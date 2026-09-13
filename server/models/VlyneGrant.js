const mongoose = require('mongoose');

/**
 * Выданное пользователем разрешение приложению — то, что делает вход
 * «в одно нажатие». Согласие спрашивается один раз: дальше при новом входе
 * сервер видит запись и сразу выдаёт код, без экрана подтверждения.
 *
 * Запись же — единственная точка отзыва: удалили её, и все токены приложения
 * перестают обновляться, а пользователь снова увидит экран согласия.
 */
const vlyneGrantSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'VlyneClient', required: true, index: true },

  // Права, на которые человек согласился. Новый запрос с правом вне списка
  // снова покажет экран согласия — молча расширить доступ нельзя.
  scopes: { type: [String], default: [] },

  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
  lastUsedAt:  { type: Date, default: Date.now },

  // Чем пользовался в последний раз — показывается в «Подключённых приложениях».
  lastUserAgent: { type: String, default: '' },
  lastIp: { type: String, default: '' }
});

vlyneGrantSchema.index({ user: 1, client: 1 }, { unique: true });

/** Покрывает ли выданное согласие запрошенный набор прав. */
vlyneGrantSchema.methods.covers = function (scopes) {
  return scopes.every((s) => this.scopes.includes(s));
};

module.exports = mongoose.model('VlyneGrant', vlyneGrantSchema);
