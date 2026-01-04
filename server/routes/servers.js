const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Server = require('../models/Server');
const Channel = require('../models/Channel');
const User = require('../models/User');

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
      .populate('members.user', 'username avatar status');

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

    // Check if user is owner
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only owner can update server' });
    }

    const { name, description, icon } = req.body;
    if (name) server.name = name;
    if (description !== undefined) server.description = description;
    if (icon !== undefined) server.icon = icon;

    await server.save();

    const populatedServer = await Server.findById(server._id)
      .populate('owner', 'username avatar')
      .populate('channels')
      .populate('members.user', 'username avatar status');

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

module.exports = router;
