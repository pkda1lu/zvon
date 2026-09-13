const User = require('../models/User');
const { verifyAccessToken } = require('../utils/vlyneTokens');
const { parseScopes } = require('../utils/vlyneScopes');

/**
 * Проверка access-токена Vlyne ID на стороне ресурса.
 *
 * Отличие от middleware/auth.js: тот проверяет собственный токен сессии Zvon
 * (HS256, свой секрет) и обслуживает интерфейс самого Zvon. Этот — токен
 * единого входа, выданный стороннему приложению экосистемы, и подпись у него
 * асимметричная: тот же код работает в любом сервисе на этой машине, имея на
 * руках только публичный ключ.
 *
 * Проверка полностью локальная: обращаться к базе на каждый запрос не нужно,
 * потому что срок жизни access-токена короткий (час). Пользователь
 * подгружается только если ресурсу он действительно нужен (loadUser).
 *
 *   app.get('/api/что-то',
 *     requireVlyneToken({ scopes: ['profile'] }),
 *     (req, res) => { req.vlyne.sub / req.vlyne.scopes / req.user });
 */
function requireVlyneToken({ scopes = [], loadUser = true, audience } = {}) {
  return async (req, res, next) => {
    const header = req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="vlyne-id"');
      return res.status(401).json({ error: 'invalid_token', error_description: 'Нужен токен Vlyne ID' });
    }

    let payload;
    try {
      payload = verifyAccessToken(header.slice(7), { audience });
      if (payload.typ !== 'access') throw new Error('не access-токен');
    } catch (e) {
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
      return res.status(401).json({ error: 'invalid_token', error_description: 'Токен недействителен или истёк' });
    }

    const granted = parseScopes(payload.scope);
    const missing = scopes.filter((s) => !granted.includes(s));
    if (missing.length) {
      // 403 с insufficient_scope, а не 401: токен настоящий, просто прав мало —
      // клиенту бессмысленно его обновлять, надо просить доступ заново.
      res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${missing.join(' ')}"`);
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Токену не хватает прав: ${missing.join(', ')}`
      });
    }

    req.vlyne = { sub: payload.sub, clientId: payload.azp || payload.aud, scopes: granted, payload };

    if (loadUser) {
      const user = await User.findById(payload.sub).select('-password');
      if (!user) return res.status(401).json({ error: 'invalid_token', error_description: 'Пользователь не найден' });
      if (user.isBanned) return res.status(403).json({ error: 'access_denied', error_description: 'Аккаунт заблокирован' });
      req.user = user;
    }

    next();
  };
}

module.exports = { requireVlyneToken };
