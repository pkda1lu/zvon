import { useEffect, useState } from 'react';

/**
 * Неподвижная уменьшенная копия картинки — для размытых подложек.
 *
 * Анимированный баннер (GIF/WebP) под filter: blur() заставляет Chromium
 * заново размывать слой на каждом кадре анимации, и одна такая карточка в
 * голосовом канале держит GPU-процесс занятым постоянно. Под сильным блюром
 * движение всё равно не разглядеть, поэтому берём первый кадр и уменьшаем его:
 * маленькую картинку и размывать дешевле.
 */
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

const MAX_SIDE = 160;

const makeStill = (url: string): Promise<string> => {
    const inFlight = pending.get(url);
    if (inFlight) return inFlight;
    const p = new Promise<string>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => {
            try {
                const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
                const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
                const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('no 2d context');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch {
                resolve(url); // холст «испорчен» чужим источником — оставляем как есть
            }
        };
        img.onerror = () => resolve(url);
        img.src = url;
    }).then((still) => {
        cache.set(url, still);
        pending.delete(url);
        return still;
    });
    pending.set(url, p);
    return p;
};

/** URL неподвижной копии; пока она готовится — null (подложку лучше не рисовать). */
export const useStillImage = (url: string | null | undefined): string | null => {
    const [still, setStill] = useState<string | null>(() => (url ? cache.get(url) ?? null : null));
    useEffect(() => {
        if (!url) { setStill(null); return; }
        const cached = cache.get(url);
        if (cached) { setStill(cached); return; }
        let alive = true;
        setStill(null);
        makeStill(url).then((s) => { if (alive) setStill(s); });
        return () => { alive = false; };
    }, [url]);
    return still;
};
