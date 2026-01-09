const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Server = require('../models/Server');
const Channel = require('../models/Channel');
const User = require('../models/User');
const upload = require('../middleware/upload');

router.post('/', auth, async (req, res) => {
  try {
    const { name, description, icon } = req.body;
    if (!name || name.trim().length === 0) return res.status(400).json({ message: 'Server name is required' });
    const server = new Server({ name: name.trim(), description: description || '', icon: icon || null, owner: req.user._id, members: [{ user: req.user._id }] });
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

router.put('/:id', auth, async (req, res) => {
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

router.delete('/:id', auth, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Server not found' });
    await Channel.deleteMany({ server: server._id });
    const io = req.app.get('io');
    if (io) io.to(`server-${req.params.id}`).emit('server-deleted', { serverId: req.params.id });
    await Server.findByIdAndDelete(req.params.id);
    res.json({ message: 'Server deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/icon', auth, upload.single('icon'), async (req, res) => {
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

router.post('/:id/banner', auth, upload.single('banner'), async (req, res) => {
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
