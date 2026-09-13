const mongoose = require('mongoose');

/**
 * Заявка на подключение приложения к Vlyne ID.
 *
 * Регистрация клиентов остаётся непубличной — доступ к аккаунтам людей нельзя
 * раздавать по факту нажатия кнопки. Но «непубличная» не значит «руками в
 * коде»: разработчик заполняет заявку, модератор читает и решает, а клиент при
 * одобрении создаётся сам. Человек в этой цепочке отвечает за решение, а не за
 * перенос полей из письма в базу — переносом машина не ошибается, а человек да.
 *
 * Статусы:
 *   pending           — ждёт первого рассмотрения
 *   changes_requested — модератор задал вопросы или попросил доработать
 *   approved          — одобрена, клиент создан
 *   rejected          — отклонена
 */
const vlyneAppRequestSchema = new mongoose.Schema({
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Почта для писем о решении. Копируется из аккаунта на момент подачи, но
  // хранится отдельно: человек может сменить её, пока заявка на рассмотрении,
  // и письмо должно уйти туда, куда он просил.
  contactEmail: { type: String, required: true, trim: true, lowercase: true },

  // ---- Что просят ----
  name:             { type: String, required: true, trim: true, maxlength: 60 },
  description:      { type: String, default: '', maxlength: 300 },
  homepageUrl:      { type: String, default: '', trim: true },
  privacyPolicyUrl: { type: String, default: '', trim: true },
  logo:             { type: String, default: null },

  type: { type: String, enum: ['public', 'confidential'], default: 'public' },
  redirectUris:   { type: [String], default: [] },
  requestedScopes: { type: [String], default: ['openid', 'profile'] },

  // Зачем приложению эти права. Главный текст заявки: по нему модератор и
  // принимает решение, всё остальное — анкетные поля.
  purpose: { type: String, required: true, maxlength: 1500 },

  status: {
    type: String,
    enum: ['pending', 'changes_requested', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },

  /**
   * Переписка по заявке. Модератор может спросить, разработчик — ответить,
   * и заявка при этом не начинается заново: история решения остаётся в одном
   * месте, а не расползается по личной почте.
   */
  messages: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role:   { type: String, enum: ['applicant', 'moderator'], required: true },
    text:   { type: String, required: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now }
  }],

  // ---- Решение ----
  moderator:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt:  { type: Date, default: null },
  // Клиент, созданный по этой заявке. Связь нужна, чтобы разработчик видел
  // свои приложения, а модератор — историю: кто и по какой заявке получил доступ.
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'VlyneClient', default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

vlyneAppRequestSchema.index({ applicant: 1, createdAt: -1 });
vlyneAppRequestSchema.index({ status: 1, createdAt: -1 });

vlyneAppRequestSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

/** Можно ли ещё редактировать заявку — то есть решение по ней не принято. */
vlyneAppRequestSchema.methods.isOpen = function () {
  return this.status === 'pending' || this.status === 'changes_requested';
};

module.exports = mongoose.model('VlyneAppRequest', vlyneAppRequestSchema);
