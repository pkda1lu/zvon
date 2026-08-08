/**
 * Ленивый доступ к livekit-client.
 *
 * livekit-client весит ~433 КБ (113 КБ gzip) и нужен только когда пользователь
 * реально заходит в голосовой канал или начинает звонок. Но раньше он лежал в
 * статическом графе импортов VoiceContext, который смонтирован всегда, — и
 * потому грузился при каждом входе в приложение, даже если человек за всю
 * сессию не притронулся к голосу.
 *
 * Здесь два механизма:
 *
 * 1. `loadLiveKit()` — динамический импорт с кэшированием промиса. Вызывается
 *    перед первым созданием Room; всё, что дальше происходит внутри уже
 *    подключённой комнаты, обращается к загруженному неймспейсу.
 *
 * 2. Локальные копии строковых enum'ов (`ConnectionState`, `RoomEvent`,
 *    `TrackSource`). В livekit это `enum X { A = "a" }`, то есть на рантайме —
 *    обычные строки. Сравнения вида `state === ConnectionState.Connected`
 *    поэтому можно делать без загрузки библиотеки, а UI-компоненты
 *    (ServerSidebar, VoiceControlPanel) читают состояние соединения, ещё когда
 *    голос не задействован. Значения обязаны совпадать с библиотекой —
 *    см. livekit-client/dist/src/room/Room.d.ts и .../room/events.d.ts.
 */

// Тип берём из библиотеки — `import type` стирается при компиляции и в бандл
// ничего не тянет.
import type {
    ConnectionState as LKConnectionState,
    ConnectionQuality as LKConnectionQuality,
    Track as LKTrack,
} from 'livekit-client';

export type LiveKitModule = typeof import('livekit-client');

let livekitPromise: Promise<LiveKitModule> | null = null;
let livekitModule: LiveKitModule | null = null;

/** Загружает (и кэширует) livekit-client. Повторные вызовы отдают тот же промис. */
export const loadLiveKit = (): Promise<LiveKitModule> => {
    if (!livekitPromise) {
        livekitPromise = import('livekit-client').then(m => {
            livekitModule = m;
            if (import.meta.env.DEV) assertMirrorsMatch(m);
            return m;
        });
    }
    return livekitPromise;
};

/**
 * Сверяет локальные копии enum'ов с реальной библиотекой при первой загрузке.
 * Значения ниже захардкожены, а приведение через `as` глушит проверку типов —
 * поэтому при обновлении livekit-client расхождение иначе всплыло бы только
 * сломанным голосом в проде. В дев-сборке оно приедет в консоль сразу.
 */
const assertMirrorsMatch = (m: LiveKitModule) => {
    const mismatches: string[] = [];
    const check = (group: string, mine: Record<string, unknown>, theirs: Record<string, unknown>) => {
        Object.entries(mine).forEach(([key, value]) => {
            if (theirs[key] !== value) {
                mismatches.push(`${group}.${key}: ожидалось ${JSON.stringify(theirs[key])}, у нас ${JSON.stringify(value)}`);
            }
        });
    };
    check('ConnectionState', ConnectionStates, m.ConnectionState as unknown as Record<string, unknown>);
    check('ConnectionQuality', ConnectionQualities, m.ConnectionQuality as unknown as Record<string, unknown>);
    check('Track.Source', TrackSources, m.Track.Source as unknown as Record<string, unknown>);
    if (mismatches.length) {
        console.error(
            '[livekitLazy] Локальные копии enum\'ов разошлись с livekit-client — ' +
            'обновите utils/livekitLazy.ts:\n' + mismatches.join('\n')
        );
    }
};

/**
 * Синхронный доступ к уже загруженному модулю — для мест, которые физически
 * не могут выполниться до подключения к комнате (обработчики треков и т.п.),
 * но при этом не являются async. Вернёт null, если голос ещё не задействован.
 */
export const getLoadedLiveKit = (): LiveKitModule | null => livekitModule;

/**
 * Зеркало `ConnectionState` из livekit-client, но без рантайм-импорта.
 * Типизировано как сам enum, поэтому сравнения остаются типобезопасными:
 * подмена значения сломает сборку.
 */
export const ConnectionStates: Record<
    'Disconnected' | 'Connecting' | 'Connected' | 'Reconnecting' | 'SignalReconnecting',
    LKConnectionState
> = {
    Disconnected: 'disconnected' as LKConnectionState,
    Connecting: 'connecting' as LKConnectionState,
    Connected: 'connected' as LKConnectionState,
    Reconnecting: 'reconnecting' as LKConnectionState,
    SignalReconnecting: 'signalReconnecting' as LKConnectionState,
};

/** Зеркало `Track.Source` — используется в сравнениях и опциях публикации. */
export const TrackSources: Record<
    'Camera' | 'Microphone' | 'ScreenShare' | 'ScreenShareAudio' | 'Unknown',
    LKTrack.Source
> = {
    Camera: 'camera' as LKTrack.Source,
    Microphone: 'microphone' as LKTrack.Source,
    ScreenShare: 'screen_share' as LKTrack.Source,
    ScreenShareAudio: 'screen_share_audio' as LKTrack.Source,
    Unknown: 'unknown' as LKTrack.Source,
};

/** Зеркало `ConnectionQuality` — нужно только начальное значение до подключения. */
export const ConnectionQualities: Record<
    'Excellent' | 'Good' | 'Poor' | 'Lost' | 'Unknown',
    LKConnectionQuality
> = {
    Excellent: 'excellent' as LKConnectionQuality,
    Good: 'good' as LKConnectionQuality,
    Poor: 'poor' as LKConnectionQuality,
    Lost: 'lost' as LKConnectionQuality,
    Unknown: 'unknown' as LKConnectionQuality,
};
