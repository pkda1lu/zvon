const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const DirectMessage = require('../models/DirectMessage');
const Message = require('../models/Message');
const User = require('../models/User');
const { canDirectMessage } = require('../utils/privacy');
const { pushIfOffline } = require('../utils/webPush');

router.get('/', auth, async (req, res) => {
  try {
    const dms = await DirectMessage.find({ participants: req.user._id }).populate({ path: 'participants', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }).sort({ updatedAt: -1 });
    res.json(dms);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const dm = await DirectMessage.findById(req.params.id).populate({ path: 'participants', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    if (!dm) return res.status(404).json({ message: 'DM not found' });
    if (!dm.participants.some(p => p._id.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Access denied' });
    res.json(dm);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user ID' });
    if (userId === req.user._id.toString()) return res.status(400).json({ message: 'Cannot create DM with yourself' });
    let dm = await DirectMessage.findOne({ participants: { $size: 2, $all: [req.user._id, userId] } }).populate({ path: 'participants', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    if (!dm) {
      // Приватность: проверяем настройки получателя только при создании НОВОГО диалога
      // (существующую переписку никогда не блокируем).
      const target = await User.findById(userId).select('settings blockedUsers');
      if (!target) return res.status(404).json({ message: 'User not found' });
      if (!(await canDirectMessage(req.user._id, target))) {
        return res.status(403).json({ message: 'Этот пользователь ограничил круг тех, кто может писать ему первым' });
      }
      dm = new DirectMessage({ participants: [req.user._id, userId] });
      await dm.save();
      await dm.populate({ path: 'participants', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    }
    res.json(dm);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Начать (или открыть существующий) чат «от имени модерации» с пользователем.
// Доступно только модераторам и админам. Такой чат отдельный от обычного 1:1.
router.post('/moderation/:userId', auth, async (req, res) => {
  try {
    if (!req.user || (req.user.role !== 'moderator' && req.user.role !== 'admin')) {
      return res.status(403).json({ message: 'Доступ разрешён только модераторам' });
    }
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user ID' });
    if (userId === req.user._id.toString()) return res.status(400).json({ message: 'Cannot create DM with yourself' });

    let dm = await DirectMessage.findOne({
      isModeration: true,
      participants: { $size: 2, $all: [req.user._id, userId] },
    }).populate({ path: 'participants', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });

    if (!dm) {
      dm = new DirectMessage({
        participants: [req.user._id, userId],
        isModeration: true,
        moderator: req.user._id,
      });
      await dm.save();
      await dm.populate({ path: 'participants', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    }
    res.json(dm);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/group', auth, async (req, res) => {
  try {
    const { userIds, name } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length < 1) {
      return res.status(400).json({ message: 'At least one other user is required' });
    }

    // Include the creator in the participants
    const participants = [...new Set([...userIds, req.user._id.toString()])];

    // If it's just 2 people total, check if a DM already exists
    if (participants.length === 2) {
      let dm = await DirectMessage.findOne({ participants: { $size: 2, $all: participants } }).populate({ path: 'participants', select: 'username avatar status badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      if (dm) return res.json(dm);
      // Создание 1:1 через групповой эндпоинт — применяем те же правила приватности,
      // что и для обычного ЛС, чтобы их нельзя было обойти.
      const otherId = participants.find(id => id !== req.user._id.toString());
      const target = otherId ? await User.findById(otherId).select('settings blockedUsers') : null;
      if (!target) return res.status(404).json({ message: 'User not found' });
      if (!(await canDirectMessage(req.user._id, target))) {
        return res.status(403).json({ message: 'Этот пользователь ограничил круг тех, кто может писать ему первым' });
      }
    }

    const dm = new DirectMessage({
      participants,
      name: name || null
    });

    await dm.save();
    await dm.populate('participants', 'username avatar status activity');

    // Сообщаем добавленным, что их куда-то позвали. Только для настоящих групп:
    // при participants.length === 2 это обычный личный чат, и уведомлять не о
    // чем — там сработает уведомление о первом сообщении.
    if (dm.participants.length > 2) {
      const io = req.app.get('io');
      const creatorName = req.user.username || 'Кто-то';
      const groupTitle = dm.name || 'Групповой чат';
      dm.participants.forEach(p => {
        if (String(p._id) === String(req.user._id)) return;
        pushIfOffline(io, p._id, {
          title: groupTitle,
          body: `${creatorName} добавил вас в групповой чат`,
          tag: `dm-${dm._id}`,
          url: `/?dm=${dm._id}`,
          data: { type: 'dm-group-added', dmId: String(dm._id) }
        });
      });
    }

    res.status(201).json(dm);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id/messages', auth, async (req, res) => {
  try {
    const { limit = 50, before, after } = req.query;
    const dm = await DirectMessage.findById(req.params.id);
    if (!dm) return res.status(404).json({ message: 'DM not found' });
    if (!dm.participants.some(p => p.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Access denied' });

    let query = { channel: null, directMessage: dm._id };
    if (before) query.createdAt = { $lt: new Date(before) };
    else if (after) query.createdAt = { $gt: new Date(after) };
    const sort = after ? { createdAt: 1 } : { createdAt: -1 };

    const messages = await Message.find(query)
      .populate({ path: 'author', select: 'username avatar badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } })
      .populate({ path: 'mentions', select: 'username avatar badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } })
      .sort(sort)
      .limit(parseInt(limit))
      .exec();
    res.json(after ? messages : messages.reverse());
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/:id/messages/search', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (q.length < 2) return res.json({ results: [], hasMore: false });
    const limit = Math.min(parseInt(req.query.limit) || 30, 50);
    const before = req.query.before;

    const dm = await DirectMessage.findById(req.params.id).select('participants');
    if (!dm) return res.status(404).json({ message: 'DM not found' });
    if (!dm.participants.some(p => p.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Access denied' });

    const query = {
      channel: null,
      directMessage: dm._id,
      content: { $regex: escapeRegex(q), $options: 'i' },
    };
    if (before) query.createdAt = { $lt: new Date(before) };

    const results = await Message.find(query)
      .populate({ path: 'author', select: 'username avatar badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } })
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = results.length > limit;
    res.json({ results: hasMore ? results.slice(0, limit) : results, hasMore });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { content, attachments, type } = req.body;
    const dm = await DirectMessage.findById(req.params.id);
    if (!dm) return res.status(404).json({ message: 'DM not found' });
    if (!dm.participants.some(p => p.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Access denied' });
    const message = new Message({ content, author: req.user._id, channel: null, directMessage: dm._id, attachments: attachments || [], type: type || 'default' });
    await message.save();
    await message.populate({ path: 'author', select: 'username avatar badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
    dm.updatedAt = new Date();
    await dm.save();
    const io = req.app.get('io');
    if (io) dm.participants.forEach(participantId => { io.to(`user-${participantId}`).emit('new-message', message); });
    res.status(201).json(message);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Полное удаление личного чата у всех участников вместе с историей сообщений.
router.delete('/:id', auth, async (req, res) => {
  try {
    const dm = await DirectMessage.findById(req.params.id);
    if (!dm) return res.status(404).json({ message: 'DM not found' });
    if (!dm.participants.some(p => p.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Access denied' });

    const participants = dm.participants.map(p => p.toString());

    await Message.deleteMany({ directMessage: dm._id });
    await DirectMessage.findByIdAndDelete(dm._id);

    const io = req.app.get('io');
    if (io) participants.forEach(pid => io.to(`user-${pid}`).emit('dm-deleted', { dmId: dm._id.toString() }));

    res.json({ message: 'DM deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id/pins', auth, async (req, res) => {
  try {
    const dmId = req.params.id;
    const pins = await Message.find({ directMessage: dmId, pinned: true })
      .populate({ path: 'author', select: 'username avatar badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } })
      .populate({ path: 'mentions', select: 'username avatar badges activity displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } })
      .sort({ pinnedAt: -1 });
    res.json(pins);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
