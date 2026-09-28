/*
 * Ролик «Zvon 3.0» при первом запуске новой версии (components/UpdateIntro).
 * Проверка вынесена отдельно, чтобы Main не тянул сам компонент всем подряд.
 */
const INTRO_KEY = 'zvon:intro-shown:3.0';

export const wasUpdateIntroShown = () => { try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return true; } };
export const markUpdateIntroShown = () => { try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* без хранилища ролик в этой сессии больше не покажем */ } };

/**
 * Показывать ли ролик: только настольный клиент (есть IPC) версии 3.0.x и
 * только если на этом устройстве его ещё не показывали. Из того же кода
 * собираются переходный Electron 2.9.x и веб-версия — там ролика нет.
 */
export async function shouldShowUpdateIntro(): Promise<boolean> {
    if (wasUpdateIntroShown()) return false;
    const ipc = (window as any).electron?.ipc;
    if (!ipc) return false;
    try {
        const version: string = await ipc.invoke('get-app-version');
        return /^3\.0\./.test(String(version || ''));
    } catch {
        return false;
    }
}
