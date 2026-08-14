const mongoose = require('mongoose');

/**
 * Запись о согласии на обработку персональных данных (152-ФЗ, ст. 9).
 *
 * Зачем отдельная модель, а не флаг в User: по ч. 1 ст. 9 бремя доказывания
 * получения согласия лежит на операторе. Доказывать нужно не факт «галочка
 * стоит», а что конкретный человек в конкретный момент согласился с конкретной
 * редакцией документа. Поэтому храним версию и хеш текста: если политику потом
 * изменят, останется видно, с чем именно человек соглашался.
 *
 * Записи об отзыве согласия не удаляют запись о его выдаче — история должна
 * оставаться целостной. Отзыв фиксируется отдельной записью с revokedAt.
 */
const consentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },

  // Почта на момент согласия — на случай, если аккаунт позже удалят или
  // обезличат, а подтвердить факт согласия потребуется.
  email: { type: String, default: '' },

  /**
   * Назначение согласия. Разделены намеренно: по ст. 9 согласие должно быть
   * конкретным, одной галочкой «на всё» закрыть разные цели нельзя.
   *   personal_data — обработка ПД для работы сервиса (основное)
   *   cross_border  — трансграничная передача (ст. 12)
   *   marketing     — рассылки и реклама (может быть отозвано отдельно)
   */
  purpose: {
    type: String,
    enum: ['personal_data', 'cross_border', 'marketing'],
    required: true,
    index: true
  },

  // Версия документа, с которым согласился пользователь, и хеш его текста.
  documentVersion: { type: String, required: true },
  documentHash: { type: String, default: '' },

  granted: { type: Boolean, default: true },
  grantedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },

  // Обстоятельства получения — подтверждают осознанность действия.
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' }
});

consentSchema.index({ user: 1, purpose: 1, grantedAt: -1 });

module.exports = mongoose.model('Consent', consentSchema);
