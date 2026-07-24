const mongoose = require('mongoose');

const permissionOverwriteSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  type: {
    type: String,
    enum: ['role', 'member'],
    required: true
  },
  allow: {
    type: String,
    default: '0'
  },
  deny: {
    type: String,
    default: '0'
  }
});

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['text', 'voice', 'category', 'room'],
    default: 'text'
  },
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    default: null
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    default: null
  },
  position: {
    type: Number,
    default: 0
  },
  topic: {
    type: String,
    maxlength: 500
  },
  // Медленный режим (сек между сообщениями), 0 = выключен. Только для текстовых.
  slowMode: {
    type: Number,
    default: 0,
    min: 0,
    max: 21600
  },
  // Голосовые каналы
  bitrate: {
    type: Number,
    default: 64000
  },
  userLimit: {
    type: Number,
    default: 0,
    min: 0,
    max: 99
  },
  permissionOverwrites: [permissionOverwriteSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Channel', channelSchema);

