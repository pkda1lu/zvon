const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Приложение экосистемы Vlyne, которому разрешено входить через Vlyne ID.
 *
 * Регистрация приложений не самообслуживаемая: клиента заводит администратор
 * (скрипт server/scripts/vlyneClient.js или админ-API). Это осознанно —
 * Vlyne ID отдаёт доступ к аккаунту, а значит список тех, кто может его
 * просить, должен быть коротким и проверяемым глазами.
 *
 * Типы:
 *   public       — код выполняется у пользователя (SPA, десктоп, мобильное).
 *                  Секрет хранить негде, поэтому обязателен PKCE.
 *   confidential — серверное приложение, умеет хранить секрет.
 *                  PKCE тоже обязателен: он защищает не от кражи секрета,
 *                  а от перехвата кода на редиректе.
 */
const vlyneClientSchema = new mongoose.Schema({
  // Публичный идентификатор в URL авторизации. Не секрет.
  clientId: { type: String, required: true, unique: true, index: true },

  // sha256 секрета. Сам секрет показывается один раз при создании и больше
  // нигде не хранится — как и пароль пользователя.
  clientSecretHash: { type: String, default: null },

  type: { type: String, enum: ['public', 'confidential'], default: 'public' },

  name: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, default: '', maxlength: 300 },
  logo: { type: String, default: null },
  homepageUrl: { type: String, default: '' },
  privacyPolicyUrl: { type: String, default: '' },

  /**
   * Точные адреса возврата. Сравнение строго посимвольное: без этого
   * открытый редирект превращает авторизацию в выдачу кода чужому сайту.
   */
  redirectUris: { type: [String], default: [] },

  // Куда можно вернуть пользователя после выхода (RP-initiated logout).
  postLogoutRedirectUris: { type: [String], default: [] },

  // Максимальный набор прав, который приложение вообще может попросить.
  allowedScopes: { type: [String], default: ['openid', 'profile'] },

  /**
   * Свои приложения экосистемы. Для них экран согласия показывается один раз,
   * а не при каждом входе: спрашивать разрешение у человека на доступ Vlyne
   * Client к Vlyne ID — это ритуал, а не защита. Чужим приложениям (если они
   * когда-нибудь появятся) флаг не ставится.
   */
  firstParty: { type: Boolean, default: false },

  // Выдавать ли refresh-токены (долгий вход без повторной авторизации).
  allowRefreshTokens: { type: Boolean, default: true },

  accessTokenTtlSec:  { type: Number, default: 60 * 60 },            // 1 час
  refreshTokenTtlSec: { type: Number, default: 60 * 60 * 24 * 60 },  // 60 дней

  isActive: { type: Boolean, default: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null }
});

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

vlyneClientSchema.methods.verifySecret = function (secret) {
  if (!this.clientSecretHash) return false;
  const given = Buffer.from(hashSecret(secret), 'hex');
  const known = Buffer.from(this.clientSecretHash, 'hex');
  if (given.length !== known.length) return false;
  // Сравнение за постоянное время: обычное === утекает длину общего префикса.
  return crypto.timingSafeEqual(given, known);
};

/** Строгая проверка адреса возврата (без префиксов и шаблонов). */
/** Возврат на этот же компьютер: 127.0.0.1 или ::1. */
function isLoopback(hostname) {
  return hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

/**
 * Строгая проверка адреса возврата — с одним исключением для настольных
 * приложений.
 *
 * Настольное приложение не может занять заранее известный порт: он может быть
 * занят другой программой или вторым запущенным экземпляром. Поэтому оно
 * поднимает слушателя на свободном порту и указывает его в redirect_uri —
 * и порт каждый раз другой. RFC 8252 §7.3 прямо требует от сервера разрешать
 * любой порт для адресов на localhost.
 *
 * Послабление ровно одно и только для петлевых адресов: схема, хост и путь
 * по-прежнему сверяются посимвольно. Чужой домен так не подставить — на
 * 127.0.0.1 слушает машина самого пользователя, и увести туда чужой код
 * можно, только уже находясь на этой машине.
 */
vlyneClientSchema.methods.allowsRedirect = function (uri) {
  if (this.redirectUris.includes(uri)) return true;

  let given;
  try { given = new URL(uri); } catch { return false; }
  if (!isLoopback(given.hostname)) return false;

  return this.redirectUris.some((registered) => {
    let known;
    try { known = new URL(registered); } catch { return false; }
    return (
      isLoopback(known.hostname) &&
      known.protocol === given.protocol &&
      known.hostname === given.hostname &&
      known.pathname === given.pathname
    );
  });
};

vlyneClientSchema.statics.hashSecret = hashSecret;

module.exports = mongoose.model('VlyneClient', vlyneClientSchema);
