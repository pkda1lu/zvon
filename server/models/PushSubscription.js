const mongoose = require('mongoose');

/**
 * Подписка браузера на Web Push.
 *
 * Одна запись = один установленный экземпляр приложения (конкретный браузер на
 * конкретном устройстве). У пользователя их может быть несколько: PWA на
 * айфоне, Chrome на ноутбуке и т.д. — уведомление рассылается на все.
 *
 * endpoint выдаёт push-сервис браузера (для iOS это Apple, для Chrome — FCM) и
 * он же служит идентификатором подписки, поэтому уникален. При переустановке
 * PWA или отзыве разрешения старый endpoint начинает отвечать 404/410 — такие
 * записи чистит sendPushToUser (см. utils/webPush.js).
 */
const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    unique: true
  },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  // Для показа в настройках («откуда подписаны») и отладки.
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
