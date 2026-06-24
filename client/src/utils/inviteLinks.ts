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
