const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const PushSubscription = require('../models/PushSubscription');
const { isPushConfigured, getPublicKey, sendPushToUser } = require('../utils/webPush');

// Публичный VAPID-ключ нужен клиенту, чтобы оформить подписку в браузере.
// Он публичный по определению — приватный остаётся только на сервере.
router.get('/public-key', (req, res) => {
  res.json({ enabled: isPushConfigured(), publicKey: getPublicKey() });
});

// Регистрация подписки. Клиент присылает объект PushSubscription из браузера.
// Один и тот же endpoint может прийти повторно (переустановка приложения,
// перелогин) — тогда просто переписываем владельца и ключи.
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ message: 'Некорректная подписка' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user: req.user._id,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userAgent: (req.header('User-Agent') || '').slice(0, 300),
        lastUsedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[push] subscribe error:', err.message);
    res.status(500).json({ message: 'Не удалось сохранить подписку' });
  }
});

router.post('/unsubscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ message: 'endpoint обязателен' });
    await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Не удалось удалить подписку' });
  }
});

// Тестовое уведомление — чтобы пользователь мог проверить, что всё дошло,
// не дожидаясь чужого сообщения. Особенно полезно на iOS, где путь установки
// PWA неочевиден и легко ошибиться.
router.post('/test', auth, async (req, res) => {
  try {
    const { withAttachment } = req.body || {};
    const result = await sendPushToUser(req.user._id, {
      title: '💬 Тестовое уведомление',
      body: withAttachment ? 'Проверка с вложением: всё настроено верно! (📷 Фотография)' : 'Проверка уведомлений — всё работает отлично.',
      icon: req.user.avatar || '/icon.png',
      image: withAttachment ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop' : null,
      tag: 'zvon-test',
      url: '/?settings=notifications'
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ message: 'Не удалось отправить тестовое уведомление' });
  }
});

module.exports = router;
