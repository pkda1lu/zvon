/**
 * Vlyne ID — проверка токенов на стороне ресурса (Node.js).
 *
 * Это половина SDK для сервисов, которые НЕ выпускают токены, а лишь
 * принимают их: «кто пришёл и что ему можно». Обращения к Vlyne ID на каждый
 * запрос нет — подпись проверяется публичным ключом из JWKS, который берётся
 * один раз и кешируется. Сервис остаётся работоспособным, даже когда Vlyne ID
 * временно недоступен.
 *
 * Зависимостей нет: только crypto из стандартной библиотеки Node 18+.
 *
 *   const { VlyneVerifier } = require('./vlyne-id/node');
 *   const verifier = new VlyneVerifier({ issuer: 'https://vlyneid.zvonserver.ru', audience: 'vlyne_xxx' });
 *
 *   app.use(verifier.middleware({ scopes: ['profile'] }));
 *   // req.vlyne = { sub, scopes, clientId, claims }
 */

const crypto = require('crypto');

function base64urlDecode(part) {
  return Buffer.from(String(part).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

class VlyneVerifier {
  /**
   * @param {object}   options
   * @param {string}   options.issuer    адрес Vlyne ID (совпадает с iss в токенах)
   * @param {string|string[]} [options.audience]  свой client_id; без него aud не проверяется
   * @param {number}   [options.jwksTtlMs]        как долго держать ключи (по умолчанию час)
   * @param {number}   [options.clockToleranceSec] допуск на расхождение часов
   */
  constructor({ issuer, audience, jwksTtlMs = 60 * 60 * 1000, clockToleranceSec = 60 } = {}) {
    if (!issuer) throw new Error('VlyneVerifier: нужен issuer');
    this.issuer = issuer.replace(/\/$/, '');
    this.audience = audience ? [].concat(audience) : null;
    this.jwksTtlMs = jwksTtlMs;
    this.clockToleranceSec = clockToleranceSec;

    this._keys = new Map();     // kid -> KeyObject
    this._fetchedAt = 0;
    this._inFlight = null;
  }

  async _loadJwks(force = false) {
    const fresh = Date.now() - this._fetchedAt < this.jwksTtlMs;
    if (!force && fresh && this._keys.size) return;
    // Параллельные запросы делят одну загрузку: иначе первый всплеск трафика
    // после перезапуска превращается в пачку одинаковых обращений.
    if (this._inFlight) return this._inFlight;

    this._inFlight = (async () => {
      const res = await fetch(`${this.issuer}/oauth/jwks.json`);
      if (!res.ok) throw new Error(`Vlyne ID вернул ${res.status} на JWKS`);
      const { keys } = await res.json();

      const next = new Map();
      for (const jwk of keys || []) {
        try { next.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })); }
        catch (e) { /* ключ незнакомого типа — пропускаем, остальные годны */ }
      }
      if (!next.size) throw new Error('В JWKS Vlyne ID нет пригодных ключей');

      this._keys = next;
      this._fetchedAt = Date.now();
    })().finally(() => { this._inFlight = null; });

    return this._inFlight;
  }

  /**
   * Проверяет токен и возвращает его claims. Бросает исключение, если токен
   * недействителен — вызывающий сам решает, чем на это ответить.
   */
  async verify(token, { requireScopes = [], type = 'access' } = {}) {
    const parts = String(token).split('.');
    if (parts.length !== 3) throw new Error('Некорректный формат токена');

    const header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
    const claims = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));

    // Алгоритм берём свой, а не из заголовка токена: иначе подделыватель
    // объявит alg: none или HS256 и подпишет токен нашим же публичным ключом.
    if (header.alg !== 'RS256') throw new Error('Недопустимый алгоритм подписи');

    await this._loadJwks();
    let key = this._keys.get(header.kid);
    if (!key) {
      // Неизвестный kid — возможно, ключ обновили. Одна принудительная
      // перезагрузка, и только потом отказ.
      await this._loadJwks(true);
      key = this._keys.get(header.kid);
    }
    if (!key) throw new Error('Ключ подписи неизвестен');

    const ok = crypto.verify(
      'sha256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { key, padding: crypto.constants.RSA_PKCS1_PADDING },
      base64urlDecode(parts[2])
    );
    if (!ok) throw new Error('Подпись токена не совпала');

    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== this.issuer) throw new Error('Токен выпущен другим сервером');
    if (claims.exp && claims.exp + this.clockToleranceSec < now) throw new Error('Срок действия токена истёк');
    if (claims.nbf && claims.nbf - this.clockToleranceSec > now) throw new Error('Токен ещё не действует');
    if (type && claims.typ && claims.typ !== type) throw new Error(`Ожидался токен типа ${type}`);

    if (this.audience) {
      const aud = [].concat(claims.aud || []);
      if (!aud.some((a) => this.audience.includes(a))) throw new Error('Токен предназначен другому приложению');
    }

    if (requireScopes.length) {
      const granted = String(claims.scope || '').split(/\s+/).filter(Boolean);
      const missing = requireScopes.filter((s) => !granted.includes(s));
      if (missing.length) {
        const err = new Error(`Токену не хватает прав: ${missing.join(', ')}`);
        err.code = 'insufficient_scope';
        err.missing = missing;
        throw err;
      }
    }

    return claims;
  }

  /** Готовый middleware для Express. */
  middleware({ scopes = [], optional = false } = {}) {
    return async (req, res, next) => {
      const header = req.headers.authorization || '';
      if (!header.startsWith('Bearer ')) {
        if (optional) return next();
        res.setHeader('WWW-Authenticate', 'Bearer realm="vlyne-id"');
        return res.status(401).json({ error: 'invalid_token', error_description: 'Нужен токен Vlyne ID' });
      }

      try {
        const claims = await this.verify(header.slice(7), { requireScopes: scopes });
        req.vlyne = {
          sub: claims.sub,
          clientId: claims.azp || claims.aud,
          scopes: String(claims.scope || '').split(/\s+/).filter(Boolean),
          claims
        };
        next();
      } catch (e) {
        if (e.code === 'insufficient_scope') {
          res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${e.missing.join(' ')}"`);
          return res.status(403).json({ error: 'insufficient_scope', error_description: e.message });
        }
        res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
        return res.status(401).json({ error: 'invalid_token', error_description: e.message });
      }
    };
  }

  /** Данные пользователя с сервера — когда claims токена недостаточно. */
  async userinfo(accessToken) {
    const res = await fetch(`${this.issuer}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`Vlyne ID вернул ${res.status} на userinfo`);
    return await res.json();
  }
}

module.exports = { VlyneVerifier };
