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
const Session = require('../models/Session');
const VoiceSession = require('../models/VoiceSession');
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

    let totalMiniApps = 0;
    try {
      const MiniApp = require('../models/MiniApp');
      totalMiniApps = await MiniApp.countDocuments();
    } catch (e) {}
    const totalBots = await User.countDocuments({ isBot: true });

    let startDate, endDate;
    if (req.query.after || req.query.before) {
      if (req.query.after) {
        const parts = String(req.query.after).split('T')[0].split('-').map(Number);
        startDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
      } else {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      }
      if (req.query.before) {
        const parts = String(req.query.before).split('T')[0].split('-').map(Number);
        endDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
      } else {
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      const range = req.query.range || '30d';
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      if (range === 'all') {
        // Первый день существования платформы (по дате первого пользователя)
        const earliestUser = await User.findOne().sort({ createdAt: 1 }).select('createdAt').lean();
        if (earliestUser && earliestUser.createdAt) {
          const d = new Date(earliestUser.createdAt);
          startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        } else {
          const d = new Date();
          d.setDate(d.getDate() - 29);
          startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        }
      } else {
        const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
        const d = new Date();
        d.setDate(d.getDate() - (days - 1));
        startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      }
    }

    const dailyNewUsers = await User.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    const dailyNewServers = await Server.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    const dailyMessages = await Message.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Активность по отправке сообщений (DAU авторов сообщений)
    const activeUsersDaily = await Message.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, author: "$author" } } },
      { $group: { _id: "$_id.day", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // 1. Уникальные пользователи онлайн по дням (DAU Online)
    let onlineUsersAgg = [];
    try {
      onlineUsersAgg = await Session.aggregate([
        {
          $match: {
            $or: [
              { lastActiveAt: { $gte: startDate, $lte: endDate } },
              { createdAt: { $gte: startDate, $lte: endDate } }
            ]
          }
        },
        {
          $project: {
            user: 1,
            activeDate: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ["$lastActiveAt", null] },
                    { $gte: ["$lastActiveAt", startDate] },
                    { $lte: ["$lastActiveAt", endDate] }
                  ]
                },
                then: "$lastActiveAt",
                else: "$createdAt"
              }
            }
          }
        },
        {
          $match: {
            activeDate: { $ne: null }
          }
        },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$activeDate" } },
              user: "$user"
            }
          }
        },
        {
          $group: {
            _id: "$_id.day",
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (e) {
      console.error('Session DAU aggregate error:', e);
      onlineUsersAgg = [];
    }

    // 1.1. Статистика заходов по брендингам (динамически из BRANDS)
    const { BRANDS } = require('../utils/branding');
    const knownBrandKeys = Object.keys(BRANDS).length > 0 ? Object.keys(BRANDS) : ['zvon'];
    if (!knownBrandKeys.includes('zvon')) knownBrandKeys.unshift('zvon');

    let brandingAgg = [];
    try {
      brandingAgg = await Session.aggregate([
        {
          $match: {
            $or: [
              { lastActiveAt: { $gte: startDate, $lte: endDate } },
              { createdAt: { $gte: startDate, $lte: endDate } }
            ]
          }
        },
        {
          $project: {
            user: 1,
            brand: { $ifNull: ["$brand", "zvon"] },
            activeDate: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ["$lastActiveAt", null] },
                    { $gte: ["$lastActiveAt", startDate] },
                    { $lte: ["$lastActiveAt", endDate] }
                  ]
                },
                then: "$lastActiveAt",
                else: "$createdAt"
              }
            }
          }
        },
        {
          $match: {
            activeDate: { $ne: null }
          }
        },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$activeDate" } },
              user: "$user",
              brand: "$brand"
            }
          }
        },
        {
          $group: {
            _id: {
              day: "$_id.day",
              brand: "$_id.brand"
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.day": 1 } }
      ]);
    } catch (e) {
      console.error('Branding visits aggregate error:', e);
      brandingAgg = [];
    }

    // Если в brandingAgg пусто, но есть онлайн-пользователи в onlineUsersAgg,
    // считаем эти существующие сессии как бренд zvon
    if ((!brandingAgg || brandingAgg.length === 0) && (onlineUsersAgg && onlineUsersAgg.length > 0)) {
      brandingAgg = onlineUsersAgg.map(item => ({
        _id: {
          day: item._id,
          brand: 'zvon'
        },
        count: item.count
      }));
    }

    // 2. Голосовая статистика (VoiceSession)
    let voiceHoursAgg = [];
    try {
      voiceHoursAgg = await VoiceSession.aggregate([
        { $match: { joinedAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$joinedAt" } },
            totalSeconds: { $sum: "$durationSeconds" },
            sessionsCount: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 1,
            count: { $round: [{ $divide: ["$totalSeconds", 3600] }, 1] },
            sessionsCount: 1
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (e) {
      console.error('Voice hours aggregate error:', e);
      voiceHoursAgg = [];
    }

    // б) Сеансы голосовых по дням
    const voiceSessionsAgg = (voiceHoursAgg || []).map(v => ({ _id: v._id, count: v.sessionsCount || 0 }));

    // в) Уникальные пользователи в голосовых по дням (Voice DAU)
    let voiceUsersAgg = [];
    try {
      voiceUsersAgg = await VoiceSession.aggregate([
        { $match: { joinedAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$joinedAt" } },
              user: "$user"
            }
          }
        },
        {
          $group: {
            _id: "$_id.day",
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (e) {
      console.error('Voice users aggregate error:', e);
      voiceUsersAgg = [];
    }

    // Общее суммарное время во всех голосовых сессиях на платформе
    let totalVoiceHours = 0;
    let totalVoiceSessions = 0;
    try {
      const voiceTotalsAgg = await VoiceSession.aggregate([
        {
          $group: {
            _id: null,
            totalSeconds: { $sum: "$durationSeconds" },
            totalSessions: { $sum: 1 }
          }
        }
      ]);
      const totalVoiceSeconds = (voiceTotalsAgg[0] && voiceTotalsAgg[0].totalSeconds) || 0;
      totalVoiceHours = Math.round((totalVoiceSeconds / 3600) * 10) / 10;
      totalVoiceSessions = (voiceTotalsAgg[0] && voiceTotalsAgg[0].totalSessions) || 0;
    } catch (e) {
      console.error('Voice totals aggregate error:', e);
    }

    // Голосовые часы до начала периода (для накопительного графика)
    let voiceHoursBeforePeriod = 0;
    try {
      const voiceBeforePeriodAgg = await VoiceSession.aggregate([
        { $match: { joinedAt: { $lt: startDate } } },
        { $group: { _id: null, totalSeconds: { $sum: "$durationSeconds" } } }
      ]);
      voiceHoursBeforePeriod = Math.round((((voiceBeforePeriodAgg[0] && voiceBeforePeriodAgg[0].totalSeconds) || 0) / 3600) * 10) / 10;
    } catch (e) {
      console.error('Voice before period aggregate error:', e);
    }

    function buildDailyTimeline(startD, endD, aggList, isCumulative = false, initialValue = 0) {
      const map = new Map();
      (aggList || []).forEach(item => map.set(item._id, item.count || 0));

      const result = [];
      const cur = new Date(Date.UTC(startD.getFullYear(), startD.getMonth(), startD.getDate()));
      const end = new Date(Date.UTC(endD.getFullYear(), endD.getMonth(), endD.getDate()));

      let running = initialValue;

      while (cur <= end) {
        const y = cur.getUTCFullYear();
        const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
        const d = String(cur.getUTCDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const count = map.get(dateStr) || 0;
        if (isCumulative) {
          running = Math.round((running + count) * 10) / 10;
          result.push({ _id: dateStr, count: Math.max(0, running) });
        } else {
          result.push({ _id: dateStr, count });
        }

        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      return result;
    }

    function buildBrandingTimeline(startD, endD, aggList) {
      const dateBrandMap = new Map();

      (aggList || []).forEach(item => {
        if (item._id && item._id.day) {
          const day = item._id.day;
          const rawBrand = item._id.brand || 'zvon';
          const brand = BRANDS[rawBrand] ? rawBrand : 'zvon';
          if (!dateBrandMap.has(day)) {
            dateBrandMap.set(day, {});
          }
          const dayObj = dateBrandMap.get(day);
          dayObj[brand] = (dayObj[brand] || 0) + (item.count || 0);
        }
      });

      const result = [];
      const cur = new Date(Date.UTC(startD.getFullYear(), startD.getMonth(), startD.getDate()));
      const end = new Date(Date.UTC(endD.getFullYear(), endD.getMonth(), endD.getDate()));

      while (cur <= end) {
        const y = cur.getUTCFullYear();
        const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
        const d = String(cur.getUTCDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const dayCounts = dateBrandMap.get(dateStr) || {};
        let dayTotal = 0;
        const entry = { _id: dateStr, total: 0 };

        knownBrandKeys.forEach(k => {
          const cnt = dayCounts[k] || 0;
          entry[k] = cnt;
          dayTotal += cnt;
        });
        entry.total = dayTotal;

        result.push(entry);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      return result;
    }

    const usersBeforePeriod = await User.countDocuments({ createdAt: { $lt: startDate } });
    const serversBeforePeriod = await Server.countDocuments({ createdAt: { $lt: startDate } });
    const messagesBeforePeriod = await Message.countDocuments({ createdAt: { $lt: startDate } });

    const usersDaily = buildDailyTimeline(startDate, endDate, dailyNewUsers);
    const usersCumulative = buildDailyTimeline(startDate, endDate, dailyNewUsers, true, usersBeforePeriod);
    const serversDaily = buildDailyTimeline(startDate, endDate, dailyNewServers);
    const serversCumulative = buildDailyTimeline(startDate, endDate, dailyNewServers, true, serversBeforePeriod);
    const messagesDailyChart = buildDailyTimeline(startDate, endDate, dailyMessages);
    const messagesCumulative = buildDailyTimeline(startDate, endDate, dailyMessages, true, messagesBeforePeriod);
    const activeUsersDailyChart = buildDailyTimeline(startDate, endDate, activeUsersDaily);

    // Новые графики:
    const onlineUsersDailyChart = buildDailyTimeline(startDate, endDate, onlineUsersAgg);
    const brandingDailyChart = buildBrandingTimeline(startDate, endDate, brandingAgg);

    const brandTotals = {};
    let totalBrandVisits = 0;
    knownBrandKeys.forEach(k => {
      const sum = brandingDailyChart.reduce((acc, item) => acc + (item[k] || 0), 0);
      brandTotals[k] = sum;
      totalBrandVisits += sum;
    });

    const brandingList = knownBrandKeys.map(k => {
      const count = brandTotals[k] || 0;
      const percent = totalBrandVisits > 0 ? Math.round((count / totalBrandVisits) * 100) : (k === 'zvon' ? 100 : 0);
      return {
        id: k,
        name: BRANDS[k]?.name || k,
        color: BRANDS[k]?.color || '#5865f2',
        count,
        percent
      };
    });

    const voiceHoursDailyChart = buildDailyTimeline(startDate, endDate, voiceHoursAgg);
    const voiceHoursCumulativeChart = buildDailyTimeline(startDate, endDate, voiceHoursAgg, true, voiceHoursBeforePeriod);
    const voiceSessionsDailyChart = buildDailyTimeline(startDate, endDate, voiceSessionsAgg);
    const voiceUsersDailyChart = buildDailyTimeline(startDate, endDate, voiceUsersAgg);

    // Сумма часов за выбранный период
    const voiceHoursPeriod = Math.round((voiceHoursAgg.reduce((sum, item) => sum + (item.count || 0), 0)) * 10) / 10;
    const voiceSessionsPeriod = voiceSessionsAgg.reduce((sum, item) => sum + (item.count || 0), 0);
    // Топ-5 пользователей по количеству сообщений за период
    let topMessageUsersAgg = [];
    try {
      topMessageUsersAgg = await Message.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate }, author: { $ne: null } } },
        {
          $group: {
            _id: "$author",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            count: 1,
            username: { $ifNull: ['$userInfo.username', 'Удаленный пользователь'] },
            displayName: { $ifNull: ['$userInfo.displayName', ''] },
            avatar: { $ifNull: ['$userInfo.avatar', null] }
          }
        }
      ]);
    } catch (e) {
      console.error('Top message users aggregate error:', e);
      topMessageUsersAgg = [];
    }

    // Топ-5 пользователей по часам в голосовых комнатах за период
    let topVoiceUsersAgg = [];
    try {
      topVoiceUsersAgg = await VoiceSession.aggregate([
        { $match: { joinedAt: { $gte: startDate, $lte: endDate }, user: { $ne: null } } },
        {
          $group: {
            _id: "$user",
            totalSeconds: { $sum: "$durationSeconds" },
            sessionsCount: { $sum: 1 }
          }
        },
        { $sort: { totalSeconds: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            totalSeconds: 1,
            hours: { $round: [{ $divide: ["$totalSeconds", 3600] }, 1] },
            sessionsCount: 1,
            username: { $ifNull: ['$userInfo.username', 'Удаленный пользователь'] },
            displayName: { $ifNull: ['$userInfo.displayName', ''] },
            avatar: { $ifNull: ['$userInfo.avatar', null] }
          }
        }
      ]);
    } catch (e) {
      console.error('Top voice users aggregate error:', e);
      topVoiceUsersAgg = [];
    }

    // Сумма сообщений за выбранный период
    const messagesPeriod = dailyMessages.reduce((sum, item) => sum + (item.count || 0), 0);

    res.json({
      totals: {
        users: totalUsers,
        servers: totalServers,
        messages: totalMessages,
        messagesPeriod,
        miniApps: totalMiniApps,
        bots: totalBots,
        newUsersPeriod: dailyNewUsers.reduce((a, b) => a + b.count, 0),
        totalVoiceHours,
        totalVoiceSessions,
        voiceHoursPeriod,
        voiceSessionsPeriod,
        branding: {
          total: totalBrandVisits,
          brands: brandingList,
          byBrand: brandTotals
        }
      },
      topUsers: {
        byMessages: topMessageUsersAgg,
        byVoice: topVoiceUsersAgg
      },
      charts: {
        usersDaily,
        usersCumulative,
        serversDaily,
        serversCumulative,
        messagesDaily: messagesDailyChart,
        messagesCumulative,
        activeUsersDaily: activeUsersDailyChart,
        onlineUsersDaily: onlineUsersDailyChart,
        brandingDaily: brandingDailyChart,
        voiceHoursDaily: voiceHoursDailyChart,
        voiceHoursCumulative: voiceHoursCumulativeChart,
        voiceSessionsDaily: voiceSessionsDailyChart,
        voiceUsersDaily: voiceUsersDailyChart
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
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
    if (username) {
      const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const trimmedUsername = username.trim();
      const existingUser = await User.findOne({ username: new RegExp(`^${escapeRegex(trimmedUsername)}$`, 'i') });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: 'Никнейм уже занят' });
      }
      user.username = trimmedUsername;
    }
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
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/actions', [auth, isModerator], async (req, res) => {
  try {
    const { action, actions, hours, after, before, page = 1, limit = 50, search } = req.query;
    const query = {};

    let actionList = [];
    if (actions) {
      actionList = Array.isArray(actions) ? actions : String(actions).split(',').filter(Boolean);
    } else if (action) {
      actionList = [action];
    }
    if (actionList.length > 0) {
      query.action = { $in: actionList };
    }

    // Диапазон дат (after/before) имеет приоритет над устаревшим параметром hours.
    if (after || before) {
      query.createdAt = {};
      if (after) {
        const aDate = new Date(after);
        if (typeof after === 'string' && after.length === 10) aDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = aDate;
      }
      if (before) {
        const bDate = new Date(before);
        if (typeof before === 'string' && before.length === 10) bDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = bDate;
      }
    } else {
      const timeLimit = new Date();
      timeLimit.setHours(timeLimit.getHours() - parseInt(hours || 24));
      query.createdAt = { $gte: timeLimit };
    }

    // Поиск по исполнителю/цели (имя пользователя или сервера), а также по
    // текстовым полям details и коду действия.
    const term = (search || '').toString().trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const [matchedUsers, matchedServers] = await Promise.all([
        User.find({ username: rx }).select('_id').lean(),
        Server.find({ name: rx }).select('_id').lean(),
      ]);
      const refIds = [...matchedUsers.map(u => u._id), ...matchedServers.map(s => s._id)];
      const or = [
        { action: rx },
        { 'details.username': rx },
        { 'details.name': rx },
        { 'details.serverName': rx },
        { 'details.reason': rx },
      ];
      if (refIds.length) {
        or.push({ executor: { $in: refIds } });
        or.push({ target: { $in: refIds } });
      }
      query.$or = or;
    }

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
    console.error('Admin actions fetch error:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
