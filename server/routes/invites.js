const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const auth = require('../middleware/auth');
const Invite = require('../models/Invite');
const Server = require('../models/Server');
const User = require('../models/User');

// Generate random code
const generateCode = (length = 8) => {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
};

// Create invite
router.post('/', auth, async (req, res) => {
    try {
        const { serverId, expiresIn, maxUses } = req.body;

        const server = await Server.findById(serverId);
        if (!server) {
            return res.status(404).json({ message: 'Server not found' });
        }

        // Check if user is a member of the server
        const isMember = server.members.some(
            member => member.user.toString() === req.user._id.toString()
        );

        if (!isMember) {
            return res.status(403).json({ message: 'You must be a member of this server to create an invite' });
        }

        let code = generateCode();
        // Ensure uniqueness
        while (await Invite.findOne({ code })) {
            code = generateCode();
        }

        let expiresAt = null;
        if (expiresIn) {
            expiresAt = new Date(Date.now() + expiresIn * 1000);
        }

        const invite = new Invite({
            code,
            server: serverId,
            creator: req.user._id,
            expiresAt,
            maxUses: maxUses || null
        });

        await invite.save();

        res.status(201).json(invite);
    } catch (error) {
        console.error('Create invite error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get invite info
router.get('/:code', auth, async (req, res) => {
    try {
        const invite = await Invite.findOne({ code: req.params.code })
            .populate('server', 'name icon description members')
            .populate('creator', 'username');

        if (!invite) {
            return res.status(404).json({ message: 'Invite not found' });
        }

        // Check expiration
        if (invite.expiresAt && invite.expiresAt < Date.now()) {
            return res.status(410).json({ message: 'Invite expired' });
        }

        // Check usage limit
        if (invite.maxUses && invite.uses >= invite.maxUses) {
            return res.status(410).json({ message: 'Invite limit reached' });
        }

        const memberCount = invite.server.members.length;
        // Return safe info
        res.json({
            code: invite.code,
            server: {
                _id: invite.server._id,
                name: invite.server.name,
                icon: invite.server.icon,
                description: invite.server.description,
                memberCount
            },
            inviter: invite.creator
        });
    } catch (error) {
        console.error('Get invite error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Join server using invite
router.post('/:code/join', auth, async (req, res) => {
    try {
        const invite = await Invite.findOne({ code: req.params.code });

        if (!invite) {
            return res.status(404).json({ message: 'Invite not found' });
        }

        // Check expiration
        if (invite.expiresAt && invite.expiresAt < Date.now()) {
            return res.status(410).json({ message: 'Invite expired' });
        }

        // Check usage limit
        if (invite.maxUses && invite.uses >= invite.maxUses) {
            return res.status(410).json({ message: 'Invite limit reached' });
        }

        const server = await Server.findById(invite.server);
        if (!server) {
            return res.status(404).json({ message: 'Server no longer exists' });
        }

        // Check if already member
        const isMember = server.members.some(
            member => member.user.toString() === req.user._id.toString()
        );

        if (isMember) {
            return res.status(400).json({ message: 'Already a member' });
        }

        // Add member
        server.members.push({ user: req.user._id, roles: [] });
        await server.save();

        // Add server to user's server list
        const user = await User.findById(req.user._id);
        if (!user.servers) {
            user.servers = [];
        }
        if (!user.servers.includes(server._id)) {
            user.servers.push(server._id);
            await user.save();
        }

        // Update invite usage
        invite.uses += 1;
        await invite.save();

        const populatedServer = await Server.findById(server._id)
            .populate('owner', 'username avatar')
            .populate('channels')
            .populate('members.user', 'username avatar status');

        res.json(populatedServer);
    } catch (error) {
        console.error('Join invite error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
