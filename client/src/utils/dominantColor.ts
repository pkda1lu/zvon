import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://zvonserver.ru';

// Кэш по URL, чтобы не пересчитывать один и тот же значок игры на каждый рендер/событие.
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

const SAMPLE_SIZE = 16;

// Внешние CDN (иконки игр из SteamGridDB и т.п.) обычно не отдают Access-Control-Allow-Origin,
// поэтому canvas "затейнчивается" при попытке прочитать пиксели напрямую. Прогоняем через свой
// прокси, который отдаёт с разрешающим CORS — так canvas остаётся доступен для чтения.
const toProxied = (url: string): string => {
    if (url.startsWith(`${API_URL}/api/media-proxy`)) return url;
    return `${API_URL}/api/media-proxy?url=${encodeURIComponent(url)}`;
};

const computeDominantColor = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = SAMPLE_SIZE;
                canvas.height = SAMPLE_SIZE;
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(null);
                ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
                const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

                // Взвешенное по "цветности" (chroma = max-min канала) усреднение: приглушённые/белые/чёрные
                // пиксели (фон, паддинг иконки) почти не влияют на итог, а сочные цвета — определяют его.
                // Плоское усреднение всех пикселей на разноцветной иконке (например красно-синей) даёт
                // мутно-серый результат — именно это взвешивание и решает.
                let wr = 0, wg = 0, wb = 0, totalWeight = 0;
                let hasOpaquePixels = false;
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3];
                    if (alpha < 32) continue; // прозрачные пиксели пропускаем полностью
                    hasOpaquePixels = true;
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
                    const weight = chroma + 1; // +1 — чтобы полностью серые пиксели тоже чуть-чуть учитывались
                    wr += r * weight;
                    wg += g * weight;
                    wb += b * weight;
                    totalWeight += weight;
                }
                if (!hasOpaquePixels || totalWeight === 0) return resolve(null);
                resolve(`${Math.round(wr / totalWeight)}, ${Math.round(wg / totalWeight)}, ${Math.round(wb / totalWeight)}`);
            } catch {
                // На случай, если прокси всё же не помог (сетевая ошибка и т.п.) — нейтральный фолбэк.
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = toProxied(url);
    });
};

/** RGB-триплет ("r, g, b") усреднённого (по цветности) цвета изображения — для мягкой подложки под иконку. */
export const useDominantColor = (url: string | null | undefined): string | null => {
    const [color, setColor] = useState<string | null>(url ? cache.get(url) ?? null : null);

    useEffect(() => {
        if (!url) { setColor(null); return; }
        if (cache.has(url)) { setColor(cache.get(url)!); return; }

        let cancelled = false;
        let promise = pending.get(url);
        if (!promise) {
            promise = computeDominantColor(url);
            pending.set(url, promise);
        }
        promise.then(result => {
            cache.set(url, result);
            pending.delete(url);
            if (!cancelled) setColor(result);
        });
        return () => { cancelled = true; };
    }, [url]);

    return color;
};
