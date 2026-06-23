const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  name: {
    type: String,
    trim: true,
    default: null
  },
  icon: {
    type: String,
    default: null
  },
  // Чат «от имени модерации»: пользователь видит собеседника как «Модерация»,
  // а не реальный аккаунт модератора. moderator — кто из участников модератор.
  isModeration: {
    type: Boolean,
    default: false
  },
  moderator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  messages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index participants for faster lookup
directMessageSchema.index({ participants: 1 });

module.exports = mongoose.model('DirectMessage', directMessageSchema);










