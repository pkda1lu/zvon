const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const Server = require('./models/Server');
const Channel = require('./models/Channel');
const Message = require('./models/Message');
const User = require('./models/User');
const VoiceSession = require('./models/VoiceSession');
const { computePermissions, hasPermission } = require('./utils/permissionCalculator');
const { Permissions } = require('./utils/permissions');
const { logAction } = require('./utils/auditLogger');
const { getBrand } = require('./utils/branding');
const { pushIfOffline: pushOfflineWithIo, previewText } = require('./utils/webPush');
const { isCommunicationBlocked } = require('./utils/privacy');
const fs = require('fs');

const compression = require('compression');

const app = express();
/**
 * Доверяем РОВНО одному прокси — nginx на этой же машине.
 *
 * Было `true`, то есть «доверять всем». В этом режиме Express берёт из
 * X-Forwarded-For САМЫЙ ЛЕВЫЙ адрес, а левый — тот, что прислал клиент: nginx
 * лишь дописывает настоящий адрес справа. Значит любой мог подставить чужой IP
 * заголовком, и это не теория:
 *   — ограничитель попыток входа считает по req.ip, то есть перебор паролей
 *     обходился сменой заголовка на каждом запросе;
 *   — в журналы по 152-ФЗ и в сведения об устройствах попадал вымышленный адрес.
 *
 * С числом 1 доверенным считается один переход, и req.ip — адрес, который
 * подставил nginx, то есть настоящий. Если прокси станет больше (например,
 * появится CDN), число нужно увеличить ровно на их количество.
 */
app.set('trust proxy', 1);
const server = http.createServer(app);

// Медленный режим: последний таймстемп отправки сообщения, ключ `${channelId}:${userId}`.
const slowModeTracker = new Map();

app.use(compression());

const io = socketIo(server, {
  cors: { origin: [process.env.CLIENT_URL || "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3000"], methods: ["GET", "POST"] },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://zvon.duckdns.com',
      'http://zvon.duckdns.com',
      'https://zvonserver.ru',
      'http://zvonserver.ru',
      'https://maxcord.fun',
      'http://maxcord.fun'
    ];
    // Сравнение строго по совпадению. Было `startsWith`, а это дыра:
    // https://zvonserver.ru.example.com начинается с https://zvonserver.ru,
    // то есть чужой домен проходил проверку.
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Раньше обе ветки возвращали `true` — список был декоративным, и запрос
    // принимался с любого сайта. Теперь чужие источники отклоняются.
    console.warn('[cors] отклонён источник:', origin);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Device-Id',
    'x-device-id',
    'X-Brand',
    'x-brand',
    'X-Zvon-Client',
    'x-zvon-client',
    'X-Zvon-Platform',
    'x-zvon-platform',
    'X-Zvon-Version',
    'x-zvon-version',
    'Accept'
  ],
  exposedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/push', require('./routes/push'));
app.use('/api/personal-data', require('./routes/personalData'));
app.use('/api/servers', require('./routes/servers'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/direct-messages', require('./routes/directMessages'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/invites', require('./routes/invites'));
app.use('/api/gifs', require('./routes/gifs'));
app.use('/api/bots', require('./routes/bots'));
app.use('/api/miniapps', require('./routes/miniapps'));
app.use('/api/store', require('./routes/store'));
app.use('/api/showcase', require('./routes/showcase'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/upload-files', require('./routes/uploads'));
app.use('/api/livekit', require('./routes/livekit'));
app.get('/zvon-sdk.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(__dirname, 'public/zvon-sdk.js'));
});
app.use('/miniapps', express.static(path.join(__dirname, 'public/miniapps'), {
  setHeaders: (res) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https: http: file: zvon:;");
  }
}));
app.use('/api/moderation', require('./routes/moderation'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/version', require('./routes/version'));
app.use('/api/roadmap', require('./routes/roadmap'));
app.use('/api/themes', require('./routes/themes'));
const { router: downloadRouter, latestRedirect: downloadLatestRedirect } = require('./routes/download');
app.use('/api/download', downloadRouter);
// Friendly public URLs (registered before the SPA catch-all below):
//   https://zvonserver.ru/download         -> latest Windows installer
//   https://zvonserver.ru/download/latest  -> latest installer (?platform=win|mac|linux)
app.get('/download', downloadLatestRedirect);
app.get('/download/latest', downloadLatestRedirect);
// Прокси для внешних картинок (иконки игр из SteamGridDB и т.п.), которым нужен canvas-доступ
// на клиенте (усреднение цвета для подложки события) — внешние CDN обычно не отдают
// Access-Control-Allow-Origin, из-за чего canvas "затейнчивается". Отдаём с разрешающим CORS.
const axios = require('axios');
// Без auth: запрос уходит через нативный <img>/Image(), который не может нести заголовок
// Authorization. Безопасность — за счёт ограничения протокола и блокировки внутренних адресов ниже.
app.get('/api/media-proxy', async (req, res) => {
  try {
    const target = req.query.url;
    if (!target || typeof target !== 'string') return res.status(400).json({ message: 'Missing url' });
    let parsed;
    try { parsed = new URL(target); } catch { return res.status(400).json({ message: 'Invalid url' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ message: 'Invalid protocol' });
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^(10|127|169\.254|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return res.status(400).json({ message: 'Host not allowed' });
    }
    const response = await axios.get(target, { responseType: 'arraybuffer', timeout: 8000, maxContentLength: 8 * 1024 * 1024 });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    res.send(response.data);
  } catch (error) {
    res.status(502).json({ message: 'Failed to fetch media' });
  }
});

app.use('/api/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  immutable: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Защита от stored XSS через загруженные файлы (SVG/HTML с <script>):
    // запрет MIME-сниффинга + песочница для документов (скрипты не выполняются,
    // origin становится opaque — нет доступа к localStorage/токену).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    // SVG/HTML/прочее потенциально активное — отдаём как вложение, не как страницу.
    if (/\.(svg|svgz|html?|xht(ml)?|xml|js|mjs)$/i.test(filePath)) {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Content-Type', 'application/octet-stream');
    }
  }
}));

// Serve static assets from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/^(?!\/api).+/, (req, res) => {
  res.removeHeader('X-Frame-Options');
  // Allow framing for miniapps and deep linking
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https: http: file: zvon:;");
  
  const indexPath = path.join(__dirname, '../client/build/index.html');
  if (fs.existsSync(indexPath)) {
    try {
      let html = fs.readFileSync(indexPath, 'utf8');
      const brand = getBrand(req);
      
      // Dynamically replace title and favicon for better SEO/Initial load
      html = html.replace(/<title>.*?<\/title>/g, `<title>${brand.name}</title>`);
      // Update favicons and logos
      html = html.replace(/href="\/icon\.png"/g, `href="/${brand.favicon}"`);
      // Update OpenGraph / Meta tags if they exist
      html = html.replace(/content="Zvon"/g, `content="${brand.name}"`);
      
      res.send(html);
    } catch (e) {
      res.sendFile(indexPath);
    }
  } else {
    res.sendFile(indexPath);
  }
});

const channelVoiceStartTimes = new Map();

const getVoiceChannelUsers = async (channelId) => {
  const room = io.sockets.adapter.rooms.get(`voice-channel-${channelId}`);
  if (!room || room.size === 0) {
    channelVoiceStartTimes.delete(String(channelId));
    return [];
  }
  const users = [];
  const User = require('./models/User');
  // Build nickname map for this server's members
  let nickByUserId = new Map();
  try {
    const channel = await Channel.findById(channelId).select('server');
    if (channel?.server) {
      const srv = await Server.findById(channel.server).select('members');
      (srv?.members || []).forEach(m => {
        if (m.user && m.nickname) nickByUserId.set(String(m.user), m.nickname);
      });
    }
  } catch (e) { /* fall back to username */ }
  let earliestJoinedAt = Infinity;
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.userId) {
      const user = await User.findById(socket.userId).select('username displayName avatar status banner badges activity displayedTag').populate('displayedTag.server', 'name icon tag');
      if (user) {
        const userData = user.toObject();
        userData.isMuted = socket.isMuted || false;
        userData.isDeafened = socket.isDeafened || false;
        userData.isScreenSharing = socket.isScreenSharing || false;
        userData.isServerMuted = socket.isServerMuted || false;
        userData.isServerDeafened = socket.isServerDeafened || false;
        userData.nickname = nickByUserId.get(String(user._id)) || null;
        userData.joinedVoiceAt = socket.joinedVoiceAt || Date.now();
        if (socket.joinedVoiceAt && socket.joinedVoiceAt < earliestJoinedAt) {
          earliestJoinedAt = socket.joinedVoiceAt;
        }
        users.push(userData);
      }
    }
  }

  const channelKey = String(channelId);
  if (users.length > 0) {
    if (!channelVoiceStartTimes.has(channelKey) || (earliestJoinedAt !== Infinity && earliestJoinedAt < channelVoiceStartTimes.get(channelKey))) {
      channelVoiceStartTimes.set(channelKey, earliestJoinedAt !== Infinity ? earliestJoinedAt : Date.now());
    }
  } else {
    channelVoiceStartTimes.delete(channelKey);
  }

  return users;
};

const notifyVoiceChannelUpdate = async (channelId) => {
  try {
    const channel = await Channel.findById(channelId);
    if (channel) {
      const users = await getVoiceChannelUsers(channelId);
      io.to(`server-${channel.server}`).emit('voice-channel-users-update', { channelId, users });
    }
  } catch (err) { }
};

app.get('/api/channels/:id/voice-participants', async (req, res) => {
  try { res.json(await getVoiceChannelUsers(req.params.id)); }
  catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// Active collaborative mini-app session per voice channel, used to auto-open the
// app for members who join while a session (e.g. a watch-together) is running.
// Map<channelId, { appId, hostUserId, ts }>
const miniappWatchByChannel = new Map();

// --- 3D-комнаты (channel.type === 'room') ---
// Позиции аватарок пользователей на плоскости комнаты. Храним только x/z
// (y — высота — фиксирована на клиенте), синхронизируем по voice-channel room.
// Map<channelId, Map<userId, { x: number, z: number }>>
const roomPositionsByChannel = new Map();

function getRoomPositionsSnapshot(channelId) {
  const m = roomPositionsByChannel.get(String(channelId));
  return m ? Array.from(m.entries()).map(([userId, pos]) => ({ userId, ...pos })) : [];
}
function setRoomPosition(channelId, userId, pos) {
  const key = String(channelId);
  let m = roomPositionsByChannel.get(key);
  if (!m) { m = new Map(); roomPositionsByChannel.set(key, m); }
  m.set(String(userId), pos);
}
function removeRoomPosition(channelId, userId) {
  const m = roomPositionsByChannel.get(String(channelId));
  if (!m) return;
  m.delete(String(userId));
  if (m.size === 0) roomPositionsByChannel.delete(String(channelId));
}

// --- Voice presences (mini-app virtual participants) ---
// Map<channelId, Map<sessionId, presence>>
const voicePresencesByChannel = new Map();

function getPresencesSnapshot(channelId) {
  const m = voicePresencesByChannel.get(String(channelId));
  return m ? Array.from(m.values()) : [];
}
function setPresence(channelId, presence) {
  const key = String(channelId);
  let m = voicePresencesByChannel.get(key);
  if (!m) { m = new Map(); voicePresencesByChannel.set(key, m); }
  m.set(presence.sessionId, presence);
}
function removePresence(channelId, sessionId) {
  const m = voicePresencesByChannel.get(String(channelId));
  if (!m) return null;
  const p = m.get(sessionId);
  if (!p) return null;
  m.delete(sessionId);
  if (m.size === 0) voicePresencesByChannel.delete(String(channelId));
  return p;
}
function cleanupUserPresencesInChannel(channelId, userId, io) {
  const m = voicePresencesByChannel.get(String(channelId));
  if (!m) return;
  for (const [sid, p] of Array.from(m.entries())) {
    if (String(p.ownerUserId) === String(userId)) {
      m.delete(sid);
      io.to(`voice-channel-${channelId}`).emit('voice-presence-removed', { sessionId: sid, channelId });
    }
  }
  if (m.size === 0) voicePresencesByChannel.delete(String(channelId));
}
// If the leaving user hosts the channel's collaborative session, tear it down.
// `channelId` here is the RAW voice channel id (the key used by miniappWatchByChannel
// and the `voice-channel-<id>` socket room).
function endWatchIfHost(channelId, userId, io) {
  const w = miniappWatchByChannel.get(String(channelId));
  if (w && String(w.hostUserId) === String(userId)) {
    miniappWatchByChannel.delete(String(channelId));
    io.to(`voice-channel-${channelId}`).emit('miniapp-broadcast', {
      appId: w.appId, event: 'stop', data: {}, fromUserId: String(userId),
    });
  }
}
function cleanupUserPresencesEverywhere(userId, io) {
  for (const [chId, m] of voicePresencesByChannel.entries()) {
    for (const [sid, p] of Array.from(m.entries())) {
      if (String(p.ownerUserId) === String(userId)) {
        m.delete(sid);
        io.to(`voice-channel-${chId}`).emit('voice-presence-removed', { sessionId: sid, channelId: chId });
      }
    }
    if (m.size === 0) voicePresencesByChannel.delete(chId);
  }
}

// Сокращение, чтобы не таскать io в каждый вызов — реализация в utils/webPush.js.
const pushIfOffline = (userId, payload) => pushOfflineWithIo(io, userId, payload);

// Уведомление о звонке живёт недолго: если человек взял телефон через десять
// минут, «вам звонят» уже неправда и только путает. 45 секунд примерно
// соответствуют времени, пока звонящий ждёт ответа.
const CALL_PUSH_OPTS = { ttl: 45, urgency: 'high' };

// Запись завершённой голосовой сессии в базу для аналитики/статистики
async function finalizeVoiceSession(socket, channelId, dmId = null) {
  try {
    const joinedAt = socket.joinedVoiceAt;
    if (!joinedAt || !socket.userId) return;
    const durationSeconds = Math.max(0, Math.floor((Date.now() - joinedAt) / 1000));
    socket.joinedVoiceAt = null;

    // Игнорируем сеансы меньше 3 секунд (случайный клик/промах)
    if (durationSeconds < 3) return;

    let serverId = null;
    if (channelId) {
      const channel = await Channel.findById(channelId).select('server');
      serverId = channel?.server || null;
    }

    await VoiceSession.create({
      user: socket.userId,
      channel: channelId || null,
      server: serverId,
      dmId: dmId || null,
      joinedAt: new Date(joinedAt),
      leftAt: new Date(),
      durationSeconds
    });
  } catch (e) {
    console.error('Error finalizing voice session:', e);
  }
}

// Как в Discord: когда пользователь заходит в голосовой канал с нового устройства,
// все его прочие сессии, находящиеся в голосовом канале, принудительно отключаются.
// Иначе на LiveKit возникает конфликт identity (одинаковый userId) — старое
// соединение рвётся, а в списке участников появляется дубликат.
const disconnectOtherVoiceSessions = async (userId, exceptSocketId) => {
  const connections = io.sockets.adapter.rooms.get(`user-${String(userId)}`);
  if (!connections) return;
  for (const sid of Array.from(connections)) {
    if (sid === exceptSocketId) continue;
    const s = io.sockets.sockets.get(sid);
    if (!s || !s.voiceChannelId) continue;
    const oldChannelId = s.voiceChannelId;
    finalizeVoiceSession(s, oldChannelId);
    cleanupUserPresencesInChannel('channel-' + oldChannelId, userId, io);
    endWatchIfHost(oldChannelId, userId, io);
    s.emit('force-disconnect-voice', { reason: 'other-device' });
    s.leave(`voice-channel-${oldChannelId}`);
    s.voiceChannelId = null;
    io.to(`voice-channel-${oldChannelId}`).emit('voice-user-left', { userId: String(userId) });
    removeRoomPosition(oldChannelId, userId);
    io.to(`voice-channel-${oldChannelId}`).emit('room-position-removed', { channelId: oldChannelId, userId: String(userId) });
    await notifyVoiceChannelUpdate(oldChannelId);
  }
};

app.set('io', io);
app.set('voiceManager', { getVoiceChannelUsers, notifyVoiceChannelUpdate });

// Periodic sweep: kick zombie sockets (disconnected but still listed in voice rooms)
// out of voice-channel rooms and notify everyone. This is a safety net for cases
// where the normal disconnect event never fires (proxy keepalives, transport upgrades,
// abrupt power loss without TCP RST, etc.).
setInterval(async () => {
  try {
    const affectedChannels = new Set();
    for (const [roomName, sockets] of io.sockets.adapter.rooms.entries()) {
      if (!roomName.startsWith('voice-channel-')) continue;
      const channelId = roomName.replace('voice-channel-', '');
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (!s || !s.connected) {
          if (s) {
            finalizeVoiceSession(s, channelId);
            s.leave(roomName);
            s.voiceChannelId = null;
          } else {
            sockets.delete(sid);
          }
          if (s && s.userId) {
            io.to(roomName).emit('voice-user-left', { userId: s.userId });
            removeRoomPosition(channelId, s.userId);
            io.to(roomName).emit('room-position-removed', { channelId, userId: String(s.userId) });
          }
          affectedChannels.add(channelId);
        }
      }
    }
    for (const channelId of affectedChannels) {
      await notifyVoiceChannelUpdate(channelId);
    }
  } catch (err) {
    console.error('Voice sweep error:', err);
  }
}, 10000);
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      if (token.startsWith('bot_')) {
        const User = require('./models/User');
        const bot = await User.findOne({ botToken: token, isBot: true });
        if (bot) {
          socket.userId = bot._id;
          socket.isBot = true;
          return next();
        }
      }

      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) { next(new Error('Authentication error')); }
  } else next(new Error('Authentication error'));
});

io.on('connection', (socket) => {
  socket.join(`user-${String(socket.userId)}`);
  socket.emit('ready', { userId: socket.userId });
  const updateStatusOnConnect = async () => {
    try {
      const user = await User.findById(socket.userId);
      if (user) {
        if (user.servers) user.servers.forEach(s => socket.join(`server-${s}`));
        if (user.status === 'offline') {
          const newStatus = user.statusPreference || 'online';
          user.status = newStatus;
          await user.save();
          io.emit('user-updated', { _id: user._id, status: newStatus });
        }
      }
    } catch (err) { }
  };
  updateStatusOnConnect();

  socket.on('join-server', async (serverId) => {
    socket.join(`server-${serverId}`);
    try {
      const server = await Server.findById(serverId).populate('channels');
      if (server) {
        const voiceStates = {};
        for (const ch of server.channels) if (ch.type === 'voice' || ch.type === 'room') voiceStates[ch._id] = await getVoiceChannelUsers(ch._id);
        socket.emit('server-voice-states', voiceStates);
        io.to(`server-${serverId}`).emit('server-voice-states', voiceStates);
      }
    } catch (err) { }
  });

  socket.on('leave-server', (serverId) => socket.leave(`server-${serverId}`));
  socket.on('join-channel', (channelId) => socket.join(`channel-${channelId}`));
  socket.on('leave-channel', (channelId) => socket.leave(`channel-${channelId}`));

  socket.on('send-message', async (data, callback) => {
    try {
      const user = await User.findById(socket.userId);
      if (user && user.isBanned) {
        if (user.banExpires && user.banExpires < Date.now()) {
          user.isBanned = false;
          user.banExpires = undefined;
          user.banReason = undefined;
          await user.save();
        } else {
          return socket.emit('error', { message: 'Ваш аккаунт заблокирован. Вы не можете отправлять сообщения.' });
        }
      }

      const messageData = {
        content: data.content || '',
        author: socket.userId,
        channel: data.channelId || null,
        directMessage: data.dmId || null,
        attachments: [],
        embeds: Array.isArray(data.embeds) ? data.embeds : [],
        buttons: Array.isArray(data.buttons) ? data.buttons.map(b => ({
          label: b.label,
          url: b.url,
          actionId: b.actionId,
          style: b.style || 'primary',
          row: b.row || 0
        })) : [],
        replyTo: data.replyToId || null
      };

      if (data.attachments) {
        let raw = data.attachments;
        if (typeof raw === 'string' && (raw.startsWith('[') || raw.startsWith('{'))) { try { raw = JSON.parse(raw); } catch (e) { } }
        if (!Array.isArray(raw)) raw = [raw];
        messageData.attachments = raw.filter(a => a && typeof a === 'object' && a.url).map(a => ({ url: String(a.url), filename: String(a.filename || ''), size: Number(a.size || 0), type: String(a.type || '') }));
      }
      if (data.poll && typeof data.poll === 'object' && data.poll.question) {
        const opts = Array.isArray(data.poll.options) ? data.poll.options : [];
        const cleanOptions = opts
          .map(o => ({ text: String((o && o.text) || '').trim() }))
          .filter(o => o.text)
          .slice(0, 20)
          .map((o, i) => ({ id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`, text: o.text.slice(0, 120), custom: false, voters: [] }));
        if (cleanOptions.length >= 2) {
          messageData.poll = {
            question: String(data.poll.question).trim().slice(0, 300),
            multiple: !!data.poll.multiple,
            allowCustom: !!data.poll.allowCustom,
            options: cleanOptions
          };
        }
      }
      if (data.channelId) {
        const channel = await Channel.findById(data.channelId);
        if (!channel) return socket.emit('error', { message: 'Channel not found' });
        const server = await Server.findById(channel.server);
        if (!server) return socket.emit('error', { message: 'Server not found' });
        const perms = computePermissions(socket.userId, server, channel);
        if (!hasPermission(perms, Permissions.SEND_MESSAGES)) {
          return socket.emit('error', { message: 'У вас нет прав для отправки сообщений в этот канал' });
        }
        // Мут / кулдаун новичков (не действуют на владельца)
        if (String(server.owner) !== String(socket.userId)) {
          const member = server.members.find(m => String(m.user) === String(socket.userId));
          if (member) {
            if (member.communicationDisabledUntil && new Date(member.communicationDisabledUntil) > new Date()) {
              return socket.emit('error', { message: 'Вы временно не можете отправлять сообщения на этом сервере (мут)' });
            }
            if (server.newcomerCooldownSeconds > 0) {
              const remainingMs = new Date(member.joinedAt).getTime() + server.newcomerCooldownSeconds * 1000 - Date.now();
              if (remainingMs > 0) {
                return socket.emit('error', { message: `Подождите ещё ${Math.ceil(remainingMs / 1000)} с. после присоединения к серверу` });
              }
            }
          }
        }
        // Медленный режим
        const slow = channel.slowMode || 0;
        if (slow > 0) {
          const isOwner = String(server.owner) === String(socket.userId);
          const exempt = isOwner
            || hasPermission(perms, Permissions.MANAGE_MESSAGES)
            || hasPermission(perms, Permissions.MANAGE_CHANNELS)
            || hasPermission(perms, Permissions.ADMINISTRATOR);
          if (!exempt) {
            const key = `${data.channelId}:${socket.userId}`;
            const now = Date.now();
            const waitMs = slow * 1000 - (now - (slowModeTracker.get(key) || 0));
            if (waitMs > 0) {
              return socket.emit('error', { message: `Медленный режим: подождите ${Math.ceil(waitMs / 1000)} с.` });
            }
            slowModeTracker.set(key, now);
          }
        }
      }
      // Личный чат: отправлять может только участник.
      if (data.dmId) {
        const DirectMessage = require('./models/DirectMessage');
        const dm = await DirectMessage.findById(data.dmId);
        if (!dm) return socket.emit('error', { message: 'DM not found' });
        if (!dm.participants.some(p => String(p) === String(socket.userId))) {
          return socket.emit('error', { message: 'Нет доступа к этому чату' });
        }
        // Блокировка в любую сторону закрывает переписку один на один.
        // Основной путь отправки идёт именно через сокет, поэтому без этой
        // проверки чёрный список не работал бы вовсе (см. пояснение в
        // routes/directMessages.js).
        if (dm.participants.length === 2) {
          const other = dm.participants.find(p => String(p) !== String(socket.userId));
          if (other && await isCommunicationBlocked(socket.userId, other)) {
            return socket.emit('error', { message: 'Отправка сообщений недоступна', blocked: true });
          }
        }
      }

      // Пересылка сообщения: подтягиваем оригинал и копируем его содержимое,
      // сохраняя снимок об авторе исходника.
      if (data.forwardOf) {
        const original = await Message.findById(data.forwardOf).populate('author', 'username avatar');
        if (!original) return socket.emit('error', { message: 'Исходное сообщение не найдено' });
        messageData.content = original.content || '';
        messageData.attachments = (original.attachments || []).map(a => ({ url: a.url, filename: a.filename, size: a.size, type: a.type }));
        messageData.embeds = Array.isArray(original.embeds) ? original.embeds.map(e => (e.toObject ? e.toObject() : e)) : [];
        messageData.poll = null;
        messageData.replyTo = null;
        messageData.forwardedFrom = {
          authorId: original.author?._id || original.author || null,
          authorUsername: original.author?.username || 'Пользователь',
          authorAvatar: original.author?.avatar || null,
          content: original.content || '',
          createdAt: original.createdAt,
        };
      }

      const message = new Message(messageData);

      // Parse mentions
      if (message.content) {
        const foundMentions = [];

        // Handle User Mentions
        const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const userMentionRegex = /@([\p{L}\p{N}_.-]+)/gu;
        let userMatch;
        while ((userMatch = userMentionRegex.exec(message.content)) !== null) {
          const username = userMatch[1];
          const mentionedUser = await User.findOne({ username: new RegExp(`^${escapeRegex(username)}$`, 'i') });
          if (mentionedUser) {
            if (data.channelId) {
              const channel = await Channel.findById(data.channelId);
              const server = await Server.findById(channel?.server);
              if (server && server.members.some(m => String(m.user) === String(mentionedUser._id))) {
                foundMentions.push(mentionedUser._id);
              }
            } else {
              foundMentions.push(mentionedUser._id);
            }
          }
        }

        // Handle Role Mentions (only in channels)
        if (data.channelId) {
          const channel = await Channel.findById(data.channelId);
          const server = await Server.findById(channel?.server);
          if (server) {
            const perms = computePermissions(socket.userId, server, channel);
            const canMentionEveryone = hasPermission(perms, Permissions.MENTION_EVERYONE);

            server.roles.forEach(role => {
              if (message.content.includes(`@${role.name}`)) {
                // If it's a role mention, verify permission or if role is mentionable
                if (canMentionEveryone || role.mentionable) {
                  server.members.forEach(member => {
                    if (member.roles.some(r => String(r) === String(role._id))) {
                      foundMentions.push(member.user);
                    }
                  });
                }
              }
            });

            // Handle @everyone and @here
            if (message.content.includes('@everyone') || message.content.includes('@here')) {
              if (canMentionEveryone) {
                server.members.forEach(member => {
                  foundMentions.push(member.user);
                });
              }
            }
          }
        }

        if (foundMentions.length > 0) {
          message.mentions = [...new Set(foundMentions.map(id => String(id)))];
        }
      }

      // Extract URL Previews
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = message.content ? message.content.match(urlRegex) : null;
      if (urls && urls.length > 0) {
        try {
          const { getUrlPreview } = require('./utils/urlPreview');
          const uniqueUrls = [...new Set(urls)];
          const previewPromises = uniqueUrls.slice(0, 3).map(getUrlPreview);
          const previews = await Promise.all(previewPromises);
          const validPreviews = previews.filter(p => p !== null);
          if (validPreviews.length > 0) {
            message.embeds = [...(message.embeds || []), ...validPreviews];
          }
        } catch (err) {
          console.error('URL Preview error:', err);
        }
      }

      await message.save();
      await message.populate({ path: 'author', select: 'username avatar activity badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      if (message.replyTo) {
        await message.populate({
          path: 'replyTo',
          populate: { path: 'author', select: 'username avatar activity badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }
        });
      }

      if (data.channelId) {
        const fullMessage = await Message.findById(message._id)
          .populate({ path: 'author', select: 'username avatar activity badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } })
          .populate({ path: 'mentions', select: 'username badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } })
          .populate({
            path: 'replyTo',
            populate: { path: 'author', select: 'username avatar activity badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } }
          });
        io.to(`channel-${data.channelId}`).emit('new-message', fullMessage);

        // Название канала для текста уведомления. Отдельным запросом, потому что
        // в fullMessage поле channel не populate-ится (там ObjectId), а
        // одноимённая переменная выше объявлена в другом блоке и сюда не видна.
        // Ходим в базу только если есть кого уведомлять.
        let pushChannelName = '';
        if (message.mentions && message.mentions.length) {
          try {
            const ch = await Channel.findById(data.channelId).select('name');
            pushChannelName = ch?.name || '';
          } catch { /* название необязательно — уведомление уйдёт и без него */ }
        }

        // Specifically notify mentioned users if they are not in the channel
        message.mentions.forEach(userId => {
          if (String(userId) !== String(socket.userId)) {
            io.to(`user-${userId}`).emit('mention', fullMessage);
            // Упомянули, а приложение закрыто — доставим системным уведомлением.
            const authorName = fullMessage.author?.username || 'Кто-то';
            const channelName = pushChannelName;
            pushIfOffline(userId, {
              title: channelName ? `${authorName} в #${channelName}` : authorName,
              body: previewText(fullMessage.content),
              tag: `channel-${data.channelId}`,
              url: `/?channel=${data.channelId}`,
              data: { type: 'mention', channelId: String(data.channelId) }
            });
          }
        });
      }
      else if (data.dmId) {
        const DirectMessage = require('./models/DirectMessage');
        const dm = await DirectMessage.findById(data.dmId).populate('participants');
        if (dm) {
          dm.participants.forEach(p => io.to(`user-${p._id}`).emit('new-message', message));

          // Личное сообщение — уведомляем всех участников, кроме автора.
          // Имя берём из базы: при аутентификации сокета проставляется только
          // socket.userId, объекта socket.user нет.
          const sender = dm.participants.find(p => String(p._id) === String(socket.userId));
          const authorName = sender?.username || 'Новое сообщение';
          // Модерационные обращения помечаем явно: для модератора это рабочая
          // очередь, и он должен отличать её от личной переписки, не открывая.
          const dmTitle = dm.isModeration
            ? `Модерация · ${authorName}`
            : (dm.name ? `${authorName} · ${dm.name}` : authorName);
          dm.participants.forEach(p => {
            if (String(p._id) === String(socket.userId)) return;
            // Уведомления по этой переписке отключены получателем — не шлём.
            // Проверяем здесь, а не на клиенте: push доставляется системой, и
            // до кода приложения он бы дошёл уже показанным.
            if ((p.mutedDMs || []).some(id => String(id) === String(data.dmId))) return;
            pushIfOffline(p._id, {
              title: dmTitle,
              body: previewText(message.content),
              tag: `dm-${data.dmId}`,
              url: `/?dm=${data.dmId}`,
              data: { type: 'dm', dmId: String(data.dmId) }
            });
          });
        }
      }
        if (typeof callback === 'function') callback({ messageId: message._id });
      } catch (error) { socket.emit('error', { message: 'Failed to send message' }); }
  });

  socket.on('interactive-button-click', async (data) => {
    try {
      const { messageId, actionId, channelId } = data;
      if (!channelId || !messageId || !actionId) return;

      const userPayload = { _id: socket.user?._id, username: socket.user?.username };
      io.to(`channel-${channelId}`).emit('interactive-button-click', {
        messageId,
        actionId,
        channelId,
        user: userPayload
      });
    } catch (err) {
      console.error('interative-button-click error:', err);
    }
  });

  socket.on('edit-message', async (data) => {
    try {
      const { messageId, content } = data;
      const message = await Message.findById(messageId);
      if (!message) return;

      if (message.author.toString() !== socket.userId.toString()) {
        return socket.emit('error', { message: 'You can only edit your own messages' });
      }

      message.content = content !== undefined ? content : message.content;
      if (data.embeds) message.embeds = data.embeds;
      
      // Re-extract URL Previews on edit if content changed
      if (content !== undefined) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = message.content ? message.content.match(urlRegex) : null;
        if (urls && urls.length > 0) {
          try {
            const { getUrlPreview } = require('./utils/urlPreview');
            const uniqueUrls = [...new Set(urls)];
            const previewPromises = uniqueUrls.slice(0, 3).map(getUrlPreview);
            const previews = await Promise.all(previewPromises);
            const validPreviews = previews.filter(p => p !== null);
            if (validPreviews.length > 0) {
              message.embeds = [...(message.embeds || []), ...validPreviews];
            }
          } catch (err) { }
        }
      }

      if (data.buttons) message.buttons = data.buttons;
      message.edited = true;
      message.editedAt = new Date();
      await message.save();
      await message.populate({ path: 'author', select: 'username avatar activity badges displayedTag', populate: { path: 'displayedTag.server', select: 'name icon tag' } });
      await message.populate('mentions', 'username');

      if (message.channel) {
        io.to(`channel-${message.channel}`).emit('message-updated', message);
      } else if (message.directMessage) {
        const DirectMessage = require('./models/DirectMessage');
        const dm = await DirectMessage.findById(message.directMessage);
        if (dm) dm.participants.forEach(p => io.to(`user-${p._id}`).emit('message-updated', message));
      }
    } catch (error) { socket.emit('error', { message: 'Failed to edit message' }); }
  });

  socket.on('delete-message', async (data) => {
    try {
      const { messageId, channelId } = data;
      const msg = await Message.findById(messageId);
      if (!msg) return;

      const isAuthor = String(msg.author) === String(socket.userId);
      let canDelete = isAuthor;

      if (!isAuthor && channelId) {
        const channel = await Channel.findById(channelId);
        if (channel) {
          const server = await Server.findById(channel.server);
          if (server) {
            const perms = computePermissions(socket.userId, server, channel);
            if (hasPermission(perms, Permissions.MANAGE_MESSAGES)) {
              canDelete = true;
            }
          }
        }
      }

      if (canDelete) {
        await Message.findByIdAndDelete(messageId);
        if (channelId) io.to(`channel-${channelId}`).emit('message-deleted', messageId);
        else if (msg.directMessage) {
          const dm = await require('./models/DirectMessage').findById(msg.directMessage);
          if (dm) dm.participants.forEach(p => io.to(`user-${p}`).emit('message-deleted', messageId));
        }
      } else socket.emit('error', { message: 'Insufficient permissions' });
    } catch (error) { }
  });

  socket.on('typing-start', (data) => socket.to(`channel-${data.channelId}`).emit('user-typing', { userId: socket.userId, channelId: data.channelId }));
  socket.on('typing-stop', (data) => socket.to(`channel-${data.channelId}`).emit('user-stopped-typing', { userId: socket.userId, channelId: data.channelId }));

  socket.on('activity-update', async (activity) => {
    try {
      const user = await User.findById(socket.userId);
      if (!user) return;

      // Enrich with SteamGridDB icons if it's a game and icons are missing OR remote
      if (activity && activity.name && (!activity.assets || !activity.assets.largeImage || activity.assets.largeImage.startsWith('http'))) {
        try {
          const { getGameIcon } = require('./utils/steamGridDB');
          const iconUrl = await getGameIcon(activity.name);
          if (iconUrl) {
            if (!activity.assets) activity.assets = {};
            activity.assets.largeImage = iconUrl;
          }
        } catch (enrichErr) {
          console.error('Activity enrichment error:', enrichErr);
        }
      }

      // Засчитываем завершившуюся игровую сессию в gameStats (для «Любимых игр»).
      try {
        const { recordGameSession } = require('./utils/gamePlaytime');
        const prevActivity = user.activity && user.activity.toObject ? user.activity.toObject() : user.activity;
        recordGameSession(user, prevActivity, activity);
      } catch (e) { console.error('Playtime accumulation error:', e); }

      user.activity = activity;
      await user.save();
      io.emit('user-updated', { _id: user._id, activity });
    } catch (err) { }
  });

  socket.on('call-offer', async (data) => {
    const user = await User.findById(socket.userId);
    if (user && user.isBanned) {
      if (user.banExpires && user.banExpires < Date.now()) {
        user.isBanned = false;
        user.banExpires = undefined;
        user.banReason = undefined;
        await user.save();
      } else {
        return socket.emit('error', { message: 'Ваш аккаунт заблокирован. Звонки запрещены.' });
      }
    }

    if (data.dmId && !data.targetUserId) {
      // Group call offer
      try {
        const DirectMessage = require('./models/DirectMessage');
        const dm = await DirectMessage.findById(data.dmId);
        if (dm) {
          console.log(`[Call] Group offer from ${socket.userId} in DM ${data.dmId}`);
          const callerName = user?.username || 'Кто-то';
          dm.participants.forEach(p => {
            if (String(p) !== String(socket.userId)) {
              io.to(`user-${String(p)}`).emit('call-offer', {
                fromUserId: String(socket.userId),
                offer: data.offer,
                dmId: data.dmId,
                isGroup: true
              });
              pushIfOffline(p, {
                title: dm.name ? `Групповой звонок · ${dm.name}` : 'Групповой звонок',
                body: `${callerName} звонит`,
                ...CALL_PUSH_OPTS,
                tag: `call-${data.dmId}`,
                url: `/?dm=${data.dmId}`,
                data: { type: 'call', dmId: String(data.dmId), isGroup: true }
              });
            }
          });
        }
      } catch (err) { }
    } else {
      console.log(`[Call] Offer from ${socket.userId} to ${data.targetUserId}`);
      io.to(`user-${String(data.targetUserId)}`).emit('call-offer', { fromUserId: String(socket.userId), offer: data.offer, dmId: data.dmId });
      pushIfOffline(data.targetUserId, {
        title: 'Входящий звонок',
        body: `${user?.username || 'Кто-то'} звонит вам`,
        ...CALL_PUSH_OPTS,
        tag: `call-${data.dmId || data.targetUserId}`,
        url: data.dmId ? `/?dm=${data.dmId}` : '/',
        data: { type: 'call', dmId: data.dmId ? String(data.dmId) : null }
      });
    }
  });

  socket.on('call-end', async (data) => {
    if (data.dmId && !data.targetUserId) {
      // Notify all in DM room
      io.to(`dm-call-${data.dmId}`).emit('call-end', { fromUserId: socket.userId });
    } else {
      console.log(`[Call] End from ${socket.userId} to ${data.targetUserId}`);
      io.to(`user-${data.targetUserId}`).emit('call-end');
    }
  });

  socket.on('join-dm-call', (data) => {
    console.log(`[Call] User ${socket.userId} joined DM room ${data.dmId}`);
    socket.join(`dm-call-${data.dmId}`);
    socket.dmCallId = data.dmId;
    const requestedJoinedAt = Number(data?.joinedVoiceAt);
    const isValidJoinedAt = requestedJoinedAt && !isNaN(requestedJoinedAt) && requestedJoinedAt > 0 && requestedJoinedAt <= (Date.now() + 5000);
    socket.joinedVoiceAt = isValidJoinedAt ? requestedJoinedAt : Date.now();
    socket.to(`dm-call-${data.dmId}`).emit('dm-call-user-joined', { userId: socket.userId });
    const room = io.sockets.adapter.rooms.get(`dm-call-${data.dmId}`);
    const existing = [];
    if (room) {
      for (const sid of room) {
        const s = io.sockets.sockets.get(sid);
        if (s && s.userId && s.userId !== socket.userId) existing.push(String(s.userId));
      }
    }
    socket.emit('dm-call-existing-users', existing);
    socket.emit('voice-presences-snapshot', {
      channelId: `call-${data.dmId}`,
      presences: getPresencesSnapshot(`call-${data.dmId}`),
    });
  });

  socket.on('leave-dm-call', (data) => {
    const dmId = data?.dmId || socket.dmCallId;
    if (dmId) {
      finalizeVoiceSession(socket, null, dmId);
      cleanupUserPresencesInChannel('call-' + dmId, socket.userId, io);
      socket.leave(`dm-call-${dmId}`);
      socket.to(`dm-call-${dmId}`).emit('dm-call-user-left', { userId: socket.userId });
    }
    socket.dmCallId = null;
    socket.joinedVoiceAt = null;
  });

  // --- Voice presence lifecycle ---
  // The mini-app sends a "channelHint" — either the LiveKit room name (e.g.
  // "call-<dmId>" or "channel-<id>") — and the server validates the user is
  // actually in that room before broadcasting.

  function presenceSocketRoom(channelId) {
    if (channelId.startsWith('call-')) return 'dm-call-' + channelId.slice(5);
    if (channelId.startsWith('channel-')) return 'voice-channel-' + channelId.slice(8);
    return null;
  }
  function userIsInPresenceChannel(s, channelId) {
    if (channelId.startsWith('call-')) return s.dmCallId === channelId.slice(5);
    if (channelId.startsWith('channel-')) return String(s.voiceChannelId) === channelId.slice(8);
    return false;
  }

  socket.on('voice-presence-create', (data) => {
    const { sessionId, channelId, displayName, avatar, appId } = data || {};
    if (!sessionId || !channelId || !userIsInPresenceChannel(socket, channelId)) return;
    const room = presenceSocketRoom(channelId);
    if (!room) return;
    const presence = {
      sessionId, channelId,
      ownerUserId: String(socket.userId),
      displayName: displayName || 'Мини-приложение',
      avatar: avatar || null,
      appId: appId ? String(appId) : null,
      background: null,
      controls: [],
    };
    setPresence(channelId, presence);
    io.to(room).emit('voice-presence-added', presence);
    if (typeof socket._ownedPresences !== 'object') socket._ownedPresences = new Set();
    socket._ownedPresences.add(sessionId + '|' + channelId);
  });

  socket.on('voice-presence-update', (data) => {
    const { sessionId, channelId, patch } = data || {};
    const m = voicePresencesByChannel.get(String(channelId));
    const presence = m?.get(sessionId);
    if (!presence || presence.ownerUserId !== String(socket.userId)) return;
    if (patch.background !== undefined) presence.background = patch.background;
    if (patch.subtitle !== undefined) presence.subtitle = patch.subtitle;
    if (patch.accentColor !== undefined) presence.accentColor = patch.accentColor;
    if (patch.displayName !== undefined) presence.displayName = patch.displayName;
    if (patch.avatar !== undefined) presence.avatar = patch.avatar;
    if (Array.isArray(patch.controls)) presence.controls = patch.controls;
    if (patch.controlPatch) {
      const ctrl = (presence.controls || []).find(c => c.id === patch.controlPatch.id);
      if (ctrl) Object.assign(ctrl, patch.controlPatch.partial || {});
    }
    const room = presenceSocketRoom(channelId);
    if (room) io.to(room).emit('voice-presence-updated', presence);
  });

  socket.on('voice-presence-destroy', (data) => {
    const { sessionId, channelId } = data || {};
    const m = voicePresencesByChannel.get(String(channelId));
    const presence = m?.get(sessionId);
    if (!presence || presence.ownerUserId !== String(socket.userId)) return;
    removePresence(channelId, sessionId);
    const room = presenceSocketRoom(channelId);
    if (room) io.to(room).emit('voice-presence-removed', { sessionId, channelId });
    socket._ownedPresences?.delete(sessionId + '|' + channelId);
  });

  // Any voice-channel member can send a control — forwarded to the presence owner.
  socket.on('voice-presence-control', (data) => {
    const { sessionId, channelId, controlId, value } = data || {};
    if (!userIsInPresenceChannel(socket, channelId)) return;
    const presence = voicePresencesByChannel.get(String(channelId))?.get(sessionId);
    if (!presence) return;
    io.to(`user-${presence.ownerUserId}`).emit('voice-presence-control', {
      sessionId, channelId, controlId, value, fromUserId: String(socket.userId),
    });
  });

  socket.on('leave-dm-call', (data) => {
    cleanupUserPresencesInChannel('call-' + data.dmId, socket.userId, io);
    console.log(`[Call] User ${socket.userId} left DM room ${data.dmId}`);
    socket.leave(`dm-call-${data.dmId}`);
    socket.dmCallId = null;
    socket.to(`dm-call-${data.dmId}`).emit('dm-call-user-left', { userId: socket.userId });
  });

  socket.on('join-voice-channel', async (data) => {
    try {
      const user = await User.findById(socket.userId);
      if (user && user.isBanned) {
        if (user.banExpires && user.banExpires < Date.now()) {
          user.isBanned = false;
          user.banExpires = undefined;
          user.banReason = undefined;
          await user.save();
        } else {
          return socket.emit('error', { message: 'Ваш аккаунт заблокирован. Доступ в голосовые каналы запрещен.' });
        }
      }

      const channelId = data.channelId;
      const channel = await Channel.findById(channelId);
      if (!channel) return;

      const fullServer = await Server.findById(channel.server);
      const perms = computePermissions(socket.userId, fullServer, channel);
      if (!hasPermission(perms, Permissions.CONNECT)) {
        socket.emit('error', { message: 'No permission to connect to this channel' });
        return;
      }

      if (socket.voiceChannelId && socket.voiceChannelId !== channelId) {
        finalizeVoiceSession(socket, socket.voiceChannelId);
        cleanupUserPresencesInChannel('channel-' + socket.voiceChannelId, socket.userId, io);
        endWatchIfHost(socket.voiceChannelId, socket.userId, io);
        socket.leave(`voice-channel-${socket.voiceChannelId}`);
        io.to(`voice-channel-${socket.voiceChannelId}`).emit('voice-user-left', { userId: socket.userId });
        removeRoomPosition(socket.voiceChannelId, socket.userId);
        io.to(`voice-channel-${socket.voiceChannelId}`).emit('room-position-removed', { channelId: socket.voiceChannelId, userId: String(socket.userId) });
        await notifyVoiceChannelUpdate(socket.voiceChannelId);
      }

      // Отключаем прочие устройства этого пользователя из голосовых каналов,
      // чтобы активной осталась только новая сессия (поведение как в Discord).
      await disconnectOtherVoiceSessions(socket.userId, socket.id);

      const requestedJoinedAt = Number(data?.joinedVoiceAt);
      const isValidJoinedAt = requestedJoinedAt && !isNaN(requestedJoinedAt) && requestedJoinedAt > 0 && requestedJoinedAt <= (Date.now() + 5000);

      socket.join(`voice-channel-${channelId}`); socket.voiceChannelId = channelId;
      socket.joinedVoiceAt = isValidJoinedAt ? requestedJoinedAt : Date.now();
      const existingUsers = await getVoiceChannelUsers(channelId);
      // Presence хранятся под ключом LiveKit-комнаты ('channel-<id>'), а не под сырым id —
      // иначе зашедший позже не получал снапшот presence (нет плитки мини-аппа).
      socket.emit('voice-presences-snapshot', { channelId, presences: getPresencesSnapshot('channel-' + channelId) });
      // user is already declared above
      const memberRec = (fullServer.members || []).find(m => String(m.user) === String(socket.userId));
      const serverNickname = memberRec?.nickname || null;
      await user.populate('displayedTag.server', 'name icon tag');
      socket.to(`voice-channel-${channelId}`).emit('voice-user-joined', {
        userId: socket.userId,
        user: {
          _id: user._id,
          username: user.username,
          displayName: user.displayName || null,
          nickname: serverNickname,
          avatar: user.avatar,
          banner: user.banner,
          badges: user.badges || [],
          displayedTag: user.displayedTag || null,
          isMuted: socket.isMuted || false,
          isDeafened: socket.isDeafened || false,
          isScreenSharing: socket.isScreenSharing || false,
          isServerMuted: socket.isServerMuted || false,
          isServerDeafened: socket.isServerDeafened || false,
          joinedVoiceAt: socket.joinedVoiceAt
        }
      });
      socket.emit('voice-existing-users', existingUsers);
      socket.emit('voice-server-state-update', {
        isServerMuted: socket.isServerMuted || false,
        isServerDeafened: socket.isServerDeafened || false,
        myNickname: serverNickname,
      });

      // 3D-комната: даём присоединившемуся снапшот позиций всех, кто уже в
      // комнате, назначаем ему случайную стартовую позицию и рассылаем её остальным.
      if (channel.type === 'room') {
        socket.emit('room-positions-snapshot', { channelId, positions: getRoomPositionsSnapshot(channelId) });
        const startPos = { x: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 };
        setRoomPosition(channelId, socket.userId, startPos);
        io.to(`voice-channel-${channelId}`).emit('room-position-update', { channelId, userId: String(socket.userId), ...startPos });
      }

      await notifyVoiceChannelUpdate(channelId);
      const ch = await Channel.findById(channelId);
      if (ch && ch.server) io.to(`server-${ch.server}`).emit('voice-channel-users-update', { channelId, users: await getVoiceChannelUsers(channelId) });

      // If a collaborative mini-app session (e.g. watch-together) is active in
      // this channel, auto-open the app for the joining member so they sync up.
      const activeWatch = miniappWatchByChannel.get(channelId);
      if (activeWatch && String(activeWatch.hostUserId) !== String(socket.userId)) {
        socket.emit('miniapp-open-app', { appId: activeWatch.appId });
      }
    } catch (e) { console.error('Join voice error', e); }
  });

  // Generic real-time relay between members of a voice channel who have the same
  // mini-app open. Powers collaborative apps via zvon.broadcast(event, data).
  socket.on('miniapp-broadcast', (data) => {
    const { channelId, appId, event, data: payload, open } = data || {};
    if (!channelId || !appId || !event) return;
    socket.to(`voice-channel-${channelId}`).emit('miniapp-broadcast', {
      appId, event, data: payload, fromUserId: String(socket.userId),
    });
    if (open) {
      miniappWatchByChannel.set(channelId, { appId, hostUserId: String(socket.userId), ts: Date.now() });
      socket.to(`voice-channel-${channelId}`).emit('miniapp-open-app', { appId });
    }
    // A collaborative session ends — stop auto-opening for late joiners.
    if (event === 'stop') {
      const w = miniappWatchByChannel.get(channelId);
      if (w && w.appId === appId) miniappWatchByChannel.delete(channelId);
    }
  });

  socket.on('admin-voice-kick', async (data) => {
    try {
      const { userId, channelId } = data;
      const ch = await Channel.findById(channelId);
      if (!ch) return;
      const server = await Server.findById(ch.server);
      if (!server) return;

      const perms = computePermissions(socket.userId, server);
      if (!hasPermission(perms, Permissions.MOVE_MEMBERS)) return;

      const connections = io.sockets.adapter.rooms.get(`user-${userId}`);
      if (connections) {
        for (const sid of connections) {
          const s = io.sockets.sockets.get(sid);
          if (s && s.voiceChannelId === channelId) {
            s.emit('force-disconnect-voice');
            s.leave(`voice-channel-${channelId}`);
            s.voiceChannelId = null;
            io.to(`voice-channel-${channelId}`).emit('voice-user-left', { userId });
            await notifyVoiceChannelUpdate(channelId);
            
            await logAction({
              serverId: ch.server,
              executorId: socket.userId,
              targetId: userId,
              targetModel: 'User',
              action: 'MEMBER_VOICE_KICK',
              reason: `Kicked from voice channel #${ch.name}`
            });
          }
        }
      }
    } catch (e) { console.error('Voice kick error', e); }
  });

  socket.on('voice-state-update', (data) => {
    if (!socket.voiceChannelId || socket.voiceChannelId !== data.channelId) return;

    const wasMuted = socket.isMuted;
    const wasDeafened = socket.isDeafened;

    socket.isMuted = !!data.isMuted;
    socket.isDeafened = !!data.isDeafened;
    socket.isScreenSharing = !!data.isScreenSharing;
    socket.isVideoOn = !!data.isVideoOn;

    // МОМЕНТАЛЬНО транслируем состояние остальным — без ожидания записи в аудит/БД,
    // иначе мьют-бар «подвисал» (бродкаст ждал завершения logAction).
    socket.to(`voice-channel-${data.channelId}`).emit('voice-user-state-update', {
      userId: socket.userId,
      isMuted: socket.isMuted,
      isDeafened: socket.isDeafened,
      isScreenSharing: socket.isScreenSharing,
      isVideoOn: socket.isVideoOn,
      isServerMuted: socket.isServerMuted || false,
      isServerDeafened: socket.isServerDeafened || false
    });
    notifyVoiceChannelUpdate(data.channelId).catch(() => {});

    // Аудит self mute/deaf — асинхронно, не блокируя трансляцию.
    if (wasMuted !== socket.isMuted || wasDeafened !== socket.isDeafened) {
      Channel.findById(data.channelId).then(channel => {
        if (!channel) return;
        return logAction({
          serverId: channel.server,
          executorId: socket.userId,
          targetId: socket.userId,
          targetModel: 'User',
          action: 'MEMBER_VOICE_SELF_STATE',
          changes: [
            { key: 'isMuted', oldValue: wasMuted, newValue: socket.isMuted },
            { key: 'isDeafened', oldValue: wasDeafened, newValue: socket.isDeafened }
          ].filter(c => c.oldValue !== c.newValue)
        });
      }).catch(() => {});
    }
  });

  socket.on('leave-voice-channel', async (data) => {
    const channelId = data.channelId;
    // Игнорируем, если этот сокет уже не числится в данном канале — иначе при
    // переезде на другое устройство запоздалый leave со старого устройства
    // прислал бы лишний voice-user-left и убрал участника с нового устройства.
    if (String(socket.voiceChannelId || '') !== String(channelId)) return;
    finalizeVoiceSession(socket, channelId);
    cleanupUserPresencesInChannel('channel-' + channelId, socket.userId, io);
    endWatchIfHost(channelId, socket.userId, io);
    socket.leave(`voice-channel-${channelId}`);
    socket.voiceChannelId = null;
    socket.joinedVoiceAt = null;
    io.to(`voice-channel-${channelId}`).emit('voice-user-left', { userId: socket.userId });
    removeRoomPosition(channelId, socket.userId);
    io.to(`voice-channel-${channelId}`).emit('room-position-removed', { channelId, userId: String(socket.userId) });
    await notifyVoiceChannelUpdate(channelId);
  });

  // 3D-комната: пользователь перетащил свою аватарку. Рассылаем позицию всем
  // прочим участникам того же голосового канала.
  socket.on('room-position-update', (data) => {
    const { channelId, x, z } = data || {};
    if (!channelId || String(socket.voiceChannelId || '') !== String(channelId)) return;
    if (typeof x !== 'number' || typeof z !== 'number') return;
    const pos = { x: Math.max(-20, Math.min(20, x)), z: Math.max(-20, Math.min(20, z)) };
    setRoomPosition(channelId, socket.userId, pos);
    socket.to(`voice-channel-${channelId}`).emit('room-position-update', { channelId, userId: String(socket.userId), ...pos });
  });

  // 3D-комната: клиент просит актуальный снапшот позиций. Нужен потому, что
  // three.js-сцена инициализируется асинхронно и обычно НЕ успевает подписаться
  // на 'room-positions-snapshot' к моменту его отправки при входе в voice-канал.
  // Клиент повторно запрашивает снапшот, когда сцена готова.
  socket.on('room-request-snapshot', (data) => {
    const { channelId } = data || {};
    if (!channelId || String(socket.voiceChannelId || '') !== String(channelId)) return;
    socket.emit('room-positions-snapshot', { channelId, positions: getRoomPositionsSnapshot(channelId) });
  });

  socket.on('admin-voice-move', async (data) => {
    try {
      const { userId, channelId } = data;
      const targetChannel = await Channel.findById(channelId);
      if (!targetChannel) return;
      const server = await Server.findById(targetChannel.server);
      if (!server) return;

      const perms = computePermissions(socket.userId, server);
      if (!hasPermission(perms, Permissions.MOVE_MEMBERS)) return;

      const connections = io.sockets.adapter.rooms.get(`user-${userId}`);
      if (connections) {
        for (const sid of connections) {
          const s = io.sockets.sockets.get(sid);
          if (s) s.emit('force-join-voice', { channelId });
        }
      }
    } catch (e) { console.error('Move error', e); }
  });

  socket.on('admin-voice-mute', async (data) => {
    try {
      const { userId, muted, serverId } = data;
      const server = await Server.findById(serverId);
      if (!server) return;
      const perms = computePermissions(socket.userId, server);
      if (!hasPermission(perms, Permissions.MUTE_MEMBERS)) return;

      const connections = io.sockets.adapter.rooms.get(`user-${userId}`);
      if (connections) {
        for (const sid of connections) {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.isServerMuted = muted;
            if (s.voiceChannelId) {
              io.to(`voice-channel-${s.voiceChannelId}`).emit('voice-user-state-update', {
                userId: userId,
                isMuted: s.isMuted,
                isDeafened: s.isDeafened,
                isScreenSharing: s.isScreenSharing,
                isServerMuted: s.isServerMuted,
                isServerDeafened: s.isServerDeafened
              });
              await notifyVoiceChannelUpdate(s.voiceChannelId);
            }
            s.emit('voice-server-state-update', { isServerMuted: muted, isServerDeafened: s.isServerDeafened });
          }
        }
        
        await logAction({
          serverId: serverId,
          executorId: socket.userId,
          targetId: userId,
          targetModel: 'User',
          action: 'MEMBER_VOICE_SERVER_MUTE',
          changes: [{ key: 'isServerMuted', newValue: muted }]
        });
      }
    } catch (e) { console.error('admin-voice-mute error:', e); }
  });

  socket.on('admin-voice-deafen', async (data) => {
    try {
      const { userId, deafened, serverId } = data;
      const server = await Server.findById(serverId);
      if (!server) return;
      const perms = computePermissions(socket.userId, server);
      if (!hasPermission(perms, Permissions.DEAFEN_MEMBERS)) return;

      const connections = io.sockets.adapter.rooms.get(`user-${userId}`);
      if (connections) {
        for (const sid of connections) {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.isServerDeafened = deafened;
            if (s.voiceChannelId) {
              io.to(`voice-channel-${s.voiceChannelId}`).emit('voice-user-state-update', {
                userId: userId,
                isMuted: s.isMuted,
                isDeafened: s.isDeafened,
                isScreenSharing: s.isScreenSharing,
                isServerMuted: s.isServerMuted,
                isServerDeafened: s.isServerDeafened
              });
              await notifyVoiceChannelUpdate(s.voiceChannelId);
            }
            s.emit('voice-server-state-update', { isServerMuted: s.isServerMuted, isServerDeafened: deafened });
          }
        }
        
        await logAction({
          serverId: serverId,
          executorId: socket.userId,
          targetId: userId,
          targetModel: 'User',
          action: 'MEMBER_VOICE_SERVER_DEAFEN',
          changes: [{ key: 'isServerDeafened', newValue: deafened }]
        });
      }
    } catch (e) { console.error('admin-voice-deafen error:', e); }
  });

  socket.on('disconnect', async () => {
    if (socket.voiceChannelId) {
      const channelId = socket.voiceChannelId;
      finalizeVoiceSession(socket, channelId);
      cleanupUserPresencesInChannel('channel-' + channelId, socket.userId, io);
      endWatchIfHost(channelId, socket.userId, io);
      io.to(`voice-channel-${channelId}`).emit('voice-user-left', { userId: socket.userId });
      removeRoomPosition(channelId, socket.userId);
      io.to(`voice-channel-${channelId}`).emit('room-position-removed', { channelId, userId: String(socket.userId) });
      await notifyVoiceChannelUpdate(channelId);
    }
    if (socket.dmCallId) {
      finalizeVoiceSession(socket, null, socket.dmCallId);
      cleanupUserPresencesInChannel('call-' + socket.dmCallId, socket.userId, io);
    }
    cleanupUserPresencesEverywhere(socket.userId, io);
    const connections = io.sockets.adapter.rooms.get(`user-${String(socket.userId)}`);
    if (!connections || connections.size === 0) {
      try {
        const user = await User.findById(socket.userId);
        if (user) {
          // Флашим время текущей игровой сессии перед сбросом активности.
          try {
            const { recordGameSession } = require('./utils/gamePlaytime');
            const prevActivity = user.activity && user.activity.toObject ? user.activity.toObject() : user.activity;
            recordGameSession(user, prevActivity, null);
          } catch (e) { console.error('Playtime flush error:', e); }
          user.status = 'offline'; user.activity = null; await user.save();
          io.emit('user-updated', { _id: user._id, status: 'offline', activity: null });
        }
      } catch (err) { }
    }
  });
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zvon').then(async () => {
  console.log('Connected to MongoDB');
  try { await require('./bootstrap/systemMiniApps')(); }
  catch (e) { console.error('[MiniApps] bootstrap failed:', e.message); }
  try { await require('./bootstrap/storeProducts')(); }
  catch (e) { console.error('[Store] product seed failed:', e.message); }
}).catch(err => { console.error('MongoDB connection error:', err); });
/**
 * Слушаем ТОЛЬКО петлю: снаружи приложение доступно исключительно через nginx.
 *
 * Без указания адреса Node слушает все интерфейсы, и порт 5000 был открыт в
 * интернет напрямую. Это обходило nginx целиком — а вместе с ним ограничения
 * частоты запросов, журналы доступа и TLS.
 *
 * Отдельно важно для trust proxy (см. выше): при прямом подключении клиент сам
 * подставляет X-Forwarded-For, и настройка «доверять одному прокси» начинает
 * доверять злоумышленнику. То есть закрытый порт — не просто «ещё один рубеж»,
 * а условие, без которого определение IP не работает вовсе.
 *
 * BIND_HOST оставлен на случай другой схемы развёртывания (например, nginx на
 * отдельной машине). Менять его стоит, только когда порт закрыт фаерволом.
 */
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
server.listen(process.env.PORT || 5000, BIND_HOST, () => {
  console.log(`Server running on ${BIND_HOST}:${process.env.PORT || 5000}`);
  // Проверяем почту при старте: через неё идут коды входа и 2FA, и неверные
  // настройки означают, что пользователи не смогут войти вообще. Результат
  // только пишется в лог — падать из-за почты сервер не должен.
  require('./utils/mail').verifyConnection().catch(() => { });
});
