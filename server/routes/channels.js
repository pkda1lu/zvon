const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Channel = require('../models/Channel');
const Server = require('../models/Server');
const { hasPermission } = require('../utils/permissions');

// Create channel
router.post('/', auth, async (req, res) => {
  try {
    const { name, type, serverId, category, position, topic } = req.body;

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    if (!await hasPermission(req.user._id, serverId, 'MANAGE_CHANNELS')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const channel = new Channel({
      name,
      type: type || 'text',
      server: serverId,
      category,
      position: position || server.channels.length,
      topic
    });

    await channel.save();

    server.channels.push(channel._id);
    await server.save();

    const populatedChannel = await Channel.findById(channel._id)
      .populate('server')
      .populate('category');

    // Broadcast update
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(serverId)
        .populate('owner', 'username avatar')
        .populate('channels')
        .populate('members.user', 'username avatar status')
        .populate('members.roles')
        .populate('roles');
      io.to(`server-${serverId}`).emit('server-updated', updatedServer);
    }

    res.status(201).json(populatedChannel);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get channels for server
router.get('/server/:serverId', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is member
    const isMember = server.members.some(
      member => member.user.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const channels = await Channel.find({ server: req.params.serverId })
      .sort({ position: 1 })
      .populate('category');

    res.json(channels);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get channel by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('server')
      .populate('category');

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server._id);
    const isMember = server.members.some(
      member => member.user.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(channel);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update channel
router.put('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const serverId = channel.server;
    if (!await hasPermission(req.user._id, serverId, 'MANAGE_CHANNELS')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { name, topic, position } = req.body;
    if (name) channel.name = name;
    if (topic !== undefined) channel.topic = topic;
    if (position !== undefined) channel.position = position;

    await channel.save();

    // Broadcast update
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(serverId)
        .populate('owner', 'username avatar')
        .populate('channels')
        .populate('members.user', 'username avatar status')
        .populate('members.roles')
        .populate('roles');
      io.to(`server-${serverId}`).emit('server-updated', updatedServer);
    }

    res.json(channel);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete channel
router.delete('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!await hasPermission(req.user._id, server._id, 'MANAGE_CHANNELS')) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    await Channel.findByIdAndDelete(req.params.id);

    server.channels = server.channels.filter(
      id => id.toString() !== req.params.id
    );
    await server.save();

    // Broadcast update
    const io = req.app.get('io');
    if (io) {
      const updatedServer = await Server.findById(server._id)
        .populate('owner', 'username avatar')
        .populate('channels')
        .populate('members.user', 'username avatar status')
        .populate('members.roles')
        .populate('roles');
      io.to(`server-${server._id}`).emit('server-updated', updatedServer);
    }

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;










