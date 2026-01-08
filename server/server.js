const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const Server = require('./models/Server');
const Channel = require('./models/Channel');
const Role = require('./models/Role');
const Message = require('./models/Message');
const User = require('./models/User');
const { hasPermission } = require('./utils/permissions');

const compression = require('compression');

const app = express();
const server = http.createServer(app);

// Use compression
app.use(compression());

const io = socketIo(server, {
  cors: {
    origin: [
      process.env.CLIENT_URL || "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"]
  }
});

// CORS configuration
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
      'http://zvonserver.ru'
    ];

    if (allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
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
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  immutable: true
}));

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
        // Add voice states from socket
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
      io.to(`server-${channel.server}`).emit('voice-channel-users-update', {
        channelId,
        users
      });
    }
  } catch (err) {
    console.error('Error notifying voice update:', err);
  }
};

// New route for voice channel participants
app.get('/api/channels/:id/voice-participants', async (req, res) => {
  try {
    const users = await getVoiceChannelUsers(req.params.id);
    res.json(users);
  } catch (error) {
    console.error('Error fetching voice participants:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Socket.io connection handling
app.set('io', io);
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.userId);

  // Join user room for DM notifications
  const userRoom = `user-${String(socket.userId)}`;
  socket.join(userRoom);
  console.log(`Socket ${socket.id} joined room ${userRoom}`);

  // Automatic status update on connection
  const updateStatusOnConnect = async () => {
    try {
      const user = await User.findById(socket.userId);
      if (user) {
        // Join all server rooms for instant updates
        if (user.servers && user.servers.length > 0) {
          user.servers.forEach(serverId => {
            const roomName = `server-${serverId}`;
            socket.join(roomName);
            console.log(`Socket ${socket.id} (User ${socket.userId}) joined room ${roomName} on connection`);
          });
          console.log(`User ${socket.userId} joined rooms for ${user.servers.length} servers`);
        }

        if (user.status === 'offline') {
          user.status = 'online';
          await user.save();
          io.emit('user-updated', {
            _id: user._id,
            status: 'online'
          });
        }
      }
    } catch (err) {
      console.error('Error auto-updating status/joining rooms on connect:', err);
    }
  };
  updateStatusOnConnect();

  // Join server room
  socket.on('join-server', async (serverId) => {
    const roomName = `server-${serverId}`;
    socket.join(roomName);
    console.log(`User ${socket.userId} explicitly joined server room ${roomName}`);

    // Auto-send voice states immediately
    try {
      const Server = require('./models/Server');
      const server = await Server.findById(serverId).populate('channels');
      if (server) {
        const voiceStates = {};
        for (const ch of server.channels) {
          if (ch.type === 'voice') {
            voiceStates[ch._id] = await getVoiceChannelUsers(ch._id);
          }
        }
        socket.emit('server-voice-states', voiceStates);

        // Also broadcast to all server members to ensure they see the new user
        io.to(`server-${serverId}`).emit('server-voice-states', voiceStates);
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Leave server room
  socket.on('leave-server', (serverId) => {
    socket.leave(`server-${serverId}`);
    console.log(`User ${socket.userId} left server ${serverId}`);
  });

  // Join channel room
  socket.on('join-channel', (channelId) => {
    socket.join(`channel-${channelId}`);
    console.log(`User ${socket.userId} joined channel ${channelId}`);
  });

  // Leave channel room
  socket.on('leave-channel', (channelId) => {
    socket.leave(`channel-${channelId}`);
    console.log(`User ${socket.userId} left channel ${channelId}`);
  });

  // Send message
  socket.on('send-message', async (data) => {
    try {
      const Message = require('./models/Message');

      // Check permission if channelId is present (Server Channel)
      if (data.channelId) {
        const Channel = require('./models/Channel');
        const channel = await Channel.findById(data.channelId);

        if (channel && channel.server) {
          const hasSendPerm = await hasPermission(socket.userId, channel.server, 'SEND_MESSAGES', data.channelId);
          if (!hasSendPerm) {
            socket.emit('error', { message: 'Insufficient permissions to send messages' });
            return;
          }

          if (data.attachments && data.attachments.length > 0) {
            const hasAttachPerm = await hasPermission(socket.userId, channel.server, 'ATTACH_FILES', data.channelId);
            if (!hasAttachPerm) {
              socket.emit('error', { message: 'Insufficient permissions to attach files' });
              return;
            }
          }
        }
      }

      const messageData = {
        content: data.content || '',
        author: socket.userId,
        channel: data.channelId || null,
        directMessage: data.dmId || null,
        attachments: []
      };

      if (data.attachments) {
        let raw = data.attachments;
        if (typeof raw === 'string' && (raw.startsWith('[') || raw.startsWith('{'))) {
          try { raw = JSON.parse(raw); } catch (e) { /* ignore */ }
        }
        if (!Array.isArray(raw)) raw = [raw];

        messageData.attachments = raw
          .filter(a => a && typeof a === 'object' && a.url)
          .map(a => ({
            url: String(a.url),
            filename: String(a.filename || ''),
            size: Number(a.size || 0),
            type: String(a.type || '')
          }));
      }

      console.log(`Sending message from ${socket.userId}. Files: ${messageData.attachments.length}`);

      const message = new Message(messageData);
      console.log('Mongoose message attachments:', message.attachments);
      await message.save();
      await message.populate('author', 'username avatar');

      if (data.channelId) {
        io.to(`channel-${data.channelId}`).emit('new-message', message);
      } else if (data.dmId) {
        const DirectMessage = require('./models/DirectMessage');
        const dm = await DirectMessage.findById(data.dmId).populate('participants');
        if (dm) {
          dm.participants.forEach(participant => {
            io.to(`user-${participant._id}`).emit('new-message', message);
          });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('delete-message', async (data) => {
    try {
      const { messageId, channelId } = data;
      const Message = require('./models/Message');
      const msg = await Message.findById(messageId);
      if (!msg) return;

      let canDelete = String(msg.author) === String(socket.userId);

      if (!canDelete && channelId) {
        const channel = await Channel.findById(channelId);
        if (channel && channel.server) {
          canDelete = await hasPermission(socket.userId, channel.server, 'MANAGE_MESSAGES');
        }
      }

      if (canDelete) {
        await Message.findByIdAndDelete(messageId);
        if (channelId) {
          io.to(`channel-${channelId}`).emit('message-deleted', messageId);
        } else if (msg.directMessage) {
          // Notify both participants in DM
          const DirectMessage = require('./models/DirectMessage');
          const dm = await DirectMessage.findById(msg.directMessage);
          if (dm) {
            dm.participants.forEach(p => {
              io.to(`user-${p}`).emit('message-deleted', messageId);
            });
          }
        }
      } else {
        socket.emit('error', { message: 'Insufficient permissions' });
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  });

  // Typing indicator
  socket.on('typing-start', (data) => {
    socket.to(`channel-${data.channelId}`).emit('user-typing', {
      userId: socket.userId,
      channelId: data.channelId
    });
  });

  socket.on('typing-stop', (data) => {
    socket.to(`channel-${data.channelId}`).emit('user-stopped-typing', {
      userId: socket.userId,
      channelId: data.channelId
    });
  });

  // Activity Update
  socket.on('activity-update', async (activity) => {
    try {
      const User = require('./models/User');
      const user = await User.findById(socket.userId);
      if (!user) return;

      console.log(`[Activity] User ${user.username} (${user._id}) updated activity to:`, activity ? activity.name : 'None');
      await User.findByIdAndUpdate(user._id, { activity });

      io.emit('user-updated', { _id: user._id, activity });
    } catch (err) {
      console.error('[Activity] Error updating activity:', err);
    }
  });

  // Voice call events
  socket.on('call-offer', (data) => {
    const targetRoom = `user-${String(data.targetUserId)}`;
    const clients = io.sockets.adapter.rooms.get(targetRoom);
    console.log(`Call offer from ${socket.userId} to ${data.targetUserId}. Target room ${targetRoom} has ${clients ? clients.size : 0} clients.`);

    io.to(targetRoom).emit('call-offer', {
      fromUserId: String(socket.userId),
      offer: data.offer,
      dmId: data.dmId
    });
  });

  socket.on('call-answer', (data) => {
    io.to(`user-${data.targetUserId}`).emit('call-answer', {
      answer: data.answer
    });
  });

  socket.on('call-ice-candidate', (data) => {
    io.to(`user-${data.targetUserId}`).emit('call-ice-candidate', {
      candidate: data.candidate
    });
  });

  socket.on('call-end', (data) => {
    io.to(`user-${data.targetUserId}`).emit('call-end');
  });

  // DM call events
  const getDMCallUsers = (dmId) => {
    const room = io.sockets.adapter.rooms.get(`dm-call-${dmId}`);
    if (!room) return [];

    const userIds = [];
    for (const socketId of room) {
      const s = io.sockets.sockets.get(socketId);
      if (s && s.userId) userIds.push(String(s.userId));
    }
    return userIds;
  };

  socket.on('join-dm-call', (data) => {
    const { dmId } = data;
    socket.join(`dm-call-${dmId}`);
    socket.dmCallId = dmId;

    // Notify others in DM
    socket.to(`dm-call-${dmId}`).emit('dm-call-user-joined', { userId: socket.userId });

    // Let the joiner know who is already there
    const existingUsers = getDMCallUsers(dmId).filter(id => id !== socket.userId);
    socket.emit('dm-call-existing-users', existingUsers);

    console.log(`User ${socket.userId} joined DM call ${dmId}`);
  });

  socket.on('leave-dm-call', (data) => {
    const { dmId } = data;
    socket.leave(`dm-call-${dmId}`);
    socket.dmCallId = null;
    socket.to(`dm-call-${dmId}`).emit('dm-call-user-left', { userId: socket.userId });
    console.log(`User ${socket.userId} left DM call ${dmId}`);
  });

  // Voice channel events
  socket.on('join-voice-channel', async (data) => {
    const channelId = data.channelId;
    const User = require('./models/User');

    // Permission check
    const Channel = require('./models/Channel');
    const channelToCheck = await Channel.findById(channelId);
    if (channelToCheck && channelToCheck.server) {
      if (!await hasPermission(socket.userId, channelToCheck.server, 'CONNECT')) {
        socket.emit('error', { message: 'Insufficient permissions to connect' });
        return;
      }
    }

    // Leave previous channel if any
    if (socket.voiceChannelId && socket.voiceChannelId !== channelId) {
      socket.leave(`voice-channel-${socket.voiceChannelId}`);
      io.to(`voice-channel-${socket.voiceChannelId}`).emit('voice-user-left', {
        userId: socket.userId
      });
      await notifyVoiceChannelUpdate(socket.voiceChannelId);
    }

    // Get existing users BEFORE joining appropriately
    const existingUsers = await getVoiceChannelUsers(channelId);

    socket.join(`voice-channel-${channelId}`);
    socket.voiceChannelId = channelId;

    const user = await User.findById(socket.userId);

    // Notify others in channel
    socket.to(`voice-channel-${channelId}`).emit('voice-user-joined', {
      userId: socket.userId,
      user: {
        _id: user._id,
        username: user.username,
        avatar: user.avatar,
        banner: user.banner,
        isMuted: socket.isMuted || false,
        isDeafened: socket.isDeafened || false,
        isScreenSharing: socket.isScreenSharing || false
      }
    });

    // Send existing users to the joiner
    socket.emit('voice-existing-users', existingUsers);

    // Notify server (Sidebar) - ensure this happens immediately
    await notifyVoiceChannelUpdate(channelId);

    // Also send immediate update to all server members
    // We already fetched channelToCheck, use it
    if (channelToCheck && channelToCheck.server) {
      io.to(`server-${channelToCheck.server}`).emit('voice-channel-users-update', {
        channelId,
        users: await getVoiceChannelUsers(channelId)
      });
    }
  });

  // Voice state updates (mute/deafen/screenshare)
  socket.on('voice-state-update', async (data) => {
    const { channelId, isMuted, isDeafened, isScreenSharing } = data;
    if (!socket.voiceChannelId || socket.voiceChannelId !== channelId) return;

    // Store state on socket for retrieval by others joining
    socket.isMuted = isMuted;
    socket.isDeafened = isDeafened;
    if (isScreenSharing !== undefined) {
      socket.isScreenSharing = isScreenSharing;
    }

    // Broadcast state to others in the channel
    socket.to(`voice-channel-${channelId}`).emit('voice-user-state-update', {
      userId: socket.userId,
      isMuted: socket.isMuted,
      isDeafened: socket.isDeafened,
      isScreenSharing: socket.isScreenSharing
    });

    // Notify server (Sidebar) to update "LIVE" status
    await notifyVoiceChannelUpdate(channelId);
  });

  socket.on('leave-voice-channel', async (data) => {
    const channelId = data.channelId;
    socket.leave(`voice-channel-${channelId}`);
    socket.voiceChannelId = null;

    io.to(`voice-channel-${channelId}`).emit('voice-user-left', {
      userId: socket.userId
    });

    // Notify server (Sidebar)
    await notifyVoiceChannelUpdate(channelId);
  });

  // WebRTC Signaling for Voice Channels
  socket.on('voice-offer', async (data) => {
    if (!socket.voiceChannelId) return;

    // We rely on the initial 'join-voice-channel' CONNECT permission check.
    // Blocking 'voice-offer' prevents the P2P handshake, which stops users from even listening.
    // Future improvement: Implement specific 'speak' vs 'listen' logic if needed,
    // possibly by filtering SDP or using a media server, but for Mesh P2P, we allow the handshake.

    io.to(`user-${data.targetUserId}`).emit('voice-offer', {
      fromUserId: socket.userId,
      offer: data.offer
    });
  });

  socket.on('voice-answer', (data) => {
    io.to(`user-${data.targetUserId}`).emit('voice-answer', {
      fromUserId: socket.userId,
      answer: data.answer
    });
  });

  socket.on('voice-ice-candidate', (data) => {
    io.to(`user-${data.targetUserId}`).emit('voice-ice-candidate', {
      fromUserId: socket.userId,
      candidate: data.candidate
    });
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.userId);
    if (socket.voiceChannelId) {
      io.to(`voice-channel-${socket.voiceChannelId}`).emit('voice-user-left', {
        userId: socket.userId
      });
      await notifyVoiceChannelUpdate(socket.voiceChannelId);
    }

    // Automatic status update on last disconnect
    const userRoom = `user-${String(socket.userId)}`;
    const connections = io.sockets.adapter.rooms.get(userRoom);
    if (!connections || connections.size === 0) {
      try {
        const user = await User.findById(socket.userId);
        if (user) {
          user.status = 'offline';
          await user.save();
          io.emit('user-updated', {
            _id: user._id,
            status: 'offline'
          });
        }
      } catch (err) {
        console.error('Error auto-updating status on disconnect:', err);
      }
    }
  });
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zvon', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

