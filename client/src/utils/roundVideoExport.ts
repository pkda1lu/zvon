/**
 * Сохранение видеосообщения кружком.
 *
 * Сам файл видеосообщения прямоугольный — кружком его делает только плеер.
 * При скачивании кадры перерисовываются в WebGL: по центру кружок с видео,
 * вокруг — серый «туман» из шейдера до прямоугольного кадра 720×1280,
 * в углу значок Zvon. Результат пишется MediaRecorder'ом вместе со звуком.
 *
 * Запись идёт в реальном времени (кружки короткие): видео проигрывается
 * беззвучно для пользователя — звук уходит только в запись.
 */
import { parseDurationFromFilename } from '../components/MediaControls';

const OUT_W = 720;
const OUT_H = 1280;
const CIRCLE = { x: OUT_W / 2, y: OUT_H * 0.46, r: 300 };
const LOGO = { size: 84, margin: 40 };
const FPS = 30;
const LOGO_SRC = `${import.meta.env.BASE_URL}icon.png`;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Серый туман: два слоя fbm-шума медленно плывут навстречу, сверху виньетка
// и зерно. Кружок — с мягкой тенью и тонким светлым кантом.
const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_video;
uniform sampler2D u_logo;
uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_crop;      // смещение и масштаб UV квадратной части кадра
uniform vec3 u_circle;    // центр и радиус, px
uniform vec4 u_logoRect;  // x, y, w, h, px
uniform float u_logoReady;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 p = px / u_res.y;

  float n1 = fbm(p * 2.2 + vec2(u_time * 0.035, -u_time * 0.025));
  float n2 = fbm(p * 4.1 - vec2(u_time * 0.02, u_time * 0.04));
  float g = mix(0.17, 0.36, n1 * 0.7 + n2 * 0.3);
  g += (0.5 - v_uv.y) * 0.06;
  vec2 c = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float vig = smoothstep(1.05, 0.2, length(c));
  vec3 col = vec3(g) * mix(0.55, 1.0, vig);

  float d = length(px - u_circle.xy) - u_circle.z;
  col *= 1.0 - smoothstep(48.0, -6.0, d) * 0.5;               // тень
  col = mix(col, vec3(0.9), smoothstep(2.5, 0.0, abs(d - 1.0)) * 0.22); // кант

  if (d < 1.5) {
    vec2 cuv = (px - (u_circle.xy - u_circle.z)) / (2.0 * u_circle.z);
    vec3 v = texture2D(u_video, u_crop.xy + cuv * u_crop.zw).rgb;
    col = mix(col, v, smoothstep(1.0, -1.0, d));
  }

  if (u_logoReady > 0.5) {
    vec2 luv = (px - u_logoRect.xy) / u_logoRect.zw;
    if (luv.x >= 0.0 && luv.y >= 0.0 && luv.x <= 1.0 && luv.y <= 1.0) {
      vec4 l = texture2D(u_logo, luv);
      col = mix(col, l.rgb, l.a * 0.92);
    }
  }

  col += (hash(px + fract(u_time) * 97.0) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;

const pickMime = (): { mime: string; ext: string } => {
  const options: [string, string][] = [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [mime, ext] of options) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return { mime: '', ext: 'webm' };
};

const compile = (gl: WebGLRenderingContext, type: number, src: string) => {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
};

const makeTexture = (gl: WebGLRenderingContext) => {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
};

const loadImage = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/** Имя файла результата: «zvon-<исходное имя>.<mp4|webm>». */
export const roundExportFilename = (filename: string, ext: string) =>
  `zvon-${filename.replace(/\.[^.]+$/, '')}.${ext}`;

/**
 * Перерисовать видеосообщение кружком. onProgress — доля 0…1.
 * signal — отмена (из панели передач).
 */
export async function renderRoundVideo(
  url: string,
  filename: string,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; ext: string }> {
  // Файл целиком в память: так видео не тормозит на сети во время записи,
  // и canvas не «затейнчивается» (blob: — тот же источник).
  const res = await fetch(url, { mode: 'cors', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const srcUrl = URL.createObjectURL(await res.blob());

  const video = document.createElement('video');
  video.src = srcUrl;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('видео не открылось'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL недоступен');

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program');
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  gl.uniform2f(u('u_res'), OUT_W, OUT_H);
  gl.uniform3f(u('u_circle'), CIRCLE.x, CIRCLE.y, CIRCLE.r);
  gl.uniform4f(u('u_logoRect'), OUT_W - LOGO.size - LOGO.margin, OUT_H - LOGO.size - LOGO.margin, LOGO.size, LOGO.size);
  gl.uniform1i(u('u_video'), 0);
  gl.uniform1i(u('u_logo'), 1);

  // Квадратная середина кадра — то, что видно в кружке.
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1, side = Math.min(vw, vh);
  gl.uniform4f(u('u_crop'), (vw - side) / 2 / vw, (vh - side) / 2 / vh, side / vw, side / vh);

  gl.activeTexture(gl.TEXTURE1);
  makeTexture(gl);
  const logo = await loadImage(LOGO_SRC);
  if (logo) {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, logo);
  }
  gl.uniform1f(u('u_logoReady'), logo ? 1 : 0);

  gl.activeTexture(gl.TEXTURE0);
  makeTexture(gl);
  const uTime = u('u_time');
  const t0 = performance.now();
  const draw = () => {
    if (video.readyState >= 2) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    gl.uniform1f(uTime, (performance.now() - t0) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  draw();

  // Звук — только в запись: источник не подключён к динамикам.
  const stream = canvas.captureStream(FPS);
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContext();
    await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaElementSource(video).connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch {
    video.muted = true; // без звука, но кружок всё равно сохранится
  }

  const { mime, ext } = pickMime();
  const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  // У записей MediaRecorder длительность часто Infinity — тогда берём её из имени.
  const knownDuration = () => (isFinite(video.duration) && video.duration > 0)
    ? video.duration
    : parseDurationFromFilename(filename) || 0;

  let raf = 0, timer = 0, done = false;
  const loop = () => {
    if (done) return;
    draw();
    const dur = knownDuration();
    if (dur > 0) onProgress(Math.min(0.99, video.currentTime / dur));
    // Во свёрнутом окне requestAnimationFrame засыпает — переходим на таймер.
    if (document.hidden) timer = window.setTimeout(loop, 1000 / FPS);
    else raf = requestAnimationFrame(loop);
  };

  const cleanup = () => {
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    video.pause();
    stream.getTracks().forEach((t) => t.stop());
    audioCtx?.close().catch(() => {});
    URL.revokeObjectURL(srcUrl);
  };

  try {
    recorder.start(250);
    loop();
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Отменено', 'AbortError'));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      video.onended = () => resolve();
      video.onerror = () => reject(new Error('ошибка воспроизведения'));
      // Подстраховка: видео «зависло» и не закончилось.
      const limit = (knownDuration() || 120) * 1000 + 10_000;
      window.setTimeout(() => resolve(), limit);
      video.play().catch(reject);
    });
    draw(); // последний кадр
    await new Promise((r) => setTimeout(r, 150));
    recorder.stop();
    await stopped;
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    cleanup();
  }

  onProgress(1);
  return { blob: new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] }), ext };
}
