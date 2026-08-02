const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const { Permissions } = require('../utils/permissions');
const Channel = require('../models/Channel');
const Server = require('../models/Server');
const { logAction } = require('../utils/auditLogger');

router.post('/', auth, checkPermission(Permissions.MANAGE_CHANNELS, 'body.serverId'), async (req, res) => {
  try {
    const { name, type, serverId, category, position, topic } = req.body;
    // 3D-комнаты пока в разработке — создавать их могут только модераторы/админы Zvon.
    // Гейт дублирует клиентскую проверку, т.к. запрос можно отправить в обход UI.
    if (type === 'room' && !['admin', 'moderator'].includes(req.user.role)) {
      return res.status(403).json({ message: '3D-комнаты в разработке и доступны только модераторам Zvon' });
    }
    const server = await Server.findById(serverId);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    const channel = new Channel({ name, type: type || 'text', server: serverId, category, position: position || server.channels.length, topic });
    await channel.save();
    server.channels.push(channel._id);
    await server.save();

    await logAction({
      serverId: server._id,
      executorId: req.user._id,
      targetId: channel._id,
      targetModel: 'Channel',
      action: 'CHANNEL_CREATE',
      changes: [{ key: 'name', newValue: name }, { key: 'type', newValue: type }]
    });
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(serverId).populate('owner', 'username avatar badges').populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      io.to(`server-${serverId}`).emit('server-updated', updatedServer);
    }
    res.status(201).json(channel);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/server/:serverId', auth, async (req, res) => {
  try {
    const channels = await Channel.find({ server: req.params.serverId }).sort({ position: 1 }).populate('category');
    res.json(channels);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id).populate('server').populate('category');
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    res.json(channel);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/reorder', auth, checkPermission(Permissions.MANAGE_CHANNELS, 'body.serverId'), async (req, res) => {
  try {
    const { serverId, items } = req.body;
    if (!serverId || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { _id: item._id, server: serverId },
        update: {
          $set: {
            position: item.position,
            category: item.category === undefined ? null : item.category
          }
        }
      }
    }));

    if (bulkOps.length > 0) {
      await Channel.bulkWrite(bulkOps);
    }

    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(serverId)
        .populate('owner', 'username avatar badges')
        .populate('channels')
        .populate({
          path: 'members.user',
          select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink',
          populate: { path: 'displayedTag.server', select: 'name icon tag' }
        });
      io.to(`server-${serverId}`).emit('server-updated', updatedServer);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Reorder channels error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    req.serverId = channel.server;
    next();
  } catch (err) { next(err); }
}, checkPermission(Permissions.MANAGE_CHANNELS), async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    const { name, topic, position, category, permissionOverwrites, slowMode, bitrate, userLimit } = req.body;
    if (name) channel.name = name;
    if (topic !== undefined) channel.topic = topic;
    if (position !== undefined) channel.position = position;
    if (category !== undefined) channel.category = category || null;
    if (permissionOverwrites !== undefined) channel.permissionOverwrites = permissionOverwrites;
    if (slowMode !== undefined) channel.slowMode = Math.max(0, Math.min(21600, parseInt(slowMode, 10) || 0));
    if (bitrate !== undefined) channel.bitrate = parseInt(bitrate, 10) || 64000;
    if (userLimit !== undefined) channel.userLimit = Math.max(0, Math.min(99, parseInt(userLimit, 10) || 0));
    await channel.save();

    await logAction({
      serverId: channel.server,
      executorId: req.user._id,
      targetId: channel._id,
      targetModel: 'Channel',
      action: 'CHANNEL_UPDATE',
      changes: Object.keys(req.body).map(k => ({ key: k, newValue: req.body[k] }))
    });

    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(channel.server).populate('owner', 'username avatar badges').populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      io.to(`server-${channel.server}`).emit('server-updated', updatedServer);
    }
    res.json(channel);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    req.serverId = channel.server;
    next();
  } catch (err) { next(err); }
}, checkPermission(Permissions.MANAGE_CHANNELS), async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    const serverId = channel.server;
    const isCategory = channel.type === 'category';

    await Channel.findByIdAndDelete(req.params.id);

    if (isCategory) {
      await Channel.updateMany({ category: req.params.id }, { $set: { category: null } });
    }

    const server = await Server.findById(serverId);
    if (server) {
      server.channels = server.channels.filter(id => id.toString() !== req.params.id);
      await server.save();

      await logAction({
        serverId: serverId,
        executorId: req.user._id,
        targetId: serverId, // Server is target since channel is gone
        targetModel: 'Server',
        action: 'CHANNEL_DELETE',
        reason: `Deleted ${isCategory ? 'category' : 'channel'} ${channel.name}`
      });
    }
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(serverId).populate('owner', 'username avatar badges').populate('channels').populate({ path: 'members.user', select: 'username avatar status badges activity displayedTag settings.streamerMode.streamerLink', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      io.to(`server-${serverId}`).emit('server-updated', updatedServer);
    }
    res.json({ message: 'Channel deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
