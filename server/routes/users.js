const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Server = require('../models/Server');
const upload = require('../middleware/upload');
const { logGlobalAction } = require('../utils/globalAuditLogger');

router.get('/check-username/:username', auth, async (req, res) => {
  try {
    const { username } = req.params;
    const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingUser = await User.findOne({ username: new RegExp(`^${escapeRegex(username.trim())}$`, 'i') });
    if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
      return res.json({ available: false });
    }
    res.json({ available: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('username displayName primaryServer email avatar status banner badges customStatus theme activity settings');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/profile/:id', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;
    const user = await User.findById(targetUserId).select('-password').populate('primaryServer', 'name icon members').populate('displayedTag.server', 'name icon tag');
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Privacy logic
    const settings = user.settings || {};
    const whoCanSee = Array.isArray(settings.whoCanSeeFullProfile) 
      ? settings.whoCanSeeFullProfile 
      : [settings.whoCanSeeFullProfile || 'everyone'];
    
    let canSeeFull = whoCanSee.includes('everyone');
    
    // Check friendship
    const friendship = await Friendship.findOne({
      $or: [
        { requester: currentUserId, recipient: targetUserId },
        { requester: targetUserId, recipient: currentUserId }
      ]
    });
    const isFriend = friendship && friendship.status === 'accepted';
    if (whoCanSee.includes('friends') && isFriend) canSeeFull = true;

    // Check mutual servers and small servers
    const mutualServers = await Server.find({ 'members.user': { $all: [currentUserId, targetUserId] } }).select('name icon members');
    
    if (whoCanSee.includes('small_servers')) {
      const limit = settings.smallServerLimit || 50;
      const hasSmallServer = mutualServers.some(s => s.members.length <= limit);
      if (hasSmallServer) canSeeFull = true;
    }

    if (whoCanSee.includes('nobody') && targetUserId.toString() !== currentUserId.toString()) canSeeFull = false;
    if (targetUserId.toString() === currentUserId.toString()) canSeeFull = true;

    const currentUserFriendships = await Friendship.find({ $or: [{ requester: currentUserId }, { recipient: currentUserId }], status: 'accepted' });
    const currentUserFriendIds = currentUserFriendships.map(f => f.requester.toString() === currentUserId.toString() ? f.recipient : f.requester);
    const targetUserFriendships = await Friendship.find({ $or: [{ requester: targetUserId }, { recipient: targetUserId }], status: 'accepted' });
    const targetUserFriendIds = targetUserFriendships.map(f => f.requester.toString() === targetUserId.toString() ? f.recipient : f.requester);
    const mutualFriendIds = currentUserFriendIds.filter(id => targetUserFriendIds.some(tid => tid.toString() === id.toString()));
    const mutualFriends = await User.find({ _id: { $in: mutualFriendIds } }).select('username avatar status badges activity displayedTag').populate('displayedTag.server', 'name icon tag');

    // Fetch developments (redacted if not full profile)
    let bots = [];
    let miniApps = [];
    if (canSeeFull) {
      bots = await User.find({ isBot: true, owner: targetUserId, isPublished: true }).select('username avatar badges banner');
      const MiniApp = require('../models/MiniApp');
      miniApps = await MiniApp.find({ owner: targetUserId, isPublished: true }).select('name avatar banner description');
    }

    // Redact user object if not full
    const userObj = user.toObject();
    // Любимые игры (топ по времени) — часть активности, показываем только при полном профиле.
    const { getTopGames } = require('../utils/gamePlaytime');
    userObj.topGames = canSeeFull ? getTopGames(user, 3) : [];
    delete userObj.gameStats;
    if (!canSeeFull) {
      delete userObj.activity;
      delete userObj.developments;
      delete userObj.primaryServer;
      delete userObj.lastActiveAt;
    }

    res.json({
      user: userObj,
      mutualServers: mutualServers.map(s => ({ _id: s._id, name: s.name, icon: s.icon })),
      mutualFriends,
      developments: {
        bots,
        miniApps
      },
      friendship: friendship ? {
        _id: friendship._id,
        status: friendship.status,
        requester: friendship.requester,
        recipient: friendship.recipient
      } : null
    });
  } catch (error) { 
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error' }); 
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { username, displayName, primaryServer, status, bio, badges, bannerColor, displayedTag } = req.body;
    if (username) {
      const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const trimmedUsername = username.trim();
      const existingUser = await User.findOne({ username: new RegExp(`^${escapeRegex(trimmedUsername)}$`, 'i') });
      if (existingUser && existingUser._id.toString() !== req.user._id.toString()) return res.status(400).json({ message: 'Username already taken' });
      req.user.username = trimmedUsername;
    }
    if (displayName !== undefined) req.user.displayName = displayName;
    if (primaryServer !== undefined) {
      req.user.primaryServer = primaryServer === '' ? null : primaryServer;
    }
    if (status) {
      req.user.status = status;
      req.user.statusPreference = status;
    }
    if (bio !== undefined) req.user.bio = bio;
    if (badges !== undefined) req.user.badges = badges;
    if (bannerColor !== undefined) req.user.bannerColor = bannerColor;
    if (displayedTag !== undefined) {
      req.user.displayedTag = {
        type: displayedTag?.type === 'serverTag' ? 'serverTag' : 'badge',
        server: displayedTag?.type === 'serverTag' ? (displayedTag.server || null) : null
      };
    }
    await req.user.save();
    // Populate до эмита/ответа — иначе клиенты (включая себя, через сокет-эхо) получают
    // displayedTag.server голым id и значок сервера перестаёт резолвиться в реальном времени.
    await req.user.populate('displayedTag.server', 'name icon tag');
    const io = req.app.get('io');
    if (io) {
      io.emit('user-updated', { _id: req.user._id, username: req.user.username, status: req.user.status, bio: req.user.bio, avatar: req.user.avatar, banner: req.user.banner, bannerColor: req.user.bannerColor, badges: req.user.badges, displayedTag: req.user.displayedTag });
    }
    res.json({ id: req.user._id, username: req.user.username, email: req.user.email, avatar: req.user.avatar, banner: req.user.banner, bannerColor: req.user.bannerColor, bio: req.user.bio, status: req.user.status, badges: req.user.badges, displayedTag: req.user.displayedTag });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/avatar', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.avatar = null;
    await user.save();
    const io = req.app.get('io');
    if (io) io.emit('user-updated', { _id: user._id, avatar: null });
    res.json({ message: 'Avatar deleted', avatar: null });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/banner', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.banner = null;
    await user.save();
    const io = req.app.get('io');
    if (io) io.emit('user-updated', { _id: user._id, banner: null });
    res.json({ message: 'Banner deleted', banner: null });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    req.user.status = status;
    req.user.statusPreference = status;
    await req.user.save();
    const io = req.app.get('io');
    if (io) io.emit('user-updated', { _id: req.user._id, status: req.user.status });
    res.json({ status: req.user.status });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/avatar', auth, (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const avatarUrl = `/api/uploads/${req.file.filename}`;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.avatar = avatarUrl;
    await user.save();
    const io = req.app.get('io');
    if (io) io.emit('user-updated', { _id: user._id, avatar: avatarUrl });
    res.json({ avatar: avatarUrl, user: { id: user._id, username: user.username, email: user.email, avatar: user.avatar } });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/banner', auth, (req, res, next) => {
  upload.single('banner')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const bannerUrl = `/api/uploads/${req.file.filename}`;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.banner = bannerUrl;
    await user.save();
    const io = req.app.get('io');
    if (io) io.emit('user-updated', { _id: user._id, banner: bannerUrl });
    res.json({ banner: bannerUrl, user: { id: user._id, username: user.username, email: user.email, avatar: user.avatar, banner: user.banner } });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/block', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'User ID required' });
    if (userId === req.user._id.toString()) return res.status(400).json({ message: 'Cannot block yourself' });
    if (!req.user.blockedUsers.includes(userId)) { req.user.blockedUsers.push(userId); await req.user.save(); }
    res.json({ message: 'User blocked' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/unblock', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    req.user.blockedUsers = req.user.blockedUsers.filter(id => id.toString() !== userId);
    await req.user.save();
    res.json({ message: 'User unblocked' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/note', auth, async (req, res) => {
  try {
    const { userId, note } = req.body;
    if (!userId) return res.status(400).json({ message: 'User ID required' });
    if (!req.user.notes) req.user.notes = new Map();
    req.user.notes.set(userId, note);
    await req.user.save();
    res.json({ message: 'Note updated' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.put('/settings', auth, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ message: 'Settings required' });
    
    // Simple deep merge for known interface settings
    if (settings.appearance) {
      req.user.settings.appearance = { ...req.user.settings.appearance, ...settings.appearance };
    }
    if (settings.chat) {
      req.user.settings.chat = { ...req.user.settings.chat, ...settings.chat };
    }
    if (settings.language) {
      req.user.settings.language = { ...req.user.settings.language, ...settings.language };
    }
    if (settings.accessibility) {
      req.user.settings.accessibility = { ...req.user.settings.accessibility, ...settings.accessibility };
    }
    if (settings.streamerMode) {
      req.user.settings.streamerMode = { ...req.user.settings.streamerMode, ...settings.streamerMode };
    }
    if (settings.windows) {
      req.user.settings.windows = { ...req.user.settings.windows, ...settings.windows };
    }
    if (settings.overlay) {
      req.user.settings.overlay = { ...req.user.settings.overlay, ...settings.overlay };
    }
    if (settings.interaction) {
      const currentInteraction = req.user.settings.interaction?.toObject
        ? req.user.settings.interaction.toObject()
        : (req.user.settings.interaction || {});
      const incomingInteraction = settings.interaction;
      const merged = { ...currentInteraction, ...incomingInteraction };
      // voice — вложенный объект в схеме: никогда не присваиваем undefined,
      // глубоко мержим, иначе mongoose падает с CastError "Cast to Object failed".
      merged.voice = { ...(currentInteraction.voice || {}), ...(incomingInteraction.voice || {}) };
      merged.gestures = { ...(currentInteraction.gestures || {}), ...(incomingInteraction.gestures || {}) };
      req.user.settings.interaction = merged;
    }

    // Handle other settings (privacy etc.)
    const otherKeys = ['showActivityStatus', 'activityVisibility', 'hiddenActivities', 'whoCanDM', 'whoCanFindInSearch', 'whoCanSeeFullProfile', 'smallServerLimit'];
    otherKeys.forEach(key => {
      if (settings[key] !== undefined) req.user.settings[key] = settings[key];
    });
    
    req.user.markModified('settings');
    await req.user.save();
    res.json({ settings: req.user.settings });
  } catch (error) { 
    console.error('Settings update error:', error);
    res.status(500).json({ message: 'Server error' }); 
  }
});

router.delete('/me', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Delete all sessions
    const Session = require('../models/Session');
    await Session.deleteMany({ user: userId });
    
    // Delete friendships
    const Friendship = require('../models/Friendship');
    await Friendship.deleteMany({ $or: [{ requester: userId }, { recipient: userId }] });
    
    // Delete messages? Usually we keep them as "Deleted User" or remove them. 
    // Requirement says "полностью удалить аккаунт без возможности восстановления".
    await logGlobalAction({
      executorId: userId,
      action: 'USER_DELETE',
      targetId: userId,
      targetModel: 'User',
      details: { username: req.user.username, email: req.user.email }
    });
    await User.findByIdAndDelete(userId);
    
    res.json({ message: 'Account successfully deleted' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
