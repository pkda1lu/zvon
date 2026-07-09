const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationCode: String,
  verificationCodeExpires: Date,
  twoFactorCode: String,
  twoFactorCodeExpires: Date,
  resetPasswordCode: String,
  resetPasswordExpires: Date,
  tempEmail: String,
  emailChangeCode: String,
  emailChangeCodeExpires: Date,
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
    default: '#5865f2'
  },
  bio: {
    type: String,
    maxlength: 300,
    default: ''
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'away', 'busy'],
    default: 'offline'
  },
  statusPreference: {
    type: String,
    enum: ['online', 'away', 'busy', 'offline'],
    default: 'online'
  },
  servers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server'
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  notes: {
    type: Map,
    of: String, // Key is target ID (user, etc.), value is the note
    default: {}
  },
  activity: {
    name: { type: String, default: null },
    type: {
      type: String,
      enum: ['playing', 'streaming', 'listening', 'watching', 'competing', 'sitting', null],
      default: 'playing'
    },
    details: String,
    state: String,
    timestamps: {
      start: Number,
      end: Number
    },
    assets: {
      largeImage: String,
      largeText: String,
      smallImage: String,
      smallText: String
    },
    miniAppData: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  // Накопленное время в играх — для блока «Любимые игры» в развёрнутом профиле.
  gameStats: [{
    name: { type: String, required: true },
    image: { type: String, default: null },
    totalSeconds: { type: Number, default: 0 },
    lastPlayedAt: { type: Date, default: Date.now }
  }],
  isBot: {
    type: Boolean,
    default: false
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  /** For bot accounts: status of marketplace publication review. */
  botModerationStatus: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected'],
    default: 'draft'
  },
  botModerationReason: { type: String, default: null },
  botModeratedAt: { type: Date, default: null },
  botModeratedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  botIsBlocked: { type: Boolean, default: false },
  botBlockReason: { type: String, default: null },
  botToken: {
    type: String,
    unique: true,
    sparse: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  badges: {
    type: [String],
    default: []
  },
  is2FAEnabled: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banExpires: Date,
  banReason: String,
  displayName: {
    type: String,
    trim: true,
    maxlength: 32,
    default: null
  },
  primaryServer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    default: null
  },
  // Какой значок показывать рядом с ником: собственный профильный бейдж или тег одного из серверов
  displayedTag: {
    type: {
      type: String,
      enum: ['badge', 'serverTag'],
      default: 'badge'
    },
    server: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Server',
      default: null
    }
  },
  settings: {
    showActivityStatus: {
      type: Boolean,
      default: true
    },
    activityVisibility: {
      type: String,
      enum: ['everyone', 'friends', 'none'],
      default: 'everyone'
    },
    hiddenActivities: {
      type: [String],
      default: []
    },
    // Multi-select (клиент шлёт массив категорий) — поэтому [String], а не String,
    // иначе mongoose падает с CastError при сохранении настроек приватности.
    whoCanDM: {
      type: [String],
      enum: ['everyone', 'server_members', 'friends', 'nobody'],
      default: ['everyone']
    },
    whoCanFindInSearch: {
      type: String,
      enum: ['everyone', 'friends_of_friends', 'nobody'],
      default: 'everyone'
    },
    whoCanSeeFullProfile: {
      type: [String],
      enum: ['everyone', 'friends', 'small_servers', 'nobody'],
      default: ['everyone']
    },
    smallServerLimit: {
      type: Number,
      default: 50
    },
    // New Interface Settings
    appearance: {
      theme: { type: String, default: 'dark' },
      interfaceScale: { type: Number, default: 1.0 },
      appIcon: { type: String, default: 'default' },
      reduceMotion: { type: Boolean, default: false },
      performanceMode: { type: Boolean, default: false },
      customColors: {
        primary: { type: String, default: '#006aff' },
        secondary: { type: String, default: '#7000ff' },
        accent: { type: String, default: '#ff00c8' }
      },
      customBackground: { type: String, default: '' },
      backgroundDim: { type: Number, default: 40 },
      backgroundBlur: { type: Number, default: 0 }
    },
    chat: {
      displayMode: { type: String, default: 'cozy' },
      showPreview: { type: Boolean, default: true },
      autoPlayGif: { type: Boolean, default: true },
      highlightMentions: { type: Boolean, default: true },
      emojiAutocomplete: { type: Boolean, default: true },
      showHoverBar: { type: Boolean, default: true },
      textToSpeech: { type: Boolean, default: false }
    },
    language: {
      language: { type: String, default: 'ru' },
      timeFormat: { type: String, default: '24h' }
    },
    accessibility: {
      screenReader: { type: Boolean, default: false },
      interfaceScale: { type: Number, default: 1.0 }
    },
    streamerMode: {
      enabled: { type: Boolean, default: false },
      autoEnableWithOBS: { type: Boolean, default: true },
      streamerLink: { type: String, default: '' },
      censorInfo: { type: Boolean, default: true },
      disableSounds: { type: Boolean, default: true },
      disableNotifications: { type: Boolean, default: true },
      changeStatusToStreaming: { type: Boolean, default: true },
      confirmSettingsAccess: { type: Boolean, default: true }
    },
    windows: {
      activityDetectionEnabled: { type: Boolean, default: true },
      overlayCategories: {
        type: [String],
        enum: ['game', 'music', 'video', 'other'],
        default: ['game', 'music', 'video']
      }
    },
    overlay: {
      enabled: { type: Boolean, default: true },
      position: { 
        type: String, 
        enum: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'],
        default: 'top-left'
      },
      opacity: { type: Number, default: 1.0 },
      size: { type: Number, default: 1.0 },
      showNames: { type: Boolean, default: true },
      showAvatars: { type: Boolean, default: true },
      showSpeakingRing: { type: Boolean, default: true },
      idleOpacity: { type: Number, default: 0.5 },
      showBackground: { type: Boolean, default: true }
    },
    interaction: {
      voice: {
        noiseSuppression: { type: Boolean, default: true },
        echoCancellation: { type: Boolean, default: true },
        autoGainControl: { type: Boolean, default: true },
        attenuation: { type: Number, default: 0 },
        isAutomaticSensitivity: { type: Boolean, default: true },
        inputSensitivity: { type: Number, default: -60 }
      },
      keybinds: [{
        id: String,
        action: String,
        accelerator: String,
        isEnabled: { type: Boolean, default: true }
      }]
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);










