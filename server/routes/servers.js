const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Server = require('../models/Server');
const Channel = require('../models/Channel');
const User = require('../models/User');
const upload = require('../middleware/upload');

const checkPermission = require('../middleware/checkPermission');
const { Permissions, DEFAULT_PERMISSIONS } = require('../utils/permissions');
const { computePermissions } = require('../utils/permissionCalculator');

router.post('/', auth, async (req, res) => {
  try {
    const { name, description, icon } = req.body;
    if (!name || name.trim().length === 0) return res.status(400).json({ message: 'Server name is required' });

    // Create @everyone role
    const everyoneRole = {
      name: '@everyone',
      color: '#99aab5',
      hoist: false,
      position: 0,
      permissions: DEFAULT_PERMISSIONS.toString(),
      mentionable: false
    };

    const server = new Server({
      name: name.trim(),
      description: description || '',
      icon: icon || null,
      owner: req.user._id,
      roles: [everyoneRole],
      members: [{
        user: req.user._id,
        roles: [] // Owner doesn't strictly need roles, but @everyone is implicit
      }]
    });

    await server.save();
    const generalChannel = new Channel({ name: 'general', type: 'text', server: server._id, position: 0 });
    await generalChannel.save();
    server.channels.push(generalChannel._id);
    await server.save();
    const user = await User.findById(req.user._id);
    if (user) {
      if (!user.servers) user.servers = [];
      if (!user.servers.includes(server._id)) { user.servers.push(server._id); await user.save(); }
    }
    const populatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('members.user', 'username avatar status').populate('channels');
    res.status(201).json(populatedServer);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const userServerIds = user?.servers || [];
    const allServers = await Server.find({ _id: { $in: userServerIds } }).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status').sort({ createdAt: -1 });
    res.json(allServers);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
    if (!server) return res.status(404).json({ message: 'Server not found' });
    res.json(server);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/join', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const isMember = server.members.some(member => member.user.toString() === req.user._id.toString());
    if (isMember) return res.status(400).json({ message: 'Already a member' });
    server.members.push({ user: req.user._id });
    await server.save();
    const user = await User.findById(req.user._id);
    if (!user.servers) user.servers = [];
    if (!user.servers.includes(server._id)) { user.servers.push(server._id); await user.save(); }
    const populatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
    const io = req.app.get('io');
    if (io) {
      const newMember = populatedServer.members.find(m => m.user._id.toString() === req.user._id.toString());
      io.to(`server-${server._id}`).emit('server-member-joined', { serverId: server._id, member: newMember, server: populatedServer });
      io.to(`server-${server._id}`).emit('server-updated', populatedServer);
    }
    res.json(populatedServer);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Update server settings
router.put('/:id', auth, checkPermission(Permissions.MANAGE_GUILD), async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const { name, description, icon, banner, bannerColor } = req.body;
    if (name) server.name = name;
    if (description !== undefined) server.description = description;
    if (icon !== undefined) server.icon = icon;
    if (banner !== undefined) server.banner = banner;
    if (bannerColor !== undefined) server.bannerColor = bannerColor;
    await server.save();
    const populatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', populatedServer);
    res.json(populatedServer);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Delete server
router.delete('/:id', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // Only owner can delete server
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the server owner can delete the server' });
    }

    await Channel.deleteMany({ server: server._id });
    const io = req.app.get('io');
    if (io) io.to(`server-${req.params.id}`).emit('server-deleted', { serverId: req.params.id });
    await Server.findByIdAndDelete(req.params.id);
    res.json({ message: 'Server deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/icon', auth, checkPermission(Permissions.MANAGE_GUILD), upload.single('icon'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const iconUrl = `/api/uploads/${req.file.filename}`;
    server.icon = iconUrl;
    await server.save();
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
      io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    }
    res.json({ icon: iconUrl });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/banner', auth, checkPermission(Permissions.MANAGE_GUILD), upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const bannerUrl = `/api/uploads/${req.file.filename}`;
    server.banner = bannerUrl;
    await server.save();
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
      io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    }
    res.json({ banner: bannerUrl });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// ROLES ROUTES
router.get('/:id/roles', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // AUTOMATIC CLEANUP: Remove roles with no name or invalid structure
    const initialCount = server.roles.length;
    let roles = server.roles.filter(r => r && r.name && r.name.trim() !== '');

    // Ensure @everyone exists and is at index 0
    let everyone = roles.find(r => r.name === '@everyone');
    if (!everyone) {
      everyone = {
        name: '@everyone',
        color: '#99aab5',
        hoist: false,
        position: 0,
        permissions: DEFAULT_PERMISSIONS.toString()
      };
      roles.unshift(everyone);
    }

    if (roles.length !== initialCount) {
      console.log(`Cleaned up ${initialCount - roles.length} phantom roles for server ${server._id}`);
      server.roles = roles;
      await server.save();
    }

    res.json(server.roles);
  } catch (error) {
    console.error('Roles GET error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/roles', auth, checkPermission(Permissions.MANAGE_ROLES), async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const { name, color, hoist, permissions, mentionable } = req.body;

    // Fix existing roles that might be missing names to pass validation
    server.roles.forEach((role, index) => {
      if (!role || !role.name) {
        if (role) role.name = index === 0 ? '@everyone' : `Recovered Role ${index}`;
      }
    });

    const newRole = {
      name: name || 'New Role',
      color: color || '#99aab5',
      hoist: hoist || false,
      position: server.roles.length,
      permissions: permissions || DEFAULT_PERMISSIONS.toString(),
      mentionable: mentionable || false
    };

    server.roles.push(newRole);
    await server.save();

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status'));

    res.status(201).json(server.roles[server.roles.length - 1]);
  } catch (error) {
    console.error('Role creation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/roles/:roleId', auth, checkPermission(Permissions.MANAGE_ROLES), async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // --- ULTRA-ROBUST ROLE LOOKUP ---
    let role = server.roles.id(req.params.roleId);

    if (!role) {
      console.log(`Role ID ${req.params.roleId} not found by standard method. Trying fallbacks...`);
      // Fallback 1: Manual search in array
      role = server.roles.find(r => r && String(r._id || r) === String(req.params.roleId));
    }

    if (!role) {
      // Fallback 2: If it's the @everyone role, find it by name regardless of ID
      // Some old clients or manual DB edits might have mismatched IDs
      const isEveryoneRequest = req.params.roleId === 'everyone' || req.params.roleId === '0';
      role = server.roles.find(r => r.name === '@everyone');
      if (role) console.log('Found @everyone role by name fallback.');
    }

    if (!role) {
      console.error(`Update role error: Role ${req.params.roleId} absolutely not found on server ${server._id}`);
      return res.status(404).json({ message: 'Role not found' });
    }

    if (role.name === '@everyone' && req.body.name) return res.status(400).json({ message: 'Cannot rename @everyone role' });

    const fields = ['name', 'color', 'hoist', 'position', 'permissions', 'mentionable'];
    fields.forEach(field => {
      if (req.body[field] !== undefined) role[field] = req.body[field];
    });

    await server.save();

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status'));

    res.json(role);
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id/roles/:roleId', auth, checkPermission(Permissions.MANAGE_ROLES), async (req, res) => {
  try {
    console.log(`Attempting to delete role ${req.params.roleId} from server ${req.params.id}`);

    const server = await Server.findById(req.params.id);
    if (!server) {
      console.error('Delete role error: Server not found');
      return res.status(404).json({ message: 'Server not found' });
    }

    // --- REPAIR STEP ---
    // Ensure ALL existing roles have a name, otherwise we can't save the server at all
    let namesFixed = false;
    server.roles.forEach((r, idx) => {
      if (!r.name) {
        r.name = idx === 0 ? '@everyone' : `Recovered Role ${idx}`;
        namesFixed = true;
      }
    });
    if (namesFixed) console.log('Fixed missing names for some roles to allow saving.');

    console.log('Available role IDs in DB:', server.roles.map(r => String(r._id || 'NO_ID')));

    // Robust role lookup
    let role = server.roles.id(req.params.roleId);
    if (!role) {
      role = server.roles.find(r => r && String(r._id || r) === String(req.params.roleId));
    }

    if (!role) {
      console.log(`Role ${req.params.roleId} not found in roles array. Attempting forced filter removal...`);
      const initialLength = server.roles.length;
      // Filter out anything that matches the ID string
      server.roles = server.roles.filter(r => r && String(r._id || r) !== String(req.params.roleId));

      if (server.roles.length < initialLength) {
        await server.save();
        const updatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
        const io = req.app.get('io');
        if (io) io.to(`server-${server._id}`).emit('server-updated', updatedServer);
        return res.json({ message: 'Role forcibly removed' });
      }

      console.error(`Delete role error: Role ${req.params.roleId} absolutely not found`);
      return res.status(404).json({ message: 'Role not found' });
    }

    if (role.name === '@everyone') return res.status(400).json({ message: 'Cannot delete @everyone role' });

    // Remove role from all members
    server.members.forEach(member => {
      if (member.roles) {
        member.roles = member.roles.filter(r => String(r) !== String(req.params.roleId));
      }
    });

    server.roles.pull(req.params.roleId);
    await server.save();

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status'));

    res.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('Role deletion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:id/update-member-roles', auth, checkPermission(Permissions.MANAGE_ROLES), async (req, res) => {
  try {
    const { userId, roles } = req.body;
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const member = server.members.find(m => m.user.toString() === userId);
    if (!member) return res.status(404).json({ message: 'Member not found' });

    member.roles = roles;
    await server.save();

    const populatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
    const updatedMember = populatedServer.members.find(m => m.user._id.toString() === userId);

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-member-updated', { serverId: server._id, member: updatedMember });

    res.json(updatedMember);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id/members/:userId', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const member = server.members.find(m => m.user.toString() === req.params.userId);
    if (!member) return res.status(404).json({ message: 'Member not found' });
    res.json(member);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Update member profile (nickname, roles, etc.)
router.put('/:id/members/:userId', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const memberIndex = server.members.findIndex(m => m.user.toString() === req.params.userId);
    if (memberIndex === -1) return res.status(404).json({ message: 'Member not found' });

    const { nickname, bio, avatar, banner, roles } = req.body;
    const isSelf = req.user._id.toString() === req.params.userId;
    const userPerms = computePermissions(req.user._id, server);

    // Permission checks
    if (nickname !== undefined && nickname !== server.members[memberIndex].nickname) {
      const canChangeSelf = isSelf && (userPerms & Permissions.CHANGE_NICKNAME);
      const canManageOthers = (userPerms & Permissions.MANAGE_NICKNAMES);
      if (!canChangeSelf && !canManageOthers && String(server.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Insufficient permissions to change nickname' });
      }
      server.members[memberIndex].nickname = nickname;
    }

    if (roles !== undefined) {
      if (!(userPerms & Permissions.MANAGE_ROLES) && String(server.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Insufficient permissions to manage roles' });
      }
      // TODO: Check role hierarchy (cannot add/remove roles higher than your own)
      server.members[memberIndex].roles = roles;
    }

    if (bio !== undefined) server.members[memberIndex].bio = bio;
    if (avatar !== undefined) server.members[memberIndex].avatar = avatar;
    if (banner !== undefined) server.members[memberIndex].banner = banner;

    await server.save();
    const updatedServer = await Server.findById(server._id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-member-updated', { serverId: server._id, member: updatedServer.members[memberIndex] });
    res.json(updatedServer.members[memberIndex]);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    server.members = server.members.filter(m => m.user.toString() !== req.params.userId);
    await server.save();
    const user = await User.findById(req.params.userId);
    if (user) { user.servers = user.servers.filter(s => s.toString() !== server._id.toString()); await user.save(); }
    const io = req.app.get('io');
    if (io) {
      io.to(`server-${req.params.id}`).emit('server-member-left', { serverId: req.params.id, userId: req.params.userId });
      const updatedServer = await Server.findById(req.params.id).populate('owner', 'username avatar').populate('channels').populate('members.user', 'username avatar status');
      io.to(`server-${req.params.id}`).emit('server-updated', updatedServer);
    }
    res.json({ message: 'Member removed' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
