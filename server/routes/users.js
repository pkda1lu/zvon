const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Server = require('../models/Server');
const upload = require('../middleware/upload');
const path = require('path');

// Get basic user info
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile with mutuals
router.get('/profile/:id', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    const user = await User.findById(targetUserId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Mutual Servers
    const mutualServers = await Server.find({
      'members.user': { $all: [currentUserId, targetUserId] }
    }).select('name icon');

    // Mutual Friends
    // 1. Get current user's friends
    const currentUserFriendships = await Friendship.find({
      $or: [{ requester: currentUserId }, { recipient: currentUserId }],
      status: 'accepted'
    });
    const currentUserFriendIds = currentUserFriendships.map(f =>
      f.requester.toString() === currentUserId.toString() ? f.recipient : f.requester
    );

    // 2. Get target user's friends
    const targetUserFriendships = await Friendship.find({
      $or: [{ requester: targetUserId }, { recipient: targetUserId }],
      status: 'accepted'
    });
    const targetUserFriendIds = targetUserFriendships.map(f =>
      f.requester.toString() === targetUserId.toString() ? f.recipient : f.requester
    );

    // 3. Find intersection
    const mutualFriendIds = currentUserFriendIds.filter(id =>
      targetUserFriendIds.some(tid => tid.toString() === id.toString())
    );

    const mutualFriends = await User.find({ _id: { $in: mutualFriendIds } }).select('username avatar status');

    res.json({
      user,
      mutualServers,
      mutualFriends
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { username, status, bio } = req.body;

    if (username) {
      const existingUser = await User.findOne({ username });
      if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
        return res.status(400).json({ message: 'Username already taken' });
      }
      req.user.username = username;
    }

    if (status) {
      req.user.status = status;
    }

    if (bio !== undefined) {
      req.user.bio = bio;
    }

    await req.user.save();

    // Broadcast update via socket
    const io = req.app.get('io');
    if (io) {
      io.emit('user-updated', {
        _id: req.user._id,
        username: req.user.username,
        status: req.user.status,
        bio: req.user.bio,
        avatar: req.user.avatar,
        banner: req.user.banner
      });
    }

    res.json({
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      avatar: req.user.avatar,
      banner: req.user.banner,
      bio: req.user.bio,
      status: req.user.status
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user status
router.put('/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    req.user.status = status;
    await req.user.save();

    // Broadcast status update
    const io = req.app.get('io');
    if (io) {
      io.emit('user-updated', {
        _id: req.user._id,
        status: req.user.status
      });
    }

    res.json({ status: req.user.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload avatar
router.post('/avatar', auth, (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ message: err.message || 'File upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const avatarUrl = `/api/uploads/${req.file.filename}`;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.avatar = avatarUrl;
    await user.save();

    // Broadcast avatar update
    const io = req.app.get('io');
    if (io) {
      io.emit('user-updated', {
        _id: user._id,
        avatar: avatarUrl
      });
    }

    res.json({
      avatar: avatarUrl,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Upload banner
router.post('/banner', auth, (req, res, next) => {
  upload.single('banner')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ message: err.message || 'File upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const bannerUrl = `/api/uploads/${req.file.filename}`;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.banner = bannerUrl;
    await user.save();

    // Broadcast banner update
    const io = req.app.get('io');
    if (io) {
      io.emit('user-updated', {
        _id: user._id,
        banner: bannerUrl
      });
    }

    res.json({
      banner: bannerUrl,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        banner: user.banner
      }
    });
  } catch (error) {
    console.error('Banner upload error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Block user
router.post('/block', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'User ID required' });
    if (userId === req.user._id.toString()) return res.status(400).json({ message: 'Cannot block yourself' });

    if (!req.user.blockedUsers.includes(userId)) {
      req.user.blockedUsers.push(userId);
      await req.user.save();
    }
    res.json({ message: 'User blocked' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Unblock user
router.post('/unblock', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    req.user.blockedUsers = req.user.blockedUsers.filter(id => id.toString() !== userId);
    await req.user.save();
    res.json({ message: 'User unblocked' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update note
router.post('/note', auth, async (req, res) => {
  try {
    const { userId, note } = req.body;
    if (!userId) return res.status(400).json({ message: 'User ID required' });

    if (!req.user.notes) req.user.notes = new Map();
    req.user.notes.set(userId, note);
    await req.user.save();
    res.json({ message: 'Note updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

