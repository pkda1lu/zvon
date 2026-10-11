/*
 * Всплывающее окно трансляции.
 *
 * Окно держит свой <video>, живущий вне React: плитка трансляции
 * размонтируется, как только человек уходит из голосового канала в чат, а
 * окно должно остаться поверх всего, пока идёт эфир. Звук трансляции на время
 * окна играет оно, а плитка молчит (subscribeStreamPip), иначе звук двоится.
 *
 * Два исполнения:
 *  • настольный клиент — собственное окно Zvon. window.open с меткой
 *    STREAM_PIP_URL перехватывает Tauri (src-tauri/src/windows.rs) и
 *    открывает настоящее окно поверх остальных, связанное с этой страницей, —
 *    в него кладём <video> с той же трансляцией и свои кнопки. Системное
 *    «картинка в картинке» здесь не годится: его «Вернуться на вкладку» и
 *    «Параметры» в WebView2 ничего не делают, а убрать их нельзя;
 *  • веб — системное «картинка в картинке» браузера, там эти кнопки работают.
 */

type Listener = (key: string | null) => void;

export interface StreamPipOptions {
    muted: boolean;
    volume: number;
    /** Окно открылось само (ушли со страницы канала / свернули звонок). */
    auto?: boolean;
    /** Подпись окна — чья трансляция. */
    title?: string;
    /** «Вернуться в Zvon»: открыть канал или развернуть звонок. */
    onReturn?: () => void;
}

const STREAM_PIP_URL = 'about:blank#zvon-stream-pip';

let currentKey: string | null = null;
// Окно, открытое само, при возвращении закрываем. Открытое кнопкой не трогаем.
let openedAutomatically = false;
// Номер текущего открытия: закрытие или новое открытие отменяют незавершённое,
// а запоздавшие события прежнего окна не сбрасывают новое.
let session = 0;
let opening = false;
let cleanup: (() => void) | null = null;
let activeVideo: HTMLVideoElement | null = null;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach(l => l(currentKey));
const ipc = () => (window as any).electron?.ipc;
const isDesktop = () => !!ipc();

export const isStreamPipSupported = () =>
    typeof document !== 'undefined' && (isDesktop() || !!document.pictureInPictureEnabled);

function reset() {
    cleanup?.();
    cleanup = null;
    activeVideo = null;
    openedAutomatically = false;
    if (currentKey !== null) {
        currentKey = null;
        notify();
    }
}

/** Закрыть окно, когда эфир закончился. */
function watchStreamEnd(stream: MediaStream): () => void {
    // Трек, остановленный своей же стороной (LiveKit делает track.stop() при
    // выходе из комнаты), события 'ended' не присылает — поэтому ещё и опрос.
    const onEnded = () => { if (!stream.getVideoTracks().some(t => t.readyState === 'live')) closeStreamPip(); };
    stream.getVideoTracks().forEach(t => t.addEventListener('ended', onEnded));
    stream.addEventListener('removetrack', onEnded);
    const poll = window.setInterval(onEnded, 2000);
    return () => {
        window.clearInterval(poll);
        stream.getVideoTracks().forEach(t => t.removeEventListener('ended', onEnded));
        stream.removeEventListener('removetrack', onEnded);
    };
}

// --- настольный клиент: своё окно ---------------------------------------------

const POPUP_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; cursor: pointer;
    font-family: 'Segoe UI', system-ui, sans-serif; color: #fff; user-select: none; }
  video { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; pointer-events: none; }
  .top { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 8px;
    padding: 8px 8px 22px 12px; background: linear-gradient(rgba(0,0,0,.72), transparent);
    opacity: 0; transition: opacity .16s ease; }
  .hint { position: fixed; left: 0; right: 0; bottom: 0; padding: 22px 12px 10px; font-size: 12px;
    color: rgba(255,255,255,.82); background: linear-gradient(transparent, rgba(0,0,0,.62));
    opacity: 0; transition: opacity .16s ease; }
  body.hover .top, body.hover .hint { opacity: 1; }
  .name { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .live { display: inline-block; margin-right: 8px; padding: 1px 6px; border-radius: 6px; font-size: 11px;
    font-weight: 700; background: #f23f42; vertical-align: 1px; }
  .close { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
    border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.55); color: #fff;
    cursor: pointer; transition: background .15s ease, border-color .15s ease, color .15s ease; }
  .close:hover { background: rgba(237,66,69,.2); border-color: rgba(237,66,69,.6); color: #ff6b6e; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2;
    stroke-linecap: round; stroke-linejoin: round; }
`;

const ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';

/*
 * Окно в настольном клиенте одно и живёт дольше одной трансляции.
 *
 * Новый window.open, пока прежнее окно трансляции ещё существует (или только
 * закрывается), намертво вешает WebView2 — и новое окно, и сам Zvon: у них
 * общий процесс отрисовки. Поэтому: переключение трансляции переиспользует
 * открытое окно (меняется только содержимое), а новое окно открывается лишь
 * после того, как прежнее закрылось полностью.
 */
let desktopWin: Window | null = null;
let desktopClosing = false;

const closeDesktopWindows = () => {
    if (desktopWin && !desktopWin.closed) desktopClosing = true;
    ipc()?.send('stream-pip-close');
};

async function acquireDesktopWindow(my: number): Promise<Window | null> {
    if (desktopWin && !desktopWin.closed && !desktopClosing) return desktopWin;
    if (desktopWin && !desktopWin.closed) {
        // Прежнее ещё закрывается — ждём, иначе window.open повиснет.
        for (let i = 0; i < 60 && !desktopWin.closed; i++) await new Promise(r => setTimeout(r, 50));
        if (!desktopWin.closed) throw new Error('прежнее окно трансляции не закрылось');
    }
    if (my !== session) return null;
    // Размер и место окна (правый нижний угол монитора) задаёт Tauri.
    const w = window.open(STREAM_PIP_URL, `zvon-stream-pip-${my}`, 'width=480,height=270');
    if (!w) throw new Error('окно трансляции не открылось');
    desktopWin = w;
    desktopClosing = false;
    // window.close() этого окна в WebView2 уничтожает лишь его содержимое в
    // обход Tauri и тоже вешает Zvon — закрываем только через Tauri.
    try { (w as any).close = closeDesktopWindows; } catch { }
    // Документ окна готов не сразу после window.open.
    for (let i = 0; i < 50 && !(w.document && w.document.body); i++) await new Promise(r => setTimeout(r, 40));
    return w;
}

async function openDesktopWindow(my: number, key: string, stream: MediaStream, opts: StreamPipOptions) {
    const w = await acquireDesktopWindow(my);
    // Пока окно готовилось, его отменили: если следом открывают другое, оно
    // возьмёт это же окно, иначе закрываем.
    if (!w || my !== session) { if (!opening) closeDesktopWindows(); return; }
    const doc = w.document;
    doc.head.querySelectorAll('style').forEach(el => el.remove());
    doc.body.replaceChildren();
    doc.body.className = '';
    doc.title = opts.title ? `${opts.title} — Zvon` : 'Трансляция — Zvon';
    const style = doc.createElement('style');
    style.textContent = POPUP_CSS;
    doc.head.appendChild(style);

    const v = doc.createElement('video');
    v.autoplay = true;
    v.playsInline = true;
    v.muted = opts.muted;
    v.volume = opts.volume;
    v.srcObject = stream;
    doc.body.appendChild(v);
    v.play().catch(() => { });

    // Окно без рамки, как в Discord: сверху ник и крестик, клик по окну —
    // назад в голосовой чат, перетаскивание за любое место — сдвиг окна.
    const top = doc.createElement('div');
    top.className = 'top';
    const name = doc.createElement('div');
    name.className = 'name';
    name.innerHTML = '<span class="live">LIVE</span>';
    name.append(opts.title || 'Трансляция');
    const close = doc.createElement('button');
    close.className = 'close';
    close.title = 'Закрыть';
    close.innerHTML = ICON_CLOSE;
    top.append(name, close);
    const hint = doc.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Нажмите, чтобы вернуться в голосовой чат';
    doc.body.append(top, hint);

    const returnToApp = () => {
        const onReturn = opts.onReturn;
        closeStreamPip();
        ipc()?.send('focus-main-window');
        onReturn?.();
    };

    // Обработчики документа снимаются вместе с этой трансляцией: окно
    // переиспользуется, и без этого они копились бы.
    const ac = new AbortController();
    const on = <K extends keyof DocumentEventMap>(target: Document | HTMLElement, type: K, fn: (e: DocumentEventMap[K]) => void) =>
        target.addEventListener(type, fn as EventListener, { signal: ac.signal });

    // Наведение — по mouseenter/leave: :hover в окне без фокуса срабатывает не всегда.
    on(doc.documentElement, 'mouseenter', () => doc.body.classList.add('hover'));
    on(doc.documentElement, 'mouseleave', () => doc.body.classList.remove('hover'));

    let press: { x: number; y: number } | null = null;
    close.addEventListener('pointerdown', e => e.stopPropagation());
    close.addEventListener('click', e => { e.stopPropagation(); closeStreamPip(); });
    on(doc, 'pointerdown', e => {
        if (e.button !== 0) return;
        press = { x: e.screenX, y: e.screenY };
    });
    on(doc, 'pointermove', e => {
        if (!press || !(e.buttons & 1)) { press = null; return; }
        if (Math.abs(e.screenX - press.x) + Math.abs(e.screenY - press.y) < 5) return;
        // Сдвинули с зажатой кнопкой — это перетаскивание, а не клик. Дальше
        // мышь ведёт Windows, pointerup сюда уже не придёт.
        press = null;
        ipc()?.send('stream-pip-drag');
    });
    on(doc, 'pointerup', e => {
        if (e.button !== 0 || !press) return;
        press = null;
        returnToApp();
    });
    on(doc, 'keydown', e => { if (e.key === 'Escape') closeStreamPip(); });

    // Окно закрыли не нашей кнопкой (Alt+F4, закрытие приложения).
    const closedPoll = window.setInterval(() => { if (w.closed && my === session) closeStreamPip(); }, 500);
    const stopEnd = watchStreamEnd(stream);
    return {
        video: v,
        // Окно не закрываем: его может взять следующая трансляция. Закрывает
        // closeStreamPip.
        dispose: () => {
            ac.abort();
            window.clearInterval(closedPoll);
            stopEnd();
            try { v.pause(); v.srcObject = null; } catch { }
        },
    };
}

// --- веб: системное «картинка в картинке» ------------------------------------

let webVideo: HTMLVideoElement | null = null;

function ensureWebVideo(): HTMLVideoElement {
    if (webVideo) return webVideo;
    const v = document.createElement('video');
    v.playsInline = true;
    v.autoplay = true;
    // В документе, но невидимый: PiP нужен элемент с загруженным кадром.
    Object.assign(v.style, {
        position: 'fixed', width: '1px', height: '1px', left: '-10px', top: '-10px',
        opacity: '0', pointerEvents: 'none',
    });
    // Событие приходит асинхронно — если уже открывается новое окно, не мешаем ему.
    v.addEventListener('leavepictureinpicture', () => {
        if (!opening && document.pictureInPictureElement !== v) reset();
    });
    document.body.appendChild(v);
    webVideo = v;
    return v;
}

async function openWebPip(my: number, stream: MediaStream, opts: StreamPipOptions) {
    const v = ensureWebVideo();
    v.srcObject = stream;
    v.muted = opts.muted;
    v.volume = opts.volume;
    await v.play().catch(() => { });
    if (v.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
            const t = window.setTimeout(() => reject(new Error('нет кадра трансляции')), 4000);
            v.addEventListener('loadedmetadata', () => { window.clearTimeout(t); resolve(); }, { once: true });
        });
    }
    if (my !== session) return null;
    await v.requestPictureInPicture();
    const stopEnd = watchStreamEnd(stream);
    return {
        video: v,
        dispose: () => {
            stopEnd();
            if (document.pictureInPictureElement === v) document.exitPictureInPicture().catch(() => { });
            v.pause();
            v.srcObject = null;
        },
    };
}

// --- общее -------------------------------------------------------------------

export async function openStreamPip(key: string, stream: MediaStream, opts: StreamPipOptions) {
    const my = ++session;
    cleanup?.();
    cleanup = null;
    opening = true;
    let handle: { video: HTMLVideoElement; dispose: () => void } | null | undefined;
    try {
        handle = isDesktop() ? await openDesktopWindow(my, key, stream, opts) : await openWebPip(my, stream, opts);
    } finally {
        if (my === session) opening = false;
    }
    if (!handle) return;
    if (my !== session) { handle.dispose(); return; }
    cleanup = handle.dispose;
    activeVideo = handle.video;
    currentKey = key;
    openedAutomatically = !!opts.auto;
    notify();
}

/** Закрыть окно, если оно открылось само и показывает подходящий источник. */
export function closeAutoStreamPip(matches: (key: string) => boolean = () => true) {
    if (openedAutomatically && currentKey !== null && matches(currentKey)) closeStreamPip();
}

/** Ключи окон личного звонка — `call:<identity>`, голосового канала — id пользователя. */
export const isCallPipKey = (key: string) => key.startsWith('call:');

export function closeStreamPip(key?: string) {
    if (key !== undefined && key !== currentKey) return;
    session++;
    opening = false;
    reset();
    if (isDesktop()) closeDesktopWindows();
}

export function setStreamPipVolume(key: string, volume: number) {
    if (activeVideo && currentKey === key) activeVideo.volume = volume;
}

export function subscribeStreamPip(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export const getStreamPipUserId = () => currentKey;
