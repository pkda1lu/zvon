const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Message = require('../models/Message');

router.get('/channel/:channelId', auth, async (req, res) => {
  try {
    const { limit = 50, before } = req.query;
    let query = { channel: req.params.channelId };
    if (before) query.createdAt = { $lt: new Date(before) };
    const messages = await Message.find(query).populate('author', 'username avatar').populate('replyTo').sort({ createdAt: -1 }).limit(parseInt(limit)).exec();
    res.json(messages.reverse());
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { content, channelId, replyTo, attachments } = req.body;
    const message = new Message({ content, author: req.user._id, channel: channelId, replyTo, attachments: attachments || [] });
    await message.save();
    await message.populate('author', 'username avatar');
    if (replyTo) await message.populate('replyTo');
    res.status(201).json(message);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'You can only edit your own messages' });
    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();
    await message.populate('author', 'username avatar');
    res.json(message);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.author.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Access denied' });
    await Message.findByIdAndDelete(req.params.id);
    res.json({ message: 'Message deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
