#!/usr/bin/env node
/**
 * Проверка криптографической части Vlyne ID без базы и без сети.
 *
 * Смысл в том, что ошибка здесь не проявляется как поломка: неправильно
 * собранный JWKS или несовпадающий kid дают ровно один симптом — «токен
 * недействителен» в чужом проекте, где отлаживать его некому. Поэтому подпись,
 * публикацию ключа, проверку со стороны SDK и PKCE прогоняем одной командой:
 *
 *   node server/scripts/vlyneSelfTest.js
 */

const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { keys, jwks, issuer, base64url } = require('../utils/vlyneKeys');
const tokens = require('../utils/vlyneTokens');
const scopeUtil = require('../utils/vlyneScopes');
const { VlyneVerifier } = require('../../sdk/vlyne-id/node');

let failures = 0;
function check(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) return result.then(
      () => console.log(`  ok   ${name}`),
      (e) => { failures++; console.error(`  FAIL ${name}: ${e.message}`); }
    );
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name}: ${e.message}`);
  }
  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`\nVlyne ID — самопроверка\n  issuer: ${issuer()}\n  kid:    ${keys().kid}\n`);

  const user = {
    _id: '507f1f77bcf86cd799439011',
    username: 'testuser',
    email: 'test@example.com',
    isVerified: true,
    avatar: '/uploads/a.png',
    bio: 'тест',
    telegram: { id: 12345, username: 'tg', linkedAt: new Date() }
  };
  const client = {
    _id: 'client-oid',
    clientId: 'vlyne_selftest',
    accessTokenTtlSec: 3600,
    refreshTokenTtlSec: 86400,
    firstParty: true
  };
  const scopes = ['openid', 'profile', 'email', 'telegram'];

  const accessToken = tokens.signAccessToken({ user, client, scopes, sessionId: 'sess-1' });
  const idToken = tokens.signIdToken({ user, client, scopes, nonce: 'n-1' });

  await check('access-токен проверяется своим же кодом', () => {
    const p = tokens.verifyAccessToken(accessToken, { audience: client.clientId });
    assert(p.sub === String(user._id), 'sub не совпал');
    assert(p.typ === 'access', 'typ не access');
    assert(p.scope === scopes.join(' '), 'scope не совпал');
  });

  await check('id_token несёт заявленные claims и nonce', () => {
    const p = tokens.verifyAccessToken(idToken, { audience: client.clientId });
    assert(p.nonce === 'n-1', 'nonce не совпал');
    assert(p.email === user.email, 'email отсутствует при scope email');
    assert(p.telegram && p.telegram.id === 12345, 'telegram отсутствует при scope telegram');
  });

  await check('без scope email почта в токен не попадает', () => {
    const narrow = tokens.signIdToken({ user, client, scopes: ['openid', 'profile'] });
    const p = tokens.verifyAccessToken(narrow, { audience: client.clientId });
    assert(p.email === undefined, 'почта утекла в токен без соответствующего права');
    assert(p.telegram === undefined, 'telegram утёк в токен без соответствующего права');
    assert(p.name === user.username, 'profile не отдал имя');
  });

  await check('подделанный токен отвергается', () => {
    const [h, pl] = accessToken.split('.');
    const evil = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(pl, 'base64url')), sub: 'someone-else' })).toString('base64url');
    let rejected = false;
    try { tokens.verifyAccessToken(`${h}.${evil}.${accessToken.split('.')[2]}`); }
    catch (e) { rejected = true; }
    assert(rejected, 'токен с подменённым sub прошёл проверку');
  });

  await check('токен для другого приложения отвергается', () => {
    let rejected = false;
    try { tokens.verifyAccessToken(accessToken, { audience: 'vlyne_other' }); }
    catch (e) { rejected = true; }
    assert(rejected, 'aud не проверяется');
  });

  // Проверка глазами стороннего проекта: тот же токен, но ключ берётся из
  // опубликованного JWKS, как это сделает Vlyne Client или бот.
  await check('SDK проверяет токен по опубликованному JWKS', async () => {
    const verifier = new VlyneVerifier({ issuer: issuer(), audience: client.clientId });
    const realFetch = global.fetch;
    global.fetch = async (url) => {
      assert(String(url).endsWith('/oauth/jwks.json'), `SDK пошёл не туда: ${url}`);
      return { ok: true, status: 200, json: async () => jwks() };
    };
    try {
      const claims = await verifier.verify(accessToken, { requireScopes: ['profile', 'email'] });
      assert(claims.sub === String(user._id), 'SDK вернул не того пользователя');

      let scopeRejected = false;
      try { await verifier.verify(accessToken, { requireScopes: ['vpn:manage'] }); }
      catch (e) { scopeRejected = e.code === 'insufficient_scope'; }
      assert(scopeRejected, 'SDK не заметил нехватки прав');
    } finally {
      global.fetch = realFetch;
    }
  });

  await check('PKCE: верный verifier подходит, чужой — нет', () => {
    const verifier = tokens.randomToken(48);
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const computed = base64url(crypto.createHash('sha256').update(verifier).digest());
    assert(computed === challenge, 'S256 не воспроизводится');
    const other = base64url(crypto.createHash('sha256').update(tokens.randomToken(48)).digest());
    assert(other !== challenge, 'разные verifier дали один challenge');
  });

  await check('справочник прав согласован', () => {
    const described = scopeUtil.describe(scopeUtil.ALL_SCOPES);
    assert(described.length === scopeUtil.ALL_SCOPES.length - 1, 'offline_access должен быть скрыт с экрана согласия');
    assert(scopeUtil.unknownScopes(['openid', 'выдумка']).length === 1, 'неизвестное право не отсеивается');
  });

  console.log('');
  if (failures) {
    console.error(`Провалено проверок: ${failures}\n`);
    process.exit(1);
  }
  console.log('Всё в порядке.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
