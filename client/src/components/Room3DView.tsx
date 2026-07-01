import React, { useEffect, useRef, useCallback } from 'react';
import { useVoice, useVoiceLevels } from '../contexts/VoiceContext';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { Channel, Server, User } from '../types';
import { CubeIcon } from './Icons';
import './VoiceChannelView.css';
import './Room3DView.css';

interface Room3DViewProps {
    channel: Channel;
    server: Server;
    onUserClick: (userId: string, event?: React.MouseEvent) => void;
    isMobile?: boolean;
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

const Room3DView: React.FC<Room3DViewProps> = ({ channel, server, onUserClick }) => {
    const { user: currentUser } = useAuth();
    const { socket } = useSocket();
    const { isConnected, activeChannelId, joinChannel, connectedUsers } = useVoice();
    const { speakingUsers } = useVoiceLevels();

    const mountRef = useRef<HTMLDivElement>(null);
    const isConnectedToThisRoom = isConnected && activeChannelId === channel._id;

    // Всё изменяемое трёхмерное состояние держим в рефах — сцена живёт вне
    // React-рендеров, обновляется через requestAnimationFrame.
    const sceneRef = useRef<any>(null);

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

            scene.add(new THREE.AmbientLight(0x445566, 1.1));
            const sun = new THREE.DirectionalLight(0xffffff, 1.4);
            sun.position.set(5, 10, 5);
            scene.add(sun);
            const rim = new THREE.PointLight(0x00e5ff, 0.6, 30);
            rim.position.set(-5, 3, -5);
            scene.add(rim);

            // Пол комнаты — сетка + плоскость, по которой ходят/двигаются аватарки.
            const floorGeo = new THREE.PlaneGeometry(20, 20);
            const floorMat = new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 0.9, metalness: 0.05 });
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            scene.add(floor);
            const grid = new THREE.GridHelper(20, 20, 0x00e5ff, 0x22222e);
            (grid.material as any).opacity = 0.35;
            (grid.material as any).transparent = true;
            scene.add(grid);

            // --- Аватарки: примитивная капсула + подпись с именем над ней ---
            const avatarGroups = new Map<string, { group: any; body: any; target: { x: number; z: number } }>();

            const makeNameSprite = (text: string) => {
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
                sprite.position.set(0, 1.35, 0);
                return sprite;
            };

            const addAvatar = (userId: string, name: string, isMe: boolean, startX: number, startZ: number) => {
                if (avatarGroups.has(userId)) return;
                const group = new THREE.Group();
                const bodyGeo = new THREE.CapsuleGeometry(0.4, 0.7, 4, 12);
                const bodyMat = new THREE.MeshStandardMaterial({
                    color: colorForUser(userId),
                    roughness: 0.45,
                    metalness: 0.15,
                    emissive: 0x000000,
                });
                const body = new THREE.Mesh(bodyGeo, bodyMat);
                body.position.y = 0.75;
                body.userData.userId = userId;
                group.add(body);
                group.add(makeNameSprite(name + (isMe ? ' (вы)' : '')));
                group.position.set(startX, 0, startZ);
                scene.add(group);
                avatarGroups.set(userId, { group, body, target: { x: startX, z: startZ } });
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
                const hits = raycaster.intersectObject(mine.body, false);
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
                const bodies = Array.from(avatarGroups.values()).map(a => a.body);
                const hits = raycaster.intersectObjects(bodies, false);
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
                data.positions.forEach(p => {
                    if (String(p.userId) === String(currentUser._id)) { setAvatarTarget(p.userId, p.x, p.z); return; }
                    if (!avatarGroups.has(p.userId)) return; // добавится когда придёт voice-user-joined/connectedUsers sync
                    setAvatarTarget(p.userId, p.x, p.z);
                });
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
            socket?.emit('room-position-update', { channelId: channel._id, x: 0, z: 0 });

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

            sceneRef.current = { avatarGroups, addAvatar, removeAvatar, getDisplayName };

            cleanupFn = () => {
                cancelAnimationFrame(raf);
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
    }, [connectedUsers, currentUser]);

    // --- Подсветка говорящих ---
    useEffect(() => {
        const s = sceneRef.current;
        if (!s) return;
        s.avatarGroups.forEach((a: any, userId: string) => {
            const talking = speakingUsers.has(userId);
            a.body.material.emissive.setHex(talking ? 0x00e5ff : 0x000000);
            a.body.material.emissiveIntensity = talking ? 0.6 : 0;
        });
    }, [speakingUsers, connectedUsers]);

    if (!isConnectedToThisRoom) {
        return (
            <div className="room3d-join-screen">
                <div className="room3d-join-icon"><CubeIcon size={48} /></div>
                <h2>{channel.name}</h2>
                <p>3D-комната — голосовой канал с пространством, где аватарки участников можно перетаскивать мышью.</p>
                <button className="room3d-join-btn" onClick={() => joinChannel(channel._id)}>Войти в комнату</button>
            </div>
        );
    }

    return (
        <div className="room3d-view">
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
                </div>
            </header>
            <div className="room3d-canvas" ref={mountRef} />
        </div>
    );
};

export default Room3DView;
