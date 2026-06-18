const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Server = require('../models/Server');
const Message = require('../models/Message');
const Report = require('../models/Report');
const GlobalAuditLog = require('../models/GlobalAuditLog');
const { logGlobalAction } = require('../utils/globalAuditLogger');

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Доступ разрешен только администраторам' });
  }
};

// Middleware to check if user is moderator or admin
const isModerator = async (req, res, next) => {
  if (req.user && (req.user.role === 'moderator' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Доступ разрешен только модераторам' });
  }
};

// --- Statistics ---
router.get('/stats', [auth, isModerator], async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalServers = await Server.countDocuments();
    const totalMessages = await Message.countDocuments();

    // Stats for charts (grouped by day for the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const userStats = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    const serverStats = await Server.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    const messageStats = await Message.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    res.json({
      totals: {
        users: totalUsers,
        servers: totalServers,
        messages: totalMessages
      },
      charts: {
        users: userStats,
        servers: serverStats,
        messages: messageStats
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// --- User Management ---
router.get('/users', [auth, isModerator], async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } }
      ];
    }
    const users = await User.find(query)
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort('-createdAt');
    const total = await User.countDocuments(query);
    res.json({ users, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.patch('/users/:id', [auth, isAdmin], async (req, res) => {
  try {
    const { username, displayName, email, role, isBanned } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const oldData = user.toObject();
    if (username) user.username = username;
    if (displayName !== undefined) user.displayName = displayName;
    if (email) user.email = email;
    if (role) user.role = role;
    if (isBanned !== undefined) user.isBanned = isBanned;

    await user.save();
    
    await logGlobalAction({
      executorId: req.user._id,
      action: 'USER_UPDATE',
      targetId: user._id,
      targetModel: 'User',
      details: {
        changes: {
          username: oldData.username !== user.username ? { old: oldData.username, new: user.username } : undefined,
          role: oldData.role !== user.role ? { old: oldData.role, new: user.role } : undefined,
          isBanned: oldData.isBanned !== user.isBanned ? { old: oldData.isBanned, new: user.isBanned } : undefined
        }
      }
    });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.delete('/users/:id', [auth, isAdmin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    await logGlobalAction({
      executorId: req.user._id,
      action: 'USER_DELETE',
      targetId: user._id,
      targetModel: 'User',
      details: { username: user.username, email: user.email }
    });

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Пользователь успешно удален' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// --- Server Management ---
router.get('/servers', [auth, isModerator], async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    const servers = await Server.find(query)
      .populate('owner', 'username avatar')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort('-createdAt');
    const total = await Server.countDocuments(query);
    res.json({ servers, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.delete('/servers/:id', [auth, isAdmin], async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Сервер не найден' });

    await logGlobalAction({
      executorId: req.user._id,
      action: 'SERVER_DELETE',
      targetId: server._id,
      targetModel: 'Server',
      details: { name: server.name }
    });

    await Server.findByIdAndDelete(req.params.id);
    res.json({ message: 'Сервер успешно удален' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// --- Send moderation notification ---
// Доставляем сообщение «от модерации» в уведомления пользователю (или владельцу
// сервера) через socket-событие 'notification', которое клиент уже умеет показывать.
router.post('/notify', [auth, isModerator], async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message || !String(message).trim()) {
      return res.status(400).json({ message: 'Нужны userId и текст сообщения' });
    }
    const target = await User.findById(userId).select('_id username');
    if (!target) return res.status(404).json({ message: 'Пользователь не найден' });

    const text = String(message).trim();
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${target._id}`).emit('notification', {
        type: 'moderation_message',
        message: text,
        timestamp: new Date()
      });
    }

    await logGlobalAction({
      executorId: req.user._id,
      action: 'MODERATION_NOTIFY',
      targetId: target._id,
      targetModel: 'User',
      details: { message: text }
    });

    res.json({ message: 'Уведомление отправлено' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// --- Actions (Audit Log) ---
router.get('/actions', [auth, isModerator], async (req, res) => {
  try {
    const { action, hours = 24, page = 1, limit = 50 } = req.query;
    const query = {};
    if (action) query.action = action;
    
    const timeLimit = new Date();
    timeLimit.setHours(timeLimit.getHours() - parseInt(hours));
    query.createdAt = { $gte: timeLimit };

    const logs = await GlobalAuditLog.find(query)
      .populate('executor', 'username avatar')
      // refPath-populate: исключаем чувствительные поля (для User-целей это пароль/токены).
      .populate({ path: 'target', select: '-password -botToken -verificationCode -verificationCodeExpires -resetPasswordCode -twoFactorSecret' })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort('-createdAt');
    
    const total = await GlobalAuditLog.countDocuments(query);
    res.json({ logs, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
