import type { TimeFormat } from '../contexts/LanguageContext';

// Текущий формат времени из настроек (хранится LanguageContext'ом в localStorage).
// Фолбэк для мест, где неудобно прокидывать значение из контекста.
export const getTimeFormat = (): TimeFormat => {
    try {
        const saved = localStorage.getItem('language-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.timeFormat === '12h' || parsed?.timeFormat === '24h') return parsed.timeFormat;
        }
    } catch { /* ignore malformed */ }
    return '24h';
};

// «ЧЧ:ММ» с учётом выбранного формата (12ч → 1:30 PM, 24ч → 13:30).
export const formatClockTime = (
    date: Date | string | number,
    fmt: TimeFormat = getTimeFormat()
): string => {
    const d = new Date(date);
    if (fmt === '12h') {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
};
