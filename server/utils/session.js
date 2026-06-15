const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const { parseUserAgent, getClientIp, lookupGeo } = require('./deviceInfo');

// Срок жизни в днях → секунды для jwt expiresIn.
function daysToExpiresIn(days) {
  return `${days}d`;
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

  // Геолокация — в фоне, чтобы не задерживать ответ логина.
  lookupGeo(ip)
    .then((geo) => {
      if (geo && (geo.country || geo.city)) {
        Session.updateOne(
          { _id: session._id },
          { $set: { country: geo.country, countryCode: geo.countryCode, city: geo.city } }
        ).catch(() => {});
      }
    })
    .catch(() => {});

  return { token, session };
}

module.exports = { createSession };
