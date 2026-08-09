const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Server = require('../models/Server');
const Channel = require('../models/Channel');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const upload = require('../middleware/upload');

const checkPermission = require('../middleware/checkPermission');
const { Permissions, DEFAULT_PERMISSIONS } = require('../utils/permissions');
const { computePermissions, getHighestRolePosition } = require('../utils/permissionCalculator');
const { logAction } = require('../utils/auditLogger');
const { logGlobalAction } = require('../utils/globalAuditLogger');
const { handleMemberJoin, logMemberLeave } = require('../utils/serverJoin');


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
      }],
      welcomeMessages: [
        'Добро пожаловать, {user}! Рады видеть тебя здесь.',
        '{user} присоединился к серверу. Поздоровайтесь!',
        'Встречайте {user} — новый участник сервера!'
      ]
    });

    await server.save();
    const generalChannel = new Channel({ name: 'general', type: 'text', server: server._id, position: 0 });
    await generalChannel.save();
    server.channels.push(generalChannel._id);
    server.welcomeChannel = generalChannel._id;
    await server.save();
    const user = await User.findById(req.user._id);
    if (user) {
      if (!user.servers) user.servers = [];
      if (!user.servers.includes(server._id)) { user.servers.push(server._id); await user.save(); }
    }
    const populatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    await logGlobalAction({
      executorId: req.user._id,
      action: 'SERVER_CREATE',
      targetId: server._id,
      targetModel: 'Server',
      details: { name: server.name }
    });
    res.status(201).json(populatedServer);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let userServerIds = user?.servers || [];

    // Fallback if servers array is empty (common for bots or desynced state)
    if (userServerIds.length === 0) {
      const serversJoined = await Server.find({ 'members.user': req.user._id }, '_id');
      userServerIds = serversJoined.map(s => s._id);

      // Update the user document if it was desynced
      if (userServerIds.length > 0 && user) {
        user.servers = userServerIds;
        await user.save();
      }
    }

    const allServers = await Server.find({ _id: { $in: userServerIds } }).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).sort({ createdAt: -1 });
    res.json(allServers);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
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
    const io = req.app.get('io');
    await handleMemberJoin(server, req.user._id, io);
    const populatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
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

// Update server settings
router.put('/:id', auth, checkPermission(Permissions.MANAGE_GUILD), async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const {
      name, description, icon, banner, bannerColor,
      features, featuredActivities, tag, welcomeEnabled, welcomeMessages, welcomeChannel,
      showMemberActivity, showMembersList, newcomerCooldownSeconds
    } = req.body;
    if (name) server.name = name;
    if (description !== undefined) server.description = description;
    if (icon !== undefined) server.icon = icon;
    if (banner !== undefined) server.banner = banner;
    if (bannerColor !== undefined) server.bannerColor = bannerColor;
    if (features !== undefined) server.features = (features || []).filter(f => f && f.trim()).slice(0, 5);
    if (featuredActivities !== undefined) {
      server.featuredActivities = (featuredActivities || [])
        .filter(a => a && a.name)
        .slice(0, 5)
        .map(a => ({ name: a.name, image: a.image || null }));
    }
    if (tag !== undefined) {
      server.tag = {
        text: tag.text ? String(tag.text).slice(0, 5) : null,
        icon: tag.icon !== undefined ? tag.icon : (server.tag && server.tag.icon) || null,
        color: tag.color || (server.tag && server.tag.color) || '#5865f2'
      };
    }
    if (welcomeEnabled !== undefined) server.welcomeEnabled = !!welcomeEnabled;
    if (welcomeMessages !== undefined) server.welcomeMessages = (welcomeMessages || []).filter(m => m && m.trim()).slice(0, 10);
    if (welcomeChannel !== undefined) server.welcomeChannel = welcomeChannel || null;
    if (showMemberActivity !== undefined) server.showMemberActivity = !!showMemberActivity;
    if (showMembersList !== undefined) server.showMembersList = !!showMembersList;
    if (newcomerCooldownSeconds !== undefined) server.newcomerCooldownSeconds = Math.max(0, parseInt(newcomerCooldownSeconds) || 0);
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: server._id,
      targetModel: 'Server',
      action: 'SERVER_UPDATE',
      changes: [
        { key: 'name', newValue: name },
        { key: 'description', newValue: description },
        { key: 'icon', newValue: icon },
        { key: 'banner', newValue: banner }
      ].filter(c => c.newValue !== undefined)
    });

    const populatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
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
    await logGlobalAction({
      executorId: req.user._id,
      action: 'SERVER_DELETE',
      targetId: server._id,
      targetModel: 'Server',
      details: { name: server.name }
    });
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
      const updatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
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
      const updatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    }
    res.json({ banner: bannerUrl });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Top activities among server members (by total playtime) — for the "featured activities" picker
router.get('/:id/top-activities', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const memberIds = server.members.map(m => m.user);
    const users = await User.find({ _id: { $in: memberIds } }, 'gameStats activity');

    const totals = new Map();
    users.forEach(u => {
      (u.gameStats || []).forEach(g => {
        if (!g.name) return;
        const prev = totals.get(g.name) || { name: g.name, image: g.image || null, totalSeconds: 0 };
        prev.totalSeconds += g.totalSeconds || 0;
        if (!prev.image && g.image) prev.image = g.image;
        totals.set(g.name, prev);
      });
      // Include currently-active activities even if not yet accumulated in gameStats
      if (u.activity && u.activity.name && !totals.has(u.activity.name)) {
        totals.set(u.activity.name, { name: u.activity.name, image: u.activity.assets?.largeImage || null, totalSeconds: 0 });
      }
    });

    const sorted = Array.from(totals.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
    res.json(sorted.slice(0, 50));
  } catch (error) {
    console.error('Top activities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Server tag icon upload
router.post('/:id/tag/icon', auth, checkPermission(Permissions.MANAGE_GUILD), upload.single('icon'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const iconUrl = `/api/uploads/${req.file.filename}`;
    if (!server.tag) server.tag = {};
    server.tag.icon = iconUrl;
    await server.save();
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    }
    res.json({ icon: iconUrl });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// ROLES ROUTES
router.get('/:id/roles', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // AUTOMATIC REPAIR: Ensure all roles have names to pass validation
    let changed = false;
    server.roles.forEach((r, idx) => {
      if (!r.name) {
        r.name = idx === 0 ? '@everyone' : `Recovered Role ${idx}`;
        changed = true;
      }
    });

    // Ensure @everyone exists at the start
    let everyoneIdx = server.roles.findIndex(r => r.name === '@everyone');
    if (everyoneIdx === -1) {
      server.roles.unshift({
        name: '@everyone',
        color: '#99aab5',
        hoist: false,
        position: 0,
        permissions: DEFAULT_PERMISSIONS.toString()
      });
      changed = true;
    } else if (everyoneIdx > 0) {
      // Optional: move it to the front if it's not there
      const everyone = server.roles[everyoneIdx];
      server.roles.splice(everyoneIdx, 1);
      server.roles.unshift(everyone);
      changed = true;
    }

    if (changed) {
      console.log(`Repaired roles for server ${server._id}`);
      await server.save();
    }

    res.json(server.roles);
  } catch (error) {
    console.error('Roles GET error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update role positions
router.patch('/:id/roles/positions', auth, checkPermission(Permissions.MANAGE_ROLES), async (req, res) => {
  try {
    const { roles: rolePositions } = req.body; // [{ id, position }]
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // Иерархия ролей влияет только на отображение (порядок в списке, цвет ника) —
    // MANAGE_ROLES (проверено в checkPermission выше) достаточно, чтобы менять порядок любых ролей.
    rolePositions.forEach(item => {
      const role = server.roles.id(item.id);
      if (role) role.position = item.position;
    });

    await server.save();

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } }));

    res.json(server.roles);
  } catch (error) {
    console.error('Role position update error:', error);
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

    // Новые роли всегда создаются в самом низу иерархии — сразу над @everyone.
    // Иерархия влияет только на порядок отображения и цвет ника, не на права редактирования.
    const everyoneRole = server.roles.find(r => r.name === '@everyone');
    const everyonePos = everyoneRole ? everyoneRole.position : 0;
    server.roles.forEach(r => {
      if (r.position > everyonePos) r.position += 1;
    });

    const newRole = {
      name: name || 'New Role',
      color: color || '#99aab5',
      hoist: hoist || false,
      position: everyonePos + 1,
      permissions: permissions || DEFAULT_PERMISSIONS.toString(),
      mentionable: mentionable || false
    };

    server.roles.push(newRole);
    await server.save();
    const createdRole = server.roles[server.roles.length - 1];

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: createdRole._id,
      targetModel: 'Server', // Roles are subdocs, ref server
      action: 'ROLE_CREATE',
      changes: [{ key: 'name', newValue: createdRole.name }]
    });

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } }));

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
    let role;
    const roleIdStr = String(req.params.roleId);

    // 1. Try standard Mongoose subdocument lookup
    try {
      role = server.roles.id(req.params.roleId);
    } catch (e) { }

    // 2. Manual search by ID string
    if (!role) {
      role = server.roles.find(r => String(r._id) === roleIdStr);
    }

    // 3. Special handling for @everyone aliases and ID mismatches
    if (!role) {
      const isEveryoneAlias = roleIdStr === 'everyone' || roleIdStr === '0' || roleIdStr.length < 5;

      // Final fallback: If we can't find by ID, but there is an @everyone role,
      // and this is either a known alias OR we're just desperate to find the base role
      role = server.roles.find(r => r.name === '@everyone');

      if (role) {
        console.log(`[DEBUG] Role ${roleIdStr} not found by ID, but using @everyone by name fallback.`);
      }
    }

    if (!role) {
      console.error(`Update role error: Role ${roleIdStr} absolutely not found on server ${server._id}`);
      return res.status(404).json({ message: 'Role not found' });
    }

    console.log(`[DEBUG] Found role to update: ${role.name} (${role._id})`);


    // MANAGE_ROLES (проверено в checkPermission выше) достаточно для редактирования любой роли —
    // иерархия позиций влияет только на отображение и цвет ника, не на права.
    if (role.name === '@everyone' && req.body.name) return res.status(400).json({ message: 'Cannot rename @everyone role' });

    const fields = ['name', 'color', 'hoist', 'position', 'permissions', 'mentionable'];
    fields.forEach(field => {
      if (req.body[field] !== undefined) role[field] = req.body[field];
    });

    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: role._id,
      targetModel: 'Server',
      action: 'ROLE_UPDATE',
      changes: Object.keys(req.body).map(k => ({ key: k, newValue: req.body[k] }))
    });

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } }));

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
        const updatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
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

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: server._id,
      targetModel: 'Server',
      action: 'ROLE_DELETE',
      reason: `Deleted role ${role.name}`
    });

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } }));

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

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: userId,
      targetModel: 'User',
      action: 'MEMBER_UPDATE',
      changes: [{ key: 'roles', newValue: roles }]
    });

    const populatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
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

    const { nickname, bio, avatar, banner, roles, bannerColor, communicationDisabledUntil } = req.body;
    const isSelf = req.user._id.toString() === req.params.userId;
    const userPerms = computePermissions(req.user._id, server);

    // Hierarchy Check (if modifying someone else)
    if (!isSelf && String(server.owner) !== String(req.user._id)) {
      const actorHigh = getHighestRolePosition(req.user._id, server);
      const targetHigh = getHighestRolePosition(req.params.userId, server);
      if (targetHigh >= actorHigh) {
        return res.status(403).json({ message: 'You cannot manage this user (hierarchy)' });
      }
    }

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
      // Иерархия ролей влияет только на отображение и цвет ника — MANAGE_ROLES достаточно
      // для назначения любой роли участнику.
      server.members[memberIndex].roles = roles;
    }

    if (bio !== undefined) server.members[memberIndex].bio = bio;
    if (avatar !== undefined) server.members[memberIndex].avatar = avatar;
    if (banner !== undefined) server.members[memberIndex].banner = banner;
    if (bannerColor !== undefined) server.members[memberIndex].bannerColor = bannerColor;

    if (communicationDisabledUntil !== undefined) {
      if (!isSelf && !(userPerms & Permissions.MODERATE_MEMBERS) && String(server.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Insufficient permissions to timeout this member' });
      }
      server.members[memberIndex].communicationDisabledUntil = communicationDisabledUntil ? new Date(communicationDisabledUntil) : null;
    }

    await server.save();

    if (communicationDisabledUntil !== undefined) {
      await logAction({
        serverId: server._id,
        executorId: req.user._id,
        targetId: req.params.userId,
        targetModel: 'User',
        action: 'MEMBER_TIMEOUT',
        changes: [{ key: 'communicationDisabledUntil', newValue: communicationDisabledUntil }]
      });
    }

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: req.params.userId,
      targetModel: 'User',
      action: 'MEMBER_UPDATE',
      changes: Object.keys(req.body).map(k => ({ key: k, newValue: req.body[k] }))
    });

    const updatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-member-updated', { serverId: server._id, member: updatedServer.members[memberIndex] });
    res.json(updatedServer.members[memberIndex]);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id/members/:userId/avatar', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const memberIndex = server.members.findIndex(m => m.user.toString() === req.params.userId);
    if (memberIndex === -1) return res.status(404).json({ message: 'Member not found' });
    
    if (req.user._id.toString() !== req.params.userId && String(server.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    server.members[memberIndex].avatar = null;
    await server.save();
    
    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-member-updated', { serverId: server._id, member: server.members[memberIndex] });
    res.json({ message: 'Avatar deleted', avatar: null });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id/members/:userId/banner', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const memberIndex = server.members.findIndex(m => m.user.toString() === req.params.userId);
    if (memberIndex === -1) return res.status(404).json({ message: 'Member not found' });
    
    if (req.user._id.toString() !== req.params.userId && String(server.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    server.members[memberIndex].banner = null;
    await server.save();
    
    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-member-updated', { serverId: server._id, member: server.members[memberIndex] });
    res.json({ message: 'Banner deleted', banner: null });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/members/:userId/avatar', auth, (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const memberIndex = server.members.findIndex(m => m.user.toString() === req.params.userId);
    if (memberIndex === -1) return res.status(404).json({ message: 'Member not found' });

    if (req.user._id.toString() !== req.params.userId && String(server.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    const avatarUrl = `/api/uploads/${req.file.filename}`;
    server.members[memberIndex].avatar = avatarUrl;
    await server.save();

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-member-updated', { serverId: server._id, member: server.members[memberIndex] });

    res.json({ avatar: avatarUrl });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/members/:userId/banner', auth, (req, res, next) => {
  upload.single('banner')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const memberIndex = server.members.findIndex(m => m.user.toString() === req.params.userId);
    if (memberIndex === -1) return res.status(404).json({ message: 'Member not found' });

    if (req.user._id.toString() !== req.params.userId && String(server.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    const bannerUrl = `/api/uploads/${req.file.filename}`;
    server.members[memberIndex].banner = bannerUrl;
    await server.save();

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-member-updated', { serverId: server._id, member: server.members[memberIndex] });

    res.json({ banner: bannerUrl });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    server.members = server.members.filter(m => m.user.toString() !== req.params.userId);

    // Hierarchy Check
    if (String(server.owner) !== String(req.user._id)) {
      const actorHigh = getHighestRolePosition(req.user._id, server);
      const targetHigh = getHighestRolePosition(req.params.userId, server);
      if (targetHigh >= actorHigh) {
        return res.status(403).json({ message: 'Cannot kick user with equal or higher role' });
      }
    }
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: req.params.userId,
      targetModel: 'User',
      action: 'MEMBER_KICK'
    });

    const user = await User.findById(req.params.userId);
    if (user) { user.servers = user.servers.filter(s => s.toString() !== server._id.toString()); await user.save(); }
    const io = req.app.get('io');
    if (io) {
      io.to(`server-${req.params.id}`).emit('server-member-left', { serverId: req.params.id, userId: req.params.userId });
      const updatedServer = await Server.findById(req.params.id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      io.to(`server-${req.params.id}`).emit('server-updated', updatedServer);
    }
    res.json({ message: 'Member removed' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/leave', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // Owners cannot leave their own server - they must delete it or transfer ownership
    if (server.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Owners cannot leave their own server' });
    }

    // Remove from server members
    server.members = server.members.filter(m => m.user.toString() !== req.user._id.toString());
    await server.save();
    await logMemberLeave(server, req.user._id);

    // Remove from user's servers list
    const user = await User.findById(req.user._id);
    if (user) {
      user.servers = user.servers.filter(s => s.toString() !== server._id.toString());
      await user.save();
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`server-${req.params.id}`).emit('server-member-left', { serverId: req.params.id, userId: req.user._id });
      const updatedServer = await Server.findById(req.params.id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      io.to(`server-${req.params.id}`).emit('server-updated', updatedServer);
    }

    res.json({ message: 'Left server successfully' });
  } catch (error) {
    console.error('Leave server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id/bans', auth, checkPermission(Permissions.BAN_MEMBERS), async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
      .populate('bans.user', 'username avatar badges')
      .populate('bans.bannedBy', 'username avatar');
    if (!server) return res.status(404).json({ message: 'Server not found' });
    res.json(server.bans || []);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/:id/bans/:userId', auth, checkPermission(Permissions.BAN_MEMBERS), async (req, res) => {
  try {
    const { reason, expiresAt } = req.body;
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const ban = server.bans.find(b => String(b.user) === String(req.params.userId));
    if (!ban) return res.status(404).json({ message: 'Ban not found' });
    if (reason !== undefined) ban.reason = reason;
    if (expiresAt !== undefined) ban.expiresAt = expiresAt ? new Date(expiresAt) : null;
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: req.params.userId,
      targetModel: 'User',
      action: 'MEMBER_BAN',
      reason: reason,
      changes: [{ key: 'expiresAt', newValue: expiresAt }]
    });

    res.json(ban);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id/bans/:userId', auth, checkPermission(Permissions.BAN_MEMBERS), async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const wasBanned = server.bans.some(b => String(b.user) === String(req.params.userId));
    if (!wasBanned) return res.status(404).json({ message: 'Ban not found' });
    server.bans = server.bans.filter(b => String(b.user) !== String(req.params.userId));
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: req.params.userId,
      targetModel: 'User',
      action: 'MEMBER_UNBAN'
    });

    res.json({ message: 'User unbanned' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Transfer server ownership
router.patch('/:id/owner', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    if (String(server.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the owner can transfer the server' });
    }
    const isMember = server.members.some(m => String(m.user) === String(userId));
    if (!isMember) return res.status(400).json({ message: 'Target user is not a member of this server' });

    const previousOwner = server.owner;
    server.owner = userId;
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: userId,
      targetModel: 'User',
      action: 'SERVER_TRANSFER',
      changes: [{ key: 'owner', oldValue: previousOwner, newValue: userId }]
    });

    const updatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    res.json(updatedServer);
  } catch (error) {
    console.error('Server transfer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/bans', auth, checkPermission(Permissions.BAN_MEMBERS), async (req, res) => {
  try {
    const { userId, reason, expiresAt } = req.body;
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    // Validate target is not owner
    if (String(server.owner) === String(userId)) return res.status(403).json({ message: 'Cannot ban the owner' });

    // Hierarchy Check
    if (String(server.owner) !== String(req.user._id)) {
      const actorHigh = getHighestRolePosition(req.user._id, server);
      const targetHigh = getHighestRolePosition(userId, server);
      if (targetHigh >= actorHigh) {
        return res.status(403).json({ message: 'Cannot ban user with equal or higher role' });
      }
    }

    // Check if already banned
    const isBanned = server.bans.some(b => String(b.user) === String(userId));
    if (isBanned) return res.status(400).json({ message: 'User is already banned' });

    server.bans.push({ user: userId, reason, expiresAt: expiresAt ? new Date(expiresAt) : null, bannedAt: new Date(), bannedBy: req.user._id });
    server.members = server.members.filter(m => String(m.user) !== String(userId));
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: userId,
      targetModel: 'User',
      action: 'MEMBER_BAN',
      reason
    });

    await logGlobalAction({
      executorId: req.user._id,
      action: 'SERVER_MEMBER_BAN',
      targetId: userId,
      targetModel: 'User',
      details: { serverName: server.name, reason: reason || null }
    });

    const user = await User.findById(userId);
    if (user) {
      user.servers = user.servers.filter(s => String(s) !== String(server._id));
      await user.save();
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`server-${server._id}`).emit('server-member-left', { serverId: server._id, userId: userId });
      const updatedServer = await Server.findById(server._id).populate({ path: 'owner', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    }

    res.json({ message: 'User banned' });
  } catch (error) {
    console.error('Ban error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/emojis', auth, checkPermission(Permissions.MANAGE_GUILD), upload.single('emoji'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!req.file || !name) return res.status(400).json({ message: 'File and name required' });

    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const emojiUrl = `/api/uploads/${req.file.filename}`;
    const newEmoji = {
      name,
      url: emojiUrl,
      id: Math.random().toString(36).substring(2, 11),
      animated: req.file.mimetype === 'image/gif',
      author: req.user._id
    };

    if (!server.emojis) server.emojis = [];
    server.emojis.push(newEmoji);
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: server._id,
      targetModel: 'Server',
      action: 'EMOJI_CREATE',
      changes: [{ key: 'name', newValue: newEmoji.name }]
    });

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-emojis-updated', { serverId: server._id, emojis: server.emojis });

    res.status(201).json(newEmoji);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/:id/emojis/:emojiId', auth, checkPermission(Permissions.MANAGE_GUILD), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Name required' });
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const emoji = (server.emojis || []).find(e => e.id === req.params.emojiId);
    if (!emoji) return res.status(404).json({ message: 'Emoji not found' });
    emoji.name = name.trim();
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: server._id,
      targetModel: 'Server',
      action: 'EMOJI_UPDATE',
      changes: [{ key: 'name', newValue: emoji.name }]
    });

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-emojis-updated', { serverId: server._id, emojis: server.emojis });

    res.json(emoji);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id/emojis/:emojiId', auth, checkPermission(Permissions.MANAGE_GUILD), async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    const deletedEmoji = (server.emojis || []).find(e => e.id === req.params.emojiId);
    server.emojis = server.emojis.filter(e => e.id !== req.params.emojiId);
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: server._id,
      targetModel: 'Server',
      action: 'EMOJI_DELETE',
      reason: deletedEmoji ? `Deleted emoji ${deletedEmoji.name}` : undefined
    });

    const io = req.app.get('io');
    if (io) io.to(`server-${server._id}`).emit('server-emojis-updated', { serverId: server._id, emojis: server.emojis });

    res.json({ message: 'Emoji deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id/audit-logs', auth, checkPermission(Permissions.VIEW_AUDIT_LOG), async (req, res) => {
  try {
    const { limit = 50, before, user, action, actions, reason, after } = req.query;
    const query = { server: req.params.id };

    if (before) {
      const bDate = new Date(before);
      if (typeof before === 'string' && before.length === 10) {
        bDate.setHours(23, 59, 59, 999);
      }
      query.createdAt = { ...(query.createdAt || {}), $lte: bDate };
    }
    if (after) {
      const aDate = new Date(after);
      if (typeof after === 'string' && after.length === 10) {
        aDate.setHours(0, 0, 0, 0);
      }
      query.createdAt = { ...(query.createdAt || {}), $gte: aDate };
    }
    if (user) query.$or = [{ executor: user }, { target: user }];
    
    // Поддержка фильтрации по 1 или нескольким действия одновременно (массив или через запятую)
    let actionList = [];
    if (actions) {
      actionList = Array.isArray(actions) ? actions : String(actions).split(',').filter(Boolean);
    } else if (action) {
      actionList = [action];
    }
    if (actionList.length > 0) {
      query.action = { $in: actionList };
    }

    if (reason) query.reason = { $regex: reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('executor', 'username avatar')
      .populate({
        path: 'target',
        select: 'username name content'
      });

    res.json(logs);
  } catch (error) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Per-server statistics: message activity + member growth (cumulative dynamics & daily breakdown)
router.get('/:id/stats', auth, checkPermission(Permissions.VIEW_AUDIT_LOG), async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });

    let startDate, endDate;
    if (req.query.after || req.query.before) {
      if (req.query.after) {
        startDate = new Date(req.query.after);
        if (typeof req.query.after === 'string' && req.query.after.length === 10) startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }
      if (req.query.before) {
        endDate = new Date(req.query.before);
        if (typeof req.query.before === 'string' && req.query.before.length === 10) endDate.setHours(23, 59, 59, 999);
      } else {
        endDate = new Date();
      }
    } else {
      const range = req.query.range || '30d';
      const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
      endDate = new Date();
      startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }

    const Message = require('../models/Message');

    const messagesChart = await Message.aggregate([
      { $match: { channel: { $in: server.channels }, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const totalMessages = await Message.countDocuments({ channel: { $in: server.channels } });

    const activeUsersDaily = await Message.aggregate([
      { $match: { channel: { $in: server.channels }, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, author: '$author' } } },
      { $group: { _id: '$_id.day', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const joinEvents = await AuditLog.aggregate([
      { $match: { server: server._id, action: 'MEMBER_JOIN', createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const leaveEvents = await AuditLog.aggregate([
      { $match: { server: server._id, action: { $in: ['MEMBER_LEAVE', 'MEMBER_KICK', 'MEMBER_BAN'] }, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }
    ]);

    const attachmentsCount = await Message.countDocuments({
      channel: { $in: server.channels },
      'attachments.0': { $exists: true }
    });

    const deltaByDay = new Map();
    joinEvents.forEach(e => deltaByDay.set(e._id, (deltaByDay.get(e._id) || 0) + e.count));
    leaveEvents.forEach(e => deltaByDay.set(e._id, (deltaByDay.get(e._id) || 0) - e.count));
    const sortedDays = Array.from(deltaByDay.keys()).sort();
    let running = server.members.length;
    const dayDeltas = sortedDays.map(day => ({ day, delta: deltaByDay.get(day) }));
    for (let i = dayDeltas.length - 1; i >= 0; i--) running -= dayDeltas[i].delta;
    const membersChart = [];
    let cursor = running;
    for (const { day, delta } of dayDeltas) {
      cursor += delta;
      membersChart.push({ _id: day, count: Math.max(1, cursor) });
    }

    // Cumulative messages path
    let cumMsg = 0;
    const cumulativeMessages = messagesChart.map(m => {
      cumMsg += m.count;
      return { _id: m._id, count: cumMsg };
    });

    res.json({
      totals: {
        members: server.members.length,
        messages: totalMessages,
        attachments: attachmentsCount,
        newMembersPeriod: joinEvents.reduce((acc, curr) => acc + curr.count, 0)
      },
      charts: {
        messages: messagesChart.map(m => ({ _id: m._id, count: m.count })),
        cumulativeMessages,
        members: membersChart.length > 0 ? membersChart : [{ _id: startDate.toISOString().slice(0, 10), count: server.members.length }],
        newMembersDaily: joinEvents.map(j => ({ _id: j._id, count: j.count })),
        activeUsersDaily: activeUsersDaily.map(a => ({ _id: a._id, count: a.count }))
      }
    });
  } catch (error) {
    console.error('Server stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

