const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

/**
 * Отправка Web Push уведомлений.
 *
 * Зачем нужно, если уже есть сокеты: сокет живёт только пока открыта вкладка.
 * Web Push доставляется через push-сервис браузера (у iOS — Apple), поэтому
 * уведомление приходит и когда приложение полностью закрыто. Для PWA на iPhone
 * это единственный рабочий способ — Notification API там из страницы не
 * работает, показывать умеет только service worker.
 *
 * Ключи VAPID — это способ push-сервиса убедиться, что отправитель тот же, что
 * и при подписке. Генерируются один раз: `node server/scripts/generateVapidKeys.js`.
 */

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
// mailto: обязателен по спецификации — push-сервис использует его, чтобы
// связаться с владельцем при проблемах с отправкой.
const contact = process.env.VAPID_CONTACT || 'mailto:admin@example.com';

let configured = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(contact, publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.error('[push] Некорректные VAPID-ключи, push отключён:', err.message);
  }
} else {
  console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY не заданы — push-уведомления отключены.');
}

const isPushConfigured = () => configured;
const getPublicKey = () => publicKey;

/**
 * Шлёт уведомление на все устройства пользователя.
 *
 * Полезная нагрузка ограничена ~4 КБ, поэтому передаём только то, что нужно
 * для показа и перехода: заголовок, текст, иконку и ссылку.
 *
 * @param {string} userId
 * @param {{title: string, body: string, icon?: string, tag?: string, url?: string, data?: object}} payload
 */
async function sendPushToUser(userId, payload) {
  if (!configured || !userId) return { sent: 0, removed: 0 };

  let subs;
  try {
    subs = await PushSubscription.find({ user: userId });
  } catch (err) {
    console.error('[push] Не удалось прочитать подписки:', err.message);
    return { sent: 0, removed: 0 };
  }
  if (!subs.length) return { sent: 0, removed: 0 };

  const body = JSON.stringify({
    title: payload.title || 'Zvon',
    body: payload.body || '',
    icon: payload.icon || null,
    // tag схлопывает уведомления из одного чата в одно, чтобы не заваливать
    // экран блокировки при активной переписке.
    tag: payload.tag || 'zvon',
    url: payload.url || '/',
    data: payload.data || {}
  });

  let sent = 0;
  const stale = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        body,
        { TTL: 60 * 60 * 24, urgency: 'high' }
      );
      sent++;
    } catch (err) {
      // 404/410 — подписка мертва (PWA удалили, разрешение отозвали).
      // Такие чистим, иначе они копятся и каждая отправка тратит время впустую.
      if (err.statusCode === 404 || err.statusCode === 410) {
        stale.push(sub._id);
      } else {
        console.error('[push] Ошибка отправки:', err.statusCode, err.body || err.message);
      }
    }
  }));

  if (stale.length) {
    try { await PushSubscription.deleteMany({ _id: { $in: stale } }); } catch { }
  }
  if (sent) {
    try { await PushSubscription.updateMany({ user: userId }, { lastUsedAt: new Date() }); } catch { }
  }

  return { sent, removed: stale.length };
}

/**
 * Обрезает длинный текст сообщения до пригодного для уведомления вида.
 * Заодно убирает переводы строк — в системном уведомлении они выглядят рвано.
 */
function previewText(text, max = 140) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Новое сообщение';
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

module.exports = { sendPushToUser, isPushConfigured, getPublicKey, previewText };
