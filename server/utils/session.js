const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Session = require('../models/Session');
const { parseUserAgent, getClientIp, lookupGeo } = require('./deviceInfo');

// Срок жизни в днях → секунды для jwt expiresIn.
function daysToExpiresIn(days) {
  return `${days}d`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Подтягиваем геолокацию в фоне, не блокируя запрос.
function fillGeoInBackground(sessionId, ip) {
  lookupGeo(ip)
    .then((geo) => {
      if (geo && (geo.country || geo.city)) {
        Session.updateOne(
          { _id: sessionId },
          { $set: { country: geo.country, countryCode: geo.countryCode, city: geo.city } }
        ).catch(() => {});
      }
    })
    .catch(() => {});
}

/**
 * Создаёт серверную сессию и подписанный JWT с привязкой к её id (sid).
 * Геолокация подтягивается best-effort и не блокирует выдачу токена.
 *
 * @returns {Promise<{ token: string, session: object }>}
 */
async function createSession(user, req, { days = 7 } = {}) {
  const ua = req.header?.('user-agent') || req.headers?.['user-agent'] || '';
  const ip = getClientIp(req);
  const info = parseUserAgent(ua);

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const session = await Session.create({
    user: user._id,
    userAgent: ua,
    browser: info.browser,
    os: info.os,
    deviceType: info.deviceType,
    deviceName: info.deviceName,
    ip,
    expiresAt
  });

  // Подписываем токен с идентификатором сессии (sid).
  const token = jwt.sign(
    { userId: user._id, sid: session._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: daysToExpiresIn(days) }
  );

  // Привязываем хеш итогового токена (на случай, если sid не дойдёт).
  Session.updateOne({ _id: session._id }, { $set: { tokenHash: hashToken(token) } }).catch(() => {});

  // Геолокация — в фоне, чтобы не задерживать ответ логина.
  fillGeoInBackground(session._id, ip);

  return { token, session };
}

/**
 * «Усыновляет» токен без sid (выданный до появления управления сессиями):
 * находит сессию по хешу токена или создаёт новую, чтобы текущее устройство
 * всегда отображалось в списке. Возвращает документ сессии.
 */
async function findOrCreateSessionForToken(user, req, token, expSeconds) {
  const tokenHash = hashToken(token);
  const existing = await Session.findOne({ user: user._id, tokenHash });
  if (existing) return existing;

  const ua = req.header?.('user-agent') || req.headers?.['user-agent'] || '';
  const ip = getClientIp(req);
  const info = parseUserAgent(ua);
  const expiresAt = expSeconds
    ? new Date(expSeconds * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Upsert по (user, tokenHash) — защищает от гонки параллельных запросов.
  const session = await Session.findOneAndUpdate(
    { user: user._id, tokenHash },
    {
      $setOnInsert: {
        user: user._id,
        tokenHash,
        userAgent: ua,
        browser: info.browser,
        os: info.os,
        deviceType: info.deviceType,
        deviceName: info.deviceName,
        ip,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt
      }
    },
    { new: true, upsert: true }
  );

  fillGeoInBackground(session._id, ip);
  return session;
}

module.exports = { createSession, findOrCreateSessionForToken, hashToken };
