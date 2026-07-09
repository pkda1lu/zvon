const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  color: {
    type: String,
    default: '#99aab5'
  },
  hoist: {
    type: Boolean,
    default: false
  },
  position: {
    type: Number,
    default: 0
  },
  permissions: {
    type: String, // Stored as BigInt string
    default: '0'
  },
  mentionable: {
    type: Boolean,
    default: false
  }
});

const serverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  icon: {
    type: String,
    default: null
  },
  banner: {
    type: String,
    default: null
  },
  bannerColor: {
    type: String,
    default: '#5865f2'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  roles: [roleSchema],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    nickname: {
      type: String,
      maxlength: 100,
      default: null
    },
    roles: [{
      type: mongoose.Schema.Types.ObjectId,
      // No ref here because we store role as a subdocument in the server
    }],
    joinedAt: {
      type: Date,
      default: Date.now
    },
    communicationDisabledUntil: {
      type: Date,
      default: null
    },
    bio: {
      type: String,
      maxlength: 300,
      default: null
    },
    avatar: {
      type: String,
      default: null
    },
    banner: {
      type: String,
      default: null
    },
    bannerColor: {
      type: String,
      default: null
    }
  }],
  channels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel'
  }],
  bans: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      maxlength: 500,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null // null = навсегда
    },
    bannedAt: {
      type: Date,
      default: Date.now
    },
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  emojis: [{
    name: String,
    url: String,
    id: String, // Unique ID for the emoji within the server
    animated: Boolean,
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  // Особенности сервера — до 5 коротких строк, отображаются на карточке/инвайте
  features: {
    type: [String],
    default: []
  },
  // Любимые активности сервера — до 5 игр/активностей участников (с иконкой для карточки сервера)
  featuredActivities: {
    type: [{
      name: { type: String, required: true },
      image: { type: String, default: null }
    }],
    default: []
  },
  // Значок сервера (server tag)
  tag: {
    text: { type: String, maxlength: 5, default: null },
    icon: { type: String, default: null },
    color: { type: String, default: '#5865f2' }
  },
  // Приветствия при входе — пул до 10 сообщений, случайный выбор при джойне
  welcomeEnabled: {
    type: Boolean,
    default: true
  },
  welcomeMessages: {
    type: [String],
    default: []
  },
  welcomeChannel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    default: null
  },
  // События сервера — показывать текущие активности участников в списке участников
  showMemberActivity: {
    type: Boolean,
    default: true
  },
  // Отображение списка пользователей справа от чата
  showMembersList: {
    type: Boolean,
    default: true
  },
  // Кулдаун новичков в секундах, 0 = выключен
  newcomerCooldownSeconds: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model('Server', serverSchema);
