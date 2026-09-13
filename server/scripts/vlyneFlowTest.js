#!/usr/bin/env node
/**
 * Сквозная проверка потока Vlyne ID без MongoDB.
 *
 * Модели подменены заглушками в require.cache — всё остальное настоящее:
 * те же маршруты, та же подпись, тот же PKCE. Смысл в том, чтобы проверять
 * логику входа на любой машине, где нет базы, и чтобы падение было видно
 * сразу, а не в чужом проекте через неделю.
 *
 *   node server/scripts/vlyneFlowTest.js
 *
 * Проверку самой криптографии делает соседний vlyneSelfTest.js.
 */
process.env.VLYNE_ID_KEY_FILE = require('path').join(require('os').tmpdir(), 'vid-flow.pem');
process.env.VLYNE_ID_ISSUER = 'http://localhost:5097';
process.env.VLYNE_ID_WEB_URL = 'http://localhost:3000';

const crypto = require('crypto');

function stub(modPath, exports) {
  const resolved = require.resolve(modPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const USER = {
  _id: '507f1f77bcf86cd799439011', username: 'tester', email: 't@e.ru', isVerified: true,
  avatar: null, banner: null, bannerColor: '#fff', bio: '', telegram: { id: 1, username: 'tg', linkedAt: null },
  isBanned: false
};

const MODERATOR = { _id: '507f1f77bcf86cd799439099', username: 'mod', email: 'm@e.ru', role: 'moderator' };

const CLIENT = {
  _id: 'cid', clientId: 'vlyne_test', type: 'public', clientSecretHash: null,
  name: 'Vlyne Client', description: '', logo: null, homepageUrl: '', privacyPolicyUrl: '',
  redirectUris: ['https://app.example/cb'], postLogoutRedirectUris: [],
  allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
  firstParty: true, allowRefreshTokens: true, isActive: true,
  accessTokenTtlSec: 3600, refreshTokenTtlSec: 86400,
  allowsRedirect(u) { return this.redirectUris.includes(u); },
  verifySecret() { return false; },
  save: async () => {}
};

const requests = new Map();
const grants = new Map();
const refreshTokens = [];

stub('../models/User', { findById: (id) => ({ select: async () => (String(id) === USER._id ? USER : null) }) });

const clients = new Map([[CLIENT.clientId, CLIENT]]);
let clientSeq = 0;
stub('../models/VlyneClient', {
  findOne: async (q) => clients.get(q.clientId) || null,
  create: async (doc) => {
    const c = {
      // Значения по умолчанию из схемы: настоящая модель проставляет их сама,
      // а заглушка — нет, и без них созданное приложение считалось бы
      // отключённым.
      isActive: true,
      allowRefreshTokens: true,
      accessTokenTtlSec: 3600,
      refreshTokenTtlSec: 86400,
      firstParty: false,
      ...doc,
      _id: 'cid-' + (++clientSeq),
      allowsRedirect(u) { return this.redirectUris.includes(u); },
      verifySecret() { return false; },
      save: async () => {}
    };
    clients.set(c.clientId, c);
    return c;
  },
  find: () => ({ sort: async () => [...clients.values()].filter((c) => c._id !== 'cid') }),
  hashSecret: (s) => crypto.createHash('sha256').update(s).digest('hex')
});

stub('../models/VlyneAuthRequest', {
  create: async (doc) => {
    const d = { status: 'pending', user: null, codeHash: null, codeExpiresAt: null, sessionId: null, ...doc, createdAt: new Date(), save: async () => { requests.set(d.requestId, d); } };
    requests.set(d.requestId, d);
    return d;
  },
  findOne: (q) => {
    const found = [...requests.values()].find((r) =>
      (q.requestId && r.requestId === q.requestId) || (q.codeHash && r.codeHash === q.codeHash));
    // populate('client') подставляет документ приложения; save должен писать в исходный объект
    const proxy = found ? new Proxy(found, {
      get: (t, k) => (k === 'client' ? CLIENT : t[k]),
      set: (t, k, v) => { t[k] = v; return true; }
    }) : null;
    return Object.assign(Promise.resolve(proxy), { populate: async () => proxy });
  }
});

stub('../models/VlyneGrant', {
  findOne: async ({ user, client }) => grants.get(`${user}:${client}`) || null,
  findOneAndUpdate: async (filter, update) => {
    const key = `${filter.user}:${filter.client}`;
    let g = grants.get(key);
    if (!g) {
      g = {
        _id: 'grant-' + key, user: filter.user, client: filter.client, scopes: [],
        covers(scopes) { return scopes.every((s) => this.scopes.includes(s)); },
        save: async () => {}
      };
      grants.set(key, g);
    }
    for (const s of update.$addToSet.scopes.$each) if (!g.scopes.includes(s)) g.scopes.push(s);
    Object.assign(g, update.$set);
    return g;
  },
  deleteOne: async ({ user, client }) => { grants.delete(`${user}:${client}`); },
  find: () => ({ populate: () => ({ sort: async () => [] }) }),
  deleteMany: async () => {}
});

stub('../models/VlyneRefreshToken', {
  create: async (doc) => { const d = { ...doc, save: async () => {} }; refreshTokens.push(d); return d; },
  findOne: async (q) => refreshTokens.find((t) => t.tokenHash === q.tokenHash) || null,
  updateMany: async (filter, update) => {
    for (const t of refreshTokens) {
      if (filter.family && t.family !== filter.family) continue;
      if (filter.revokedAt === null && t.revokedAt) continue;
      Object.assign(t, update.$set);
    }
  },
  deleteMany: async () => {}
});

stub('../utils/globalAuditLogger', { logGlobalAction: async () => {} });

// Почта и push в тесте только считаются — проверяем, что решение их вызывает.
const sentMail = [];
stub('../utils/mail', { sendVlyneAppDecision: async (to, data) => { sentMail.push({ to, ...data }); } });
stub('../utils/webPush', { pushToModerators: async () => {}, previewText: (t) => t });

// Заявки на подключение.
const appRequests = new Map();
let reqSeq = 0;
function makeRequest(doc) {
  const r = {
    _id: 'req-' + (++reqSeq),
    status: 'pending', messages: [], moderator: null, decidedAt: null, client: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...doc,
    isOpen() { return this.status === 'pending' || this.status === 'changes_requested'; },
    toObject() { return { ...this }; },
    populate: async () => r,
    save: async () => { appRequests.set(String(r._id), r); return r; }
  };
  appRequests.set(String(r._id), r);
  return r;
}
stub('../models/VlyneAppRequest', {
  create: async (doc) => makeRequest(doc),
  countDocuments: async (q) => [...appRequests.values()]
    .filter((r) => String(r.applicant) === String(q.applicant) && q.status.$in.includes(r.status)).length,
  findById: (id) => {
    const r = appRequests.get(String(id)) || null;
    const chain = Object.assign(Promise.resolve(r), { populate: () => chain });
    return chain;
  },
  find: (q) => {
    let rows = [...appRequests.values()];
    if (q.applicant) rows = rows.filter((r) => String(r.applicant) === String(q.applicant));
    if (q.status && q.status.$in) rows = rows.filter((r) => q.status.$in.includes(r.status));
    else if (q.status) rows = rows.filter((r) => r.status === q.status);
    const chain = {
      populate: () => chain,
      sort: () => chain,
      limit: () => chain,
      then: (res, rej) => Promise.resolve(rows).then(res, rej)
    };
    return chain;
  }
});

// Журнал действий для личного кабинета.
const auditEntries = [
  { _id: 'a1', executor: USER._id, action: 'USER_LOGIN', details: {}, createdAt: new Date('2026-09-10T10:00:00Z') },
  { _id: 'a2', executor: USER._id, action: 'VLYNE_ID_AUTHORIZE', details: { client: 'vlyne_test', scopes: ['openid'] }, createdAt: new Date('2026-09-09T10:00:00Z') },
  { _id: 'a3', executor: 'someone-else', action: 'USER_LOGIN', details: {}, createdAt: new Date('2026-09-08T10:00:00Z') },
];
stub('../models/GlobalAuditLog', {
  find: (q) => {
    let rows = auditEntries.filter((e) => String(e.executor) === String(q.executor));
    if (q.createdAt && q.createdAt.$lt) rows = rows.filter((e) => e.createdAt < q.createdAt.$lt);
    const chain = {
      sort: () => chain,
      limit: (n) => { chain._limit = n; return chain; },
      lean: async () => rows.slice(0, chain._limit || rows.length),
    };
    return chain;
  }
});

// Аутентификация Zvon: в тесте достаточно заголовка с именем пользователя.
stub('../middleware/auth', (req, res, next) => {
  const who = req.header('X-Test-User');
  if (!who) return res.status(401).json({ message: 'No token' });
  // «mod» — тот же тест, но от лица модератора: так проверяются обе стороны
  // разбора заявки, не поднимая второго пользователя по-настоящему.
  req.user = who === 'mod' ? MODERATOR : USER;
  req.sessionId = 'sess-1';
  next();
});

const express = require('express');
const vlyneId = require('../routes/vlyneId');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/oauth', vlyneId.oauthRouter);
app.use('/api/vlyne-id', vlyneId.apiRouter);
app.get('/.well-known/openid-configuration', vlyneId.discovery);

const B = 'http://localhost:5097';
const b64url = (b) => Buffer.from(b).toString('base64url');

let fails = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else { fails++; console.error(`  FAIL ${name} ${extra}`); }
}

/** Полный проход входа: authorize → согласие → обмен кода. Возвращает токены. */
async function login(scopes) {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const a = await fetch(`${B}/oauth/authorize?client_id=vlyne_test&redirect_uri=${encodeURIComponent('https://app.example/cb')}`
    + `&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&code_challenge=${challenge}&code_challenge_method=S256`,
    { redirect: 'manual' });
  const rid = new URL(a.headers.get('location')).searchParams.get('request');
  const dec = await (await fetch(`${B}/api/vlyne-id/requests/${rid}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': 'yes', Authorization: 'Bearer test' },
    body: JSON.stringify({ approve: true })
  })).json();
  const code = new URL(dec.redirectTo).searchParams.get('code');
  return await (await fetch(`${B}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: 'vlyne_test', redirect_uri: 'https://app.example/cb', code_verifier: verifier })
  })).json();
}

async function run() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

  // --- 1. authorize ---
  const authUrl = `${B}/oauth/authorize?client_id=vlyne_test&redirect_uri=${encodeURIComponent('https://app.example/cb')}`
    + `&response_type=code&scope=${encodeURIComponent('openid profile email offline_access')}`
    + `&state=st-1&nonce=no-1&code_challenge=${challenge}&code_challenge_method=S256`;
  const a = await fetch(authUrl, { redirect: 'manual' });
  const loc = a.headers.get('location') || '';
  ok('authorize уводит на экран согласия', a.status === 302 && loc.startsWith('http://localhost:3000/vlyne/authorize?request='), loc);
  const requestId = new URL(loc).searchParams.get('request');

  // Чужой redirect_uri
  const bad = await fetch(`${B}/oauth/authorize?client_id=vlyne_test&redirect_uri=${encodeURIComponent('https://evil.example/cb')}&response_type=code&code_challenge=${challenge}`, { redirect: 'manual' });
  ok('чужой redirect_uri отклонён без редиректа', bad.status === 400 && !bad.headers.get('location'));

  // Без PKCE
  const noPkce = await fetch(`${B}/oauth/authorize?client_id=vlyne_test&redirect_uri=${encodeURIComponent('https://app.example/cb')}&response_type=code&state=s`, { redirect: 'manual' });
  ok('без PKCE — ошибка возвращается приложению', noPkce.status === 302 && (noPkce.headers.get('location') || '').includes('error=invalid_request'));

  // Право вне списка приложения
  const badScope = await fetch(`${B}/oauth/authorize?client_id=vlyne_test&redirect_uri=${encodeURIComponent('https://app.example/cb')}&response_type=code&scope=telegram&code_challenge=${challenge}`, { redirect: 'manual' });
  ok('нераз­решённое приложению право отклонено', (badScope.headers.get('location') || '').includes('error=invalid_scope'));

  // --- 2. экран согласия ---
  const guest = await fetch(`${B}/api/vlyne-id/requests/${requestId}`);
  const guestData = await guest.json();
  ok('гость видит описание приложения, но не авторизован', guest.status === 200 && guestData.authenticated === false && guestData.client.name === 'Vlyne Client');
  ok('права описаны текстом для человека', guestData.scopeDetails.length === 3 && guestData.offlineAccess === true);

  const noAuth = await fetch(`${B}/api/vlyne-id/requests/${requestId}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve: true })
  });
  ok('решение без авторизации отклонено', noAuth.status === 401);

  const dec = await fetch(`${B}/api/vlyne-id/requests/${requestId}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': 'yes', Authorization: 'Bearer test' }, body: JSON.stringify({ approve: true })
  });
  const decData = await dec.json();
  ok('согласие выдаёт код и state', dec.status === 200 && decData.redirectTo.includes('code=') && decData.redirectTo.includes('state=st-1'), JSON.stringify(decData));
  const code = new URL(decData.redirectTo).searchParams.get('code');

  const twice = await fetch(`${B}/api/vlyne-id/requests/${requestId}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': 'yes', Authorization: 'Bearer test' }, body: JSON.stringify({ approve: true })
  });
  ok('повторное решение по тому же запросу отклонено', twice.status === 409);

  // --- 3. обмен кода ---
  const wrongVerifier = await fetch(`${B}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: 'vlyne_test', redirect_uri: 'https://app.example/cb', code_verifier: b64url(crypto.randomBytes(48)) })
  });
  ok('код без верного code_verifier не обменивается', wrongVerifier.status === 400);

  const tok = await fetch(`${B}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: 'vlyne_test', redirect_uri: 'https://app.example/cb', code_verifier: verifier })
  });
  const tokens = await tok.json();
  ok('код обменивается на токены', tok.status === 200 && !!tokens.access_token && !!tokens.id_token && !!tokens.refresh_token, JSON.stringify(tokens));

  const idClaims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url'));
  ok('id_token привязан к попытке входа (nonce)', idClaims.nonce === 'no-1');
  ok('sub — идентификатор пользователя Zvon', idClaims.sub === USER._id);

  const reuse = await fetch(`${B}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: 'vlyne_test', redirect_uri: 'https://app.example/cb', code_verifier: verifier })
  });
  ok('повторный обмен кода отклонён', reuse.status === 400);

  // --- 4. userinfo ---
  const ui = await fetch(`${B}/oauth/userinfo`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const uiData = await ui.json();
  ok('userinfo отдаёт только разрешённые данные', ui.status === 200 && uiData.email === USER.email && uiData.telegram === undefined, JSON.stringify(uiData));

  // --- 5. ротация refresh (на отдельном входе: проверка повторного обмена
  //        кода выше намеренно погасила токены предыдущего) ---
  const fresh = await login(['openid', 'profile', 'offline_access']);
  const r1 = await fetch(`${B}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: fresh.refresh_token, client_id: 'vlyne_test' })
  });
  const r1data = await r1.json();
  ok('refresh выдаёт новую пару', r1.status === 200 && !!r1data.access_token && r1data.refresh_token !== fresh.refresh_token, JSON.stringify(r1data));

  const r2 = await fetch(`${B}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: fresh.refresh_token, client_id: 'vlyne_test' })
  });
  ok('повторное использование старого refresh отклонено', r2.status === 400);

  const r3 = await fetch(`${B}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: r1data.refresh_token, client_id: 'vlyne_test' })
  });
  ok('вся цепочка погашена после кражи', r3.status === 400);

  // --- 6. второй вход: ноль нажатий ---
  const v2 = b64url(crypto.randomBytes(48));
  const c2 = b64url(crypto.createHash('sha256').update(v2).digest());
  const a2 = await fetch(`${B}/oauth/authorize?client_id=vlyne_test&redirect_uri=${encodeURIComponent('https://app.example/cb')}&response_type=code&scope=${encodeURIComponent('openid profile email')}&code_challenge=${c2}&code_challenge_method=S256`, { redirect: 'manual' });
  const rid2 = new URL(a2.headers.get('location')).searchParams.get('request');
  const info2 = await (await fetch(`${B}/api/vlyne-id/requests/${rid2}`, { headers: { 'X-Test-User': 'yes', Authorization: 'Bearer test' } })).json();
  ok('повторный вход подтверждается автоматически', info2.autoApprove === true, JSON.stringify(info2));

  // --- 7. личный кабинет: своя активность ---
  const act = await (await fetch(`${B}/api/vlyne-id/activity`, { headers: { 'X-Test-User': 'yes', Authorization: 'Bearer test' } })).json();
  ok('активность отдаётся только своя', act.entries.length === 2, JSON.stringify(act));
  ok('действия названы по-человечески', act.entries[0].title === 'Вход в аккаунт' && act.entries[1].title === 'Выдан доступ приложению');
  ok('в активности видно приложение и права', act.entries[1].client === 'vlyne_test' && act.entries[1].scopes.length === 1);

  const actNoAuth = await fetch(`${B}/api/vlyne-id/activity`);
  ok('чужую активность без входа не получить', actNoAuth.status === 401);

  // --- 8. отзыв доступа ---
  await fetch(`${B}/api/vlyne-id/grants/vlyne_test`, { method: 'DELETE', headers: { 'X-Test-User': 'yes', Authorization: 'Bearer test' } });
  const info3 = await (await fetch(`${B}/api/vlyne-id/requests/${rid2}`, { headers: { 'X-Test-User': 'yes', Authorization: 'Bearer test' } })).json();
  ok('после отзыва согласие спрашивается заново', info3.autoApprove === false);

  // --- 9. заявка на подключение: подача, вопросы, одобрение ---
  const H = { 'Content-Type': 'application/json', 'X-Test-User': 'yes', Authorization: 'Bearer test' };
  const M = { 'Content-Type': 'application/json', 'X-Test-User': 'mod', Authorization: 'Bearer test' };

  const thin = await fetch(`${B}/api/vlyne-id/applications`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: 'App', purpose: 'коротко', redirectUris: ['https://a.example/cb'], requestedScopes: ['profile'] })
  });
  ok('заявка без внятного обоснования отклонена', thin.status === 400);

  const badUri = await fetch(`${B}/api/vlyne-id/applications`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      name: 'App', purpose: 'Сервис расписаний для студентов, нужен вход и имя пользователя.',
      redirectUris: ['не-адрес'], requestedScopes: ['profile']
    })
  });
  ok('заявка с битым адресом возврата отклонена', badUri.status === 400);

  const created = await fetch(`${B}/api/vlyne-id/applications`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      name: 'Расписание', description: 'Расписание занятий',
      purpose: 'Сервис расписаний для студентов. Имя и аватар нужны, чтобы подписывать комментарии.',
      redirectUris: ['https://raspisanie.example/auth/callback'],
      requestedScopes: ['profile', 'email'], type: 'confidential'
    })
  });
  const app1 = await created.json();
  ok('заявка принята', created.status === 201 && app1.status === 'pending', JSON.stringify(app1));
  ok('openid добавляется сам', app1.requestedScopes.includes('openid'));

  const queue = await (await fetch(`${B}/api/vlyne-id/admin/applications`, { headers: M })).json();
  ok('заявка видна модератору', queue.some((r) => r.id === app1.id), JSON.stringify(queue).slice(0, 200));

  const notMod = await fetch(`${B}/api/vlyne-id/admin/applications`, { headers: H });
  ok('очередь заявок закрыта от обычного пользователя', notMod.status === 403);

  const silentReject = await fetch(`${B}/api/vlyne-id/admin/applications/${app1.id}/decision`, {
    method: 'POST', headers: M, body: JSON.stringify({ action: 'reject' })
  });
  ok('отказ без объяснения не принимается', silentReject.status === 400);

  const questions = await fetch(`${B}/api/vlyne-id/admin/applications/${app1.id}/decision`, {
    method: 'POST', headers: M,
    body: JSON.stringify({ action: 'request_changes', comment: 'Зачем вам почта?' })
  });
  const afterQ = await questions.json();
  ok('модератор может задать вопросы', questions.status === 200 && afterQ.status === 'changes_requested');
  ok('вопрос ушёл письмом', sentMail.some((m) => m.status === 'changes_requested'), JSON.stringify(sentMail));

  const answered = await fetch(`${B}/api/vlyne-id/applications/${app1.id}/messages`, {
    method: 'POST', headers: H, body: JSON.stringify({ text: 'Почта нужна для уведомлений об изменениях.' })
  });
  const afterA = await answered.json();
  ok('ответ возвращает заявку в очередь', answered.status === 200 && afterA.status === 'pending');
  ok('переписка сохраняется целиком', afterA.messages.length === 2);

  const approved = await fetch(`${B}/api/vlyne-id/admin/applications/${app1.id}/decision`, {
    method: 'POST', headers: M, body: JSON.stringify({ action: 'approve', comment: 'Годится' })
  });
  const done = await approved.json();
  ok('одобрение создаёт приложение само', approved.status === 200 && done.status === 'approved' && !!done.clientId, JSON.stringify(done));
  ok('решение ушло письмом заявителю', sentMail.some((m) => m.status === 'approved' && m.to === USER.email));

  // Главная проверка: созданное приложение работает, руками ничего не заводили.
  const newId = done.clientId;
  const v3 = b64url(crypto.randomBytes(48));
  const c3 = b64url(crypto.createHash('sha256').update(v3).digest());
  const authNew = await fetch(`${B}/oauth/authorize?client_id=${newId}`
    + `&redirect_uri=${encodeURIComponent('https://raspisanie.example/auth/callback')}`
    + `&response_type=code&scope=${encodeURIComponent('openid profile email')}`
    + `&code_challenge=${c3}&code_challenge_method=S256`, { redirect: 'manual' });
  ok('созданное приложение сразу работает', authNew.status === 302 && (authNew.headers.get('location') || '').includes('/vlyne/authorize'), String(authNew.status));

  const overreach = await fetch(`${B}/oauth/authorize?client_id=${newId}`
    + `&redirect_uri=${encodeURIComponent('https://raspisanie.example/auth/callback')}`
    + `&response_type=code&scope=telegram&code_challenge=${c3}&code_challenge_method=S256`, { redirect: 'manual' });
  ok('права сверх одобренных отклоняются', (overreach.headers.get('location') || '').includes('error=invalid_scope'));

  const twiceDecided = await fetch(`${B}/api/vlyne-id/admin/applications/${app1.id}/decision`, {
    method: 'POST', headers: M, body: JSON.stringify({ action: 'reject', comment: 'ещё раз' })
  });
  ok('повторное решение по заявке отклонено', twiceDecided.status === 409);

  console.log('');
  if (fails) { console.error(`Провалено: ${fails}`); process.exitCode = 1; }
  else console.log('Поток Vlyne ID работает целиком.');
}

const srv = app.listen(5097, async () => {
  console.log('\nVlyne ID — сквозная проверка потока\n');
  try { await run(); } catch (e) { console.error(e); process.exitCode = 1; }
  srv.close();
});
