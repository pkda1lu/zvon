const express = require('express');
const crypto = require('crypto');

const auth = require('../middleware/auth');
const User = require('../models/User');
const VlyneClient = require('../models/VlyneClient');
const VlyneGrant = require('../models/VlyneGrant');
const VlyneAuthRequest = require('../models/VlyneAuthRequest');
const VlyneRefreshToken = require('../models/VlyneRefreshToken');

const { jwks, issuer, base64url } = require('../utils/vlyneKeys');
const scopeUtil = require('../utils/vlyneScopes');
const tokens = require('../utils/vlyneTokens');
const { logGlobalAction } = require('../utils/globalAuditLogger');
const { getClientIp } = require('../utils/deviceInfo');

/**
 * Vlyne ID — единый вход в экосистему Vlyne.
 *
 * Протокол: OAuth 2.1 + OpenID Connect в объёме authorization code + PKCE.
 * Своего формата нет намеренно. Разбирать чужой велосипед пришлось бы в каждом
 * новом проекте и на каждом языке, а под стандарт уже написаны библиотеки —
 * и, что важнее, у стандарта есть проверенные ответы на неочевидные вопросы
 * вроде перехвата кода на редиректе и ротации долгих токенов.
 *
 * Экран согласия рисует клиент Zvon (страница /vlyne/authorize), а не сервер:
 * вход должен выглядеть частью Vlyne, а не служебной формой, и делить
 * оформление с остальным приложением.
 *
 *   /oauth/authorize  → проверка параметров → экран согласия → код
 *   /oauth/token      → код + code_verifier → access / id / refresh
 *   /oauth/userinfo   → данные о владельце токена
 *   /oauth/jwks.json  → публичный ключ для офлайн-проверки подписи
 */

const oauthRouter = express.Router();
const apiRouter = express.Router();

// ===== Вспомогательное =====

const WEB_URL = () => (process.env.VLYNE_ID_WEB_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
const CONSENT_PATH = '/vlyne/authorize';

/**
 * CORS для эндпоинтов, куда приложения ходят из браузера. Заголовки ставим
 * через setHeader, а не пакетом cors: глобальный cors уже отработал, и второй
 * пакет добавил бы Access-Control-Allow-Origin вторым значением, от чего
 * браузер отклоняет ответ целиком.
 */
function publicCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

// Ограничитель попыток: обмен кода и обновление токенов — это перебор
// секретов, если их не считать. Хранилище в памяти процесса; при нескольких
// воркерах лимит умножается на их число, но порядок величины сохраняется.
const _rl = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rl) if (now - v.ts > 30 * 60 * 1000) _rl.delete(k);
}, 10 * 60 * 1000).unref?.();

function rateLimit({ windowMs, max, keyFn }) {
  return (req, res, next) => {
    try {
      const key = (keyFn ? keyFn(req) : 'g') + '|' + (req.ip || '');
      const now = Date.now();
      let rec = _rl.get(key);
      if (!rec || now - rec.ts > windowMs) rec = { count: 0, ts: now };
      rec.count++;
      _rl.set(key, rec);
      if (rec.count > max) {
        return res.status(429).json({ error: 'slow_down', error_description: 'Слишком много запросов' });
      }
    } catch (e) { /* сбой лимитера не должен ломать вход */ }
    next();
  };
}

const tokenLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 60, keyFn: (req) => String(req.body?.client_id || '') });
const authorizeLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 60, keyFn: (req) => String(req.query?.client_id || '') });

/** Ошибка на /authorize, когда вернуть её приложению нельзя (битый redirect_uri). */
function renderError(res, status, title, detail) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  res.status(status).type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Vlyne ID — ошибка</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1b23;color:#e8e9ef;font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.c{max-width:440px;padding:32px;background:#23242e;border-radius:16px;border:1px solid #32333f}
h1{margin:0 0 12px;font-size:18px}p{margin:0;color:#a9abbc}</style></head>
<body><div class="c"><h1>${esc(title)}</h1><p>${esc(detail)}</p></div></body></html>`);
}

/** Возврат ошибки приложению по правилам OAuth — параметрами редиректа. */
function redirectError(res, redirectUri, error, description, state) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return res.redirect(302, url.toString());
}

/**
 * Аутентификация приложения на /token, /revoke, /introspect.
 * Публичный клиент доказывает себя только PKCE — секрета у него нет и быть
 * не может, весь его код лежит у пользователя.
 */
async function authenticateClient(req) {
  let clientId = req.body.client_id;
  let clientSecret = req.body.client_secret;

  // HTTP Basic — второй разрешённый спецификацией способ, им пользуются
  // многие готовые библиотеки.
  const basic = req.headers.authorization;
  if (basic && basic.startsWith('Basic ')) {
    try {
      const [id, secret] = Buffer.from(basic.slice(6), 'base64').toString('utf8').split(':');
      clientId = clientId || decodeURIComponent(id);
      clientSecret = clientSecret || decodeURIComponent(secret);
    } catch (e) { /* битый заголовок — ниже отдадим invalid_client */ }
  }

  if (!clientId) return { error: 'invalid_client', description: 'Не указан client_id' };

  const client = await VlyneClient.findOne({ clientId });
  if (!client || !client.isActive) return { error: 'invalid_client', description: 'Приложение не зарегистрировано' };

  if (client.type === 'confidential') {
    if (!clientSecret || !client.verifySecret(clientSecret)) {
      return { error: 'invalid_client', description: 'Неверный секрет приложения' };
    }
  }

  return { client };
}

/** Проверка PKCE: S256(code_verifier) должен совпасть с сохранённым challenge. */
function verifyPkce(codeVerifier, codeChallenge) {
  if (!codeVerifier || typeof codeVerifier !== 'string') return false;
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const computed = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(String(codeChallenge));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ===== Обнаружение =====

/**
 * Описание провайдера по OIDC Discovery. Благодаря ему клиентской библиотеке
 * достаточно знать один адрес — остальное она вычитает сама, и при переезде
 * эндпоинтов не придётся править три проекта разом.
 */
function discovery(req, res) {
  const iss = issuer();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    issuer: iss,
    authorization_endpoint: `${iss}/oauth/authorize`,
    token_endpoint: `${iss}/oauth/token`,
    userinfo_endpoint: `${iss}/oauth/userinfo`,
    jwks_uri: `${iss}/oauth/jwks.json`,
    revocation_endpoint: `${iss}/oauth/revoke`,
    introspection_endpoint: `${iss}/oauth/introspect`,
    end_session_endpoint: `${iss}/oauth/logout`,
    scopes_supported: scopeUtil.ALL_SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: [
      'sub', 'iss', 'aud', 'exp', 'iat', 'nonce',
      'name', 'preferred_username', 'nickname', 'picture', 'profile_banner', 'banner_color', 'bio', 'created_at',
      'email', 'email_verified', 'telegram'
    ],
    ui_locales_supported: ['ru']
  });
}

oauthRouter.get('/jwks.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(jwks());
});

// ===== Шаг 1: /oauth/authorize =====

oauthRouter.get('/authorize', authorizeLimiter, async (req, res) => {
  try {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: responseType,
      scope,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      prompt
    } = req.query;

    if (!clientId) return renderError(res, 400, 'Не указано приложение', 'В запросе отсутствует client_id.');

    const client = await VlyneClient.findOne({ clientId: String(clientId) });
    if (!client || !client.isActive) {
      return renderError(res, 400, 'Неизвестное приложение', 'Это приложение не зарегистрировано в Vlyne ID или отключено.');
    }

    // Адрес возврата проверяем до всего остального: пока он не признан своим,
    // отправлять по нему ошибку нельзя — иначе Vlyne ID сам станет удобным
    // перенаправителем на чужие сайты.
    if (!redirectUri || !client.allowsRedirect(String(redirectUri))) {
      return renderError(res, 400, 'Недопустимый адрес возврата',
        'redirect_uri не совпадает ни с одним из зарегистрированных для этого приложения. Проверьте настройки приложения.');
    }

    if (responseType !== 'code') {
      return redirectError(res, redirectUri, 'unsupported_response_type', 'Поддерживается только response_type=code', state);
    }

    // PKCE обязателен для всех. Без него код, перехваченный на редиректе
    // (история браузера, чужое приложение с той же URL-схемой, лог прокси),
    // сразу обменивается на токены.
    if (!codeChallenge) {
      return redirectError(res, redirectUri, 'invalid_request', 'Требуется code_challenge (PKCE)', state);
    }
    if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
      return redirectError(res, redirectUri, 'invalid_request', 'Поддерживается только code_challenge_method=S256', state);
    }

    let scopes = scopeUtil.parseScopes(scope);
    if (!scopes.length) scopes = ['openid', 'profile'];
    if (!scopes.includes('openid')) scopes.unshift('openid');

    const unknown = scopeUtil.unknownScopes(scopes);
    if (unknown.length) {
      return redirectError(res, redirectUri, 'invalid_scope', `Неизвестные права: ${unknown.join(', ')}`, state);
    }
    const disallowed = scopeUtil.disallowedScopes(scopes, client);
    if (disallowed.length) {
      return redirectError(res, redirectUri, 'invalid_scope', `Приложению не разрешены права: ${disallowed.join(', ')}`, state);
    }

    const request = await VlyneAuthRequest.create({
      requestId: tokens.randomToken(24),
      client: client._id,
      clientId: client.clientId,
      redirectUri: String(redirectUri),
      scopes,
      state: state ? String(state) : '',
      nonce: nonce ? String(nonce) : '',
      codeChallenge: String(codeChallenge),
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    const consent = new URL(WEB_URL() + CONSENT_PATH);
    consent.searchParams.set('request', request.requestId);
    // prompt=login / consent пробрасываем на экран: им приложение может
    // потребовать переспросить, даже если согласие уже выдано.
    if (prompt) consent.searchParams.set('prompt', String(prompt));

    return res.redirect(302, consent.toString());
  } catch (error) {
    console.error('[vlyne-id] authorize:', error);
    return renderError(res, 500, 'Ошибка сервера', 'Не удалось начать вход. Попробуйте ещё раз.');
  }
});

// ===== Шаг 2: экран согласия (вызывается клиентом Zvon) =====

/**
 * Мягкая авторизация: страница согласия открывается и у вошедшего, и у гостя.
 * Гостю надо показать, куда он вообще попал, до того как отправлять на вход —
 * иначе переход выглядит как случайный редирект неизвестно куда.
 */
async function optionalAuth(req, res, next) {
  if (!req.header('Authorization')) return next();
  let rejected = false;
  const probe = {
    setHeader: () => {},
    status: () => ({ json: () => { rejected = true; } }),
    json: () => { rejected = true; }
  };
  try {
    await auth(req, probe, () => {});
  } catch (e) { /* гость */ }
  if (rejected) req.user = undefined;
  next();
}

apiRouter.get('/requests/:requestId', optionalAuth, async (req, res) => {
  try {
    const request = await VlyneAuthRequest.findOne({ requestId: req.params.requestId }).populate('client');
    if (!request || !request.client) {
      return res.status(404).json({ message: 'Запрос на вход не найден или устарел' });
    }
    if (request.expiresAt < new Date()) {
      return res.status(410).json({ message: 'Срок запроса на вход истёк. Начните вход заново.' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ message: 'Этот запрос на вход уже обработан' });
    }

    const client = request.client;
    let autoApprove = false;
    let grantedScopes = [];

    if (req.user) {
      const grant = await VlyneGrant.findOne({ user: req.user._id, client: client._id });
      grantedScopes = grant ? grant.scopes : [];
      // Ноль нажатий при повторном входе: согласие уже дано и покрывает
      // запрошенное. Переспросить приложение может через prompt=consent.
      autoApprove = !!grant && grant.covers(request.scopes);
    }

    res.json({
      requestId: request.requestId,
      authenticated: !!req.user,
      autoApprove,
      grantedScopes,
      scopes: request.scopes,
      scopeDetails: scopeUtil.describe(request.scopes),
      offlineAccess: request.scopes.includes('offline_access'),
      client: {
        clientId: client.clientId,
        name: client.name,
        description: client.description,
        logo: client.logo,
        homepageUrl: client.homepageUrl,
        privacyPolicyUrl: client.privacyPolicyUrl,
        firstParty: client.firstParty
      },
      user: req.user ? {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        avatar: req.user.avatar
      } : null
    });
  } catch (error) {
    console.error('[vlyne-id] request info:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

apiRouter.post('/requests/:requestId/decision', auth, async (req, res) => {
  try {
    const { approve } = req.body || {};
    const request = await VlyneAuthRequest.findOne({ requestId: req.params.requestId }).populate('client');

    if (!request || !request.client) return res.status(404).json({ message: 'Запрос на вход не найден' });
    if (request.expiresAt < new Date()) return res.status(410).json({ message: 'Срок запроса истёк' });
    if (request.status !== 'pending') return res.status(409).json({ message: 'Запрос уже обработан' });

    if (!approve) {
      request.status = 'denied';
      request.user = req.user._id;
      await request.save();
      const url = new URL(request.redirectUri);
      url.searchParams.set('error', 'access_denied');
      if (request.state) url.searchParams.set('state', request.state);
      return res.json({ redirectTo: url.toString() });
    }

    // Согласие запоминаем: оно и делает следующий вход бесшумным, и служит
    // единственной записью о том, кому пользователь что открыл.
    const grant = await VlyneGrant.findOneAndUpdate(
      { user: req.user._id, client: request.client._id },
      {
        $set: {
          updatedAt: new Date(),
          lastUsedAt: new Date(),
          lastUserAgent: (req.header('User-Agent') || '').slice(0, 300),
          lastIp: getClientIp(req) || ''
        },
        // Права накапливаем: приложение могло раньше просить меньше.
        $addToSet: { scopes: { $each: request.scopes } },
        $setOnInsert: { user: req.user._id, client: request.client._id, createdAt: new Date() }
      },
      { upsert: true, new: true }
    );

    const code = tokens.randomToken(32);
    request.status = 'approved';
    request.user = req.user._id;
    request.sessionId = req.sessionId || null;
    request.codeHash = tokens.sha256(code);
    // Код живёт минуту: он одноразовый и обменивается сразу после редиректа.
    request.codeExpiresAt = new Date(Date.now() + 60 * 1000);
    await request.save();

    logGlobalAction({
      executorId: req.user._id,
      action: 'VLYNE_ID_AUTHORIZE',
      targetId: req.user._id,
      targetModel: 'User',
      details: { client: request.client.clientId, scopes: request.scopes }
    }).catch(() => {});

    const url = new URL(request.redirectUri);
    url.searchParams.set('code', code);
    if (request.state) url.searchParams.set('state', request.state);

    res.json({ redirectTo: url.toString(), grantId: grant._id });
  } catch (error) {
    console.error('[vlyne-id] decision:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== Шаг 3: /oauth/token =====

oauthRouter.post('/token', publicCors, express.urlencoded({ extended: false }), tokenLimiter, async (req, res) => {
  try {
    // Кэш промежуточных ответов OAuth запрещён спецификацией: в них секреты.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    const grantType = req.body.grant_type;
    const authResult = await authenticateClient(req);
    if (authResult.error) {
      return res.status(401).json({ error: authResult.error, error_description: authResult.description });
    }
    const client = authResult.client;

    if (grantType === 'authorization_code') return await grantAuthorizationCode(req, res, client);
    if (grantType === 'refresh_token') return await grantRefreshToken(req, res, client);

    return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Поддерживаются authorization_code и refresh_token' });
  } catch (error) {
    console.error('[vlyne-id] token:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

async function grantAuthorizationCode(req, res, client) {
  const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = req.body;
  if (!code) return res.status(400).json({ error: 'invalid_request', error_description: 'Не указан code' });

  const request = await VlyneAuthRequest.findOne({ codeHash: tokens.sha256(code) });
  if (!request) return res.status(400).json({ error: 'invalid_grant', error_description: 'Код не найден' });

  // Повторный обмен одного кода — либо гонка клиента, либо кража кода. В обоих
  // случаях выданные по нему токены больше нельзя считать принадлежащими
  // владельцу аккаунта, поэтому вход гасится целиком.
  if (request.status === 'used') {
    await VlyneRefreshToken.updateMany(
      { client: client._id, user: request.user, revokedAt: null, createdAt: { $gte: request.createdAt } },
      { $set: { revokedAt: new Date() } }
    );
    console.warn(`[vlyne-id] Повторный обмен кода, клиент ${client.clientId}`);
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Код уже использован' });
  }
  if (request.status !== 'approved') return res.status(400).json({ error: 'invalid_grant', error_description: 'Код недействителен' });
  if (!request.codeExpiresAt || request.codeExpiresAt < new Date()) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Срок действия кода истёк' });
  }
  if (String(request.clientId) !== String(client.clientId)) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Код выдан другому приложению' });
  }
  // redirect_uri на обмене должен совпасть с тем, по которому код вернулся:
  // это привязывает код к конкретному адресу возврата.
  if (redirectUri && String(redirectUri) !== request.redirectUri) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri не совпадает с исходным' });
  }
  if (!verifyPkce(codeVerifier, request.codeChallenge)) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Проверка PKCE не пройдена' });
  }

  request.status = 'used';
  await request.save();

  const user = await User.findById(request.user).select('-password');
  if (!user) return res.status(400).json({ error: 'invalid_grant', error_description: 'Пользователь не найден' });
  if (user.isBanned) return res.status(400).json({ error: 'invalid_grant', error_description: 'Аккаунт заблокирован' });

  const grant = await VlyneGrant.findOne({ user: user._id, client: client._id });
  return await issueTokenResponse(res, {
    user, client, grant,
    scopes: request.scopes,
    nonce: request.nonce,
    sessionId: request.sessionId
  });
}

async function grantRefreshToken(req, res, client) {
  const { refresh_token: refreshToken, scope } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'invalid_request', error_description: 'Не указан refresh_token' });

  const { record, error } = await tokens.consumeRefreshToken(refreshToken);
  if (error) return res.status(400).json({ error, error_description: 'Refresh-токен недействителен' });

  if (String(record.clientId) !== String(client.clientId)) {
    await tokens.revokeFamily(record.family, 'refresh-токен предъявлен чужим приложением');
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Токен выдан другому приложению' });
  }

  // Отзыв согласия должен обрывать и уже выданные долгие токены — иначе
  // кнопка «отключить приложение» ничего не отключает до истечения срока.
  const grant = await VlyneGrant.findOne({ user: record.user, client: client._id });
  if (!grant) {
    await tokens.revokeFamily(record.family, 'согласие пользователя отозвано');
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Доступ приложения отозван' });
  }

  const user = await User.findById(record.user).select('-password');
  if (!user || user.isBanned) {
    await tokens.revokeFamily(record.family, 'пользователь недоступен');
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Аккаунт недоступен' });
  }

  // Сузить права при обновлении можно, расширить — нет.
  let scopes = record.scopes;
  const requested = scopeUtil.parseScopes(scope);
  if (requested.length) {
    const extra = requested.filter((s) => !record.scopes.includes(s));
    if (extra.length) {
      return res.status(400).json({ error: 'invalid_scope', error_description: `Права не выдавались: ${extra.join(', ')}` });
    }
    scopes = requested;
  }

  grant.lastUsedAt = new Date();
  await grant.save();

  return await issueTokenResponse(res, {
    user, client, grant, scopes,
    sessionId: record.sessionId,
    family: record.family
  });
}

/** Единый ответ /token: access + (id_token) + (refresh). */
async function issueTokenResponse(res, { user, client, grant, scopes, nonce, sessionId, family }) {
  const ttl = client.accessTokenTtlSec || 3600;
  const accessToken = tokens.signAccessToken({ user, client, scopes, sessionId, ttlSec: ttl });

  const body = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ttl,
    scope: scopes.join(' ')
  };

  if (scopes.includes('openid')) {
    body.id_token = tokens.signIdToken({ user, client, scopes, nonce, sessionId, ttlSec: ttl });
  }

  // Долгий вход — только если приложению это разрешено и право запрошено.
  // У своих приложений экосистемы offline_access подразумевается: человек не
  // должен вводить пароль при каждом запуске Vlyne Client.
  const wantsRefresh = scopes.includes('offline_access') || client.firstParty;
  if (client.allowRefreshTokens && wantsRefresh) {
    body.refresh_token = await tokens.issueRefreshToken({ user, client, scopes, grant, sessionId, family });
    body.refresh_expires_in = client.refreshTokenTtlSec;
  }

  client.lastUsedAt = new Date();
  client.save().catch(() => {});

  return res.json(body);
}

// ===== /oauth/userinfo =====

/** Достаёт и проверяет access-токен Vlyne ID из заголовка Authorization. */
function requireAccessToken(req, res) {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="vlyne-id"');
    res.status(401).json({ error: 'invalid_token', error_description: 'Нужен access-токен' });
    return null;
  }
  try {
    const payload = tokens.verifyAccessToken(token);
    if (payload.typ !== 'access') throw new Error('не access-токен');
    return payload;
  } catch (e) {
    res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
    res.status(401).json({ error: 'invalid_token', error_description: 'Токен недействителен или истёк' });
    return null;
  }
}

async function userinfo(req, res) {
  const payload = requireAccessToken(req, res);
  if (!payload) return;

  const user = await User.findById(payload.sub).select('-password');
  if (!user) return res.status(404).json({ error: 'invalid_token', error_description: 'Пользователь не найден' });

  const scopes = scopeUtil.parseScopes(payload.scope);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ sub: String(user._id), ...scopeUtil.claimsForScopes(user, scopes) });
}

oauthRouter.get('/userinfo', publicCors, userinfo);
oauthRouter.post('/userinfo', publicCors, userinfo);

// ===== Отзыв и интроспекция =====

oauthRouter.post('/revoke', publicCors, express.urlencoded({ extended: false }), async (req, res) => {
  // По спецификации отзыв всегда отвечает 200: иначе ответ сам становится
  // способом проверять чужие токены на существование.
  try {
    const authResult = await authenticateClient(req);
    if (authResult.error) return res.status(401).json({ error: authResult.error });

    const token = req.body.token;
    if (token) {
      const record = await VlyneRefreshToken.findOne({ tokenHash: tokens.sha256(token), client: authResult.client._id });
      if (record) await tokens.revokeFamily(record.family, 'отзыв по запросу приложения');
    }
  } catch (e) {
    console.error('[vlyne-id] revoke:', e);
  }
  res.status(200).json({});
});

oauthRouter.post('/introspect', publicCors, express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const authResult = await authenticateClient(req);
    if (authResult.error) return res.status(401).json({ error: authResult.error });
    // Интроспекция раскрывает данные о токене, поэтому спрашивать может
    // только приложение, умеющее доказать себя секретом.
    if (authResult.client.type !== 'confidential') {
      return res.status(403).json({ error: 'invalid_client', error_description: 'Интроспекция доступна только серверным приложениям' });
    }

    const token = req.body.token;
    if (!token) return res.json({ active: false });

    try {
      const payload = tokens.verifyAccessToken(token);
      return res.json({
        active: true,
        scope: payload.scope,
        client_id: payload.azp,
        username: payload.username,
        sub: payload.sub,
        exp: payload.exp,
        iat: payload.iat,
        iss: payload.iss,
        token_type: 'Bearer'
      });
    } catch (e) {
      const record = await VlyneRefreshToken.findOne({ tokenHash: tokens.sha256(token) });
      const active = !!record && !record.usedAt && !record.revokedAt && record.expiresAt > new Date();
      return res.json(active
        ? { active: true, scope: record.scopes.join(' '), client_id: record.clientId, sub: String(record.user), exp: Math.floor(record.expiresAt.getTime() / 1000) }
        : { active: false });
    }
  } catch (error) {
    console.error('[vlyne-id] introspect:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

// ===== Выход, инициированный приложением =====

oauthRouter.get('/logout', async (req, res) => {
  try {
    const { client_id: clientId, post_logout_redirect_uri: redirectUri, id_token_hint: hint, state } = req.query;

    // Выход по подсказке id_token: гасим долгие токены этой пары
    // пользователь+приложение. Сессию Zvon не трогаем — человек выходит из
    // приложения, а не со всех устройств.
    if (hint) {
      try {
        const payload = tokens.verifyAccessToken(String(hint), { audience: clientId ? String(clientId) : undefined });
        const client = await VlyneClient.findOne({ clientId: payload.aud });
        if (client) {
          await VlyneRefreshToken.updateMany(
            { user: payload.sub, client: client._id, revokedAt: null },
            { $set: { revokedAt: new Date() } }
          );
        }
      } catch (e) { /* негодная подсказка — просто уводим по адресу */ }
    }

    if (redirectUri && clientId) {
      const client = await VlyneClient.findOne({ clientId: String(clientId) });
      if (client && client.postLogoutRedirectUris.includes(String(redirectUri))) {
        const url = new URL(String(redirectUri));
        if (state) url.searchParams.set('state', String(state));
        return res.redirect(302, url.toString());
      }
    }
    return res.redirect(302, WEB_URL());
  } catch (error) {
    console.error('[vlyne-id] logout:', error);
    return res.redirect(302, WEB_URL());
  }
});

// ===== Подключённые приложения (для настроек аккаунта) =====

apiRouter.get('/grants', auth, async (req, res) => {
  try {
    const grants = await VlyneGrant.find({ user: req.user._id }).populate('client').sort({ lastUsedAt: -1 });
    res.json(grants.filter((g) => g.client).map((g) => ({
      id: g._id,
      clientId: g.client.clientId,
      name: g.client.name,
      description: g.client.description,
      logo: g.client.logo,
      homepageUrl: g.client.homepageUrl,
      firstParty: g.client.firstParty,
      scopes: g.scopes,
      scopeDetails: scopeUtil.describe(g.scopes),
      createdAt: g.createdAt,
      lastUsedAt: g.lastUsedAt
    })));
  } catch (error) {
    console.error('[vlyne-id] grants:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

apiRouter.delete('/grants/:clientId', auth, async (req, res) => {
  try {
    const client = await VlyneClient.findOne({ clientId: req.params.clientId });
    if (!client) return res.status(404).json({ message: 'Приложение не найдено' });

    await VlyneGrant.deleteOne({ user: req.user._id, client: client._id });
    // Вместе с согласием гасим долгие токены: без этого приложение сохраняло
    // бы доступ до истечения срока, а человек считал бы, что отключил его.
    await VlyneRefreshToken.updateMany(
      { user: req.user._id, client: client._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    logGlobalAction({
      executorId: req.user._id,
      action: 'VLYNE_ID_REVOKE',
      targetId: req.user._id,
      targetModel: 'User',
      details: { client: client.clientId }
    }).catch(() => {});

    res.json({ message: 'Доступ приложения отозван' });
  } catch (error) {
    console.error('[vlyne-id] revoke grant:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== Реестр приложений (админ) =====

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ message: 'Доступ только администраторам' });
};

function publicClient(c, secret) {
  return {
    clientId: c.clientId,
    ...(secret ? { clientSecret: secret } : {}),
    type: c.type,
    name: c.name,
    description: c.description,
    logo: c.logo,
    homepageUrl: c.homepageUrl,
    privacyPolicyUrl: c.privacyPolicyUrl,
    redirectUris: c.redirectUris,
    postLogoutRedirectUris: c.postLogoutRedirectUris,
    allowedScopes: c.allowedScopes,
    firstParty: c.firstParty,
    allowRefreshTokens: c.allowRefreshTokens,
    accessTokenTtlSec: c.accessTokenTtlSec,
    refreshTokenTtlSec: c.refreshTokenTtlSec,
    isActive: c.isActive,
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt
  };
}

apiRouter.get('/clients', auth, isAdmin, async (req, res) => {
  const clients = await VlyneClient.find().sort({ createdAt: -1 });
  res.json(clients.map((c) => publicClient(c)));
});

apiRouter.post('/clients', auth, isAdmin, async (req, res) => {
  try {
    const {
      name, type = 'public', redirectUris = [], allowedScopes, firstParty,
      description, logo, homepageUrl, privacyPolicyUrl, postLogoutRedirectUris
    } = req.body || {};

    if (!name) return res.status(400).json({ message: 'Укажите название приложения' });
    if (!Array.isArray(redirectUris) || !redirectUris.length) {
      return res.status(400).json({ message: 'Укажите хотя бы один адрес возврата' });
    }
    const bad = redirectUris.filter((u) => { try { new URL(u); return false; } catch { return true; } });
    if (bad.length) return res.status(400).json({ message: `Неверные адреса возврата: ${bad.join(', ')}` });

    const scopes = Array.isArray(allowedScopes) && allowedScopes.length ? allowedScopes : ['openid', 'profile'];
    const unknown = scopeUtil.unknownScopes(scopes);
    if (unknown.length) return res.status(400).json({ message: `Неизвестные права: ${unknown.join(', ')}` });

    const clientId = 'vlyne_' + tokens.randomToken(12);
    let secret = null;
    let secretHash = null;
    if (type === 'confidential') {
      secret = tokens.randomToken(32);
      secretHash = VlyneClient.hashSecret(secret);
    }

    const client = await VlyneClient.create({
      clientId, clientSecretHash: secretHash, type,
      name, description: description || '', logo: logo || null,
      homepageUrl: homepageUrl || '', privacyPolicyUrl: privacyPolicyUrl || '',
      redirectUris, postLogoutRedirectUris: postLogoutRedirectUris || [],
      allowedScopes: scopes, firstParty: !!firstParty,
      createdBy: req.user._id
    });

    // Секрет отдаём один раз — дальше в базе только его хеш.
    res.status(201).json(publicClient(client, secret));
  } catch (error) {
    console.error('[vlyne-id] create client:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

apiRouter.patch('/clients/:clientId', auth, isAdmin, async (req, res) => {
  try {
    const client = await VlyneClient.findOne({ clientId: req.params.clientId });
    if (!client) return res.status(404).json({ message: 'Приложение не найдено' });

    const allowed = ['name', 'description', 'logo', 'homepageUrl', 'privacyPolicyUrl', 'redirectUris',
      'postLogoutRedirectUris', 'allowedScopes', 'firstParty', 'allowRefreshTokens',
      'accessTokenTtlSec', 'refreshTokenTtlSec', 'isActive'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) client[key] = req.body[key];
    }
    if (req.body.allowedScopes) {
      const unknown = scopeUtil.unknownScopes(client.allowedScopes);
      if (unknown.length) return res.status(400).json({ message: `Неизвестные права: ${unknown.join(', ')}` });
    }
    await client.save();
    res.json(publicClient(client));
  } catch (error) {
    console.error('[vlyne-id] update client:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

apiRouter.post('/clients/:clientId/secret', auth, isAdmin, async (req, res) => {
  try {
    const client = await VlyneClient.findOne({ clientId: req.params.clientId });
    if (!client) return res.status(404).json({ message: 'Приложение не найдено' });
    if (client.type !== 'confidential') return res.status(400).json({ message: 'У публичного приложения нет секрета' });

    const secret = tokens.randomToken(32);
    client.clientSecretHash = VlyneClient.hashSecret(secret);
    await client.save();
    res.json({ clientId: client.clientId, clientSecret: secret });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

apiRouter.delete('/clients/:clientId', auth, isAdmin, async (req, res) => {
  try {
    const client = await VlyneClient.findOne({ clientId: req.params.clientId });
    if (!client) return res.status(404).json({ message: 'Приложение не найдено' });

    // Удаляем вместе с выданными согласиями и токенами: осиротевшие записи
    // потом невозможно соотнести с приложением в списке подключённых.
    await VlyneGrant.deleteMany({ client: client._id });
    await VlyneRefreshToken.deleteMany({ client: client._id });
    await VlyneClient.deleteOne({ _id: client._id });

    res.json({ message: 'Приложение удалено' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = { oauthRouter, apiRouter, discovery };
