import React, { useEffect, useRef, useState } from 'react';
import { getIconBrand } from '../utils/branding';
import PromoReel from './PromoReel';

export type ReelSlide = { src: string; title?: string; sub?: string };

/**
 * Ролик из ТВОИХ скриншотов: анимированное слайд-шоу на <canvas>
 * (Ken Burns + кроссфейды + подписи) с записью в .webm через MediaRecorder.
 * Скрины кладём в client/public/promo/ и перечисляем в slides.
 * Если ни одна картинка не загрузилась — показываем сгенерированный PromoReel.
 */
const W = 1280, H = 720;
const FADE = 0.6;

const ScreenshotReel: React.FC<{ slides: ReelSlide[]; perMs?: number }> = ({ slides, perMs = 3800 }) => {
    const brand = getIconBrand();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef(0);
    const startRef = useRef(0);
    const [loaded, setLoaded] = useState<{ img: HTMLImageElement; slide: ReelSlide }[] | null>(null);
    const [recording, setRecording] = useState(false);

    // Предзагрузка картинок (битые — отбрасываем)
    useEffect(() => {
        let alive = true;
        Promise.all(slides.map(s => new Promise<{ img: HTMLImageElement; slide: ReelSlide } | null>(res => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res({ img, slide: s });
            img.onerror = () => res(null);
            img.src = s.src;
        }))).then(list => { if (alive) setLoaded(list.filter(Boolean) as any); });
        return () => { alive = false; };
    }, [JSON.stringify(slides)]);

    const items = loaded || [];

    useEffect(() => {
        if (!items.length) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const perSec = perMs / 1000;
        const total = items.length * perSec;

        const cover = (img: HTMLImageElement, scale: number, panx: number, pany: number, alpha: number) => {
            const ir = img.width / img.height, cr = W / H;
            let dw: number, dh: number;
            if (ir > cr) { dh = H * scale; dw = dh * ir; } else { dw = W * scale; dh = dw / ir; }
            const dx = (W - dw) / 2 + panx, dy = (H - dh) / 2 + pany;
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.globalAlpha = 1;
        };

        const draw = (elapsed: number) => {
            const time = ((elapsed % total) + total) % total;
            const idx = Math.floor(time / perSec) % items.length;
            const local = time - Math.floor(time / perSec) * perSec;
            const t = local / perSec;

            ctx.fillStyle = '#07070f';
            ctx.fillRect(0, 0, W, H);

            // текущий слайд (Ken Burns)
            const cur = items[idx];
            cover(cur.img, 1.06 + t * 0.08, (t - 0.5) * 50, (t - 0.5) * 26, 1);
            // кроссфейд со следующим в конце
            if (local > perSec - FADE) {
                const a = (local - (perSec - FADE)) / FADE;
                const nx = items[(idx + 1) % items.length];
                cover(nx.img, 1.06, 0, 0, a);
            }

            // затемнение снизу + подписи
            const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
            g.addColorStop(0, 'rgba(7,7,15,0)');
            g.addColorStop(1, 'rgba(7,7,15,0.92)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            const appear = Math.min(1, t / 0.18);
            const slideUp = (1 - appear) * 24;
            const s = cur.slide;
            if (s.title) {
                ctx.globalAlpha = appear;
                ctx.fillStyle = '#fff';
                ctx.font = '800 50px Inter, system-ui, sans-serif';
                ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
                ctx.fillText(s.title, 64, H - 96 + slideUp);
                if (s.sub) {
                    ctx.font = '500 26px Inter, system-ui, sans-serif';
                    ctx.fillStyle = '#c7cbe8';
                    ctx.fillText(s.sub, 64, H - 56 + slideUp);
                }
                ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.globalAlpha = 1;
            }
            // вотермарка-бренд
            ctx.font = '800 26px Inter, system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            ctx.fillText(brand.name, W - ctx.measureText(brand.name).width - 56, 64);

            // прогресс
            const segW = (W - 128) / items.length, gap = 8;
            for (let k = 0; k < items.length; k++) {
                const x = 64 + k * segW;
                ctx.fillStyle = 'rgba(255,255,255,.22)';
                ctx.fillRect(x, 40, segW - gap, 4);
                const fill = k < idx ? 1 : k === idx ? t : 0;
                if (fill > 0) {
                    const grad = ctx.createLinearGradient(x, 0, x + segW, 0);
                    grad.addColorStop(0, '#00e5ff'); grad.addColorStop(1, '#a155ff');
                    ctx.fillStyle = grad;
                    ctx.fillRect(x, 40, (segW - gap) * fill, 4);
                }
            }
        };

        startRef.current = performance.now();
        const loop = (now: number) => {
            draw((now - startRef.current) / 1000);
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
    }, [items, perMs, brand.name]);

    const download = () => {
        const canvas = canvasRef.current;
        if (!canvas || !items.length) return;
        const stream = (canvas as any).captureStream(30) as MediaStream;
        const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
            .find(m => (window as any).MediaRecorder?.isTypeSupported?.(m)) || 'video/webm';
        let rec: MediaRecorder;
        try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 }); }
        catch { alert('Запись видео не поддерживается этим браузером.'); return; }
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${brand.name.toLowerCase()}-promo.webm`; a.click();
            URL.revokeObjectURL(url);
            setRecording(false);
        };
        startRef.current = performance.now(); // ролик с начала
        setRecording(true);
        rec.start();
        setTimeout(() => { try { rec.stop(); } catch { } }, items.length * perMs + 250);
    };

    // Нет ни одного скрина — показываем сгенерированный ролик
    if (loaded && !items.length) return <PromoReel />;

    return (
        <div className="ss-reel">
            <canvas ref={canvasRef} width={W} height={H} className="ss-canvas" />
            <button className="ss-dl" onClick={download} disabled={recording || !items.length}>
                {recording ? '● Запись ролика…' : '⬇ Скачать ролик (.webm)'}
            </button>
        </div>
    );
};

export default ScreenshotReel;
