/*
 * Поток демонстрации экрана в настольном клиенте.
 *
 * Electron: источник выбран своим пикером (desktopCapturer), поток открывается
 * по chromeMediaSourceId.
 *
 * Tauri (WebView2): открыть поток по id источника нельзя, поэтому захват
 * выбранного окна или экрана ведёт сам клиент (openCaptureStream в шиме).
 * Id источников в обоих случаях одного формата ('screen:<n>:0',
 * 'window:<hwnd>:0'), и захват звука окна (nativeAudio.ts) работает одинаково.
 */

export async function openDesktopSource(sourceId: string, frameRate: number): Promise<MediaStream> {
    const electron = (window as any).electron;
    if (electron?.openCaptureStream) {
        return electron.openCaptureStream(sourceId, { frameRate });
    }
    return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxFrameRate: frameRate } } as any,
    } as any);
}
