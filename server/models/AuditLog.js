const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true,
    index: true
  },
  executor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  target: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel', // Dynamic ref
    default: null
  },
  targetModel: {
    type: String,
    enum: ['User', 'Channel', 'Message', 'Server', 'Invite'],
    default: 'User'
  },
  // Снимок названия цели на момент действия: канал, роль или участник могут
  // быть удалены, и без снимка запись превращалась в пустое место.
  targetName: {
    type: String,
    maxlength: 200,
    default: null
  },
  // Контекст действия: канал и текст сообщения, код приглашения, цвет роли,
  // срок бана и т.п. Раньше это писалось английской фразой в «причину».
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  action: {
    type: String,
    required: true,
    enum: [
      'SERVER_UPDATE',
      'CHANNEL_CREATE',
      'CHANNEL_UPDATE',
      'CHANNEL_DELETE',
      'MEMBER_KICK',
      'MEMBER_BAN',
      'MEMBER_UNBAN',
      'MEMBER_JOIN',
      'MEMBER_LEAVE',
      'MEMBER_UPDATE', // Roles, Nickname change
      'MEMBER_BAN_UPDATE', // Изменение срока или причины бана
      'BOT_ADD',
      'MEMBER_TIMEOUT',
      // Голосовая модерация. Эти действия писались в журнал с самого начала,
      // но в список не входили — mongoose отбивал их валидацией, и в логах
      // сервера вместо записи копились ошибки «is not a valid enum value».
      'MEMBER_VOICE_KICK',
      'MEMBER_VOICE_MOVE',
      'MEMBER_VOICE_SERVER_MUTE',
      'MEMBER_VOICE_SERVER_DEAFEN',
      'MEMBER_VOICE_SELF_STATE',
      'SERVER_TRANSFER',
      'ROLE_CREATE',
      'ROLE_UPDATE',
      'ROLE_DELETE',
      'ROLE_POSITIONS_UPDATE',
      'INVITE_CREATE',
      'INVITE_DELETE',
      'INVITE_UPDATE',
      'MESSAGE_DELETE',
      'MESSAGE_BULK_DELETE',
      'MESSAGE_PIN',
      'MESSAGE_UNPIN',
      'EMOJI_CREATE',
      'EMOJI_UPDATE',
      'EMOJI_DELETE'
    ]
  },
  changes: [{
    key: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
  }],
  reason: {
    type: String,
    maxlength: 512,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
