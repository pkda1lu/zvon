const mongoose = require('mongoose');

/**
 * Refresh-токен с ротацией. При каждом обновлении старый помечается
 * использованным и выдаётся новый — вся цепочка от одного входа образует
 * «семью» (family).
 *
 * Зачем семья: refresh-токен живёт месяцами и хранится у клиента, то есть
 * может утечь. Если украденный токен применяют повторно (а он уже был
 * использован), мы видим это по флагу usedAt и гасим всю семью. Вор и
 * настоящий владелец оба оказываются разлогинены — это лучше, чем тихий
 * параллельный доступ к аккаунту.
 */
const vlyneRefreshTokenSchema = new mongoose.Schema({
  // sha256 токена; в открытом виде он есть только у клиента.
  tokenHash: { type: String, required: true, unique: true, index: true },

  family: { type: String, required: true, index: true },

  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  client:   { type: mongoose.Schema.Types.ObjectId, ref: 'VlyneClient', required: true, index: true },
  clientId: { type: String, required: true },
  grant:    { type: mongoose.Schema.Types.ObjectId, ref: 'VlyneGrant', default: null },

  scopes: { type: [String], default: [] },

  // Сессия Zvon, породившая вход (выход с устройства обрывает и её потомков).
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },

  usedAt:    { type: Date, default: null },
  revokedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

vlyneRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('VlyneRefreshToken', vlyneRefreshTokenSchema);
