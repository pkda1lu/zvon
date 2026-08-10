/* Zvon Service Worker — минимальный и безопасный для обновлений.
 * Стратегия:
 *  - навигации (SPA): network-first, при оффлайне — кэш index.html;
 *  - хэшированные ассеты Vite (/assets/...): cache-first (имена уникальны → не устаревают);
 *  - остальное: проходит в сеть как обычно.
 * Не кэшируем API/сокеты/медиа, чтобы не отдавать устаревшие данные. */
const CACHE = 'zvon-pwa-v1';
const SHELL = '/index.html';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* --- Web Push -------------------------------------------------------------
 * Показ уведомлений живёт здесь, а не на странице, потому что service worker
 * работает и когда приложение полностью закрыто. Для PWA на iPhone это вообще
 * единственный путь: конструктор `new Notification()` в Safari не поддержан,
 * показывать умеет только registration.showNotification() из воркера.
 *
 * Подписка оформлена с userVisibleOnly: true, то есть на каждый push мы ОБЯЗАНЫ
 * показать уведомление. Молча проглотить нельзя — браузер покажет вместо нас
 * системную заглушку вида «сайт обновился в фоне». Поэтому решение «слать или
 * нет» принимает сервер: он шлёт push только когда у пользователя нет живого
 * сокета (см. pushIfOffline в server.js). */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Zvon', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Zvon';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon.png',
    badge: '/icon.png',
    // Уведомления из одного чата схлопываются в одно, чтобы активная переписка
    // не заваливала экран блокировки.
    tag: payload.tag || 'zvon',
    renotify: true,
    data: { url: payload.url || '/', ...(payload.data || {}) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Если приложение уже открыто — фокусируем существующее окно, а не плодим
    // новые вкладки. На iOS PWA окно всегда одно.
    for (const client of all) {
      if (client.url.includes(self.location.origin)) {
        await client.focus();
        try { client.postMessage({ type: 'notification-click', url: target }); } catch { }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;            // только свой origin
  if (url.pathname.startsWith('/api/')) return;               // API — всегда сеть
  if (url.pathname.startsWith('/socket.io/')) return;         // сокеты — не трогаем

  // SPA-навигации: сеть, при сбое — кэш оболочки (оффлайн).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(SHELL, net.clone()).catch(() => {});
        return net;
      } catch {
        return (await caches.match(SHELL)) || Response.error();
      }
    })());
    return;
  }

  // Хэшированные ассеты — cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net.ok) (await caches.open(CACHE)).put(req, net.clone()).catch(() => {});
        return net;
      } catch {
        return cached || Response.error();
      }
    })());
  }
});
