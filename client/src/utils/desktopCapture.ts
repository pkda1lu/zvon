/*
 * Поток демонстрации экрана в настольном клиенте.
 *
 * Electron: источник выбран своим пикером (desktopCapturer), поток открывается
 * по chromeMediaSourceId.
 *
 * Tauri (WebView2): открыть поток по id источника нельзя. Пикер получает два
 * источника — 'tauri:monitor' и 'tauri:window', — а конкретное окно или экран
 * выбирается системным окном getDisplayMedia с подсказкой типа поверхности.
 */

export const isSystemPickerSource = (sourceId?: string | null): boolean =>
    !!sourceId && sourceId.startsWith('tauri:');

export async function openDesktopSource(sourceId: string, frameRate: number): Promise<MediaStream> {
    if (isSystemPickerSource(sourceId)) {
        return navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: { ideal: frameRate },
                displaySurface: sourceId === 'tauri:window' ? 'window' : 'monitor',
            },
            // Звук берёт нативный захват процесса, как и в Electron.
            audio: false,
            selfBrowserSurface: 'exclude',
        } as any);
    }
    return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxFrameRate: frameRate } } as any,
    } as any);
}

/*
 * Id источника для захвата звука (nativeAudio.ts ждёт формат desktopCapturer:
 * 'window:<HWND>:0' — звук этого окна, иначе — всё, кроме самого Zvon).
 * У дорожки getDisplayMedia Chromium ставит метку в том же формате, поэтому
 * выбранное в системном окне приложение находится по ней.
 */
export function nativeAudioSourceId(sourceId: string, stream: MediaStream): string {
    if (!isSystemPickerSource(sourceId)) return sourceId;
    const label = stream.getVideoTracks()[0]?.label || '';
    return /^window:\d+:/.test(label) ? label : 'screen:0:0';
}
