import axios from 'axios';

/**
 * Web Push для веб-версии и PWA.
 *
 * Почему не хватает существующего `new Notification(...)` из InboxContext:
 * тот путь работает, только пока страница открыта и выполняется, и вдобавок
 * не поддерживается Safari вообще. Здесь уведомление показывает service worker,
 * поэтому оно доходит и при полностью закрытом приложении.
 *
 * Особенности iOS (Safari 16.4+), из-за которых тут столько проверок:
 *  1. Push работает ТОЛЬКО если сайт добавлен на домашний экран. В обычной
 *     вкладке Safari подписка недоступна, и это не лечится ничем, кроме
 *     установки — поэтому пользователю нужно об этом сказать явно.
 *  2. Notification.requestPermission() обязан вызываться из жеста пользователя
 *     (клик). Вызов из useEffect на монтировании молча ничего не даст.
 *  3. Подписка обязана быть userVisibleOnly — «тихие» push запрещены.
 */

export type PushStatus =
    | 'unsupported'        // браузер не умеет Web Push
    | 'ios-needs-install'  // iOS: нужно добавить на домашний экран
    | 'server-disabled'    // на сервере не настроены VAPID-ключи
    | 'denied'             // пользователь запретил уведомления
    | 'enabled'
    | 'disabled';          // всё готово, но подписки нет

export interface PushState {
    status: PushStatus;
    /** Можно ли предлагать кнопку «включить». */
    canEnable: boolean;
}

export const isIos = (): boolean =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ представляется как Mac, отличаем по наличию тач-точек.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Приложение запущено как установленная PWA, а не как вкладка браузера. */
export const isStandalone = (): boolean =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

export const isPushSupported = (): boolean =>
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

/** base64url из VAPID → Uint8Array, как того требует applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
    return output;
}

let cachedPublicKey: string | null = null;
let serverEnabled: boolean | null = null;

async function fetchServerConfig(): Promise<{ enabled: boolean; publicKey: string }> {
    if (cachedPublicKey !== null && serverEnabled !== null) {
        return { enabled: serverEnabled, publicKey: cachedPublicKey };
    }
    const { data } = await axios.get('/api/push/public-key');
    // Локальные переменные, а не поля кэша: TypeScript не сужает тип модульных
    // let-переменных после await, и возврат кэша иначе не типизируется.
    const enabled = !!data.enabled;
    const publicKey: string = data.publicKey || '';
    serverEnabled = enabled;
    cachedPublicKey = publicKey;
    return { enabled, publicKey };
}

export async function getPushState(): Promise<PushState> {
    if (!isPushSupported()) {
        // На iOS отсутствие PushManager означает именно «открыто во вкладке»:
        // после установки на домашний экран он появляется.
        if (isIos() && !isStandalone()) return { status: 'ios-needs-install', canEnable: false };
        return { status: 'unsupported', canEnable: false };
    }

    try {
        const { enabled } = await fetchServerConfig();
        if (!enabled) return { status: 'server-disabled', canEnable: false };
    } catch {
        return { status: 'server-disabled', canEnable: false };
    }

    if (Notification.permission === 'denied') return { status: 'denied', canEnable: false };

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub
        ? { status: 'enabled', canEnable: false }
        : { status: 'disabled', canEnable: true };
}

/**
 * Включает уведомления. ОБЯЗАТЕЛЬНО вызывать напрямую из обработчика клика —
 * иначе iOS проигнорирует запрос разрешения.
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
    if (!isPushSupported()) {
        return {
            ok: false,
            reason: isIos() && !isStandalone()
                ? 'На iPhone уведомления работают только после добавления на домашний экран.'
                : 'Браузер не поддерживает push-уведомления.'
        };
    }

    const { enabled, publicKey } = await fetchServerConfig();
    if (!enabled || !publicKey) {
        return { ok: false, reason: 'Push-уведомления не настроены на сервере.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        return { ok: false, reason: 'Разрешение на уведомления не выдано.' };
    }

    const reg = await navigator.serviceWorker.ready;

    // Если подписка уже есть, но оформлена под другой VAPID-ключ (например,
    // ключи на сервере пересоздали), она работать не будет — пересоздаём.
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
        const existing = sub.options?.applicationServerKey;
        const wanted = urlBase64ToUint8Array(publicKey);
        const same = existing
            ? new Uint8Array(existing as ArrayBuffer).every((b, i) => b === wanted[i])
            : false;
        if (!same) {
            try { await sub.unsubscribe(); } catch { }
            sub = null;
        }
    }

    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true, // на iOS обязательно
            applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        });
    }

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
    await axios.post('/api/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
    return { ok: true };
}

export async function disablePush(): Promise<void> {
    if (!isPushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch { }
    try { await axios.post('/api/push/unsubscribe', { endpoint }); } catch { }
}

/** Отправляет тестовое уведомление самому себе. */
export async function sendTestPush(): Promise<void> {
    await axios.post('/api/push/test');
}
