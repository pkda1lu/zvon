/*
 * Туннель для мини-аппки TikTok: трафик ТОЛЬКО её доменов уходит через
 * зарубежный узел Vlyne, всё остальное приложение продолжает ходить напрямую.
 *
 * Почему именно так:
 *
 *  — Сервис определяет страну по IP. Подмена языка, часового пояса и
 *    Geolocation API на выдачу не влияет, поэтому без своего выхода в сеть
 *    задача не решается вовсе.
 *
 *  — Прокси в Chromium настраивается на сессию целиком, а глобальный прокси
 *    здесь недопустим: через него пошли бы и голос (WebRTC), и LiveKit, и
 *    загрузки — то есть звонки поехали бы через чужую страну. Поэтому ставим
 *    PAC-скрипт: он возвращает узел для доменов TikTok и DIRECT для всего
 *    прочего.
 *
 *  — После установки PAC обязательно ПРОВЕРЯЕМ через resolveProxy, что правила
 *    действительно применились. Молча не сработавший туннель хуже ошибки:
 *    человек смотрел бы российскую ленту, считая, что смотрит немецкую.
 *
 * Сам выход в сеть поднимает sing-box: он принимает локальный SOCKS5 и
 * заворачивает его в VLESS-подключение к узлу. Бинарник кладётся в
 * resources/singbox/ при сборке (см. build.extraResources в package.json) либо
 * задаётся переменной окружения ZVON_SINGBOX.
 */

const { app, session } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Домены, которые должны идти через узел. Медиа TikTok раздаётся с отдельных
// CDN, и если забыть их, лента откроется, но видео не поедут (или поедут с
// российского узла CDN, что сервис и засчитает).
const TUNNELED_HOSTS = [
    'tiktok.com',
    'tiktokv.com',
    'tiktokcdn.com',
    'tiktokcdn-us.com',
    'tiktokcdn-eu.com',
    'ttwstatic.com',
    'ibyteimg.com',
    'ibytedtos.com',
    'byteoversea.com',
    'muscdn.com',
    'bytecdn.cn',
    'capcut.com',
];

let proc = null;
let state = { running: false, country: null, title: null, port: 0 };

/** Свободный порт для локального SOCKS5: занимаем и сразу отпускаем. */
function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

/** Путь к бинарнику sing-box. */
function findBinary() {
    if (process.env.ZVON_SINGBOX && fs.existsSync(process.env.ZVON_SINGBOX)) return process.env.ZVON_SINGBOX;
    const name = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box';
    const candidates = [
        path.join(process.resourcesPath || '', 'singbox', name),
        path.join(__dirname, 'singbox', name),
        path.join(app.getAppPath(), 'singbox', name),
    ];
    return candidates.find(p => p && fs.existsSync(p)) || null;
}

/**
 * vless://uuid@host:port?...#name → outbound для sing-box.
 * Если в переменной окружения лежит готовый JSON выходного подключения —
 * берём его как есть: так можно описать любой транспорт, который мы здесь
 * не разобрали.
 */
function parseOutbound(uri) {
    const raw = String(uri || '').trim();
    if (raw.startsWith('{')) return JSON.parse(raw);
    if (!raw.startsWith('vless://')) {
        throw new Error('Поддерживаются только ссылки vless:// или готовый JSON выходного подключения.');
    }

    const u = new URL(raw);
    const q = u.searchParams;
    const out = {
        type: 'vless',
        tag: 'proxy',
        server: u.hostname,
        server_port: Number(u.port) || 443,
        uuid: decodeURIComponent(u.username),
    };
    if (q.get('flow')) out.flow = q.get('flow');

    const security = q.get('security') || 'none';
    if (security === 'tls' || security === 'reality') {
        out.tls = {
            enabled: true,
            server_name: q.get('sni') || q.get('host') || u.hostname,
            insecure: q.get('allowInsecure') === '1',
        };
        if (q.get('fp')) out.tls.utls = { enabled: true, fingerprint: q.get('fp') };
        if (security === 'reality') {
            out.tls.reality = { enabled: true, public_key: q.get('pbk') || '', short_id: q.get('sid') || '' };
        }
        if (q.get('alpn')) out.tls.alpn = q.get('alpn').split(',');
    }

    const type = q.get('type') || 'tcp';
    if (type === 'ws') {
        out.transport = { type: 'ws', path: q.get('path') || '/', headers: q.get('host') ? { Host: q.get('host') } : undefined };
    } else if (type === 'grpc') {
        out.transport = { type: 'grpc', service_name: q.get('serviceName') || '' };
    }
    return out;
}

function pacFor(port) {
    const hosts = JSON.stringify(TUNNELED_HOSTS);
    // PAC — это функция, которую Chromium выполняет для каждого запроса.
    return `function FindProxyForURL(url, host) {
  var tunneled = ${hosts};
  host = host.toLowerCase();
  for (var i = 0; i < tunneled.length; i++) {
    var d = tunneled[i];
    if (host === d || host.indexOf('.' + d, host.length - d.length - 1) !== -1) {
      return "SOCKS5 127.0.0.1:${port}";
    }
  }
  return "DIRECT";
}`;
}

/** Ставим PAC и убеждаемся, что он действительно применился. */
async function installPac(port) {
    const file = path.join(app.getPath('userData'), 'tiktok-proxy.pac');
    fs.writeFileSync(file, pacFor(port), 'utf8');

    const ses = session.defaultSession;
    await ses.setProxy({ mode: 'pac_script', pacScript: `file://${file.replace(/\\/g, '/')}` });

    const viaProxy = await ses.resolveProxy('https://www.tiktok.com/');
    const direct = await ses.resolveProxy('https://zvonserver.ru/');
    if (!/SOCKS5/i.test(viaProxy)) {
        throw new Error('Правила маршрутизации не применились: трафик пошёл бы напрямую, страна не сменилась бы.');
    }
    if (!/DIRECT/i.test(direct)) {
        throw new Error('Правила маршрутизации захватили лишний трафик — отменено ради сохранности голосовой связи.');
    }
}

async function removePac() {
    try { await session.defaultSession.setProxy({ mode: 'direct' }); } catch { /* приложение уже закрывается */ }
}

/**
 * Приводим заголовки в соответствие с новым адресом: сервису незачем видеть
 * русский Accept-Language с немецкого IP — это первое, на что смотрит
 * определение региона после самого адреса.
 */
function applyHeaders(locale) {
    const ses = session.defaultSession;
    ses.webRequest.onBeforeSendHeaders(
        { urls: TUNNELED_HOSTS.map(d => `*://*.${d}/*`).concat(TUNNELED_HOSTS.map(d => `*://${d}/*`)) },
        (details, callback) => {
            if (locale) {
                const base = locale.split('-')[0];
                details.requestHeaders['Accept-Language'] = `${locale},${base};q=0.9,en;q=0.8`;
            }
            callback({ requestHeaders: details.requestHeaders });
        }
    );
}

function clearHeaders() {
    try {
        session.defaultSession.webRequest.onBeforeSendHeaders(
            { urls: TUNNELED_HOSTS.map(d => `*://*.${d}/*`) },
            null
        );
    } catch { /* не критично */ }
}

/** Ждём, пока sing-box действительно начнёт принимать подключения. */
function waitForPort(port, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const sock = net.connect({ host: '127.0.0.1', port }, () => { sock.destroy(); resolve(); });
            sock.on('error', () => {
                sock.destroy();
                if (Date.now() > deadline) reject(new Error('Узел не ответил вовремя. Проверьте доступность сервера.'));
                else setTimeout(attempt, 250);
            });
        };
        attempt();
    });
}

async function start({ uri, country, title, locale } = {}) {
    await stop();

    const bin = findBinary();
    if (!bin) {
        throw new Error('Не найден компонент подключения (sing-box). Переустановите клиент или задайте ZVON_SINGBOX.');
    }

    const outbound = parseOutbound(uri);
    const port = await freePort();
    const config = {
        log: { level: 'error' },
        inbounds: [{ type: 'socks', tag: 'local', listen: '127.0.0.1', listen_port: port }],
        outbounds: [outbound, { type: 'direct', tag: 'direct' }],
    };

    const configPath = path.join(app.getPath('userData'), 'tiktok-tunnel.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    proc = spawn(bin, ['run', '-c', configPath], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += String(d); });
    proc.on('exit', (code) => {
        if (state.running && code !== 0) console.error('[Tunnel] sing-box завершился с кодом', code, stderr.slice(-500));
        proc = null;
        state = { running: false, country: null, title: null, port: 0 };
    });

    try {
        await waitForPort(port);
        await installPac(port);
    } catch (e) {
        await stop();
        throw new Error(`${e.message}${stderr ? ` (${stderr.trim().slice(-200)})` : ''}`);
    }

    applyHeaders(locale);
    state = { running: true, country: country || null, title: title || null, port };
    console.log(`[Tunnel] TikTok идёт через «${title || country}», локальный порт ${port}`);
    return { ok: true, country: state.country, port };
}

async function stop() {
    clearHeaders();
    await removePac();
    if (proc) {
        try { proc.kill(); } catch { /* уже мёртв */ }
        proc = null;
    }
    state = { running: false, country: null, title: null, port: 0 };
    return { ok: true };
}

function status() {
    return { running: state.running, country: state.country, title: state.title };
}

module.exports = { start, stop, status };
