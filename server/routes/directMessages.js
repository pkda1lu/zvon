const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const DirectMessage = require('../models/DirectMessage');
const Message = require('../models/Message');
const User = require('../models/User');

// Get all DMs for user
router.get('/', auth, async (req, res) => {
  try {
    const dms = await DirectMessage.find({
      participants: req.user._id
    })
      .populate('participants', 'username avatar status')
      .sort({ updatedAt: -1 });

    res.json(dms);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get or create DM with user
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[DM Route] Request from ${req.user._id} to start DM with ${userId}`);

    if (!mongoose.isValidObjectId(userId)) {
      console.warn(`[DM Route] Invalid userId provided: ${userId}`);
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot create DM with yourself' });
    }

    let dm = await DirectMessage.findOne({
      participants: { $size: 2, $all: [req.user._id, userId] }
    })
      .populate('participants', 'username avatar status');

    if (!dm) {
      console.log(`[DM Route] DM not found, creating new one for participants: [${req.user._id}, ${userId}]`);
      dm = new DirectMessage({
        participants: [req.user._id, userId]
      });
      await dm.save();
      await dm.populate('participants', 'username avatar status');
    }

    res.json(dm);
  } catch (error) {
    console.error('[DM Route] Error in /user/:userId:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get messages for DM
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const dm = await DirectMessage.findById(req.params.id);

    if (!dm) {
      return res.status(404).json({ message: 'DM not found' });
    }

    if (!dm.participants.some(p => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({ channel: null, directMessage: dm._id })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();

    res.json(messages.reverse());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send message to DM
router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { content, attachments } = req.body;
    const dm = await DirectMessage.findById(req.params.id);

    if (!dm) {
      return res.status(404).json({ message: 'DM not found' });
    }

    if (!dm.participants.some(p => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const message = new Message({
      content,
      author: req.user._id,
      channel: null,
      directMessage: dm._id,
      attachments: attachments || []
    });

    await message.save();
    await message.populate('author', 'username avatar');

    dm.updatedAt = new Date();
    await dm.save();

    res.status(201).json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;










