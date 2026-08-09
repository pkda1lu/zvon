import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useVoice, useVoiceLevels } from '../contexts/VoiceContext';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { Channel, Server, User } from '../types';
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
    const { isConnected, activeChannelId, joinChannel, connectedUsers } = useVoice();
    const { speakingUsers } = useVoiceLevels();

    const mountRef = useRef<HTMLDivElement>(null);
    const isConnectedToThisRoom = isConnected && activeChannelId === channel._id;

    // Всё изменяемое трёхмерное состояние держим в рефах — сцена живёт вне
    // React-рендеров, обновляется через requestAnimationFrame.
    const sceneRef = useRef<any>(null);
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
            const floorGeo = new THREE.PlaneGeometry(20, 20);
            const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0b14, roughness: 0.32, metalness: 0.4 });
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            scene.add(floor);
            const grid = new THREE.GridHelper(20, 20, 0x00e5ff, 0x22222e);
            (grid.material as any).opacity = 0.22;
            (grid.material as any).transparent = true;
            scene.add(grid);

            // ===== Каркас комнаты: закрытый неоновый киберпанк-лаунж =====
            // Раньше комната была голой плоскостью в пустоте — теперь пол окружён
            // стенами и потолком, по периметру идёт неоновая окантовка в цветах
            // бренда (циан/фиолетовый/розовый — те же, что у блобов panel-hero),
            // а под потолком висят три цветные «люстры», подсвечивающие зал.
            const ROOM_HALF = 10; // половина стороны — совпадает с полом и сеткой 20×20
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
            const animate = () => {
                raf = requestAnimationFrame(animate);
                avatarGroups.forEach((a) => {
                    a.group.position.x += (a.target.x - a.group.position.x) * 0.18;
                    a.group.position.z += (a.target.z - a.group.position.z) * 0.18;
                });
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

            sceneRef.current = { avatarGroups, addAvatar, removeAvatar, getDisplayName };
            setSceneReady(true);

            cleanupFn = () => {
                cancelAnimationFrame(raf);
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
