const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Server = require('../models/Server');
const Message = require('../models/Message');
const Report = require('../models/Report');
const GlobalAuditLog = require('../models/GlobalAuditLog');
const { logGlobalAction } = require('../utils/globalAuditLogger');

// Middleware to check if user is moderator or admin
const isModerator = async (req, res, next) => {
  if (req.user && (req.user.role === 'moderator' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Доступ разрешен только модераторам' });
  }
};

// --- Infrastructure (live system metrics) ---
// Состояние храним между запросами, чтобы считать дельты (CPU idle/total, сеть rx/tx).
let _prevCpu = null;
let _prevNet = null;

function cpuUsagePercent() {
  const cpus = os.cpus() || [];
  let idle = 0, total = 0;
  for (const c of cpus) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  if (!_prevCpu) { _prevCpu = { idle, total }; return 0; }
  const idleDiff = idle - _prevCpu.idle;
  const totalDiff = total - _prevCpu.total;
  _prevCpu = { idle, total };
  if (totalDiff <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100));
}

// Скорость сети (байт/сек) суммарно по всем интерфейсам кроме loopback.
// Читаем /proc/net/dev (Linux — продакшен). На других ОС вернём unavailable.
function networkRates() {
  try {
    const raw = fs.readFileSync('/proc/net/dev', 'utf8');
    let rx = 0, tx = 0;
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([^:]+):\s*(.*)$/);
      if (!m) continue;
      const iface = m[1].trim();
      if (iface === 'lo') continue;
      const cols = m[2].trim().split(/\s+/).map(Number);
      rx += cols[0] || 0;   // receive bytes
      tx += cols[8] || 0;   // transmit bytes
    }
    const now = Date.now();
    if (!_prevNet) { _prevNet = { rx, tx, t: now }; return { rxRate: 0, txRate: 0 }; }
    const dt = (now - _prevNet.t) / 1000 || 1;
    const rxRate = Math.max(0, (rx - _prevNet.rx) / dt);
    const txRate = Math.max(0, (tx - _prevNet.tx) / dt);
    _prevNet = { rx, tx, t: now };
    return { rxRate, txRate };
  } catch {
    return { rxRate: 0, txRate: 0, unavailable: true };
  }
}

router.get('/infrastructure', [auth, isModerator], async (req, res) => {
  try {
    const cpuPct = cpuUsagePercent();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Хранилище: раздел, где лежит сервер. fs.statfs есть в Node 18.15+.
    let storage = { total: 0, used: 0, free: 0, usage: 0, unavailable: true };
    try {
      const root = process.platform === 'win32' ? path.parse(process.cwd()).root : '/';
      const st = await fs.promises.statfs(root);
      const total = st.blocks * st.bsize;
      const free = st.bavail * st.bsize;
      const used = total - free;
      storage = { total, used, free, usage: total ? (used / total) * 100 : 0 };
    } catch (e) { /* statfs недоступен */ }

    const net = networkRates();
    const NET_CAP = 100 * 1024 * 1024; // 100 МБ/с принимаем за 100% шкалы
    const netUsage = Math.min(100, ((net.rxRate + net.txRate) / NET_CAP) * 100);

    res.json({
      cpu: { usage: cpuPct, cores: (os.cpus() || []).length, model: ((os.cpus() || [])[0] || {}).model || '', loadavg: os.loadavg() },
      memory: { total: totalMem, used: usedMem, free: freeMem, usage: totalMem ? (usedMem / totalMem) * 100 : 0 },
      storage,
      network: { rxRate: net.rxRate, txRate: net.txRate, usage: netUsage, unavailable: !!net.unavailable },
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: os.platform()
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

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

router.patch('/users/:id', [auth, isModerator], async (req, res) => {
  try {
    const { username, displayName, email, role, isBanned } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    // Модератор не может действовать против админа и не может менять роли —
    // иначе появляется эскалация привилегий (мод повышает себя/банит админа).
    const isExecutorAdmin = req.user.role === 'admin';
    if (!isExecutorAdmin && user.role === 'admin') {
      return res.status(403).json({ message: 'Нельзя изменять администратора' });
    }
    if (role && !isExecutorAdmin) {
      return res.status(403).json({ message: 'Менять роли может только администратор' });
    }

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

router.delete('/users/:id', [auth, isModerator], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    // Модератор не может удалить администратора.
    if (req.user.role !== 'admin' && user.role === 'admin') {
      return res.status(403).json({ message: 'Нельзя удалить администратора' });
    }

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

router.delete('/servers/:id', [auth, isModerator], async (req, res) => {
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
