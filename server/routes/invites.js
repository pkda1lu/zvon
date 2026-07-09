const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const auth = require('../middleware/auth');
const Invite = require('../models/Invite');
const Server = require('../models/Server');
const User = require('../models/User');
const { logAction } = require('../utils/auditLogger');
const { handleMemberJoin } = require('../utils/serverJoin');
const checkPermission = require('../middleware/checkPermission');
const { Permissions } = require('../utils/permissions');

const generateCode = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

router.post('/', auth, async (req, res) => {
    try {
        const { serverId, expiresIn, maxUses } = req.body;
        const server = await Server.findById(serverId);
        if (!server) return res.status(404).json({ message: 'Server not found' });
        let code = generateCode();
        while (await Invite.findOne({ code })) code = generateCode();
        let expiresAt = null;
        if (expiresIn) expiresAt = new Date(Date.now() + expiresIn * 1000);
        const invite = new Invite({ code, server: serverId, creator: req.user._id, expiresAt, maxUses: maxUses || null });
        await invite.save();

        await logAction({
          serverId: serverId,
          executorId: req.user._id,
          targetId: invite._id,
          targetModel: 'Server', // Or Invite if we had it, but Server is fine
          action: 'INVITE_CREATE',
          changes: [{ key: 'code', newValue: code }, { key: 'maxUses', newValue: maxUses }]
        });

        res.status(201).json(invite);
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Public route to view invite details
router.get('/:code', async (req, res) => {
    try {
        const invite = await Invite.findOne({ code: req.params.code }).populate('server', 'name icon banner bannerColor description features featuredActivities members').populate('creator', 'username');
        if (!invite) return res.status(404).json({ message: 'Invite not found' });
        if (invite.expiresAt && invite.expiresAt < Date.now()) return res.status(410).json({ message: 'Invite expired' });
        if (invite.maxUses && invite.uses >= invite.maxUses) return res.status(410).json({ message: 'Invite limit reached' });
        res.json({
            code: invite.code,
            server: {
                _id: invite.server._id, name: invite.server.name, icon: invite.server.icon,
                banner: invite.server.banner, bannerColor: invite.server.bannerColor,
                description: invite.server.description, features: invite.server.features || [],
                featuredActivities: invite.server.featuredActivities || [], memberCount: invite.server.members.length
            },
            inviter: invite.creator
        });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:code/join', auth, async (req, res) => {
    try {
        const invite = await Invite.findOne({ code: req.params.code });
        if (!invite) return res.status(404).json({ message: 'Invite not found' });
        if (invite.expiresAt && invite.expiresAt < Date.now()) return res.status(410).json({ message: 'Invite expired' });
        if (invite.maxUses && invite.uses >= invite.maxUses) return res.status(410).json({ message: 'Invite limit reached' });
        const server = await Server.findById(invite.server);
        if (!server) return res.status(404).json({ message: 'Server no longer exists' });
        const isMember = server.members.some(member => member.user.toString() === req.user._id.toString());
        if (isMember) return res.status(400).json({ message: 'Already a member' });
        const io = req.app.get('io');
        await handleMemberJoin(server, req.user._id, io);
        invite.uses += 1;
        await invite.save();
        const populatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
        if (io) {
            const newMember = populatedServer.members.find(m => m.user._id.toString() === req.user._id.toString());
            io.to(`server-${server._id}`).emit('server-member-joined', { serverId: server._id, member: newMember, server: populatedServer });
            io.to(`server-${server._id}`).emit('server-updated', populatedServer);
        }
        res.json(populatedServer);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        res.status(500).json({ message: 'Server error' });
    }
});

// List invites for a server (management page)
router.get('/server/:serverId', auth, checkPermission(Permissions.MANAGE_GUILD, 'serverId'), async (req, res) => {
    try {
        const invites = await Invite.find({ server: req.params.serverId })
            .populate('creator', 'username avatar')
            .sort({ createdAt: -1 });
        res.json(invites);
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Edit invite (expiry / max uses)
router.patch('/:code', auth, async (req, res) => {
    try {
        const invite = await Invite.findOne({ code: req.params.code });
        if (!invite) return res.status(404).json({ message: 'Invite not found' });
        const server = await Server.findById(invite.server);
        if (!server) return res.status(404).json({ message: 'Server not found' });
        const isOwner = String(server.owner) === String(req.user._id);
        if (!isOwner && String(invite.creator) !== String(req.user._id)) {
            const { computePermissions, hasPermission } = require('../utils/permissionCalculator');
            const perms = computePermissions(req.user._id, server);
            if (!hasPermission(perms, Permissions.MANAGE_GUILD)) return res.status(403).json({ message: 'Insufficient permissions' });
        }

        const { expiresIn, maxUses } = req.body;
        if (expiresIn !== undefined) invite.expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
        if (maxUses !== undefined) invite.maxUses = maxUses || null;
        await invite.save();
        res.json(invite);
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Revoke invite
router.delete('/:code', auth, async (req, res) => {
    try {
        const invite = await Invite.findOne({ code: req.params.code });
        if (!invite) return res.status(404).json({ message: 'Invite not found' });
        const server = await Server.findById(invite.server);
        if (!server) return res.status(404).json({ message: 'Server not found' });
        const isOwner = String(server.owner) === String(req.user._id);
        if (!isOwner && String(invite.creator) !== String(req.user._id)) {
            const { computePermissions, hasPermission } = require('../utils/permissionCalculator');
            const perms = computePermissions(req.user._id, server);
            if (!hasPermission(perms, Permissions.MANAGE_GUILD)) return res.status(403).json({ message: 'Insufficient permissions' });
        }

        await Invite.findByIdAndDelete(invite._id);

        await logAction({
            serverId: server._id,
            executorId: req.user._id,
            targetId: server._id,
            targetModel: 'Server',
            action: 'INVITE_DELETE',
            reason: `Revoked invite ${invite.code}`
        });

        res.json({ message: 'Invite revoked' });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
