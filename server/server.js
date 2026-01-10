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
const { computePermissions, hasPermission } = require('./utils/permissionCalculator');
const { Permissions } = require('./utils/permissions');

const compression = require('compression');

const app = express();
const server = http.createServer(app);

app.use(compression());

const io = socketIo(server, { cors: { origin: [process.env.CLIENT_URL || "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3000"], methods: ["GET", "POST"] } });

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = [process.env.CLIENT_URL || 'http://localhost:3000', 'http://localhost:3000', 'http://127.0.0.1:3000', 'https://zvon.duckdns.com', 'http://zvon.duckdns.com', 'https://zvonserver.ru', 'http://zvonserver.ru'];
    if (allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))) callback(null, true);
    else callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/servers', require('./routes/servers'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/direct-messages', require('./routes/directMessages'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/invites', require('./routes/invites'));
app.use('/api/upload-files', require('./routes/uploads'));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d', immutable: true }));

// Serve static assets from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/^(?!\/api).+/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

const getVoiceChannelUsers = async (channelId) => {
  const room = io.sockets.adapter.rooms.get(`voice-channel-${channelId}`);
  if (!room) return [];
  const users = [];
  const User = require('./models/User');
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.userId) {
      const user = await User.findById(socket.userId).select('username avatar status banner');
      if (user) {
        const userData = user.toObject();
        userData.isMuted = socket.isMuted || false;
        userData.isDeafened = socket.isDeafened || false;
        userData.isScreenSharing = socket.isScreenSharing || false;
        users.push(userData);
      }
    }
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

app.set('io', io);
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) { next(new Error('Authentication error')); }
  } else next(new Error('Authentication error'));
});

io.on('connection', (socket) => {
  socket.join(`user-${String(socket.userId)}`);
  const updateStatusOnConnect = async () => {
    try {
      const user = await User.findById(socket.userId);
      if (user) {
        if (user.servers) user.servers.forEach(s => socket.join(`server-${s}`));
        if (user.status === 'offline') {
          user.status = 'online'; await user.save();
          io.emit('user-updated', { _id: user._id, status: 'online' });
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
        for (const ch of server.channels) if (ch.type === 'voice') voiceStates[ch._id] = await getVoiceChannelUsers(ch._id);
        socket.emit('server-voice-states', voiceStates);
        io.to(`server-${serverId}`).emit('server-voice-states', voiceStates);
      }
    } catch (err) { }
  });

  socket.on('leave-server', (serverId) => socket.leave(`server-${serverId}`));
  socket.on('join-channel', (channelId) => socket.join(`channel-${channelId}`));
  socket.on('leave-channel', (channelId) => socket.leave(`channel-${channelId}`));

  socket.on('send-message', async (data) => {
    try {
      const messageData = { content: data.content || '', author: socket.userId, channel: data.channelId || null, directMessage: data.dmId || null, attachments: [] };
      if (data.attachments) {
        let raw = data.attachments;
        if (typeof raw === 'string' && (raw.startsWith('[') || raw.startsWith('{'))) { try { raw = JSON.parse(raw); } catch (e) { } }
        if (!Array.isArray(raw)) raw = [raw];
        messageData.attachments = raw.filter(a => a && typeof a === 'object' && a.url).map(a => ({ url: String(a.url), filename: String(a.filename || ''), size: Number(a.size || 0), type: String(a.type || '') }));
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
      }
      const message = new Message(messageData);
      await message.save(); await message.populate('author', 'username avatar');
      if (data.channelId) io.to(`channel-${data.channelId}`).emit('new-message', message);
      else if (data.dmId) {
        const DirectMessage = require('./models/DirectMessage');
        const dm = await DirectMessage.findById(data.dmId).populate('participants');
        if (dm) dm.participants.forEach(p => io.to(`user-${p._id}`).emit('new-message', message));
      }
    } catch (error) { socket.emit('error', { message: 'Failed to send message' }); }
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
      await User.findByIdAndUpdate(user._id, { activity });
      io.emit('user-updated', { _id: user._id, activity });
    } catch (err) { }
  });

  socket.on('call-offer', (data) => io.to(`user-${String(data.targetUserId)}`).emit('call-offer', { fromUserId: String(socket.userId), offer: data.offer, dmId: data.dmId }));
  socket.on('call-answer', (data) => io.to(`user-${data.targetUserId}`).emit('call-answer', { answer: data.answer }));
  socket.on('call-ice-candidate', (data) => io.to(`user-${data.targetUserId}`).emit('call-ice-candidate', { candidate: data.candidate }));
  socket.on('call-end', (data) => io.to(`user-${data.targetUserId}`).emit('call-end'));

  socket.on('join-dm-call', (data) => {
    socket.join(`dm-call-${data.dmId}`); socket.dmCallId = data.dmId;
    socket.to(`dm-call-${data.dmId}`).emit('dm-call-user-joined', { userId: socket.userId });
    const room = io.sockets.adapter.rooms.get(`dm-call-${data.dmId}`);
    const existing = []; if (room) for (const sid of room) { const s = io.sockets.sockets.get(sid); if (s && s.userId && s.userId !== socket.userId) existing.push(String(s.userId)); }
    socket.emit('dm-call-existing-users', existing);
  });

  socket.on('leave-dm-call', (data) => { socket.leave(`dm-call-${data.dmId}`); socket.dmCallId = null; socket.to(`dm-call-${data.dmId}`).emit('dm-call-user-left', { userId: socket.userId }); });

  socket.on('join-voice-channel', async (data) => {
    try {
      const channelId = data.channelId;
      const channel = await Channel.findById(channelId);
      if (!channel) return;

      const server = await Server.findById(channel.server).populate('roles members.user'); // Need population for permission calc? 
      // computePermissions usually needs populated roles if using them, but my calc implementation fetches or expects structure? 
      // computePermissions(userId, server, channel)
      // Actually my computePermissions in utils/permissionCalculator.js takes (userId, server, channel). 
      // server object needs roles and members populated? 
      // Let's rely on what computePermissions expects. Usually it iterates server.roles.

      if (channel.type === 'voice') {
        // Re-fetch server with necessary fields if not available or just rely on robust fetching
        const fullServer = await Server.findById(channel.server);
        const perms = computePermissions(socket.userId, fullServer, channel);
        if (!hasPermission(perms, Permissions.CONNECT)) {
          socket.emit('error', { message: 'No permission to connect to this channel' });
          return;
        }
      }

      if (socket.voiceChannelId && socket.voiceChannelId !== channelId) {
        socket.leave(`voice-channel-${socket.voiceChannelId}`);
        io.to(`voice-channel-${socket.voiceChannelId}`).emit('voice-user-left', { userId: socket.userId });
        await notifyVoiceChannelUpdate(socket.voiceChannelId);
      }
      const existingUsers = await getVoiceChannelUsers(channelId);
      socket.join(`voice-channel-${channelId}`); socket.voiceChannelId = channelId;
      const user = await User.findById(socket.userId);
      socket.to(`voice-channel-${channelId}`).emit('voice-user-joined', {
        userId: socket.userId,
        user: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar,
          banner: user.banner,
          isMuted: socket.isMuted || false,
          isDeafened: socket.isDeafened || false,
          isScreenSharing: socket.isScreenSharing || false,
          isServerMuted: socket.isServerMuted || false,
          isServerDeafened: socket.isServerDeafened || false
        }
      });
      socket.emit('voice-existing-users', existingUsers);
      await notifyVoiceChannelUpdate(channelId);
      const ch = await Channel.findById(channelId);
      if (ch && ch.server) io.to(`server-${ch.server}`).emit('voice-channel-users-update', { channelId, users: await getVoiceChannelUsers(channelId) });
    } catch (e) { console.error('Join voice error', e); }
  });

  socket.on('admin-voice-kick', async (data) => {
    try {
      const { userId, channelId } = data; // channelId is where we kick FROM
      const ch = await Channel.findById(channelId);
      if (!ch) return;
      const server = await Server.findById(ch.server);
      if (!server) return;

      const perms = computePermissions(socket.userId, server);
      if (!hasPermission(perms, Permissions.MOVE_MEMBERS)) return; // Kicking from voice uses MOVE_MEMBERS (or should it be separate? Usually MOVE is enough, effectively moving to null)

      const connections = io.sockets.adapter.rooms.get(`user-${userId}`);
      if (connections) {
        for (const sid of connections) {
          const s = io.sockets.sockets.get(sid);
          if (s) s.disconnect(); // Or force leave? Disconnect fully disconnects socket. Force leave is better.
          if (s && s.voiceChannelId === channelId) {
            s.leave(`voice-channel-${channelId}`);
            s.voiceChannelId = null;
            s.emit('force-disconnect-voice'); // Client needs to handle this
            io.to(`voice-channel-${channelId}`).emit('voice-user-left', { userId });
            await notifyVoiceChannelUpdate(channelId);
          }
        }
      }
    } catch (e) { console.error('Voice kick error', e); }
  });

  socket.on('voice-state-update', async (data) => {
    if (!socket.voiceChannelId || socket.voiceChannelId !== data.channelId) return;
    socket.isMuted = data.isMuted; socket.isDeafened = data.isDeafened;
    socket.isScreenSharing = data.isScreenSharing || false;
    socket.to(`voice-channel-${data.channelId}`).emit('voice-user-state-update', {
      userId: socket.userId,
      isMuted: socket.isMuted,
      isDeafened: socket.isDeafened,
      isScreenSharing: socket.isScreenSharing,
      isServerMuted: socket.isServerMuted || false,
      isServerDeafened: socket.isServerDeafened || false
    });
    await notifyVoiceChannelUpdate(data.channelId);
  });

  socket.on('leave-voice-channel', async (data) => { socket.leave(`voice-channel-${data.channelId}`); socket.voiceChannelId = null; io.to(`voice-channel-${data.channelId}`).emit('voice-user-left', { userId: socket.userId }); await notifyVoiceChannelUpdate(data.channelId); });

  socket.on('voice-offer', async (data) => { if (socket.voiceChannelId) io.to(`user-${data.targetUserId}`).emit('voice-offer', { fromUserId: socket.userId, offer: data.offer }); });
  socket.on('voice-answer', (data) => io.to(`user-${data.targetUserId}`).emit('voice-answer', { fromUserId: socket.userId, answer: data.answer }));
  socket.on('voice-ice-candidate', (data) => io.to(`user-${data.targetUserId}`).emit('voice-ice-candidate', { fromUserId: socket.userId, candidate: data.candidate }));

  // --- Admin Voice Controls ---
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
              // Determine channel to emit to
              const chId = s.voiceChannelId;
              io.to(`voice-channel-${chId}`).emit('voice-user-state-update', {
                userId: userId,
                isMuted: s.isMuted,
                isDeafened: s.isDeafened,
                isScreenSharing: s.isScreenSharing,
                isServerMuted: s.isServerMuted,
                isServerDeafened: s.isServerDeafened
              });
            }
            s.emit('voice-server-state-update', { isServerMuted: muted, isServerDeafened: s.isServerDeafened });
          }
        }
      }
    } catch (e) { }
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
              const chId = s.voiceChannelId;
              io.to(`voice-channel-${chId}`).emit('voice-user-state-update', {
                userId: userId,
                isMuted: s.isMuted,
                isDeafened: s.isDeafened,
                isScreenSharing: s.isScreenSharing,
                isServerMuted: s.isServerMuted,
                isServerDeafened: s.isServerDeafened
              });
            }
            s.emit('voice-server-state-update', { isServerMuted: s.isServerMuted, isServerDeafened: deafened });
          }
        }
      }
    } catch (e) { }
  });

  socket.on('disconnect', async () => {
    if (socket.voiceChannelId) { io.to(`voice-channel-${socket.voiceChannelId}`).emit('voice-user-left', { userId: socket.userId }); await notifyVoiceChannelUpdate(socket.voiceChannelId); }
    const connections = io.sockets.adapter.rooms.get(`user-${String(socket.userId)}`);
    if (!connections || connections.size === 0) {
      try {
        const user = await User.findById(socket.userId);
        if (user) {
          user.status = 'offline'; user.activity = null; await user.save();
          io.emit('user-updated', { _id: user._id, status: 'offline', activity: null });
        }
      } catch (err) { }
    }
  });
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zvon').then(() => { console.log('Connected to MongoDB'); }).catch(err => { console.error('MongoDB connection error:', err); });
server.listen(process.env.PORT || 5000, () => { console.log(`Server running on port ${process.env.PORT || 5000}`); });
