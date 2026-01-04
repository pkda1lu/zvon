const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Friendship = require('../models/Friendship');
const User = require('../models/User');

// Get all friends
router.get('/', auth, async (req, res) => {
  try {
    const friendships = await Friendship.find({
      $or: [
        { requester: req.user._id, status: 'accepted' },
        { recipient: req.user._id, status: 'accepted' }
      ]
    })
      .populate('requester', 'username avatar status')
      .populate('recipient', 'username avatar status');

    const friends = friendships.map(friendship => {
      const friend = friendship.requester._id.toString() === req.user._id.toString()
        ? friendship.recipient
        : friendship.requester;
      return {
        ...friend.toObject(),
        friendshipId: friendship._id
      };
    });

    res.json(friends);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pending friend requests
router.get('/pending', auth, async (req, res) => {
  try {
    const requests = await Friendship.find({
      recipient: req.user._id,
      status: 'pending'
    })
      .populate('requester', 'username avatar status');

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send friend request
router.post('/request', auth, async (req, res) => {
  try {
    const { userId } = req.body;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot add yourself as friend' });
    }

    const recipient = await User.findById(userId);
    if (!recipient) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if friendship already exists
    const existing = await Friendship.findOne({
      $or: [
        { requester: req.user._id, recipient: userId },
        { requester: userId, recipient: req.user._id }
      ]
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ message: 'Already friends' });
      }
      if (existing.status === 'pending' && existing.recipient.toString() === userId) {
        return res.status(400).json({ message: 'Friend request already sent' });
      }
      if (existing.status === 'pending' && existing.requester.toString() === userId) {
        // Accept existing request
        existing.status = 'accepted';
        await existing.save();
        return res.json({ message: 'Friend request accepted', friendship: existing });
      }
    }

    const friendship = new Friendship({
      requester: req.user._id,
      recipient: userId,
      status: 'pending'
    });

    await friendship.save();
    await friendship.populate('requester', 'username avatar status');
    await friendship.populate('recipient', 'username avatar status');

    res.status(201).json(friendship);
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Friend request already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept friend request
router.post('/accept/:id', auth, async (req, res) => {
  try {
    const friendship = await Friendship.findById(req.params.id);

    if (!friendship) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    if (friendship.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (friendship.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    friendship.status = 'accepted';
    await friendship.save();
    await friendship.populate('requester', 'username avatar status');
    await friendship.populate('recipient', 'username avatar status');

    res.json(friendship);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reject/Remove friend
router.delete('/:id', auth, async (req, res) => {
  try {
    const friendship = await Friendship.findById(req.params.id);

    if (!friendship) {
      return res.status(404).json({ message: 'Friendship not found' });
    }

    const isRequester = friendship.requester.toString() === req.user._id.toString();
    const isRecipient = friendship.recipient.toString() === req.user._id.toString();

    if (!isRequester && !isRecipient) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Friendship.findByIdAndDelete(req.params.id);

    res.json({ message: 'Friendship removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search users
router.get('/search', auth, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json([]);
    }

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ],
      _id: { $ne: req.user._id }
    })
      .select('username avatar status email')
      .limit(20);

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;




