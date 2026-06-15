const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Сырой User-Agent + разобранные поля для отображения.
  // sha256 токена — для «усыновления» старых токенов без sid (привязка current).
  tokenHash: { type: String, default: null, index: true },

  userAgent: { type: String, default: '' },
  browser: { type: String, default: 'Неизвестно' },
  os: { type: String, default: 'Неизвестно' },
  deviceType: { type: String, enum: ['desktop', 'mobile', 'tablet', 'app', 'unknown'], default: 'unknown' },
  deviceName: { type: String, default: '' }, // человекочитаемое: "Chrome на Windows"

  // Геолокация по IP (best-effort, может быть пустой).
  ip: { type: String, default: '' },
  country: { type: String, default: '' },
  countryCode: { type: String, default: '' },
  city: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now, index: true },
  // TTL: сессия сама удаляется по истечении срока жизни токена.
  expiresAt: { type: Date, required: true }
});

// Авто-очистка протухших сессий.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
