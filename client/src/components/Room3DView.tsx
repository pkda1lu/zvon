import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useVoice, useVoiceLevels } from '../contexts/VoiceContext';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { setSourcePosition, setListenerPose, removeSource, resetSpatialAudio, registerPanner, unregisterPanner, setRoomActive, getPlaybackContext, resumePlayback, ROOM_HALF } from '../utils/spatialAudio';
import { Channel, Server, User } from '../types';
import { getFullUrl } from '../utils/avatar';
import { toProxiedMedia, isYouTubeUrl } from '../utils/mediaProxy';
import { drawPresenceCard, presenceCardSignature, CARD_W, CARD_H, PresenceCardHit } from '../utils/presenceCard';
import { CubeIcon, ChatIcon } from './Icons';
import './panel-hero.css';
import './VoiceChannelView.css';
import './Room3DView.css';

interface Room3DViewProps {
    channel: Channel;
    server: Server;
    onUserClick: (userId: string, event?: React.MouseEvent) => void;
    isMobile?: boolean;
    onToggleChat?: () => void;
}

// Стабильный цвет аватарки по userId — чтобы у каждого участника был свой
// узнаваемый оттенок капсулы без обращения к серверу за «профильным» цветом.
const colorForUser = (userId: string): number => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    // HSL -> приблизительный hex через встроенную конверсию three на этапе создания материала не нужен —
    // считаем вручную простую HSL->RGB, чтобы не тянуть THREE.Color на этапе модуля.
    const h = hue / 360, s = 0.65, l = 0.55;
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return (r << 16) | (g << 8) | b;
};

// Модель аватарки участника комнаты (нейтральная человеческая фигура —
// единая для всех, различие между пользователями даёт цветное кольцо у ног
// и подпись с именем, см. addAvatar).
const AVATAR_MODEL_URL = `${import.meta.env.BASE_URL}models/low_poly_female_base_character.glb`;
const AVATAR_TARGET_HEIGHT = 1.7;

const Room3DView: React.FC<Room3DViewProps> = ({ channel, server, onUserClick, onToggleChat }) => {
    const { user: currentUser } = useAuth();
    const { socket } = useSocket();

    /**
     * Пока открыта комната — аудиослой пропускает голос через панорамирование.
     * Вне комнаты узел из цепочки убирается: HRTF стоит дорого, а без координат
     * бесполезен (см. utils/spatialAudio).
     *
     * Отдельным эффектом, а не внутри инициализации сцены: там инициализация
     * асинхронная и может оборваться, а флаг обязан выключаться всегда.
     */
    useEffect(() => {
        setRoomActive(true);
        return () => { setRoomActive(false); };
    }, []);
    const {
        isConnected, activeChannelId, joinChannel, connectedUsers,
        screenStream, isScreenSharing, remoteScreenStreams,
        voicePresences, presenceVideoStreams, sendPresenceControl,
    } = useVoice();

    // Какую трансляцию показывать на экране комнаты. Чужая в приоритете: свою
    // вы и так видите у себя, а вот увидеть, что показывает собеседник, —
    // основной сценарий. Если транслируют несколько — берём первого.
    const activeScreen = useMemo(() => {
        const remote = Array.from(remoteScreenStreams.entries())[0];
        if (remote) return { stream: remote[1], own: false };
        if (isScreenSharing && screenStream) return { stream: screenStream, own: true };
        return null;
    }, [remoteScreenStreams, isScreenSharing, screenStream]);

    /**
     * Мини-приложение, выведенное в этот канал.
     *
     * Это тот же voice-presence, что в обычном голосовом канале рисуется
     * плиткой в сетке участников (PresenceTile). Ключ канала у presence —
     * `channel-<id>`, как его формирует MiniAppWindow при создании.
     *
     * Если мини-аппок несколько, берём первую: экран в комнате один.
     */
    const roomPresence = useMemo(() => {
        const key = `channel-${channel._id}`;
        for (const p of voicePresences.values()) if (p.channelId === key) return p;
        return null;
    }, [voicePresences, channel._id]);

    /**
     * Что показывать в комнате. Поверхностей две и они независимы:
     * «экран» на северной стене и «эфир» (карточка мини-аппки) на восточной.
     *
     * Раньше источник был один и они вытесняли друг друга — включив клип,
     * нельзя было видеть кнопки. Теперь конкуренция осталась только за экран:
     * демонстрация экрана перебивает клип мини-аппки, а карточка висит всегда.
     */
    const wallContent = useMemo(() => ({
        // Звук СВОЕЙ трансляции не воспроизводим — иначе слышно себя эхом.
        screen: activeScreen ? { stream: activeScreen.stream, withAudio: !activeScreen.own } : null,
        presence: roomPresence
            ? { presence: roomPresence, stream: presenceVideoStreams.get(roomPresence.sessionId) ?? null }
            : null,
    }), [activeScreen, roomPresence, presenceVideoStreams]);

    const { speakingUsers } = useVoiceLevels();

    const mountRef = useRef<HTMLDivElement>(null);
    const isConnectedToThisRoom = isConnected && activeChannelId === channel._id;

    // Всё изменяемое трёхмерное состояние держим в рефах — сцена живёт вне
    // React-рендеров, обновляется через requestAnimationFrame.
    const sceneRef = useRef<any>(null);

    // Куда слать нажатия с кнопок эфира и чем их слать.
    //
    // Через ref, а не через замыкание сцены: сцена собирается один раз при
    // входе в комнату, а presence и колбэк из контекста меняются. Замыкание
    // застряло бы на первом значении, и кнопки перестали бы работать после
    // первой же смены мини-аппки.
    const presenceControlsRef = useRef<{ channelId: string; sessionId: string } | null>(null);
    const onPresenceControlRef = useRef<typeof sendPresenceControl | null>(null);
    onPresenceControlRef.current = sendPresenceControl;
    // three.js (и GLB-модель) грузится и инициализируется асинхронно. Пока флаг
    // не взведён, sceneRef.current === null, и эффект синхронизации участников
    // не может ничего добавить. Флаг заставляет этот эффект перезапуститься ровно
    // тогда, когда сцена готова, — иначе уже присутствующие в комнате участники
    // (загруженные в connectedUsers ДО инициализации сцены) не отрисуются.
    const [sceneReady, setSceneReady] = useState(false);

    // onUserClick меняет identity почти на каждый рендер Main — держим актуальную
    // ссылку в рефе, чтобы не пересоздавать всю 3D-сцену из-за этого.
    const onUserClickRef = useRef(onUserClick);
    useEffect(() => { onUserClickRef.current = onUserClick; }, [onUserClick]);

    const getDisplayName = useCallback((u: User) => {
        const member = server.members.find(m => {
            const mId = typeof m.user === 'string' ? m.user : m.user?._id;
            return String(mId) === String(u._id);
        });
        return member?.nickname || u.username;
    }, [server.members]);

    // --- Инициализация three.js-сцены (один раз на подключение к комнате) ---
    useEffect(() => {
        if (!isConnectedToThisRoom || !mountRef.current || !currentUser) return;
        let disposed = false;
        let cleanupFn = () => {};

        (async () => {
            // @ts-ignore — типов three в проекте нет (см. Landing3D), импортируем как any
            const THREE: any = await import('three');
            // @ts-ignore — тот же повод: подмодули three/examples не типизированы
            const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
            // @ts-ignore — тот же повод: подмодули three/examples не типизированы
            const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
            const el = mountRef.current;
            if (disposed || !el) return;

            const W = el.clientWidth || 800;
            const H = el.clientHeight || 600;

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(W, H);
            renderer.setClearColor(0x0a0a12, 1);
            el.appendChild(renderer.domElement);

            const scene = new THREE.Scene();
            scene.fog = new THREE.Fog(0x0a0a12, 12, 30);

            const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
            camera.position.set(0, 6, 9);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.maxPolarAngle = Math.PI / 2.05;
            controls.minDistance = 3;
            controls.maxDistance = 20;
            controls.target.set(0, 0.5, 0);

            // Приглушённый общий свет — основную работу делают неоновые акценты
            // и три «люстры»-точечника ниже, подсветка мягче и атмосферней.
            scene.add(new THREE.AmbientLight(0x2a2a45, 0.75));
            const sun = new THREE.DirectionalLight(0xbfd6ff, 0.5);
            sun.position.set(5, 10, 5);
            scene.add(sun);

            // Глянцевый пол — не матовый бетон, а тёмное отражающее покрытие
            // киберпанк-лаунжа (даёт блики от точечных «люстр» ниже).
            const floorGeo = new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2);
            const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0b14, roughness: 0.32, metalness: 0.4 });
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            scene.add(floor);
            // Делений столько же, сколько единиц стороны — клетка ровно 1×1.
            const grid = new THREE.GridHelper(ROOM_HALF * 2, ROOM_HALF * 2, 0x00e5ff, 0x22222e);
            (grid.material as any).opacity = 0.22;
            (grid.material as any).transparent = true;
            scene.add(grid);

            // ===== Каркас комнаты: закрытый неоновый киберпанк-лаунж =====
            // Раньше комната была голой плоскостью в пустоте — теперь пол окружён
            // стенами и потолком, по периметру идёт неоновая окантовка в цветах
            // бренда (циан/фиолетовый/розовый — те же, что у блобов panel-hero),
            // а под потолком висят три цветные «люстры», подсвечивающие зал.
            // ROOM_HALF импортируется из utils/spatialAudio: от него же считаются
            // параметры затухания звука, поэтому размер комнаты задан в одном месте.
            const WALL_HEIGHT = 7;
            const NEON = { cyan: 0x00e5ff, purple: 0x7000ff, pink: 0xff2fd0 };

            const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c0c18, roughness: 0.8, metalness: 0.1 });
            const wallGeo = new THREE.PlaneGeometry(ROOM_HALF * 2, WALL_HEIGHT);

            const wallNorth = new THREE.Mesh(wallGeo, wallMat); // нормаль смотрит на +Z, в центр комнаты
            wallNorth.position.set(0, WALL_HEIGHT / 2, -ROOM_HALF);
            scene.add(wallNorth);

            const wallSouth = new THREE.Mesh(wallGeo, wallMat);
            wallSouth.position.set(0, WALL_HEIGHT / 2, ROOM_HALF);
            wallSouth.rotation.y = Math.PI; // разворачиваем нормаль на -Z, к центру
            scene.add(wallSouth);

            const wallEast = new THREE.Mesh(wallGeo, wallMat);
            wallEast.position.set(ROOM_HALF, WALL_HEIGHT / 2, 0);
            wallEast.rotation.y = -Math.PI / 2; // нормаль на -X, к центру
            scene.add(wallEast);

            const wallWest = new THREE.Mesh(wallGeo, wallMat);
            wallWest.position.set(-ROOM_HALF, WALL_HEIGHT / 2, 0);
            wallWest.rotation.y = Math.PI / 2; // нормаль на +X, к центру
            scene.add(wallWest);

            // ===== Экран для демонстрации =====
            // Висит на северной стене. Пока никто не транслирует — скрыт вместе
            // с рамкой, чтобы не занимать стену тёмным прямоугольником.
            const SCREEN_W = 9, SCREEN_H = SCREEN_W * 9 / 16;
            const SCREEN_Y = 1.1 + SCREEN_H / 2;
            const SCREEN_Z = -ROOM_HALF + 0.12;

            const screenGroup = new THREE.Group();
            screenGroup.visible = false;
            screenGroup.position.set(0, SCREEN_Y, SCREEN_Z);
            scene.add(screenGroup);

            // Рамка чуть больше полотна — даёт экрану вид объекта, а не дыры.
            const screenFrame = new THREE.Mesh(
                new THREE.PlaneGeometry(SCREEN_W + 0.3, SCREEN_H + 0.3),
                new THREE.MeshBasicMaterial({ color: 0x05050a })
            );
            screenFrame.position.z = -0.02;
            screenGroup.add(screenFrame);

            // MeshBasicMaterial намеренно: изображение не должно зависеть от
            // освещения комнаты, иначе трансляция выглядит тусклой.
            const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
            screenGroup.add(screenMesh);

            // Подсветка снизу — свет от экрана падает в зал.
            const screenGlow = new THREE.PointLight(0x88bbff, 0, 14, 2);
            screenGlow.position.set(0, SCREEN_Y, SCREEN_Z + 1.5);
            scene.add(screenGlow);

            // ===== Панель эфира =====
            // Висит на ВОСТОЧНОЙ стене, отдельно от экрана. Экран и эфир — разные
            // вещи: на экране идёт картинка (демонстрация, клип), а эфир — это
            // карточка мини-аппки с названием и кнопками. Пока они делили одно
            // полотно, включить клип и одновременно видеть управление было нельзя.
            const AIR_W = 7, AIR_H = AIR_W * 9 / 16;
            const AIR_Y = 1.3 + AIR_H / 2;
            const AIR_X = ROOM_HALF - 0.12;

            const airGroup = new THREE.Group();
            airGroup.visible = false;
            airGroup.position.set(AIR_X, AIR_Y, 0);
            airGroup.rotation.y = -Math.PI / 2;   // лицом к центру комнаты
            scene.add(airGroup);

            const airFrame = new THREE.Mesh(
                new THREE.PlaneGeometry(AIR_W + 0.26, AIR_H + 0.26),
                new THREE.MeshBasicMaterial({ color: 0x05050a })
            );
            airFrame.position.z = -0.02;
            airGroup.add(airFrame);

            const airMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const airMesh = new THREE.Mesh(new THREE.PlaneGeometry(AIR_W, AIR_H), airMat);
            airGroup.add(airMesh);

            const airGlow = new THREE.PointLight(0xffcc88, 0, 12, 2);
            airGlow.position.set(AIR_X - 1.5, AIR_Y, 0);
            scene.add(airGlow);

            const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2), wallMat);
            ceiling.position.set(0, WALL_HEIGHT, 0);
            ceiling.rotation.x = Math.PI / 2; // нормаль вниз, в комнату
            scene.add(ceiling);

            // Неоновая окантовка у основания стен — тонкие самосветящиеся полосы
            // (MeshBasicMaterial игнорирует освещение, поэтому выглядят как настоящий неон).
            const trimHeight = 0.14;
            const trimThickness = 0.06;
            const trimInset = 0.04;
            const makeTrim = (length: number, color: number) =>
                new THREE.Mesh(new THREE.BoxGeometry(length, trimHeight, trimThickness), new THREE.MeshBasicMaterial({ color }));

            const trimNorth = makeTrim(ROOM_HALF * 2 - 0.4, NEON.cyan);
            trimNorth.position.set(0, trimHeight / 2, -ROOM_HALF + trimInset);
            scene.add(trimNorth);
            const trimSouth = makeTrim(ROOM_HALF * 2 - 0.4, NEON.pink);
            trimSouth.position.set(0, trimHeight / 2, ROOM_HALF - trimInset);
            scene.add(trimSouth);
            const trimEast = makeTrim(ROOM_HALF * 2 - 0.4, NEON.purple);
            trimEast.rotation.y = Math.PI / 2;
            trimEast.position.set(ROOM_HALF - trimInset, trimHeight / 2, 0);
            scene.add(trimEast);
            const trimWest = makeTrim(ROOM_HALF * 2 - 0.4, NEON.purple);
            trimWest.rotation.y = Math.PI / 2;
            trimWest.position.set(-ROOM_HALF + trimInset, trimHeight / 2, 0);
            scene.add(trimWest);

            // Светящиеся угловые колонны — задают вертикальный ритм и глубину зала.
            const cornerColors = [NEON.cyan, NEON.pink, NEON.purple, NEON.cyan];
            const cornerPositions: Array<[number, number]> = [
                [ROOM_HALF - 0.14, ROOM_HALF - 0.14],
                [ROOM_HALF - 0.14, -ROOM_HALF + 0.14],
                [-ROOM_HALF + 0.14, ROOM_HALF - 0.14],
                [-ROOM_HALF + 0.14, -ROOM_HALF + 0.14],
            ];
            cornerPositions.forEach(([x, z], i) => {
                const pillar = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, WALL_HEIGHT, 0.12),
                    new THREE.MeshBasicMaterial({ color: cornerColors[i], transparent: true, opacity: 0.85 })
                );
                pillar.position.set(x, WALL_HEIGHT / 2, z);
                scene.add(pillar);
            });

            // Мягкое цветное «облако» на потолке и лужа отражения на полу — тот же
            // приём с радиальными градиентами, что и .panel-hero-bg .blob в 2D-интерфейсе,
            // только нарисованный на canvas-текстуре, чтобы пол/потолок не были однотонными.
            const makeGlowTexture = () => {
                const size = 512;
                const canvas = document.createElement('canvas');
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d')!;
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, size, size);
                const blobs = [
                    { x: size * 0.22, y: size * 0.28, r: size * 0.32, color: 'rgba(0,229,255,0.55)' },
                    { x: size * 0.78, y: size * 0.7, r: size * 0.36, color: 'rgba(112,0,255,0.5)' },
                    { x: size * 0.6, y: size * 0.22, r: size * 0.22, color: 'rgba(255,47,208,0.4)' },
                ];
                blobs.forEach(b => {
                    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
                    grad.addColorStop(0, b.color);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                    ctx.fill();
                });
                return new THREE.CanvasTexture(canvas);
            };
            const glowTex = makeGlowTexture();

            const ceilingGlow = new THREE.Mesh(
                new THREE.PlaneGeometry(ROOM_HALF * 2 - 0.2, ROOM_HALF * 2 - 0.2),
                new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
            );
            ceilingGlow.position.set(0, WALL_HEIGHT - 0.02, 0);
            ceilingGlow.rotation.x = Math.PI / 2;
            scene.add(ceilingGlow);

            const floorGlow = new THREE.Mesh(
                new THREE.PlaneGeometry(ROOM_HALF * 2 - 1, ROOM_HALF * 2 - 1),
                new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
            );
            floorGlow.rotation.x = -Math.PI / 2;
            floorGlow.position.y = 0.015;
            scene.add(floorGlow);

            // Три подвесные «люстры» — видимый источник каждого цветного акцента:
            // цоколь на потолке, шнур, светящаяся лампа-сфера и настоящий PointLight в ней.
            const lampSpecs: Array<{ pos: [number, number]; color: number }> = [
                { pos: [-4.5, -3.5], color: NEON.cyan },
                { pos: [4.5, 2.5], color: NEON.purple },
                { pos: [0.5, 5], color: NEON.pink },
            ];
            lampSpecs.forEach(({ pos: [x, z], color }) => {
                const bulbY = 4.3;
                const cordLength = WALL_HEIGHT - bulbY;
                const cord = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.02, 0.02, cordLength, 6),
                    new THREE.MeshBasicMaterial({ color: 0x15151f })
                );
                cord.position.set(x, bulbY + cordLength / 2, z);
                scene.add(cord);

                const bulb = new THREE.Mesh(
                    new THREE.SphereGeometry(0.22, 16, 16),
                    new THREE.MeshBasicMaterial({ color })
                );
                bulb.position.set(x, bulbY, z);
                scene.add(bulb);

                const lamp = new THREE.PointLight(color, 1.1, 15, 2);
                lamp.position.set(x, bulbY, z);
                scene.add(lamp);
            });

            // --- Модель аватарки: грузим один раз, нормализуем масштаб/высоту,
            // дальше только клонируем для каждого участника. При ошибке загрузки
            // (например, файл не задеплоен) откатываемся на примитивную капсулу. ---
            let avatarTemplate: any = null;
            try {
                const gltf = await new GLTFLoader().loadAsync(AVATAR_MODEL_URL);
                const root = gltf.scene;
                root.traverse((obj: any) => {
                    if (obj.isMesh) { obj.castShadow = false; obj.receiveShadow = false; }
                });
                const box = new THREE.Box3().setFromObject(root);
                const size = box.getSize(new THREE.Vector3());
                if (size.y > 0) {
                    const scale = AVATAR_TARGET_HEIGHT / size.y;
                    root.scale.setScalar(scale);
                    const scaledBox = new THREE.Box3().setFromObject(root);
                    root.position.y -= scaledBox.min.y; // ставим модель ногами на пол (y=0)
                }
                avatarTemplate = root;
            } catch (e) {
                console.warn('[Room3D] Не удалось загрузить модель аватарки, использую капсулу-заглушку:', e);
            }
            if (disposed) return;

            // --- Аватарки: 3D-модель (или капсула-заглушка) + цветное кольцо-идентификатор
            // у ног + подпись с именем над головой ---
            const avatarGroups = new Map<string, { group: any; hitBox: any; ring: any; target: { x: number; z: number } }>();
            // Позиции, пришедшие с сервера для ещё не созданных аватарок
            // (снапшот может прийти раньше, чем эффект добавит участника). Применяем
            // их в момент создания аватарки, чтобы участник появился сразу на своём месте.
            const pendingPositions = new Map<string, { x: number; z: number }>();

            const makeNameSprite = (text: string, yPos: number) => {
                const canvas = document.createElement('canvas');
                const W = 384, H = 80;
                canvas.width = W; canvas.height = H;
                const ctx = canvas.getContext('2d')!;
                const maxTextWidth = W - 32; // отступы по 16px с каждой стороны

                // Подбираем размер шрифта так, чтобы длинный ник не вылезал
                // за пределы холста (раньше он просто обрезался краем canvas).
                let fontSize = 34;
                const minFontSize = 16;
                let displayText = text;
                while (fontSize > minFontSize) {
                    ctx.font = `600 ${fontSize}px sans-serif`;
                    if (ctx.measureText(displayText).width <= maxTextWidth) break;
                    fontSize -= 2;
                }
                ctx.font = `600 ${fontSize}px sans-serif`;
                // Если даже на минимальном шрифте не влезает — обрезаем с многоточием.
                if (ctx.measureText(displayText).width > maxTextWidth) {
                    while (displayText.length > 1 && ctx.measureText(displayText + '…').width > maxTextWidth) {
                        displayText = displayText.slice(0, -1);
                    }
                    displayText += '…';
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                const bgWidth = Math.min(W - 8, ctx.measureText(displayText).width + 32);
                ctx.beginPath();
                const bgX = (W - bgWidth) / 2;
                (ctx as any).roundRect ? (ctx as any).roundRect(bgX, H / 2 - 24, bgWidth, 48, 16) : ctx.rect(bgX, H / 2 - 24, bgWidth, 48);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.fillText(displayText, W / 2, H / 2);
                const tex = new THREE.CanvasTexture(canvas);
                const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
                const sprite = new THREE.Sprite(mat);
                sprite.scale.set(1.6 * (W / 256), 0.4 * (H / 64), 1);
                sprite.position.set(0, yPos, 0);
                return sprite;
            };

            const addAvatar = (userId: string, name: string, isMe: boolean, startX: number, startZ: number) => {
                if (avatarGroups.has(userId)) return;
                const group = new THREE.Group();

                // Видимая модель — общая для всех, различие даёт цветное кольцо у ног.
                if (avatarTemplate) {
                    const model = avatarTemplate.clone(true);
                    group.add(model);
                } else {
                    // Фолбэк, если модель не загрузилась — старая капсула-заглушка.
                    const bodyGeo = new THREE.CapsuleGeometry(0.4, 0.7, 4, 12);
                    const bodyMat = new THREE.MeshStandardMaterial({ color: colorForUser(userId), roughness: 0.45, metalness: 0.15 });
                    const body = new THREE.Mesh(bodyGeo, bodyMat);
                    body.position.y = 0.75;
                    group.add(body);
                }

                // Невидимый хитбокс на весь рост — по нему кликаем/тащим, вместо
                // раскастинга по сложной геометрии модели (быстрее и надёжнее).
                const hitGeo = new THREE.CylinderGeometry(0.45, 0.45, AVATAR_TARGET_HEIGHT, 8);
                const hitMat = new THREE.MeshBasicMaterial({ visible: false });
                const hitBox = new THREE.Mesh(hitGeo, hitMat);
                hitBox.position.y = AVATAR_TARGET_HEIGHT / 2;
                hitBox.userData.userId = userId;
                group.add(hitBox);

                // Цветное кольцо у ног — единственный «идентификатор» пользователя,
                // раз визуально модель у всех одна и та же; заодно светится при разговоре.
                const ringGeo = new THREE.RingGeometry(0.42, 0.55, 32);
                const ringMat = new THREE.MeshStandardMaterial({
                    color: colorForUser(userId),
                    emissive: 0x000000,
                    transparent: true,
                    opacity: 0.9,
                    side: THREE.DoubleSide,
                });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.y = 0.02;
                group.add(ring);

                group.add(makeNameSprite(name + (isMe ? ' (вы)' : ''), AVATAR_TARGET_HEIGHT + 0.25));
                group.position.set(startX, 0, startZ);
                scene.add(group);
                avatarGroups.set(userId, { group, hitBox, ring, target: { x: startX, z: startZ } });
                // Если для этого пользователя уже пришла позиция с сервера — ставим его туда.
                const pend = pendingPositions.get(String(userId));
                if (pend) {
                    const a = avatarGroups.get(userId)!;
                    a.target.x = pend.x; a.target.z = pend.z;
                    a.group.position.set(pend.x, 0, pend.z);
                    pendingPositions.delete(String(userId));
                }
            };
            const removeAvatar = (userId: string) => {
                const a = avatarGroups.get(userId);
                if (!a) return;
                scene.remove(a.group);
                avatarGroups.delete(userId);
                // Иначе координаты ушедшего останутся в хранилище и применятся
                // к следующему, кто получит тот же узел панорамирования.
                removeSource(userId);
            };
            const setAvatarTarget = (userId: string, x: number, z: number) => {
                const a = avatarGroups.get(userId);
                if (a) { a.target.x = x; a.target.z = z; }
                else pendingPositions.set(String(userId), { x, z }); // применится при создании аватарки
            };

            // Своя аватарка — сразу в центре (реальную позицию подтвердит сервер
            // почти мгновенно через 'room-position-update').
            addAvatar(String(currentUser._id), getDisplayName(currentUser as any), true, 0, 0);

            // --- Драг своей аватарки мышью по полу ---
            const raycaster = new THREE.Raycaster();
            const pointerNdc = new THREE.Vector2();
            let dragging = false;
            let lastEmit = 0;

            const toNdc = (clientX: number, clientY: number) => {
                const rect = renderer.domElement.getBoundingClientRect();
                pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
                pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            };

            const emitPosition = (x: number, z: number, force = false) => {
                const now = performance.now();
                if (!force && now - lastEmit < 80) return;
                lastEmit = now;
                socket?.emit('room-position-update', { channelId: channel._id, x, z });
            };

            const onPointerDown = (e: PointerEvent) => {
                toNdc(e.clientX, e.clientY);
                raycaster.setFromCamera(pointerNdc, camera);

                // Кнопки эфира. Проверяем раньше аватарки: панель висит на стене,
                // перекрытия с фигурами нет, а промах по кнопке не должен
                // случайно начать перетаскивание.
                if (airGroup.visible && airHits.length > 0) {
                    const screenHit = raycaster.intersectObject(airMesh, false)[0];
                    if (screenHit && screenHit.uv) {
                        // UV: (0,0) — левый нижний угол полотна, у канваса — левый верхний.
                        const cx = screenHit.uv.x * CARD_W;
                        const cy = (1 - screenHit.uv.y) * CARD_H;
                        const hit = airHits.find(h => cx >= h.x && cx <= h.x + h.w && cy >= h.y && cy <= h.y + h.h);
                        if (hit) {
                            const target = presenceControlsRef.current;
                            if (target) {
                                const value = hit.kind === 'slider'
                                    ? (hit.min ?? 0) + ((cx - hit.x) / hit.w) * ((hit.max ?? 100) - (hit.min ?? 0))
                                    : undefined;
                                onPresenceControlRef.current?.(target.channelId, target.sessionId, hit.id, value);
                            }
                            return;
                        }
                    }
                }

                const mine = avatarGroups.get(String(currentUser._id));
                if (!mine) return;
                const hits = raycaster.intersectObject(mine.hitBox, false);
                if (hits.length > 0) {
                    dragging = true;
                    controls.enabled = false;
                }
            };
            const onPointerMove = (e: PointerEvent) => {
                if (!dragging) return;
                toNdc(e.clientX, e.clientY);
                raycaster.setFromCamera(pointerNdc, camera);
                const hits = raycaster.intersectObject(floor, false);
                if (hits.length === 0) return;
                const p = hits[0].point;
                const x = Math.max(-9.5, Math.min(9.5, p.x));
                const z = Math.max(-9.5, Math.min(9.5, p.z));
                setAvatarTarget(String(currentUser._id), x, z);
                const mine = avatarGroups.get(String(currentUser._id));
                if (mine) mine.group.position.set(x, 0, z);
                emitPosition(x, z);
            };
            const onPointerUp = () => {
                if (!dragging) return;
                dragging = false;
                controls.enabled = true;
                const mine = avatarGroups.get(String(currentUser._id));
                if (mine) emitPosition(mine.group.position.x, mine.group.position.z, true);
            };

            // ===== Ходьба на WASD / стрелках =====
            // Перетаскивание мышью оставлено: им удобно быстро переставить себя
            // в дальний угол. Клавиатура нужна для другого — идти неспеша и
            // слышать, как меняется звук. Ради этого всё и затевалось.
            const pressed = new Set<string>();
            const MOVE_SPEED = 4.2;          // единиц комнаты в секунду
            const BOUND = ROOM_HALF - 0.5;   // не даём выйти сквозь стены

            // Игнорируем клавиши, когда человек печатает в чате рядом с комнатой.
            const typingInInput = () => {
                const el = document.activeElement as HTMLElement | null;
                if (!el) return false;
                const tag = el.tagName;
                return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
            };

            const MOVE_KEYS: Record<string, [number, number]> = {
                KeyW: [0, 1], ArrowUp: [0, 1],
                KeyS: [0, -1], ArrowDown: [0, -1],
                KeyA: [-1, 0], ArrowLeft: [-1, 0],
                KeyD: [1, 0], ArrowRight: [1, 0],
            };

            const onKeyDown = (e: KeyboardEvent) => {
                if (!MOVE_KEYS[e.code] || typingInInput()) return;
                // Стрелки иначе прокручивают страницу под сценой.
                e.preventDefault();
                pressed.add(e.code);
            };
            const onKeyUp = (e: KeyboardEvent) => { pressed.delete(e.code); };
            // При потере фокуса окна клавиша "залипла" бы нажатой навсегда.
            const onBlurKeys = () => pressed.clear();

            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);
            window.addEventListener('blur', onBlurKeys);

            const moveDir = new THREE.Vector3();
            const camFlat = new THREE.Vector3();
            const rightFlat = new THREE.Vector3();
            const UP = new THREE.Vector3(0, 1, 0);

            /** Шаг ходьбы за кадр. dt — секунды, чтобы скорость не зависела от fps. */
            const stepMovement = (dt: number) => {
                if (dragging || pressed.size === 0) return false;
                const mine = avatarGroups.get(String(currentUser._id));
                if (!mine) return false;

                let fwd = 0, side = 0;
                pressed.forEach(code => {
                    const d = MOVE_KEYS[code];
                    if (d) { side += d[0]; fwd += d[1]; }
                });
                if (fwd === 0 && side === 0) return false;

                // Направление — относительно камеры: "вперёд" это туда, куда
                // смотрит игрок, а не фиксированная сторона комнаты.
                camera.getWorldDirection(camFlat);
                camFlat.y = 0;
                if (camFlat.lengthSq() < 1e-6) return false;
                camFlat.normalize();
                rightFlat.copy(camFlat).cross(UP).normalize();

                moveDir.set(0, 0, 0)
                    .addScaledVector(camFlat, fwd)
                    .addScaledVector(rightFlat, side);
                if (moveDir.lengthSq() < 1e-6) return false;
                // Нормализуем, иначе по диагонали шли бы в 1.4 раза быстрее.
                moveDir.normalize();

                const nx = Math.max(-BOUND, Math.min(BOUND, mine.group.position.x + moveDir.x * MOVE_SPEED * dt));
                const nz = Math.max(-BOUND, Math.min(BOUND, mine.group.position.z + moveDir.z * MOVE_SPEED * dt));

                mine.group.position.x = nx;
                mine.group.position.z = nz;
                // Цель приравниваем к позиции, иначе лерп в animate потянет
                // аватар обратно к последней точке перетаскивания.
                mine.target.x = nx;
                mine.target.z = nz;

                // Разворачиваем фигуру по направлению шага — так видно, куда идёт.
                mine.group.rotation.y = Math.atan2(moveDir.x, moveDir.z);

                emitPosition(nx, nz);
                return true;
            };

            // Двойной клик по чужой аватарке — открыть профиль пользователя.
            const onDblClick = (e: MouseEvent) => {
                toNdc(e.clientX, e.clientY);
                raycaster.setFromCamera(pointerNdc, camera);
                const hitBoxes = Array.from(avatarGroups.values()).map(a => a.hitBox);
                const hits = raycaster.intersectObjects(hitBoxes, false);
                if (hits.length === 0) return;
                const userId = hits[0].object.userData.userId;
                if (userId && userId !== String(currentUser._id)) onUserClickRef.current(userId);
            };

            renderer.domElement.addEventListener('pointerdown', onPointerDown);
            renderer.domElement.addEventListener('dblclick', onDblClick);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);

            // --- Сокет-синхронизация позиций и состава участников ---
            const onSnapshot = (data: { channelId: string; positions: Array<{ userId: string; x: number; z: number }> }) => {
                if (data.channelId !== channel._id) return;
                // setAvatarTarget сам буферизует позицию, если аватарка ещё не создана.
                data.positions.forEach(p => setAvatarTarget(p.userId, p.x, p.z));
            };
            const onPosUpdate = (data: { channelId: string; userId: string; x: number; z: number }) => {
                if (data.channelId !== channel._id) return;
                setAvatarTarget(data.userId, data.x, data.z);
            };
            const onPosRemoved = (data: { channelId: string; userId: string }) => {
                if (data.channelId !== channel._id) return;
                removeAvatar(data.userId);
            };
            socket?.on('room-positions-snapshot', onSnapshot);
            socket?.on('room-position-update', onPosUpdate);
            socket?.on('room-position-removed', onPosRemoved);
            // Запрашиваем снапшот СЕЙЧАС: снапшот при входе в voice-канал почти всегда
            // приходит раньше, чем эта сцена (three.js + GLB грузятся асинхронно) успевает
            // подписаться на событие. Без этого запроса мы не видим уже присутствующих.
            socket?.emit('room-request-snapshot', { channelId: channel._id });

            // --- Ресайз под контейнер ---
            const onResize = () => {
                if (!el) return;
                const w = el.clientWidth, h = el.clientHeight;
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                renderer.setSize(w, h);
            };
            const resizeObserver = new ResizeObserver(onResize);
            resizeObserver.observe(el);

            let raf = 0;
            const myId = String(currentUser._id);

            // Координаты в звук отдаём не каждый кадр: узлы WebAudio и так
            // сглаживают переходы, а 60 обновлений в секунду на каждого
            // участника — лишняя работа без слышимой разницы.
            const SPATIAL_UPDATE_MS = 100;
            let lastSpatialAt = 0;
            const camForward = new THREE.Vector3();

            const publishSpatial = () => {
                avatarGroups.forEach((a, userId) => {
                    if (userId === myId) return;
                    setSourcePosition(userId, a.group.position.x, a.group.position.z);
                });

                const mine = avatarGroups.get(myId);
                if (mine) {
                    // Направление взгляда берём от камеры: именно оно решает,
                    // слева или справа прозвучит собеседник. Проецируем на
                    // плоскость пола — наклон камеры на звук влиять не должен.
                    camera.getWorldDirection(camForward);
                    const len = Math.hypot(camForward.x, camForward.z) || 1;
                    setListenerPose(
                        mine.group.position.x,
                        mine.group.position.z,
                        camForward.x / len,
                        camForward.z / len
                    );
                }
            };

            let lastFrameAt = performance.now();

            const animate = () => {
                raf = requestAnimationFrame(animate);

                const frameNow = performance.now();
                // Ограничиваем шаг: после сворачивания окна dt может оказаться
                // огромным, и аватар "телепортировался" бы через всю комнату.
                const dt = Math.min((frameNow - lastFrameAt) / 1000, 0.1);
                lastFrameAt = frameNow;

                const walked = stepMovement(dt);

                avatarGroups.forEach((a) => {
                    a.group.position.x += (a.target.x - a.group.position.x) * 0.18;
                    a.group.position.z += (a.target.z - a.group.position.z) * 0.18;
                });

                // Камера следует за игроком: цель орбиты держится на аватаре,
                // поэтому вращение мышью крутится вокруг вас, а не вокруг центра
                // комнаты. Смещение камеры сохраняем, иначе шаг "выдёргивал" бы
                // обзор.
                if (walked) {
                    const mine = avatarGroups.get(String(currentUser._id));
                    if (mine) {
                        const dx = mine.group.position.x - controls.target.x;
                        const dz = mine.group.position.z - controls.target.z;
                        controls.target.x += dx;
                        controls.target.z += dz;
                        camera.position.x += dx;
                        camera.position.z += dz;
                    }
                }

                const now = performance.now();
                if (now - lastSpatialAt >= SPATIAL_UPDATE_MS) {
                    lastSpatialAt = now;
                    publishSpatial();
                }

                controls.update();
                renderer.render(scene, camera);
            };
            animate();

            // Не рисуем комнату, пока окно свёрнуто или не в фокусе — иначе
            // сцена продолжает считаться в 60 fps, хотя на неё никто не смотрит.
            let running = true;
            const syncRunning = () => {
                if (disposed) return;
                const idle = document.hidden || !document.hasFocus();
                if (idle && running) {
                    running = false;
                    cancelAnimationFrame(raf);
                } else if (!idle && !running) {
                    running = true;
                    animate();
                }
            };
            document.addEventListener('visibilitychange', syncRunning);
            window.addEventListener('focus', syncRunning);
            window.addEventListener('blur', syncRunning);

            // ===== Эфир на стене =====
            //
            // На северной стене висит один экран, и на него попадает ровно один
            // источник — «эфир». Их два вида:
            //
            //   screen   — трансляция экрана участника;
            //   presence — мини-приложение, выведенное в голосовой канал (тот же
            //              механизм voice-presence, что рисует карточки в обычном
            //              голосовом канале; здесь карточка вместо плитки в сетке
            //              попадает на стену).
            //
            // Кто из них на стене, решает React-слой: сюда приходит уже готовое
            // содержимое. Экран один, поэтому и функция одна — иначе два
            // источника наперегонки писали бы в один материал.
            //
            // Видео идёт через отдельный <video>, не добавленный в документ:
            // three.js нужен только сам элемент как источник кадров. Звук из
            // этого элемента не берём — он приглушён ради автозапуска.
            let screenVideo: HTMLVideoElement | null = null;
            let screenTexture: any = null;
            // Узлы звука трансляции держим отдельно: контекст общий и закрывать
            // его нельзя, поэтому при снятии эфира отсоединяем только их.
            let screenAudioNodes: { src: AudioNode; panner: AudioNode; gain: AudioNode } | null = null;
            const SCREEN_AUDIO_ID = '__screen__';
            let screenSourceKey: string | null = null;

            // Эфир (восточная стена) — своё состояние, чтобы карточка и экран
            // не сбрасывали друг друга.
            let airTexture: any = null;
            let airSessionId: string | null = null;
            let airAudioSourceId: string | null = null;
            let airCardSessionId: string | null = null;
            let airCardSignature: string | null = null;
            let airCardImages: Record<string, HTMLImageElement> = {};
            let airCardUrls: Record<string, string> = {};
            // Хит-боксы кнопок карточки в координатах полотна (см. presenceCard).
            let airHits: PresenceCardHit[] = [];

            const clearScreen = () => {
                screenGroup.visible = false;
                screenGlow.intensity = 0;
                if (screenTexture) { screenTexture.dispose(); screenTexture = null; }
                screenMat.map = null;
                screenMat.color.setHex(0x000000);
                screenMat.needsUpdate = true;
                if (screenVideo) {
                    try { screenVideo.pause(); screenVideo.srcObject = null; screenVideo.removeAttribute('src'); screenVideo.load(); } catch { }
                    screenVideo = null;
                }
                unregisterPanner(SCREEN_AUDIO_ID);
                removeSource(SCREEN_AUDIO_ID);
                if (screenAudioNodes) {
                    const { src, panner, gain } = screenAudioNodes;
                    try { src.disconnect(); panner.disconnect(); gain.disconnect(); } catch { }
                    screenAudioNodes = null;
                }
                screenSourceKey = null;
            };

            const clearAir = () => {
                airGroup.visible = false;
                airGlow.intensity = 0;
                if (airTexture) { airTexture.dispose(); airTexture = null; }
                airMat.map = null;
                airMat.color.setHex(0x000000);
                airMat.needsUpdate = true;
                if (airAudioSourceId) { removeSource(airAudioSourceId); airAudioSourceId = null; }
                airSessionId = null;
                airCardSessionId = null;
                airCardSignature = null;
                airCardImages = {};
                airCardUrls = {};
                airHits = [];
                presenceControlsRef.current = null;
            };

            /** Показать текстуру на экране (северная стена). */
            const showScreenTexture = (tex: any) => {
                screenTexture = tex;
                screenMat.map = tex;
                screenMat.color.setHex(0xffffff); // белый, чтобы не тонировать кадр
                screenMat.needsUpdate = true;
                screenGroup.visible = true;
                screenGlow.intensity = 1.2;
            };

            /** Показать карточку эфира (восточная стена) вместе с её хит-боксами. */
            const showAirTexture = (tex: any, hits: PresenceCardHit[] = []) => {
                airTexture = tex;
                airHits = hits;
                airMat.map = tex;
                airMat.color.setHex(0xffffff);
                airMat.needsUpdate = true;
                airGroup.visible = true;
                airGlow.intensity = 0.9;
            };

            /** Кадры из MediaStream — и для трансляции экрана, и для видео мини-аппы. */
            const showScreenStream = (stream: MediaStream) => {
                screenVideo = document.createElement('video');
                screenVideo.srcObject = stream;
                screenVideo.muted = true;      // иначе браузер не даст автозапуск
                screenVideo.playsInline = true;
                screenVideo.play().catch(() => { });
                const tex = new THREE.VideoTexture(screenVideo);
                tex.colorSpace = THREE.SRGBColorSpace;
                showScreenTexture(tex);
            };

            /** Canvas карточки -> текстура для полотна. Хит-боксы кладём рядом. */
            const cardTexture = (p: any, images: any) => {
                const res = drawPresenceCard(p, images);
                if (!res) return null;
                const tex = new THREE.CanvasTexture(res.canvas);
                tex.colorSpace = THREE.SRGBColorSpace;
                return { tex, hits: res.hits };
            };

            /**
             * Показывает карточку эфира и держит её в актуальном виде.
             *
             * Перерисовываем ТОЛЬКО когда изменилось что-то видимое (см.
             * presenceCardSignature). Плеер шлёт обновления presence часто —
             * позиция трека тикает каждую секунду, — и если на каждое из них
             * пересобирать текстуру, содержимое экрана мигает. Картинки при
             * этом кэшируем по sessionId: без кэша каждое обновление заново
             * загружало бы обложку, и карточка на миг возвращалась бы к
             * текстовому виду.
             */
            const showPresenceCard = (p: any) => {
                const sig = presenceCardSignature(p);
                const sameCard = airCardSessionId === p.sessionId;
                if (sameCard && airCardSignature === sig) return;   // ничего не изменилось

                airCardSessionId = p.sessionId;
                airCardSignature = sig;

                const cached = sameCard ? airCardImages : {};
                if (!sameCard) airCardImages = {};

                const drawn = cardTexture(p, cached);
                if (drawn) {
                    const prev = airTexture;
                    showAirTexture(drawn.tex, drawn.hits);
                    if (prev) prev.dispose();
                }

                // Обложка трека и аватар мини-аппы. Оба адреса внешние, поэтому
                // идут через свой прокси: без разрешающего CORS WebGL откажется
                // брать картинку текстурой, и карточка осталась бы без обложки.
                const bgUrl = p.background && p.background.type === 'image' ? getFullUrl(p.background.url) : null;
                const avatarUrl = getFullUrl(p.avatar);
                const urls: Record<string, string | null> = {
                    bg: bgUrl ? toProxiedMedia(bgUrl) : null,
                    avatar: avatarUrl ? toProxiedMedia(avatarUrl) : null,
                };

                // Уже загруженные адреса заново не тянем — иначе тик секунды
                // у плеера каждый раз дёргал бы сеть.
                const need = (['bg', 'avatar'] as const).filter(k => urls[k] && airCardUrls[k] !== urls[k]);
                if (need.length === 0) return;

                const loaded: Record<string, HTMLImageElement> = { ...cached };
                let pending = need.length;
                const done = () => {
                    if (--pending > 0) return;
                    // Пока грузились картинки, эфир мог смениться.
                    if (airCardSessionId !== p.sessionId) return;
                    airCardImages = loaded;
                    const next = cardTexture(p, loaded);
                    if (!next) return;
                    const prev = airTexture;
                    showAirTexture(next.tex, next.hits);
                    if (prev) prev.dispose();
                };
                need.forEach(key => {
                    const url = urls[key] as string;
                    airCardUrls[key] = url;
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => { loaded[key] = img; done(); };
                    img.onerror = () => done();
                    img.src = url;
                });
            };

            /**
             * Видео мини-аппы на «экране» (северная стена).
             *
             * Источник — либо MediaStream (демонстрация экрана, publishVideo),
             * либо обычный URL из presence.background типа 'video' (клип трека).
             * YouTube-ссылки пропускаем: их кадры отдаёт только собственный
             * плеер в iframe, текстурой это не положить.
             */
            const showScreenUrl = (url: string) => {
                const v = document.createElement('video');
                v.crossOrigin = 'anonymous';
                v.muted = true;        // звук идёт отдельным потоком presence
                v.loop = true;
                v.playsInline = true;
                v.src = url;
                v.play().catch(() => { });
                screenVideo = v;
                const tex = new THREE.VideoTexture(v);
                tex.colorSpace = THREE.SRGBColorSpace;
                showScreenTexture(tex);
            };

            /**
             * Единственная точка входа для React-слоя.
             *
             * Поверхностей две и они независимы:
             *   «экран» на северной стене — демонстрация экрана или видео мини-аппы;
             *   «эфир» на восточной стене — карточка мини-аппы с управлением.
             * Раньше они делили одно полотно и вытесняли друг друга; теперь
             * музыкальный клип может идти на экране, пока карточка с кнопками
             * висит сбоку.
             *
             * Функция идемпотентна: повторный вызов с тем же источником ничего
             * не разрушает. Это важно, потому что React зовёт её на каждое
             * обновление presence, а сброс полотна виден как рывок.
             */
            const setWall = (content: {
                screen: { stream: MediaStream; withAudio: boolean } | null;
                presence: { presence: any; stream: MediaStream | null } | null;
            }) => {
                // --- Эфир (восточная стена) ---
                if (!content.presence) {
                    clearAir();
                } else {
                    const p = content.presence.presence;
                    const sessionId: string = p.sessionId;
                    if (airSessionId !== sessionId) {
                        clearAir();
                        airSessionId = sessionId;
                        // Звук мини-аппы уже воспроизводится общим RemoteAudioRenderer
                        // (по sessionId), и в комнате он идёт через панораму. Своего
                        // графа строить не нужно — достаточно сказать, откуда он
                        // звучит: от карточки, потому что название и кнопки там.
                        airAudioSourceId = sessionId;
                        setSourcePosition(sessionId, AIR_X, 0);
                    }
                    presenceControlsRef.current = { channelId: p.channelId, sessionId };
                    showPresenceCard(p);
                }

                // --- Экран (северная стена) ---
                // Демонстрация экрана важнее: это разовое осознанное «смотрите
                // сюда». Клип мини-аппки уступает ей место, но карточка эфира
                // при этом остаётся на своей стене.
                if (content.screen) {
                    if (screenSourceKey === 'screen:' + content.screen.stream.id) return;
                    clearScreen();
                    screenSourceKey = 'screen:' + content.screen.stream.id;
                    showScreenStream(content.screen.stream);

                    // Звук трансляции — своим графом, чтобы он шёл «от экрана»:
                    // отойдя в дальний угол, вы слышите его тише, как в зале.
                    const audioTracks = content.screen.stream.getAudioTracks();
                    if (content.screen.withAudio && audioTracks.length > 0) {
                        try {
                            // Тот же общий контекст, что и у голосов: иначе у звука
                            // трансляции был бы свой AudioListener, и он не
                            // поворачивался бы вместе с вами.
                            const ctx = getPlaybackContext();
                            const src = ctx.createMediaStreamSource(new MediaStream(audioTracks));
                            const panner = ctx.createPanner();
                            const gain = ctx.createGain();
                            src.connect(panner); panner.connect(gain); gain.connect(ctx.destination);
                            screenAudioNodes = { src, panner, gain };
                            registerPanner(SCREEN_AUDIO_ID, panner);
                            setSourcePosition(SCREEN_AUDIO_ID, 0, SCREEN_Z);
                            resumePlayback();
                        } catch { /* без звука трансляция всё равно видна */ }
                    }
                    return;
                }

                // Экран свободен — на него идёт видео мини-аппки: либо её
                // собственный поток (publishVideo), либо клип из background.
                const pres = content.presence?.presence;
                const stream = content.presence?.stream ?? null;
                const bgVideoUrl = pres && pres.background && pres.background.type === 'video' && pres.background.url
                    && !isYouTubeUrl(pres.background.url) ? String(pres.background.url) : null;
                const nextScreenKey = stream && stream.getVideoTracks().length > 0
                    ? 'presence-video:' + pres.sessionId + ':' + stream.id
                    : bgVideoUrl ? 'presence-url:' + bgVideoUrl : null;

                if (screenSourceKey !== nextScreenKey) {
                    clearScreen();
                    screenSourceKey = nextScreenKey;
                    if (nextScreenKey && stream && stream.getVideoTracks().length > 0) {
                        showScreenStream(stream);
                    } else if (nextScreenKey && bgVideoUrl) {
                        showScreenUrl(bgVideoUrl);
                    }
                }
            };

            sceneRef.current = { avatarGroups, addAvatar, removeAvatar, getDisplayName, setWall };
            setSceneReady(true);

            cleanupFn = () => {
                clearScreen();
                clearAir();
                cancelAnimationFrame(raf);
                window.removeEventListener('keydown', onKeyDown);
                window.removeEventListener('keyup', onKeyUp);
                window.removeEventListener('blur', onBlurKeys);
                // Выходим из комнаты — позиции не должны пережить её.
                resetSpatialAudio();
                document.removeEventListener('visibilitychange', syncRunning);
                window.removeEventListener('focus', syncRunning);
                window.removeEventListener('blur', syncRunning);
                resizeObserver.disconnect();
                renderer.domElement.removeEventListener('pointerdown', onPointerDown);
                renderer.domElement.removeEventListener('dblclick', onDblClick);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                socket?.off('room-positions-snapshot', onSnapshot);
                socket?.off('room-position-update', onPosUpdate);
                socket?.off('room-position-removed', onPosRemoved);
                controls.dispose();
                renderer.dispose();
                if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
                sceneRef.current = null;
                setSceneReady(false);
            };
        })();

        return () => { disposed = true; cleanupFn(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnectedToThisRoom, channel._id, currentUser?._id]);

    // --- Эфир на экране комнаты ---
    // Отдельным эффектом от синхронизации участников: смена эфира не должна
    // трогать аватары, и наоборот.
    useEffect(() => {
        const s = sceneRef.current;
        if (!sceneReady || !s?.setWall) return;
        s.setWall(wallContent);
    }, [sceneReady, wallContent]);

    // --- Синхронизация состава участников (кто в комнате сейчас) со сценой ---
    useEffect(() => {
        const s = sceneRef.current;
        if (!s || !currentUser) return;
        const liveIds = new Set<string>([String(currentUser._id), ...connectedUsers.map(u => String(u._id))]);
        // Добавить недостающих
        connectedUsers.forEach(u => {
            const id = String(u._id);
            if (!s.avatarGroups.has(id)) {
                const angle = Math.random() * Math.PI * 2;
                const r = 2 + Math.random() * 3;
                s.addAvatar(id, s.getDisplayName(u), false, Math.cos(angle) * r, Math.sin(angle) * r);
            }
        });
        // Убрать тех, кто вышел
        (Array.from(s.avatarGroups.keys()) as string[]).forEach((id) => {
            if (!liveIds.has(id)) s.removeAvatar(id);
        });
    }, [connectedUsers, currentUser, sceneReady]);

    // --- Подсветка говорящих ---
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        s.avatarGroups.forEach((a: any, userId: string) => {
            const talking = speakingUsers.has(userId);
            a.ring.material.emissive.setHex(talking ? 0x00e5ff : 0x000000);
            a.ring.material.emissiveIntensity = talking ? 1.2 : 0;
        });
    }, [speakingUsers, connectedUsers]);

    if (!isConnectedToThisRoom) {
        return (
            <div className="voice-channel-view panel-hero room3d-view">
                <div className="panel-hero-bg" aria-hidden="true">
                    <div className="blob cyan" />
                    <div className="blob purple" />
                    <div className="blob pink" />
                </div>
                <div className="room3d-join-screen">
                    <div className="room3d-join-icon"><CubeIcon size={48} /></div>
                    <h2>{channel.name}</h2>
                    <p>3D-комната — голосовой канал с пространством, где аватарки участников можно перетаскивать мышью.</p>
                    <button className="room3d-join-btn" onClick={() => joinChannel(channel._id)}>Войти в комнату</button>
                </div>
            </div>
        );
    }

    return (
        <div className="voice-channel-view panel-hero room3d-view">
            <div className="panel-hero-bg" aria-hidden="true">
                <div className="blob cyan" />
                <div className="blob purple" />
                <div className="blob pink" />
            </div>
            <header className="voice-hdr">
                <div className="hdr-left">
                    <div className="voice-status-indicator inline">
                        <div className="pulse-ring"></div>
                        <div className="status-dot"></div>
                    </div>
                    <h1><CubeIcon size={20} className="room3d-title-icon" /> {channel.name}</h1>
                </div>
                <div className="hdr-right">
                    <div className="channel-topic-tag">Перетаскивайте свою аватарку мышью · вращение камеры — зажать и потянуть фон</div>
                    <div className="channel-status-badge">Подключено</div>
                    {onToggleChat && (
                        <button className="voice-chat-toggle-btn" onClick={onToggleChat} title="Открыть чат">
                            <ChatIcon size={18} />
                        </button>
                    )}
                </div>
            </header>
            <div className="room3d-canvas" ref={mountRef} />
        </div>
    );
};

export default Room3DView;
