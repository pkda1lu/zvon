const mongoose = require('mongoose');

/**
 * Один заход на /oauth/authorize — от перехода по ссылке до обмена кода
 * на токены. Держим его в базе, а не в памяти процесса: при перезапуске
 * сервера человек не должен получать «сессия истекла» посреди входа, а при
 * нескольких процессах pm2 экран согласия и обмен кода попадают в разные.
 *
 * Жизненный цикл:
 *   pending  — параметры проверены, ждём решения пользователя
 *   approved — согласие получено, выдан код (хранится хешем)
 *   used     — код обменян на токены; повторный обмен считается кражей кода
 *   denied   — пользователь отказал
 */
const vlyneAuthRequestSchema = new mongoose.Schema({
  // Непредсказуемый идентификатор: он же попадает в адресную строку экрана
  // согласия, поэтому не должен угадываться перебором.
  requestId: { type: String, required: true, unique: true, index: true },

  client:      { type: mongoose.Schema.Types.ObjectId, ref: 'VlyneClient', required: true },
  clientId:    { type: String, required: true },
  redirectUri: { type: String, required: true },
  scopes:      { type: [String], default: [] },
  state:       { type: String, default: '' },
  nonce:       { type: String, default: '' },

  // PKCE. Метод только S256: plain не защищает ни от чего.
  codeChallenge:       { type: String, required: true },
  codeChallengeMethod: { type: String, enum: ['S256'], default: 'S256' },

  status: { type: String, enum: ['pending', 'approved', 'used', 'denied'], default: 'pending', index: true },

  // Пользователь появляется на шаге согласия, а не при создании запроса.
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // sha256 кода авторизации. В открытом виде код существует только в
  // редиректе к приложению — в базе его нет, как и пароля.
  codeHash:      { type: String, default: null, index: true },
  codeExpiresAt: { type: Date, default: null },

  // Сессия Zvon, из которой подтвердили вход: позволяет оборвать доступ
  // приложения вместе с выходом с устройства.
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },

  createdAt: { type: Date, default: Date.now },
  // TTL: незавершённые попытки входа не копятся в базе.
  expiresAt: { type: Date, required: true }
});

vlyneAuthRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('VlyneAuthRequest', vlyneAuthRequestSchema);
