const mongoose = require('mongoose');

const voiceSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: false
  },
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: false,
    index: true
  },
  // Для звонков в личных сообщениях/группах
  dmId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DirectMessage',
    required: false
  },
  joinedAt: {
    type: Date,
    required: true,
    index: true
  },
  leftAt: {
    type: Date,
    required: true
  },
  durationSeconds: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: true
});

voiceSessionSchema.index({ joinedAt: 1, durationSeconds: 1 });
voiceSessionSchema.index({ server: 1, joinedAt: 1 });

module.exports = mongoose.model('VoiceSession', voiceSessionSchema);
