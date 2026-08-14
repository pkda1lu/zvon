const crypto = require('crypto');

const User = require('../models/User');
const Session = require('../models/Session');
const Consent = require('../models/Consent');
const PushSubscription = require('../models/PushSubscription');
const PendingRegistration = require('../models/PendingRegistration');

/**
 * Обезличивание учётной записи по требованию пользователя.
 *
 * 152-ФЗ (ст. 14 ч. 1, ст. 21) даёт право требовать прекращения обработки.
 * Закон допускает как уничтожение, так и обезличивание — обезличенные данные
 * перестают быть персональными, потому что по ним нельзя определить человека.
 *
 * Выбран именно этот путь, а не удаление сообщений: переписка принадлежит не
 * одному человеку, и удаление его реплик разорвало бы диалоги у собеседников,
 * чьи данные оператор обязан сохранять в целости. Сообщения остаются, автор
 * становится неопределимым.
 *
 * ВАЖНО о необратимости: username и email заменяются на производные от _id
 * значения. Восстановить исходные из них невозможно — это не шифрование, а
 * замена. Отменить операцию нельзя.
 */

/** Короткий суффикс из id — чтобы обезличенные логины не конфликтовали. */
const shortId = (id) => String(id).slice(-8);

/**
 * Полный список полей User, которые могут содержать персональные данные.
 * Держится явным списком, а не «всё кроме»: при добавлении новых полей в модель
 * забыть про них станет заметно на ревью, а не после утечки.
 */
function buildAnonymizedFields(userId) {
  const suffix = shortId(userId);
  return {
    // Идентификаторы. Значения синтетические и неуникальные лишь теоретически —
    // суффикс берётся из ObjectId, который уникален.
    username: `deleted_${suffix}`,
    displayName: null,
    email: `deleted_${suffix}@deleted.invalid`,

    // Пароль перезаписывается случайным значением: пустое поле сломало бы
    // сравнение при входе, а известное — позволило бы войти.
    password: crypto.randomBytes(32).toString('hex'),

    // Профиль.
    avatar: null,
    banner: null,
    bannerColor: null,
    bio: null,
    notes: {},
    activity: null,
    status: 'offline',
    statusPreference: 'offline',
    primaryServer: null,
    displayedTag: null,

    // Технические секреты и коды.
    verificationToken: null,
    verificationCode: null,
    verificationCodeExpires: null,
    twoFactorCode: null,
    twoFactorCodeExpires: null,
    resetPasswordCode: null,
    resetPasswordExpires: null,
    tempEmail: null,
    emailChangeCode: null,
    emailChangeCodeExpires: null,
    botToken: null,

    isDeleted: true,
    deletedAt: new Date(),
  };
}

/**
 * Обезличивает пользователя и удаляет связанные с ним технические данные.
 *
 * @param {string} userId
 * @returns {Promise<{ok: boolean, removed: object}>}
 */
async function anonymizeUser(userId) {
  const user = await User.findById(userId);
  if (!user) return { ok: false, removed: {} };
  if (user.isDeleted) return { ok: true, removed: { alreadyDeleted: true } };

  const email = user.email;

  // 1. Обезличиваем саму учётную запись.
  await User.updateOne({ _id: userId }, { $set: buildAnonymizedFields(userId) });

  // 2. Удаляем данные, которые идентифицируют устройства и местоположение.
  //    Это чистое ПД без ценности для других пользователей — удаляем, а не
  //    обезличиваем.
  const sessions = await Session.deleteMany({ user: userId });
  const pushes = await PushSubscription.deleteMany({ user: userId });
  const pending = await PendingRegistration.deleteMany({ email });

  // 3. Записи о согласиях сохраняем — оператор обязан подтверждать законность
  //    прошлой обработки, — но вычищаем из них контактные и технические
  //    идентификаторы. Связь с пользователем остаётся по _id, чего достаточно.
  const consents = await Consent.updateMany(
    { user: userId },
    { $set: { email: '', ip: '', userAgent: '' } }
  );

  return {
    ok: true,
    removed: {
      sessions: sessions.deletedCount || 0,
      pushSubscriptions: pushes.deletedCount || 0,
      pendingRegistrations: pending.deletedCount || 0,
      consentsScrubbed: consents.modifiedCount || 0,
    },
  };
}

module.exports = { anonymizeUser, buildAnonymizedFields };
