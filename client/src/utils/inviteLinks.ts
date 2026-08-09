// Возвращает правильный домен для генерации ссылок-приглашений:
// если открыто в браузере (наzvonserver.ru или maxcord.fun и т.д.) — использует текущий domain/origin.
// если открыто в Electron / EXE (file://, app://) — определяет бренд (maxcord.fun для maxcord, иначе zvonserver.ru).
export const getInviteBaseUrl = (): string => {
    if (typeof window !== 'undefined') {
        const origin = window.location.origin;
        if (origin && !origin.includes('file://') && !origin.includes('app://') && !origin.includes('localhost:3000') && !origin.includes('127.0.0.1')) {
            // Если в обычном браузере на реальном домене (например https://maxcord.fun или https://zvonserver.ru)
            const host = window.location.hostname;
            if (host.includes('maxcord.fun')) return 'https://maxcord.fun';
            if (host.includes('zvonserver.ru')) return 'https://zvonserver.ru';
            return origin.replace(/\/$/, '');
        }

        // Если в EXE (Electron, file://, app://, etc.) или на локале dev
        const host = window.location.hostname;
        if (host.includes('maxcord.fun')) return 'https://maxcord.fun';
    }

    return 'https://zvonserver.ru';
};

export const getInviteUrl = (code: string): string => {
    return `${getInviteBaseUrl()}/invite/${code}`;
};

// Утилиты для обработки ссылок-приглашений на сервер внутри сообщений.
// Ссылка имеет вид https://<host>/invite/<code> (или zvon://invite/<code>).

// Глобальный матч всех ссылок-приглашений в тексте.
const INVITE_LINK_GLOBAL = /(?:https?:\/\/[^\s]+|zvon:\/\/[^\s]*)?\/?invite\/([A-Za-z0-9]+)/g;
// Проверка одного «куска» текста (например, уже выделенной ссылки).
const INVITE_LINK_SINGLE = /^(?:https?:\/\/[^\s]+|zvon:\/\/[^\s]*)?\/?invite\/([A-Za-z0-9]+)\/?$/;

// Возвращает код приглашения, если строка целиком является ссылкой-приглашением.
export const matchInviteCode = (url: string): string | null => {
    if (!url) return null;
    const m = url.match(INVITE_LINK_SINGLE);
    return m ? m[1] : null;
};

// Извлекает все коды приглашений из текста сообщения (без дубликатов, в порядке появления).
export const extractInviteCodes = (content: string): string[] => {
    if (!content) return [];
    const codes: string[] = [];
    let m: RegExpExecArray | null;
    INVITE_LINK_GLOBAL.lastIndex = 0;
    while ((m = INVITE_LINK_GLOBAL.exec(content)) !== null) {
        if (m[1] && !codes.includes(m[1])) codes.push(m[1]);
    }
    return codes;
};

// Открывает приглашение внутри приложения: показывает модалку-приглашение на сервер.
// Снаружи (в браузере) та же ссылка ведёт на страницу /invite/<code>.
export const openInviteInApp = (code: string) => {
    window.dispatchEvent(new CustomEvent('open-invite', { detail: { code } }));
};

