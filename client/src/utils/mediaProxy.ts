const API_URL = import.meta.env.VITE_API_URL || 'https://zvonserver.ru';

/**
 * Прогоняет внешнюю картинку через свой прокси (`/api/media-proxy`).
 *
 * Зачем: сторонние CDN (обложки Яндекс.Музыки, иконки игр из SteamGridDB и т.п.)
 * обычно не отдают `Access-Control-Allow-Origin`. Такую картинку браузер
 * отрисует в <img>, но canvas от неё «затейнчивается», а WebGL просто откажется
 * брать её текстурой. Прокси отдаёт тот же байтовый поток с разрешающим CORS.
 *
 * Свои и относительные адреса не трогаем — им прокси не нужен, а лишний хоп
 * стоил бы задержки и памяти на сервере.
 */
export const toProxiedMedia = (url: string): string => {
    if (!url) return url;
    if (url.startsWith(`${API_URL}/api/media-proxy`)) return url;
    if (!/^https?:\/\//i.test(url)) return url;
    if (url.startsWith(API_URL)) return url;
    return `${API_URL}/api/media-proxy?url=${encodeURIComponent(url)}`;
};

/**
 * YouTube-ссылку нельзя положить текстурой: кадры отдаёт только их плеер в
 * iframe. В обычном голосовом канале PresenceTile так и делает, а в 3D-комнате
 * такой источник просто пропускаем — остаётся карточка.
 */
export const isYouTubeUrl = (url: string | null | undefined): boolean =>
    !!url && /(?:youtube\.com|youtu\.be)/i.test(url);
