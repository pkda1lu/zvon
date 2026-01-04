const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
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
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Socket.io connection handling
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
  socket.join(`user-${socket.userId}`);

  // Join server room
  socket.on('join-server', async (serverId) => {
    socket.join(`server-${serverId}`);
    console.log(`User ${socket.userId} joined server ${serverId}`);

    // Auto-send voice states
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

  // Voice call events
  socket.on('call-offer', (data) => {
    io.to(`user-${data.targetUserId}`).emit('call-offer', {
      fromUserId: socket.userId,
      offer: data.offer
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

  // Voice channel events
  const getVoiceChannelUsers = async (channelId) => {
    const room = io.sockets.adapter.rooms.get(`voice-channel-${channelId}`);
    if (!room) return [];

    const users = [];
    const User = require('./models/User');

    for (const socketId of room) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && socket.userId) {
        const user = await User.findById(socket.userId).select('username avatar status');
        if (user) {
          users.push(user);
        }
      }
    }
    return users;
  };

  const notifyVoiceChannelUpdate = async (channelId) => {
    try {
      const Channel = require('./models/Channel');
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

  socket.on('join-voice-channel', async (data) => {
    const channelId = data.channelId;
    const User = require('./models/User');

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
        avatar: user.avatar
      }
    });

    // Send existing users to the joiner
    socket.emit('voice-existing-users', existingUsers);

    // Notify server (Sidebar)
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
  socket.on('voice-offer', (data) => {
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

