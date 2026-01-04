const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  url: String,
  filename: String,
  size: Number,
  type: String
}, { _id: false });

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    maxlength: 2000,
    default: ''
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    default: null
  },
  directMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DirectMessage',
    default: null
  },
  attachments: [attachmentSchema],
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  reactions: [{
    emoji: String,
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageSchema.pre('save', function (next) {
  if (!this.content && (!this.attachments || this.attachments.length === 0)) {
    return next(new Error('Сообщение не может быть пустым (нужен текст или вложение)'));
  }
  next();
});

module.exports = mongoose.model('Message', messageSchema);

