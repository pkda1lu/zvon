const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const User = require('../models/User');
const Session = require('../models/Session');
const Consent = require('../models/Consent');
const Message = require('../models/Message');
const DirectMessage = require('../models/DirectMessage');
const Friendship = require('../models/Friendship');
const Server = require('../models/Server');
const PushSubscription = require('../models/PushSubscription');

const { anonymizeUser } = require('../utils/pdErasure');
const { getPolicyMeta, getConsentMeta } = require('../utils/pdDocuments');
const { logGlobalAction } = require('../utils/globalAuditLogger');

/**
 * Права субъекта персональных данных (152-ФЗ, ст. 14, 20, 21).
 *
 * Все действия здесь пользователь совершает только над собственными данными —
 * идентификатор берётся из токена, а не из параметров запроса. Принимать id из
 * тела было бы прямой дырой: любой смог бы выгрузить или удалить чужой аккаунт.
 */

/** Действующие редакции документов — чтобы интерфейс показывал актуальные. */
router.get('/documents', (req, res) => {
  res.json({ policy: getPolicyMeta(), consent: getConsentMeta() });
});

/**
 * Выгрузка своих данных (ст. 14 — право на доступ).
 *
 * Отдаём машиночитаемый JSON. Сообщения включены как содержимое, созданное
 * пользователем, но БЕЗ чужих реплик: выгрузка своих данных не должна
 * превращаться в способ получить переписку других людей.
 */
router.get('/export', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select(
      '-password -verificationToken -verificationCode -twoFactorCode -resetPasswordCode -botToken -emailChangeCode'
    );
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const [sessions, consents, ownMessages, dms, friendships, servers, pushes] = await Promise.all([
      Session.find({ user: userId }).select('-tokenHash'),
      Consent.find({ user: userId }),
      // Только собственные сообщения. Ограничение по количеству — защита от
      // неподъёмного ответа на больших аккаунтах.
      Message.find({ author: userId }).select('content createdAt channel directMessage attachments').sort({ createdAt: -1 }).limit(10000),
      DirectMessage.find({ participants: userId }).select('participants name isModeration createdAt'),
      Friendship.find({ $or: [{ requester: userId }, { recipient: userId }] }),
      Server.find({ 'members.user': userId }).select('name'),
      PushSubscription.find({ user: userId }).select('endpoint userAgent createdAt'),
    ]);

    const payload = {
      сформировано: new Date().toISOString(),
      пояснение:
        'Выгрузка персональных данных по ст. 14 152-ФЗ. Содержит данные, относящиеся к вам. ' +
        'Сообщения других пользователей не включены.',
      учётная_запись: user,
      сессии_и_устройства: sessions,
      согласия: consents,
      мои_сообщения: ownMessages,
      диалоги: dms,
      друзья_и_заявки: friendships,
      серверы: servers.map(s => s.name),
      подписки_на_уведомления: pushes,
    };

    // Журналируем факт выгрузки: это доступ к массиву ПД, он должен быть виден.
    await logGlobalAction({
      executorId: userId,
      action: 'PD_EXPORT',
      targetId: userId,
      targetModel: 'User',
      details: { messages: ownMessages.length, sessions: sessions.length }
    }).catch(() => { });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zvon-personal-data-${userId}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[pd] export error:', err.message);
    res.status(500).json({ message: 'Не удалось сформировать выгрузку' });
  }
});

/** История согласий пользователя. */
router.get('/consents', auth, async (req, res) => {
  try {
    const consents = await Consent.find({ user: req.user._id }).sort({ grantedAt: -1 });
    res.json(consents);
  } catch {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * Отзыв согласия по конкретной цели.
 *
 * Отозвать согласие на обработку ПД целиком нельзя, продолжая пользоваться
 * сервисом: без обработки логина и почты учётной записи не существует. Такой
 * отзыв равнозначен удалению аккаунта, поэтому здесь разрешены только
 * необязательные цели, а для основной пользователь направляется к удалению.
 */
router.post('/consents/revoke', auth, async (req, res) => {
  try {
    const { purpose } = req.body || {};
    if (purpose !== 'marketing' && purpose !== 'cross_border') {
      return res.status(400).json({
        message: 'Отзыв согласия на обработку данных учётной записи означает удаление аккаунта — используйте удаление.'
      });
    }
    await Consent.updateMany(
      { user: req.user._id, purpose, granted: true, revokedAt: null },
      { $set: { granted: false, revokedAt: new Date() } }
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * Удаление учётной записи через обезличивание (ст. 14, 21).
 *
 * Требуем пароль: операция необратима, и подтверждение личности здесь —
 * не формальность. Захваченная сессия иначе позволила бы уничтожить аккаунт.
 */
router.post('/delete-account', auth, async (req, res) => {
  try {
    const { password, confirm } = req.body || {};

    if (confirm !== 'УДАЛИТЬ') {
      return res.status(400).json({ message: 'Для подтверждения введите слово УДАЛИТЬ' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (user.isDeleted) return res.status(400).json({ message: 'Учётная запись уже удалена' });

    if (!password) return res.status(400).json({ message: 'Введите пароль' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Неверный пароль' });

    // Владельцев серверов не обезличиваем молча: сервер останется без
    // администратора, а его участники — без возможности им управлять.
    const ownedServers = await Server.countDocuments({ owner: user._id });
    if (ownedServers > 0) {
      return res.status(400).json({
        message: `Вы владелец ${ownedServers} сервер(ов). Передайте права или удалите их, затем повторите.`
      });
    }

    const result = await anonymizeUser(user._id);

    await logGlobalAction({
      executorId: user._id,
      action: 'PD_ACCOUNT_ANONYMIZED',
      targetId: user._id,
      targetModel: 'User',
      details: result.removed
    }).catch(() => { });

    res.json({
      ok: true,
      message: 'Учётная запись обезличена. Данные, позволяющие вас определить, удалены.',
      удалено: result.removed
    });
  } catch (err) {
    console.error('[pd] delete-account error:', err.message);
    res.status(500).json({ message: 'Не удалось удалить учётную запись' });
  }
});

module.exports = router;
