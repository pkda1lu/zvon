const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { friendIdSet } = require('../utils/privacy');

router.get('/', auth, async (req, res) => {
  try {
    const friendships = await Friendship.find({ $or: [{ requester: req.user._id, status: 'accepted' }, { recipient: req.user._id, status: 'accepted' }] }).populate({ path: 'requester', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).populate({ path: 'recipient', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    const friends = friendships.map(f => {
      const friend = f.requester._id.toString() === req.user._id.toString() ? f.recipient : f.requester;
      return { ...friend.toObject(), friendshipId: f._id };
    });
    res.json(friends);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/pending', auth, async (req, res) => {
  try {
    const requests = await Friendship.find({ recipient: req.user._id, status: 'pending' }).populate({ path: 'requester', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    res.json(requests);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/request', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    if (userId === req.user._id.toString()) return res.status(400).json({ message: 'Cannot add yourself as friend' });
    const recipient = await User.findById(userId);
    if (!recipient) return res.status(404).json({ message: 'User not found' });
    const existing = await Friendship.findOne({ $or: [{ requester: req.user._id, recipient: userId }, { requester: userId, recipient: req.user._id }] });
    if (existing) {
      if (existing.status === 'accepted') return res.status(400).json({ message: 'Already friends' });
      if (existing.status === 'pending' && existing.recipient.toString() === userId) return res.status(400).json({ message: 'Friend request already sent' });
      if (existing.status === 'pending' && existing.requester.toString() === userId) {
        existing.status = 'accepted';
        await existing.save();
        return res.json({ message: 'Friend request accepted', friendship: existing });
      }
    }
    const friendship = new Friendship({ requester: req.user._id, recipient: userId, status: 'pending' });
    await friendship.save();
    await friendship.populate({ path: 'requester', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    await friendship.populate({ path: 'recipient', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });

    // Notify recipient
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${userId}`).emit('friend-request', friendship);
    }

    res.status(201).json(friendship);
  } catch (error) { if (error.code === 11000) return res.status(400).json({ message: 'Friend request already exists' }); res.status(500).json({ message: 'Server error' }); }
});

router.post('/accept/:id', auth, async (req, res) => {
  try {
    const friendship = await Friendship.findById(req.params.id);
    if (!friendship) return res.status(404).json({ message: 'Friend request not found' });
    if (friendship.recipient.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Not authorized' });
    if (friendship.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });
    friendship.status = 'accepted';
    await friendship.save();
    await friendship.populate({ path: 'requester', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    await friendship.populate({ path: 'recipient', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });

    // Notify requester
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${friendship.requester._id}`).emit('friend-request-accepted', friendship);
    }

    res.json(friendship);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const friendship = await Friendship.findById(req.params.id);
    if (!friendship) return res.status(404).json({ message: 'Friendship not found' });
    const isRequester = friendship.requester.toString() === req.user._id.toString();
    const isRecipient = friendship.recipient.toString() === req.user._id.toString();
    if (!isRequester && !isRecipient) return res.status(403).json({ message: 'Not authorized' });
    await Friendship.findByIdAndDelete(req.params.id);
    res.json({ message: 'Friendship removed' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/search', auth, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string' || query.length < 2) return res.json([]);
    const viewerId = req.user._id;
    // Экранируем спецсимволы regex (защита от ReDoS / regex-инъекции).
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Поиск только по нику; почту не ищем и не отдаём (приватность).
    // Берём с запасом (40), т.к. часть кандидатов отсеется по настройкам приватности.
    const candidates = await User.find({
      username: { $regex: safe, $options: 'i' },
      _id: { $ne: viewerId }
    }).select('username avatar status badges activity settings blockedUsers displayedTag').populate('displayedTag.server', 'name icon tag').limit(40);

    // Друзья текущего пользователя — нужны для правила «друзья друзей».
    const viewerFr = await Friendship.find({
      status: 'accepted',
      $or: [{ requester: viewerId }, { recipient: viewerId }]
    }).select('requester recipient');
    const viewerFriendIds = friendIdSet(viewerFr, viewerId);

    // Для кандидатов с правилом «друзья друзей» одним запросом достаём их друзей.
    const fofIds = candidates
      .filter(u => (u.settings?.whoCanFindInSearch || 'everyone') === 'friends_of_friends')
      .map(u => u._id);
    const friendsByUser = new Map();
    if (fofIds.length) {
      const fr = await Friendship.find({
        status: 'accepted',
        $or: [{ requester: { $in: fofIds } }, { recipient: { $in: fofIds } }]
      }).select('requester recipient');
      for (const f of fr) {
        const r = f.requester.toString();
        const rc = f.recipient.toString();
        if (!friendsByUser.has(r)) friendsByUser.set(r, new Set());
        if (!friendsByUser.has(rc)) friendsByUser.set(rc, new Set());
        friendsByUser.get(r).add(rc);
        friendsByUser.get(rc).add(r);
      }
    }

    const visible = candidates.filter(u => {
      // Заблокировавший текущего пользователя не показывается.
      if ((u.blockedUsers || []).some(id => id.toString() === viewerId.toString())) return false;
      const rule = u.settings?.whoCanFindInSearch || 'everyone';
      if (rule === 'everyone') return true;
      if (rule === 'nobody') return false;
      if (rule === 'friends_of_friends') {
        // Прямой друг тоже проходит.
        if (viewerFriendIds.has(u._id.toString())) return true;
        const theirFriends = friendsByUser.get(u._id.toString());
        if (!theirFriends) return false;
        for (const fid of theirFriends) if (viewerFriendIds.has(fid)) return true;
        return false;
      }
      return true;
    }).slice(0, 20).map(u => ({
      _id: u._id, username: u.username, avatar: u.avatar,
      status: u.status, badges: u.badges, activity: u.activity
    }));

    res.json(visible);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
