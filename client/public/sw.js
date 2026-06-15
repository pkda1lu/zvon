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
