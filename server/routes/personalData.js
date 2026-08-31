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

/**
 * Текст документа для показа на сайте.
 *
 * Отдаётся ровно тот файл, от которого считается контрольная сумма в записях о
 * согласии (см. utils/pdDocuments.js). Это принципиально: если бы страница
 * содержала свою копию текста, они со временем разошлись бы, и получилось бы,
 * что пользователь согласился с одной формулировкой, а опубликована другая.
 */
router.get('/documents/:name', (req, res) => {
  const FILES = {
    policy: 'politika-obrabotki-pd.md',
    consent: 'soglasie-na-obrabotku.md',
  };
  const file = FILES[req.params.name];
  if (!file) return res.status(404).json({ message: 'Документ не найден' });

  try {
    const fs = require('fs');
    const path = require('path');
    const full = path.join(__dirname, '..', 'legal', file);
    const text = fs.readFileSync(full, 'utf8');
    const meta = req.params.name === 'policy' ? getPolicyMeta() : getConsentMeta();
    res.json({ text, version: meta.version, hash: meta.hash });
  } catch (err) {
    console.error('[pd] не удалось прочитать документ:', err.message);
    res.status(500).json({ message: 'Не удалось загрузить документ' });
  }
});

/** Действующие редакции документов — чтобы интерфейс показывал актуальные. */
router.get('/documents', (req, res) => {
  res.json({ policy: getPolicyMeta(), consent: getConsentMeta() });
});

/**
 * Нужно ли запросить у пользователя согласие.
 *
 * Требуется, если действующей записи под ТЕКУЩЕЙ редакцией документа нет.
 * Одним правилом накрываются оба случая: те, кто регистрировался до появления
 * согласия вообще, и те, кто соглашался с прежней редакцией — по ст. 9 при
 * изменении условий обработки согласие нужно получать заново.
 */
router.get('/consent-status', auth, async (req, res) => {
  try {
    const meta = getConsentMeta();
    const actual = await Consent.findOne({
      user: req.user._id,
      purpose: 'personal_data',
      documentVersion: meta.version,
      granted: true,
      revokedAt: null,
    });

    res.json({
      needsConsent: !actual,
      currentVersion: meta.version,
      policyVersion: getPolicyMeta().version,
    });
  } catch (err) {
    // При сбое НЕ требуем согласия: иначе ошибка базы заблокировала бы вход
    // всем сразу. Пропущенный показ окна — меньшее зло, чем недоступный сервис.
    console.error('[pd] consent-status error:', err.message);
    res.json({ needsConsent: false });
  }
});

/**
 * Приём согласия из приложения — для тех, кто регистрировался раньше.
 *
 * Фиксируется так же, как при регистрации: редакция, контрольная сумма текста,
 * адрес и браузер. Рекламное согласие принимается отдельной записью и только
 * если пользователь его отметил.
 */
router.post('/consent', auth, async (req, res) => {
  try {
    const { personalData, marketing } = req.body || {};
    if (personalData !== true) {
      return res.status(400).json({ message: 'Согласие на обработку персональных данных обязательно' });
    }

    const meta = getConsentMeta();
    const common = {
      user: req.user._id,
      email: req.user.email,
      documentVersion: meta.version,
      documentHash: meta.hash,
      granted: true,
      ip: req.ip || '',
      userAgent: (req.header('User-Agent') || '').slice(0, 300),
    };

    await Consent.create({ ...common, purpose: 'personal_data' });
    if (marketing === true) {
      await Consent.create({ ...common, purpose: 'marketing' });
    }

    res.json({ ok: true, version: meta.version });
  } catch (err) {
    console.error('[pd] consent error:', err.message);
    res.status(500).json({ message: 'Не удалось сохранить согласие' });
  }
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
    const { password } = req.body || {};

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
