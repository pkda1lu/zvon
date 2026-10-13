const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Server = require('../models/Server');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const DirectMessage = require('../models/DirectMessage');
const ReadState = require('../models/ReadState');
const { computePermissions, hasPermission } = require('../utils/permissionCalculator');
const { Permissions } = require('../utils/permissions');

// Сколько условий кладём в один $or: на больших аккаунтах чатов сотни.
const CHUNK = 300;

/*
 * Отметки «прочитано» и счётчики непрочитанного по всем чатам человека:
 * текстовым каналам его серверов (только тем, что он видит) и личным
 * перепискам. Клиент забирает это при входе и после переподключения.
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('readBaselineAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.readBaselineAt) {
      user.readBaselineAt = new Date();
      await user.save();
    }
    const baseline = user.readBaselineAt;

    const servers = await Server.find({ 'members.user': userId }).select('owner members roles');
    const serverById = new Map(servers.map(s => [String(s._id), s]));
    const channels = await Channel.find({
      server: { $in: servers.map(s => s._id) },
      type: { $in: ['text', 'voice', 'room'] },
    });
    const visibleChannels = channels.filter(ch => {
      const server = serverById.get(String(ch.server));
      return server && hasPermission(computePermissions(userId, server, ch), Permissions.VIEW_CHANNEL);
    });
    const dms = await DirectMessage.find({ participants: userId }).select('_id').lean();

    const chats = [
      ...visibleChannels.map(c => ({ id: c._id, field: 'channel' })),
      ...dms.map(d => ({ id: d._id, field: 'directMessage' })),
    ];
    const states = await ReadState.find({ user: userId, chat: { $in: chats.map(c => c.id) } }).lean();
    const lastReadById = new Map(states.map(s => [String(s.chat), s.lastReadAt]));

    const unread = {};
    for (let i = 0; i < chats.length; i += CHUNK) {
      const part = chats.slice(i, i + CHUNK);
      const rows = await Message.aggregate([
        { $match: {
          author: { $ne: new mongoose.Types.ObjectId(String(userId)) },
          $or: part.map(c => ({ [c.field]: c.id, createdAt: { $gt: lastReadById.get(String(c.id)) || baseline } })),
        } },
        { $group: { _id: { $ifNull: ['$channel', '$directMessage'] }, count: { $sum: 1 } } },
      ]);
      for (const row of rows) unread[String(row._id)] = row.count;
    }

    const lastRead = {};
    for (const c of chats) lastRead[String(c.id)] = lastReadById.get(String(c.id)) || baseline;

    res.json({ baselineAt: baseline, lastRead, unread });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
