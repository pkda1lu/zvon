/**
 * Vlyne ID — клиент для браузера и Electron.
 *
 * Реализует authorization code + PKCE: единственный поток, безопасный там, где
 * весь код приложения лежит у пользователя и секрет хранить негде.
 *
 * Зависимостей нет намеренно. Это файл, который копируется в Vlyne Client,
 * будущие проекты и мини-аппы; пакет со своим деревом зависимостей в такой
 * роли — обуза, а не удобство.
 *
 *   import { VlyneID } from './vlyne-id/browser.js';
 *
 *   const id = new VlyneID({
 *     issuer: 'https://vlyneid.zvonserver.ru',
 *     clientId: 'vlyne_xxx',
 *     redirectUri: window.location.origin + '/auth/callback',
 *     scopes: ['openid', 'profile', 'email', 'offline_access']
 *   });
 *
 *   // на странице возврата:
 *   if (VlyneID.isCallback()) await id.handleCallback();
 *   // где угодно:
 *   if (!id.isAuthenticated()) id.login();
 *   const token = await id.getAccessToken();   // сам обновится, когда истечёт
 */

const DEFAULT_STORAGE_PREFIX = 'vlyne_id';

function base64url(bytes) {
  let str = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64url(bytes).slice(0, length);
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/** Разбор JWT без проверки подписи — только чтобы прочитать claims у себя. */
function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(part))));
  } catch (e) {
    return null;
  }
}

export class VlyneID {
  constructor(options) {
    if (!options || !options.clientId) throw new Error('VlyneID: нужен clientId');
    if (!options.redirectUri) throw new Error('VlyneID: нужен redirectUri');

    this.issuer = (options.issuer || 'https://vlyneid.zvonserver.ru').replace(/\/$/, '');
    this.clientId = options.clientId;
    this.redirectUri = options.redirectUri;
    this.scopes = options.scopes || ['openid', 'profile', 'email'];
    this.prefix = options.storagePrefix || DEFAULT_STORAGE_PREFIX;

    // sessionStorage для промежуточных значений входа (они нужны ровно до
    // возврата), localStorage для токенов (вход должен переживать перезапуск).
    this.transient = options.transientStorage || window.sessionStorage;
    this.persistent = options.storage || window.localStorage;

    this._endpoints = null;
    this._refreshing = null;
  }

  // ---- Адреса провайдера ----

  /**
   * Читает описание провайдера. Один адрес в настройках вместо шести:
   * при переезде эндпоинтов приложения чинить не придётся.
   */
  async endpoints() {
    if (this._endpoints) return this._endpoints;
    const res = await fetch(`${this.issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error('Vlyne ID недоступен');
    this._endpoints = await res.json();
    return this._endpoints;
  }

  // ---- Хранилище ----

  _key(name) { return `${this.prefix}_${name}`; }

  _saveTokens(data) {
    const record = {
      accessToken: data.access_token,
      idToken: data.id_token || null,
      refreshToken: data.refresh_token || this._tokens()?.refreshToken || null,
      scope: data.scope || '',
      // Момент истечения считаем при получении: сравнивать expires_in потом
      // не с чем, а часы пользователя и сервера всё равно расходятся.
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000
    };
    this.persistent.setItem(this._key('tokens'), JSON.stringify(record));
    return record;
  }

  _tokens() {
    try { return JSON.parse(this.persistent.getItem(this._key('tokens')) || 'null'); }
    catch (e) { return null; }
  }

  // ---- Вход ----

  /** Готовит PKCE и адрес авторизации, ничего не открывая. */
  async buildAuthorizeUrl({ prompt } = {}) {
    const { authorization_endpoint: endpoint } = await this.endpoints();

    const codeVerifier = randomString(64);
    const codeChallenge = base64url(await sha256(codeVerifier));
    // state защищает от подсунутого чужого кода: вернувшийся ответ должен
    // ссылаться на попытку входа, которую начали именно мы.
    const state = randomString(32);
    // nonce связывает id_token с этой же попыткой.
    const nonce = randomString(32);

    this.transient.setItem(this._key('verifier'), codeVerifier);
    this.transient.setItem(this._key('state'), state);
    this.transient.setItem(this._key('nonce'), nonce);

    const url = new URL(endpoint);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (prompt) url.searchParams.set('prompt', prompt);

    return url.toString();
  }

  /** Уводит браузер на Vlyne ID. Возврат обработает handleCallback(). */
  async login(options) {
    window.location.assign(await this.buildAuthorizeUrl(options));
  }

  /**
   * Вход во всплывающем окне — для приложений, которым нельзя терять
   * состояние страницы. Страница возврата должна вызвать
   * VlyneID.notifyOpener() (см. ниже).
   */
  async loginPopup(options) {
    const url = await this.buildAuthorizeUrl(options);
    const w = 480, h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(url, 'vlyne-id', `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) throw new Error('Всплывающее окно заблокировано браузером');

    const params = await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (popup.closed) { clearInterval(timer); window.removeEventListener('message', onMessage); reject(new Error('Окно входа закрыто')); }
      }, 500);

      const onMessage = (event) => {
        // Принимаем только сообщения со своего origin: иначе любая открытая
        // вкладка смогла бы прислать нам чужой код.
        if (event.origin !== window.location.origin) return;
        if (!event.data || event.data.type !== 'vlyne-id-callback') return;
        clearInterval(timer);
        window.removeEventListener('message', onMessage);
        try { popup.close(); } catch (e) {}
        resolve(event.data.params);
      };
      window.addEventListener('message', onMessage);
    });

    return await this._exchange(params);
  }

  /** Есть ли в текущем адресе ответ от Vlyne ID. */
  static isCallback(search = window.location.search) {
    const p = new URLSearchParams(search);
    return p.has('code') || p.has('error');
  }

  /** Страница возврата во всплывающем окне вызывает это и закрывается. */
  static notifyOpener() {
    if (!window.opener) return false;
    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    window.opener.postMessage({ type: 'vlyne-id-callback', params }, window.location.origin);
    return true;
  }

  /** Обрабатывает возврат на redirectUri: меняет код на токены. */
  async handleCallback(search = window.location.search) {
    const params = Object.fromEntries(new URLSearchParams(search));
    const result = await this._exchange(params);

    // Подчищаем адресную строку: код одноразовый, но светить его в истории
    // и в заголовках Referer всё равно незачем.
    const clean = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, clean);

    return result;
  }

  async _exchange(params) {
    if (params.error) {
      throw new Error(params.error_description || params.error);
    }
    const expectedState = this.transient.getItem(this._key('state'));
    if (!params.state || params.state !== expectedState) {
      throw new Error('Ответ не относится к этой попытке входа (state не совпал)');
    }
    const codeVerifier = this.transient.getItem(this._key('verifier'));
    if (!codeVerifier) throw new Error('Потерян code_verifier — начните вход заново');

    const { token_endpoint: endpoint } = await this.endpoints();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code_verifier: codeVerifier
    });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error || 'Не удалось получить токены');

    if (data.id_token) {
      const claims = decodeJwt(data.id_token);
      const nonce = this.transient.getItem(this._key('nonce'));
      if (nonce && claims && claims.nonce !== nonce) {
        throw new Error('id_token не относится к этой попытке входа (nonce не совпал)');
      }
    }

    this.transient.removeItem(this._key('verifier'));
    this.transient.removeItem(this._key('state'));
    this.transient.removeItem(this._key('nonce'));

    this._saveTokens(data);
    return this.user();
  }

  // ---- Использование ----

  isAuthenticated() {
    const t = this._tokens();
    return !!t && (!!t.refreshToken || t.expiresAt > Date.now());
  }

  /** Данные о пользователе из id_token — без обращения к сети. */
  user() {
    const t = this._tokens();
    if (!t || !t.idToken) return null;
    const claims = decodeJwt(t.idToken);
    if (!claims) return null;
    return {
      id: claims.sub,
      username: claims.preferred_username || claims.name,
      avatar: claims.picture || null,
      email: claims.email || null,
      emailVerified: !!claims.email_verified,
      telegram: claims.telegram || null,
      claims
    };
  }

  /**
   * Действующий access-токен. Обновляется сам за минуту до истечения —
   * минута нужна на дорогу запроса и на расхождение часов.
   */
  async getAccessToken() {
    const t = this._tokens();
    if (!t) return null;
    if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
    if (!t.refreshToken) return null;

    // Параллельные запросы не должны каждый тратить refresh-токен: после
    // ротации второй получил бы «токен уже использован» и убил всю цепочку.
    if (!this._refreshing) {
      this._refreshing = this._refresh(t.refreshToken).finally(() => { this._refreshing = null; });
    }
    return await this._refreshing;
  }

  async _refresh(refreshToken) {
    const { token_endpoint: endpoint } = await this.endpoints();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId
      })
    });
    const data = await res.json();
    if (!res.ok) {
      // Обновиться нечем — вход окончен. Чистим хранилище, иначе приложение
      // будет бесконечно считать себя авторизованным.
      this.persistent.removeItem(this._key('tokens'));
      return null;
    }
    return this._saveTokens(data).accessToken;
  }

  /** Свежие данные о пользователе с сервера (например, после смены аватара). */
  async fetchUserInfo() {
    const token = await this.getAccessToken();
    if (!token) return null;
    const { userinfo_endpoint: endpoint } = await this.endpoints();
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.json();
  }

  /** Запрос к своему API с автоматической подстановкой токена. */
  async fetch(url, options = {}) {
    const token = await this.getAccessToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  }

  /** Локальный выход: токены удаляются у нас, сессия Vlyne ID остаётся. */
  logout() {
    const t = this._tokens();
    this.persistent.removeItem(this._key('tokens'));
    return t;
  }

  /** Выход с отзывом refresh-токена на сервере. */
  async logoutRemote() {
    const t = this.logout();
    if (!t || !t.refreshToken) return;
    try {
      const { revocation_endpoint: endpoint } = await this.endpoints();
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: t.refreshToken, client_id: this.clientId })
      });
    } catch (e) { /* локально вышли в любом случае */ }
  }
}

export default VlyneID;
