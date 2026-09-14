import React, { useEffect, useRef } from 'react';
import './VibeBackground.css';

/**
 * Живой фон — «краска в воде».
 *
 * Тот же приём, что на экране «Моей волны» в мини-приложении Яндекс.Музыки
 * (`server/public/miniapps/yandex-music/app.js`): FBM-шум с доменным
 * искажением, когда каждый следующий слой шума смещает координаты предыдущего.
 * Отсюда завихрения и жилки, которых не даёт ни один набор CSS-градиентов.
 *
 * Почему не просто картинка или CSS-анимация: страница входа должна выглядеть
 * живой, но не отвлекать. Рисунок здесь меняется целиком примерно за девять
 * секунд — на глаз это «дышит», а не мельтешит, и не перетягивает внимание с
 * текста. Палитра при этом от Zvon, чтобы Vlyne ID читался как часть той же
 * экосистемы, а не как чужой сервис.
 *
 * Стоимость намеренно низкая: кадр считается в буфер шириной 320 пикселей и
 * растягивается средствами CSS. Картинка сплошь низкочастотная, терять нечему,
 * зато шейдер обсчитывает десятки тысяч пикселей вместо миллиона.
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_c1, u_c2, u_c3, u_c4;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + 100.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv * 3.0;
  p.x *= u_res.x / u_res.y;
  float t = u_time * 0.08;

  vec2 q = vec2(fbm(p + vec2(0.0, t)),
                fbm(p + vec2(5.2, 1.3 - t)));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * t),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) - 0.13 * t));
  float f = fbm(p + 4.0 * r);

  vec3 col = mix(u_c1, u_c2, clamp(f * f * 2.4, 0.0, 1.0));
  col = mix(col, u_c3, clamp(length(q) * 0.85, 0.0, 1.0));
  col = mix(col, u_c4, clamp(r.x * 0.45, 0.0, 1.0));
  col *= 0.55 + 0.65 * f;

  float vig = smoothstep(1.3, 0.3, length(uv - 0.5));
  col *= mix(0.5, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}`;

const RENDER_W = 320;
const FPS = 30;

/** Палитра Zvon: глубокая основа, синий и фиолетовый, лёгкое касание циана. */
const DEFAULT_COLORS = ['#06060e', '#131335', '#5b23e0', '#00e5ff'];

function hexToRgb(hex: string): [number, number, number] {
    const m = hex.trim().replace('#', '');
    const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    const n = parseInt(full, 16);
    if (!isFinite(n) || full.length !== 6) return [0.1, 0.1, 0.12];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[vibe] шейдер не собрался:', gl.getShaderInfoLog(sh));
        return null;
    }
    return sh;
}

interface VibeBackgroundProps {
    className?: string;
    colors?: string[];
    /**
     * Затемняющая вуаль поверх холста. Нужна там, где текст лежит прямо на
     * фоне (страницы Vlyne ID). В основном приложении контент живёт на своих
     * стеклянных подложках, которые затемняют фон сами, — там вуаль только
     * гасит картинку второй раз, поэтому её отключают.
     */
    veil?: boolean;
}

const VibeBackground: React.FC<VibeBackgroundProps> = ({ className = '', colors, veil = true }) => {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;

        // Движение на весь экран — не то, что стоит навязывать тем, кто просил
        // его убрать. Остаётся статичная подложка из CSS.
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

        const gl = (canvas.getContext('webgl', { antialias: false, depth: false, alpha: false })
            || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        // WebGL может быть недоступен (старый браузер, программный рендер
        // отключён) — это не ошибка, CSS-слои под холстом справятся сами.
        if (!gl || gl.isContextLost()) return;

        const vs = compile(gl, gl.VERTEX_SHADER, VERT);
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return;

        const prog = gl.createProgram();
        if (!prog) return;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn('[vibe] программа не слинковалась:', gl.getProgramInfoLog(prog));
            return;
        }
        gl.useProgram(prog);

        // Один треугольник с запасом перекрывает экран — дешевле двух.
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const uRes = gl.getUniformLocation(prog, 'u_res');
        const uTime = gl.getUniformLocation(prog, 'u_time');
        const uColors = ['u_c1', 'u_c2', 'u_c3', 'u_c4'].map((n) => gl.getUniformLocation(prog, n));

        const palette = (colors && colors.length === 4 ? colors : DEFAULT_COLORS).map(hexToRgb);
        palette.forEach((c, i) => gl.uniform3f(uColors[i], c[0], c[1], c[2]));

        let raf = 0;
        let lastDraw = 0;
        let startTs = performance.now();
        let pausedAt = 0;

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const w = RENDER_W;
            const h = Math.max(1, Math.round((RENDER_W * rect.height) / rect.width));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
        };

        const frame = (ts: number) => {
            raf = requestAnimationFrame(frame);
            if (ts - lastDraw < 1000 / FPS) return;
            lastDraw = ts;
            resize();
            gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.uniform1f(uTime, (ts - startTs) / 1000);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // Холст показываем только после первого нарисованного кадра.
            // Контекст создаётся с alpha: false, поэтому пустой холст — это
            // непрозрачный чёрный прямоугольник: если бы дальше инициализации
            // дело не дошло, он закрыл бы собой запасную подложку.
            canvas.classList.add('is-ready');
        };

        // Смотреть на фон некому — не считаем его.
        //
        // Источник правды тот же, что у остальных декоративных слоёв: класс
        // .app-idle на <html> (см. useIdleAnimationPause в App.tsx). Он
        // покрывает и свёрнутое окно, и потерю фокуса, и пятнадцать секунд
        // без ввода. Остановить CSS-анимацию можно было правилом
        // animation-play-state, а цикл requestAnimationFrame — только кодом,
        // поэтому здесь следим за классом руками. Шейдер — самый дорогой из
        // декоративных слоёв, и выигрыш от паузы у него наибольший.
        const root = document.documentElement;
        const shouldRun = () => !document.hidden && !root.classList.contains('app-idle');

        const sync = () => {
            if (shouldRun()) {
                if (raf) return;
                // Время сдвигаем на длительность паузы, иначе рисунок
                // «перепрыгнет» вперёд на всё время простоя.
                if (pausedAt) startTs += performance.now() - pausedAt;
                pausedAt = 0;
                lastDraw = 0;
                raf = requestAnimationFrame(frame);
            } else if (raf) {
                cancelAnimationFrame(raf);
                raf = 0;
                pausedAt = performance.now();
            }
        };

        document.addEventListener('visibilitychange', sync);
        const idleObserver = new MutationObserver(sync);
        idleObserver.observe(root, { attributes: true, attributeFilter: ['class'] });

        resize();
        if (shouldRun()) raf = requestAnimationFrame(frame);

        return () => {
            document.removeEventListener('visibilitychange', sync);
            idleObserver.disconnect();
            if (raf) cancelAnimationFrame(raf);
            // Контекст здесь НЕ убиваем намеренно. loseContext() ломает его
            // насовсем, а getContext() на том же элементе возвращает тот же
            // самый объект — после любого повторного монтирования (возврат на
            // страницу, двойной вызов эффектов в StrictMode) рисовать было бы
            // уже некуда, и фон оставался бы пустым. Достаточно остановить
            // кадры: контекст уйдёт вместе с самим элементом.
        };
    }, [colors]);

    return (
        <div className={`vibe-bg ${className}`} aria-hidden="true">
            <canvas ref={ref} className="vibe-bg-canvas" />
            {veil && <div className="vibe-bg-veil" />}
        </div>
    );
};

export default VibeBackground;
