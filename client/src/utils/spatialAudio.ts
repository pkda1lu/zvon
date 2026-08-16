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
 * Параметры затухания подобраны под комнату 20x20 (см. ROOM_HALF в Room3DView).
 *   refDistance   — до этого расстояния громкость не падает: «личный круг»;
 *   maxDistance   — дальше этого не затухает, чтобы человек не пропадал совсем;
 *   rolloffFactor — крутизна: чем больше, тем быстрее отдаляется собеседник.
 */
const PANNER_SETTINGS = {
    panningModel: 'HRTF' as PanningModelType,
    distanceModel: 'inverse' as DistanceModelType,
    refDistance: 2.5,
    maxDistance: 18,
    rolloffFactor: 1.6,
};

/**
 * У каждого участника СВОЙ AudioContext — так устроен RemoteAudioElement в
 * VoiceContext. Значит и слушатель (AudioListener) у каждого контекста свой, и
 * позу нужно задавать во всех, а не в одном. Первая версия держала единственный
 * контекст, и пространственным звук получался только для одного собеседника.
 *
 * По той же причине время для автоматизации берётся у контекста конкретного
 * узла: currentTime у разных контекстов не совпадает, и чужое время означало бы
 * планирование в прошлое или далёкое будущее.
 */
const panners = new Map<string, { panner: PannerNode; ctx: AudioContext }>();
const positions = new Map<string, Vec2>();
let listenerPose: { pos: Vec2; forward: Vec2 } = { pos: { x: 0, z: 0 }, forward: { x: 0, z: -1 } };

// Предпочтение читается здесь, а не в настройках: иначе выключенный режим
// возвращался бы после перезагрузки у всех, кто не заходил в настройки повторно.
const STORAGE_KEY = 'spatialAudioEnabled';
let enabled = (() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { return true; }
})();

/** Плавно ведёт AudioParam к значению — резкие скачки дают щелчки. */
const glide = (param: AudioParam | undefined, value: number, ctx: AudioContext | null) => {
    if (!param) return;
    if (ctx) param.setTargetAtTime(value, ctx.currentTime, SMOOTHING);
    else param.value = value;
};

const applyPosition = (userId: string) => {
    const entry = panners.get(userId);
    const pos = positions.get(userId);
    if (!entry || !pos) return;
    const { panner, ctx } = entry;

    // При выключенном режиме сводим источник в точку слушателя — расстояние и
    // направление перестают влиять. Проверка нужна именно здесь: иначе первое
    // же перемещение участника вернуло бы панораму, несмотря на настройку.
    const target = enabled ? pos : listenerPose.pos;

    // Плоскость комнаты (x, z) ложится на оси WebAudio один в один: y — высота,
    // всех участников держим на одном уровне.
    glide(panner.positionX, target.x, ctx);
    glide(panner.positionY, 0, ctx);
    glide(panner.positionZ, target.z, ctx);
};

/**
 * Регистрирует узел панорамирования для участника.
 * Вызывает аудиослой при создании графа воспроизведения.
 */
export const registerPanner = (userId: string, panner: PannerNode, ctx: AudioContext) => {
    Object.assign(panner, PANNER_SETTINGS);
    panners.set(userId, { panner, ctx });
    // Если координаты пришли раньше узла — применяем сразу, иначе участник
    // будет слышен из центра комнаты до первого своего движения.
    applyPosition(userId);
    applyListener();
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

/** Поза слушателя задаётся во ВСЕХ контекстах — у каждого участника свой. */
const applyListener = () => {
    const { pos, forward } = listenerPose;
    const seen = new Set<AudioContext>();

    panners.forEach(({ ctx }) => {
        if (seen.has(ctx)) return;
        seen.add(ctx);
        const l = ctx.listener;

        // Современный интерфейс — AudioParam, старый — setPosition/setOrientation.
        // Safari до недавнего времени поддерживал только второй.
        if (l.positionX) {
            glide(l.positionX, pos.x, ctx);
            glide(l.positionY, 0, ctx);
            glide(l.positionZ, pos.z, ctx);
            glide(l.forwardX, forward.x, ctx);
            glide(l.forwardY, 0, ctx);
            glide(l.forwardZ, forward.z, ctx);
            glide(l.upX, 0, ctx);
            glide(l.upY, 1, ctx);
            glide(l.upZ, 0, ctx);
        } else {
            const anyL = l as any;
            anyL.setPosition?.(pos.x, 0, pos.z);
            anyL.setOrientation?.(forward.x, 0, forward.z, 0, 1, 0);
        }
    });
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

/** Сброс при выходе из комнаты — позиции прошлой комнаты не должны утекать. */
export const resetSpatialAudio = () => {
    positions.clear();
    listenerPose = { pos: { x: 0, z: 0 }, forward: { x: 0, z: -1 } };
};
