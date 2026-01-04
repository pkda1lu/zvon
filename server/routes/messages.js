const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Server = require('../models/Server');

// Get messages for channel
router.get('/channel/:channelId', auth, async (req, res) => {
  try {
    const { limit = 50, before } = req.query;
    const channel = await Channel.findById(req.params.channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    const isMember = server.members.some(
      member => member.user.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let query = { channel: req.params.channelId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('author', 'username avatar')
      .populate('replyTo')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .exec();

    res.json(messages.reverse());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create message
router.post('/', auth, async (req, res) => {
  try {
    const { content, channelId, replyTo, attachments } = req.body;

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    const isMember = server.members.some(
      member => member.user.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const message = new Message({
      content,
      author: req.user._id,
      channel: channelId,
      replyTo,
      attachments: attachments || []
    });

    await message.save();
    await message.populate('author', 'username avatar');
    if (replyTo) {
      await message.populate('replyTo');
    }

    res.status(201).json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update message
router.put('/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }

    message.content = content;
    message.edited = true;
    message.editedAt = new Date();

    await message.save();
    await message.populate('author', 'username avatar');

    res.json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete message
router.delete('/:id', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);

    const isAuthor = message.author.toString() === req.user._id.toString();
    const isOwner = server.owner.toString() === req.user._id.toString();

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Message.findByIdAndDelete(req.params.id);

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;




