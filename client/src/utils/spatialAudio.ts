/**
 * Пространственный звук в 3D-комнатах.
 *
 * Связывает две части, которые ничего не знают друг о друге: Room3DView владеет
 * координатами участников, VoiceContext — графом воспроизведения. Хранилище
 * между ними намеренно сделано вне React.
 *
 * Почему не состояние и не контекст: позиции меняются на каждом кадре движения,
 * а обновлять узлы WebAudio нужно императивно — перерисовывать при этом дерево
 * компонентов незачем. Через состояние это было бы десятки рендеров в секунду
 * ради значений, которые React вообще не отображает.
 *
 * Схема: Room3DView зовёт setSourcePosition/setListenerPose, аудиослой
 * регистрирует свои PannerNode. Хранилище само применяет позиции к
 * зарегистрированным узлам.
 */

interface Vec2 { x: number; z: number }

/** Насколько плавно узел догоняет новую позицию, секунды. */
const SMOOTHING = 0.08;

/**
 * Половина стороны комнаты. Источник правды для всего, что зависит от её
 * размера: и сцена (Room3DView), и параметры затухания ниже считаются отсюда.
 * Раньше число стояло в двух файлах и держалось на комментарии «совпадает с
 * Room3DView» — то есть при изменении комнаты звук молча разъехался бы с ней.
 */
export const ROOM_HALF = 10;

/**
 * Затухание с расстоянием, выведено из размера комнаты, а не подобрано числами.
 *
 *   refDistance   — «личный круг»: ближе этого громкость не растёт. Примерно
 *                   четверть стороны комнаты — расстояние небольшой группы,
 *                   стоящей и разговаривающей;
 *   maxDistance   — дальше этого не затухает: человек в дальнем углу звучит
 *                   тихо, но не пропадает. Берём диагональ комнаты, чтобы
 *                   предел не наступал раньше, чем участники физически могут
 *                   разойтись;
 *   rolloffFactor — крутизна, настраивается пользователем (см. ниже).
 */
const REF_DISTANCE = ROOM_HALF / 4;
const MAX_DISTANCE = Math.round(ROOM_HALF * 2 * Math.SQRT2);

/**
 * Крутизна затухания по умолчанию.
 *
 * Замерено на OfflineAudioContext для этой комнаты (inverse, ref 2.5, max 28),
 * громкость относительно «личного круга»:
 *
 *            d=5     d=10    d=28 (дальний угол)
 *   1.6     −8.3    −15.3    −24.8 дБ
 *   1.0     −6.0    −12.0    −21.0 дБ
 *   0.8     −5.1    −10.6    −19.2 дБ
 *
 * Раньше стояло 1.6: собеседник в середине комнаты оказывался тише на 15 дБ,
 * а это уже граница разборчивости речи — приходилось подходить вплотную, чтобы
 * просто понять слова. На 1.0 расстояние по-прежнему отчётливо слышно, но
 * говорить через комнату можно.
 */
const DEFAULT_ROLLOFF = 1.0;

/**
 * Пользовательская подстройка затухания, проценты от значения по умолчанию.
 * Больше — звук глохнет быстрее, слышно только ближний круг; меньше — комната
 * звучит «ближе». Подобрать это можно только на слух, поэтому значение вынесено
 * в настройки голоса, а не зашито числом.
 */
const FALLOFF_KEY = 'spatialFalloffPercent';
const FALLOFF_MIN = 50;
const FALLOFF_MAX = 200;

const clampFalloff = (v: number) => Math.min(Math.max(Math.round(v), FALLOFF_MIN), FALLOFF_MAX);

let falloffPercent = (() => {
    try {
        const raw = Number(localStorage.getItem(FALLOFF_KEY));
        return Number.isFinite(raw) && raw > 0 ? clampFalloff(raw) : 100;
    } catch { return 100; }
})();

const currentRolloff = () => DEFAULT_ROLLOFF * (falloffPercent / 100);

const PANNER_SETTINGS = {
    panningModel: 'HRTF' as PanningModelType,
    distanceModel: 'inverse' as DistanceModelType,
    refDistance: REF_DISTANCE,
    maxDistance: MAX_DISTANCE,
};

/**
 * Общий AudioContext воспроизведения — один на всех собеседников.
 *
 * Раньше каждый RemoteAudioElement создавал свой. Для пространственного звука
 * это ломалось сразу по трём причинам:
 *
 *   1. У каждого контекста свой AudioListener, то есть позу слушателя
 *      приходилось дублировать во все контексты, и любой, зарегистрировавшийся
 *      позже, до первого обновления слышался из центра комнаты.
 *   2. Браузеры ограничивают число одновременных AudioContext (в Chromium
 *      исторически шесть). В 3D-комнате — ровно там, где участников много, —
 *      очередной new AudioContext() бросал исключение, и человека просто не
 *      было слышно.
 *   3. Каждый контекст — отдельный аудиопоток со своей свёрткой HRTF. Восемь
 *      участников означали восемь параллельных графов вместо одного.
 *
 * Контекст создаётся лениво, при первом собеседнике, и НЕ закрывается при его
 * уходе: он общий, закрытие оборвало бы звук остальным. Живёт до закрытия
 * вкладки — простаивающий контекст без источников почти ничего не стоит.
 */
let playbackCtx: AudioContext | null = null;

export const getPlaybackContext = (): AudioContext => {
    if (!playbackCtx) {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        playbackCtx = new Ctx({ latencyHint: 'interactive' }) as AudioContext;
        applyListener();
    }
    if (playbackCtx.state === 'suspended') playbackCtx.resume().catch(() => { });
    return playbackCtx;
};

/**
 * Автозапуск звука браузер разрешает только после действия пользователя.
 * Вызывать можно сколько угодно — до создания контекста ничего не делает.
 */
export const resumePlayback = () => {
    if (playbackCtx?.state === 'suspended') playbackCtx.resume().catch(() => { });
};

const panners = new Map<string, PannerNode>();
const positions = new Map<string, Vec2>();
let listenerPose: { pos: Vec2; forward: Vec2 } = { pos: { x: 0, z: 0 }, forward: { x: 0, z: -1 } };

// Предпочтение читается здесь, а не в настройках: иначе выключенный режим
// возвращался бы после перезагрузки у всех, кто не заходил в настройки повторно.
const STORAGE_KEY = 'spatialAudioEnabled';
let enabled = (() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { return true; }
})();

/**
 * Включён ли пространственный режим прямо сейчас, то есть находится ли
 * пользователь в 3D-комнате.
 *
 * Зачем флаг: узел панорамирования с моделью HRTF считает свёртку с импульсными
 * характеристиками — это дорого. А в обычном голосовом канале он бесполезен:
 * координаты туда не приходят, все источники стоят в точке слушателя.
 *
 * Аудиослой перестраивает цепочку по этому флагу: в комнате звук идёт через
 * панораму, вне комнаты — напрямую в громкость.
 */
let roomActive = false;
const routingListeners = new Set<(active: boolean) => void>();

export const setRoomActive = (on: boolean) => {
    if (roomActive === on) return;
    roomActive = on;
    routingListeners.forEach(cb => cb(on));
};

export const isRoomActive = () => roomActive;

/** Подписка аудиослоя на перестройку цепочки. Сразу сообщает текущее состояние. */
export const subscribeRouting = (cb: (active: boolean) => void) => {
    routingListeners.add(cb);
    cb(roomActive);
    return () => { routingListeners.delete(cb); };
};

/** Плавно ведёт AudioParam к значению — резкие скачки дают щелчки. */
const glide = (param: AudioParam | undefined, value: number) => {
    if (!param) return;
    if (playbackCtx) param.setTargetAtTime(value, playbackCtx.currentTime, SMOOTHING);
    else param.value = value;
};

const applyPosition = (userId: string) => {
    const panner = panners.get(userId);
    const pos = positions.get(userId);
    if (!panner || !pos) return;

    // При выключенном режиме сводим источник в точку слушателя — расстояние и
    // направление перестают влиять. Проверка нужна именно здесь: иначе первое
    // же перемещение участника вернуло бы панораму, несмотря на настройку.
    const target = enabled ? pos : listenerPose.pos;

    // Плоскость комнаты (x, z) ложится на оси WebAudio один в один: y — высота,
    // всех участников держим на одном уровне.
    glide(panner.positionX, target.x);
    glide(panner.positionY, 0);
    glide(panner.positionZ, target.z);
};

/**
 * Регистрирует узел панорамирования для участника.
 * Вызывает аудиослой при создании графа воспроизведения.
 */
export const registerPanner = (userId: string, panner: PannerNode) => {
    Object.assign(panner, PANNER_SETTINGS);
    panner.rolloffFactor = currentRolloff();
    panners.set(userId, panner);
    // Если координаты пришли раньше узла — применяем сразу, иначе участник
    // будет слышен из центра комнаты до первого своего движения.
    applyPosition(userId);
};

export const unregisterPanner = (userId: string) => {
    panners.delete(userId);
};

/** Позиция участника в комнате. Вызывается из цикла отрисовки сцены. */
export const setSourcePosition = (userId: string, x: number, z: number) => {
    positions.set(userId, { x, z });
    applyPosition(userId);
};

export const removeSource = (userId: string) => {
    positions.delete(userId);
};

/** Поза слушателя. Контекст один, поэтому и слушатель один. */
const applyListener = () => {
    if (!playbackCtx) return;
    const { pos, forward } = listenerPose;
    const l = playbackCtx.listener;

    // Современный интерфейс — AudioParam, старый — setPosition/setOrientation.
    // Safari до недавнего времени поддерживал только второй.
    if (l.positionX) {
        glide(l.positionX, pos.x);
        glide(l.positionY, 0);
        glide(l.positionZ, pos.z);
        glide(l.forwardX, forward.x);
        glide(l.forwardY, 0);
        glide(l.forwardZ, forward.z);
        glide(l.upX, 0);
        glide(l.upY, 1);
        glide(l.upZ, 0);
    } else {
        const anyL = l as any;
        anyL.setPosition?.(pos.x, 0, pos.z);
        anyL.setOrientation?.(forward.x, 0, forward.z, 0, 1, 0);
    }
};

/**
 * Положение и направление взгляда слушателя — то есть вас.
 * forward задаёт, что считается «впереди»: от этого зависит, слева или справа
 * прозвучит собеседник.
 */
export const setListenerPose = (x: number, z: number, forwardX: number, forwardZ: number) => {
    listenerPose = { pos: { x, z }, forward: { x: forwardX, z: forwardZ } };
    applyListener();
};

/**
 * Выключение возвращает плоский звук: все узлы сводятся в позицию слушателя,
 * то есть расстояние перестаёт влиять. Отключать сам узел из графа не нужно —
 * так проще и не требует пересборки цепочки.
 */
export const setSpatialEnabled = (on: boolean) => {
    enabled = on;
    try { localStorage.setItem(STORAGE_KEY, String(on)); } catch { }
    panners.forEach((_, userId) => applyPosition(userId));
};

export const isSpatialEnabled = () => enabled;

/**
 * Подстройка затухания, проценты (50–200). Применяется сразу ко всем уже
 * звучащим собеседникам, без пересборки графа — крутить ползунок можно прямо
 * во время разговора и слышать результат.
 */
export const setDistanceFalloff = (percent: number) => {
    falloffPercent = clampFalloff(percent);
    try { localStorage.setItem(FALLOFF_KEY, String(falloffPercent)); } catch { }
    const rolloff = currentRolloff();
    panners.forEach(panner => { panner.rolloffFactor = rolloff; });
};

export const getDistanceFalloff = () => falloffPercent;
export const DISTANCE_FALLOFF_RANGE = { min: FALLOFF_MIN, max: FALLOFF_MAX };

/**
 * Сброс при выходе из комнаты — позиции прошлой комнаты не должны утекать.
 *
 * Узлы сводим в центр явно, а не через applyPosition: тот берёт координаты из
 * positions и, не найдя записи, выходит молча. То есть после очистки карты
 * панорамы остались бы стоять там, где участники были в покинутой комнате, и
 * при следующем входе слышались бы оттуда до первого своего шага.
 */
export const resetSpatialAudio = () => {
    positions.clear();
    listenerPose = { pos: { x: 0, z: 0 }, forward: { x: 0, z: -1 } };
    applyListener();
    panners.forEach(panner => {
        glide(panner.positionX, 0);
        glide(panner.positionY, 0);
        glide(panner.positionZ, 0);
    });
};
