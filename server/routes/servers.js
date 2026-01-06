const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Server = require('../models/Server');
const Channel = require('../models/Channel');
const User = require('../models/User');
const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');
const Ban = require('../models/Ban');
const Invite = require('../models/Invite');
const upload = require('../middleware/upload');
const { hasPermission } = require('../utils/permissions');

// Helper for audit logging
const logAction = async (serverId, userId, action, targetType, targetId, changes, reason) => {
  try {
    const log = new AuditLog({
      server: serverId,
      user: userId,
      action,
      targetType,
      targetId,
      changes,
      reason
    });
    await log.save();
  } catch (err) {
    console.error('Audit log error:', err);
  }
};

// Create server
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, icon } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Server name is required' });
    }

    const server = new Server({
      name: name.trim(),
      description: description || '',
      icon: icon || null,
      owner: req.user._id,
      members: [{ user: req.user._id, roles: [] }]
    });

    await server.save();

    // Create default channels
    const generalChannel = new Channel({
      name: 'general',
      type: 'text',
      server: server._id,
      position: 0
    });
    await generalChannel.save();

    server.channels.push(generalChannel._id);
    await server.save();

    // Add server to user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.servers) {
      user.servers = [];
    }

    if (!user.servers.includes(server._id)) {
      user.servers.push(server._id);
      await user.save();
    }

    const populatedServer = await Server.findById(server._id)
      .populate('owner', 'username avatar')
      .populate('members.user', 'username avatar status')
      .populate('members.roles')
      .populate('channels');

    res.status(201).json(populatedServer);
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get user's servers
router.get('/me', auth, async (req, res) => {
  try {
    // Get servers where user is a member
    const memberServers = await Server.find({
      'members.user': req.user._id
    })
      .populate('owner', 'username avatar')
      .populate('channels')
      .populate('members.user', 'username avatar status')
      .populate('members.roles')
      .sort({ createdAt: -1 });

    // Also get servers from user.servers array
    const user = await User.findById(req.user._id);
    const userServerIds = user?.servers?.map(s => s.toString()) || [];

    // Combine and deduplicate
    const allServerIds = new Set();
    memberServers.forEach(s => allServerIds.add(s._id.toString()));
    userServerIds.forEach(id => allServerIds.add(id.toString()));

    if (allServerIds.size === 0) {
      return res.json([]);
    }

    const allServers = await Server.find({
      _id: { $in: Array.from(allServerIds) }
    })
      .populate('owner', 'username avatar')
      .populate('channels')
      .populate('members.user', 'username avatar status')
      .populate('members.roles')
      .sort({ createdAt: -1 });

    res.json(allServers);
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get server by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
      .populate('owner', 'username avatar')
      .populate('channels')
      .populate('members.user', 'username avatar status')
      .populate('members.roles')
      .populate('roles');

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is member
    const isMember = server.members.some(
      member => member.user._id.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(server);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join server
router.post('/:id/join', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if already member
    const isMember = server.members.some(
      member => member.user.toString() === req.user._id.toString()
    );

    if (isMember) {
      return res.status(400).json({ message: 'Already a member' });
    }

    server.members.push({ user: req.user._id, roles: [] });
    await server.save();

    const user = await User.findById(req.user._id);
    if (!user.servers) {
      user.servers = [];
    }
    if (!user.servers.includes(server._id)) {
      user.servers.push(server._id);
      await user.save();
    }

    const populatedServer = await Server.findById(server._id)
      .populate('owner', 'username avatar')
      .populate('channels')
      .populate('members.user', 'username avatar status')
      .populate('members.roles');

    res.json(populatedServer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update server
router.put('/:id', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_SERVER')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { name, description, icon, banner, bannerColor } = req.body;
    if (name) server.name = name;
    if (description !== undefined) server.description = description;
    if (icon !== undefined) server.icon = icon;
    if (banner !== undefined) server.banner = banner;
    if (bannerColor !== undefined) server.bannerColor = bannerColor;

    await server.save();

    const populatedServer = await Server.findById(server._id)
      .populate('owner', 'username avatar')
      .populate('channels')
      .populate('members.user', 'username avatar status')
      .populate('members.roles');

    // Broadcast server update
    const io = req.app.get('io');
    if (io) {
      io.to(`server-${server._id}`).emit('server-updated', populatedServer);
    }

    res.json(populatedServer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete server
router.delete('/:id', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is owner
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only owner can delete server' });
    }

    // Delete all channels
    await Channel.deleteMany({ server: server._id });

    await Server.findByIdAndDelete(req.params.id);

    res.json({ message: 'Server deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update server icon
router.post('/:id/icon', auth, upload.single('icon'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_SERVER')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const iconUrl = `/api/uploads/${req.file.filename}`;
    server.icon = iconUrl;
    await server.save();

    await logAction(server._id, req.user._id, 'update', 'server', server._id, { icon: iconUrl }, 'Updated server icon');

    // Broadcast icon update
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(server._id)
        .populate('owner', 'username avatar')
        .populate('channels')
        .populate('members.user', 'username avatar status')
        .populate('members.roles');
      io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    }

    res.json({ icon: iconUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update server banner
router.post('/:id/banner', auth, upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_SERVER')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const bannerUrl = `/api/uploads/${req.file.filename}`;
    server.banner = bannerUrl;
    await server.save();

    await logAction(server._id, req.user._id, 'update', 'server', server._id, { banner: bannerUrl }, 'Updated server banner');

    // Broadcast banner update
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(server._id)
        .populate('owner', 'username avatar')
        .populate('channels')
        .populate('members.user', 'username avatar status')
        .populate('members.roles');
      io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    }

    res.json({ banner: bannerUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Roles management
router.get('/:id/roles', auth, async (req, res) => {
  try {
    const roles = await Role.find({ server: req.params.id }).sort('position');
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/roles', auth, async (req, res) => {
  try {
    const { name, color, permissions } = req.body;
    const server = await Server.findById(req.params.id);
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_ROLES')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const role = new Role({
      name: name || 'new role',
      color: color || '#99AAB5',
      permissions: permissions || [],
      server: server._id,
      position: server.roles.length
    });
    await role.save();
    server.roles.push(role._id);
    await server.save();

    await logAction(server._id, req.user._id, 'create', 'role', role._id, { name: role.name }, 'Created role');
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update role
router.put('/:id/roles/:roleId', auth, async (req, res) => {
  try {
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_ROLES')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    const server = await Server.findById(req.params.id);

    const role = await Role.findByIdAndUpdate(req.params.roleId, req.body, { new: true });
    await logAction(server._id, req.user._id, 'update', 'role', role._id, req.body, 'Updated role');
    res.json(role);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update role positions
router.put('/:id/roles/positions', auth, async (req, res) => {
  try {
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_SERVER')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { roles } = req.body; // Array of { id: roleId, position: number }
    if (!roles || !Array.isArray(roles)) {
      return res.status(400).json({ message: 'Invalid roles data' });
    }

    const updatePromises = roles.map(r =>
      Role.findByIdAndUpdate(r.id, { position: r.position })
    );

    await Promise.all(updatePromises);

    // Return updated roles
    const updatedRoles = await Role.find({ server: req.params.id }).sort({ position: -1 });

    // Notify clients
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.id).emit('server-roles-updated', {
        serverId: req.params.id,
        roles: updatedRoles
      });
    }

    res.json(updatedRoles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

router.delete('/:id/roles/:roleId', auth, async (req, res) => {
  try {
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_ROLES')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    const server = await Server.findById(req.params.id);

    await Role.findByIdAndDelete(req.params.roleId);
    server.roles = server.roles.filter(r => r.toString() !== req.params.roleId);
    await server.save();

    await logAction(server._id, req.user._id, 'delete', 'role', req.params.roleId, null, 'Deleted role');
    res.json({ message: 'Role deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Members management
router.get('/:id/members/:userId', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id).populate('members.roles');
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const member = server.members.find(m => m.user.toString() === req.params.userId);
    if (!member) return res.status(404).json({ message: 'Member not found' });

    res.json(member);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    const isSelf = req.user._id.toString() === req.params.userId;
    const canKick = await hasPermission(req.user._id, req.params.id, 'KICK_MEMBERS');

    if (!isSelf && !canKick) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    server.members = server.members.filter(m => m.user.toString() !== req.params.userId);
    await server.save();

    // Remove server from user
    const user = await User.findById(req.params.userId);
    if (user) {
      user.servers = user.servers.filter(s => s.toString() !== server._id.toString());
      await user.save();
    }

    const action = req.user._id.toString() === req.params.userId ? 'leave' : 'kick';
    await logAction(server._id, req.user._id, action, 'member', req.params.userId, null, `${action === 'kick' ? 'Kicked' : 'Left'} server`);

    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/members/:userId/roles', auth, async (req, res) => {
  try {
    const { roles } = req.body;
    const server = await Server.findById(req.params.id);
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_ROLES')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const member = server.members.find(m => m.user.toString() === req.params.userId);
    if (member) {
      member.roles = roles;
      await server.save();
      await logAction(server._id, req.user._id, 'update-roles', 'member', req.params.userId, { roles }, 'Updated member roles');

      // Re-fetch server to get populated roles for the member
      const updatedServer = await Server.findById(req.params.id).populate('members.roles').populate('members.user');
      const updatedMember = updatedServer.members.find(m => m.user._id.toString() === req.params.userId.toString());

      const io = req.app.get('io');
      if (io) {
        io.to(req.params.id).emit('server-member-updated', {
          serverId: req.params.id,
          member: updatedMember
        });
      }
    }
    res.json({ message: 'Roles updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Bans
router.get('/:id/bans', auth, async (req, res) => {
  try {
    const bans = await Ban.find({ server: req.params.id }).populate('user', 'username avatar');
    res.json(bans);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/bans', auth, async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const server = await Server.findById(req.params.id);
    if (!await hasPermission(req.user._id, req.params.id, 'BAN_MEMBERS')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const ban = new Ban({
      server: server._id,
      user: userId,
      reason: reason || 'No reason provided',
      bannedBy: req.user._id
    });
    await ban.save();

    // Also kick them
    server.members = server.members.filter(m => m.user.toString() !== userId);
    await server.save();

    await logAction(server._id, req.user._id, 'ban', 'member', userId, { reason }, 'Banned user');
    res.status(201).json(ban);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id/bans/:userId', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!await hasPermission(req.user._id, req.params.id, 'BAN_MEMBERS')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    await Ban.findOneAndDelete({ server: server._id, user: req.params.userId });
    await logAction(server._id, req.user._id, 'unban', 'member', req.params.userId, null, 'Unbanned user');
    res.json({ message: 'User unbanned' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Audit Log
router.get('/:id/audit-logs', auth, async (req, res) => {
  try {
    if (!await hasPermission(req.user._id, req.params.id, 'VIEW_AUDIT_LOG')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    const logs = await AuditLog.find({ server: req.params.id })
      .populate('user', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Invites management
router.get('/:id/invites', auth, async (req, res) => {
  try {
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_SERVER')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    const invites = await Invite.find({ server: req.params.id }).populate('creator', 'username');
    res.json(invites);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id/invites/:code', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!await hasPermission(req.user._id, req.params.id, 'MANAGE_SERVER')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    await Invite.findOneAndDelete({ code: req.params.code });
    res.json({ message: 'Invite deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
