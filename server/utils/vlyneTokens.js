const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { keys, issuer, base64url } = require('./vlyneKeys');
const { claimsForScopes } = require('./vlyneScopes');
const VlyneRefreshToken = require('../models/VlyneRefreshToken');

/**
 * Выпуск и проверка токенов Vlyne ID.
 *
 * sub — это идентификатор пользователя Zvon (тот же, что уже знают
 * телеграм-бот под именем zvonId и API Zvon). Аккаунт Zvon и есть Vlyne ID,
 * поэтому заводить второй, «настоящий» идентификатор — значит немедленно
 * получить задачу сводить их между собой во всех проектах.
 */

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return base64url(crypto.randomBytes(bytes));
}

/** Access-токен: RS256, проверяется любым проектом по публичному ключу. */
function signAccessToken({ user, client, scopes, sessionId, ttlSec }) {
  const { privateKey, kid } = keys();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = ttlSec || client.accessTokenTtlSec || 3600;

  const payload = {
    iss: issuer(),
    sub: String(user._id),
    aud: client.clientId,
    azp: client.clientId,
    scope: scopes.join(' '),
    typ: 'access',
    iat: now,
    // jti нужен, чтобы ресурс-сервер мог отличать токены в своих журналах
    // и при желании вести чёрный список без обращения к нам.
    jti: randomToken(12),
    sid: sessionId ? String(sessionId) : undefined,
    username: user.username
  };

  return jwt.sign(payload, privateKey, { algorithm: 'RS256', keyid: kid, expiresIn });
}

/** id_token — кто вошёл, для самого приложения. Не для доступа к API. */
function signIdToken({ user, client, scopes, nonce, sessionId, ttlSec }) {
  const { privateKey, kid } = keys();
  const payload = {
    iss: issuer(),
    sub: String(user._id),
    aud: client.clientId,
    typ: 'id',
    ...(nonce ? { nonce } : {}),
    ...(sessionId ? { sid: String(sessionId) } : {}),
    ...claimsForScopes(user, scopes)
  };
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: kid,
    expiresIn: ttlSec || client.accessTokenTtlSec || 3600
  });
}

/**
 * Новый refresh-токен. `family` продолжает цепочку предыдущего — по ней
 * гасится весь вход, если токен применили повторно.
 */
async function issueRefreshToken({ user, client, scopes, grant, sessionId, family }) {
  const token = randomToken(32);
  const ttl = client.refreshTokenTtlSec || 60 * 60 * 24 * 60;

  await VlyneRefreshToken.create({
    tokenHash: sha256(token),
    family: family || randomToken(16),
    user: user._id,
    client: client._id,
    clientId: client.clientId,
    grant: grant ? grant._id : null,
    scopes,
    sessionId: sessionId || null,
    expiresAt: new Date(Date.now() + ttl * 1000)
  });

  return token;
}

/** Гасит всю цепочку — при повторном использовании или отзыве доступа. */
async function revokeFamily(family, reason) {
  await VlyneRefreshToken.updateMany(
    { family, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  if (reason) console.warn(`[vlyne-id] Отозвана цепочка refresh-токенов ${family}: ${reason}`);
}

/**
 * Находит refresh-токен и проверяет его пригодность.
 * Повторное использование уже потраченного токена — признак кражи:
 * гасим всю цепочку и отказываем обеим сторонам.
 */
async function consumeRefreshToken(token) {
  const record = await VlyneRefreshToken.findOne({ tokenHash: sha256(token) });
  if (!record) return { error: 'invalid_grant' };

  if (record.revokedAt) return { error: 'invalid_grant' };

  if (record.usedAt) {
    await revokeFamily(record.family, 'повторное использование refresh-токена');
    return { error: 'invalid_grant', reused: true };
  }

  if (record.expiresAt < new Date()) return { error: 'invalid_grant' };

  record.usedAt = new Date();
  await record.save();
  return { record };
}

/**
 * Проверка access-токена. Живёт здесь, а не только в проверяющих проектах,
 * чтобы серверная часть Zvon и будущие сервисы на этой машине пользовались
 * одной и той же реализацией.
 */
function verifyAccessToken(token, { audience } = {}) {
  const { publicKey } = keys();
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: issuer(),
    ...(audience ? { audience } : {})
  });
}

module.exports = {
  sha256,
  randomToken,
  signAccessToken,
  signIdToken,
  issueRefreshToken,
  consumeRefreshToken,
  revokeFamily,
  verifyAccessToken
};
