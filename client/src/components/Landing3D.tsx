import React, { useEffect, useRef } from 'react';

/**
 * Фоновая WebGL-сцена для лендинга (тема Zvon — голос/связь):
 *  - светящееся «ядро» (icosahedron + неоновый каркас), пульсирует;
 *  - облако частиц вокруг — «звуковые волны»;
 *  - парящие неоновые «чат-пузыри»;
 *  - параллакс по движению мыши.
 *
 * three подключается динамически (npm i three) — поэтому импорт помечен
 * @ts-ignore, чтобы проверка типов не падала до установки пакета.
 */
// Локальный набор аватарок (см. client/public/avatars/). Можно переопределить
// через проп `avatars` (например, подмешать аватар текущего юзера). Если файла
// нет — текстура падает в градиентный фолбэк, ничего не ломается.
const DEFAULT_AVATARS = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (n) => `${import.meta.env.BASE_URL}avatars/av${n}.svg`
);

const Landing3D: React.FC<{ className?: string; avatars?: string[] }> = ({ className, avatars }) => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let raf = 0;
        let renderer: any = null;
        let disposed = false;
        let cleanup = () => { };

        (async () => {
            let THREE: any;
            try {
                // @ts-ignore — пакет three ставится отдельно: npm i three
                THREE = await import('three');
            } catch (e) {
                console.warn('[Landing3D] three не установлен — 3D-фон отключён');
                return;
            }
            const el = mountRef.current;
            if (disposed || !el) return;

            const W = el.clientWidth || window.innerWidth;
            const H = el.clientHeight || window.innerHeight;

            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(W, H);
            el.appendChild(renderer.domElement);

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
            camera.position.set(0, 0, 6.2);

            scene.add(new THREE.AmbientLight(0x4040608, 1.4));
            const p1 = new THREE.PointLight(0x00e5ff, 2.4, 60); p1.position.set(5, 3, 5); scene.add(p1);
            const p2 = new THREE.PointLight(0xa155ff, 2.4, 60); p2.position.set(-5, -2, 4); scene.add(p2);

            // Ядро
            const core = new THREE.Mesh(
                new THREE.IcosahedronGeometry(1.4, 1),
                new THREE.MeshStandardMaterial({ color: 0x0b0b18, emissive: 0x1a1640, metalness: 0.7, roughness: 0.25, flatShading: true })
            );
            scene.add(core);
            const wire = new THREE.LineSegments(
                new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.43, 1)),
                new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.55 })
            );
            scene.add(wire);

            // ===== Аватарки на гранях =====
            // Берём базовый икосаэдр (20 крупных граней), считаем центроид и нормаль
            // каждой грани, ставим туда плоскость-«аватарку», которую периодически
            // проявляем (fade in → пауза → fade out) — только на гранях, повёрнутых
            // к камере. Все плитки лежат в группе, синхронной с вращением ядра.
            const avatarUrls = (avatars && avatars.length ? avatars : DEFAULT_AVATARS);

            // Круглая текстура из картинки (cover) + неоновое кольцо; пока картинка
            // грузится / если её нет — рисуем градиентный фолбэк.
            const makeAvatarTexture = (url: string) => {
                const S = 256;
                const cv = document.createElement('canvas');
                cv.width = cv.height = S;
                const ctx = cv.getContext('2d')!;
                const tex = new THREE.CanvasTexture(cv);
                tex.colorSpace = THREE.SRGBColorSpace;
                const draw = (image: HTMLImageElement | null) => {
                    ctx.clearRect(0, 0, S, S);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();
                    if (image) {
                        const scale = Math.max(S / image.width, S / image.height);
                        const dw = image.width * scale, dh = image.height * scale;
                        ctx.drawImage(image, (S - dw) / 2, (S - dh) / 2, dw, dh);
                    } else {
                        const g = ctx.createLinearGradient(0, 0, S, S);
                        g.addColorStop(0, '#00e5ff');
                        g.addColorStop(1, '#a155ff');
                        ctx.fillStyle = g;
                        ctx.fillRect(0, 0, S, S);
                    }
                    ctx.restore();
                    // неоновое кольцо
                    ctx.lineWidth = 12;
                    ctx.strokeStyle = 'rgba(0,229,255,0.9)';
                    ctx.beginPath();
                    ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
                    ctx.stroke();
                    tex.needsUpdate = true;
                };
                draw(null);
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => { if (!disposed) draw(img); };
                img.onerror = () => { /* остаётся фолбэк */ };
                img.src = url;
                return tex;
            };
            const avatarTextures = avatarUrls.map(makeAvatarTexture);

            // Центроиды/нормали 20 граней базового икосаэдра
            const faceGeo = new THREE.IcosahedronGeometry(1.4, 0);
            const fpos = faceGeo.getAttribute('position');
            const faceNormals: any[] = [];
            const tileSize = 0.66;
            const tileGeo = new THREE.PlaneGeometry(tileSize, tileSize);
            const avatarGroup = new THREE.Group();
            const tiles: any[] = [];
            for (let i = 0; i < fpos.count; i += 3) {
                const a = new THREE.Vector3().fromBufferAttribute(fpos, i);
                const b = new THREE.Vector3().fromBufferAttribute(fpos, i + 1);
                const c = new THREE.Vector3().fromBufferAttribute(fpos, i + 2);
                const centroid = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3);
                const normal = centroid.clone().normalize();
                faceNormals.push(normal);
                const mat = new THREE.MeshBasicMaterial({
                    transparent: true, opacity: 0, depthWrite: false, depthTest: false,
                    side: THREE.DoubleSide, toneMapped: false,
                });
                const tile = new THREE.Mesh(tileGeo, mat);
                // Радиус ядра (вершины на 1.4, каркас 1.43) — выносим плитку наружу,
                // чтобы она «лежала» на грани, а не тонула внутри меша.
                tile.position.copy(normal).multiplyScalar(1.5);
                tile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
                tile.renderOrder = 5;
                tile.visible = false;
                tile.userData = { state: 'idle', t0: 0, dur: 0.6, hold: 0, normal };
                avatarGroup.add(tile);
                tiles.push(tile);
            }
            faceGeo.dispose();
            scene.add(avatarGroup);

            let nextSpawn = 1.5;
            const MAX_VISIBLE = 4;
            const _wn = new THREE.Vector3();

            // Частицы-«волны»
            const COUNT = 1100;
            const positions = new Float32Array(COUNT * 3);
            for (let i = 0; i < COUNT; i++) {
                const r = 2.5 + Math.random() * 2.2;
                const theta = Math.acos(2 * Math.random() - 1);
                const phi = Math.random() * Math.PI * 2;
                positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
                positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
                positions[i * 3 + 2] = r * Math.cos(theta);
            }
            const pGeo = new THREE.BufferGeometry();
            pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
                color: 0x9b6bff, size: 0.032, transparent: true, opacity: 0.85,
                blending: THREE.AdditiveBlending, depthWrite: false,
            }));
            scene.add(points);

            // Парящие чат-пузыри
            const bubbleColors = [0x00e5ff, 0xa155ff, 0x38f9d7];
            const bubbles: any[] = [];
            for (let i = 0; i < 6; i++) {
                const c = bubbleColors[i % 3];
                const mesh = new THREE.Mesh(
                    new THREE.SphereGeometry(0.2 + Math.random() * 0.14, 28, 28),
                    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.35 })
                );
                const ang = (i / 6) * Math.PI * 2;
                mesh.position.set(Math.cos(ang) * 2.9, Math.sin(ang * 1.3) * 1.4, Math.sin(ang) * 2.1);
                mesh.userData = { ang, sp: 0.3 + Math.random() * 0.35, off: Math.random() * 10, rx: Math.random(), ry: Math.random() };
                scene.add(mesh);
                bubbles.push(mesh);
            }

            let mx = 0, my = 0;
            const onMove = (e: MouseEvent) => {
                mx = (e.clientX / window.innerWidth - 0.5);
                my = (e.clientY / window.innerHeight - 0.5);
            };
            window.addEventListener('mousemove', onMove);

            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const clock = new THREE.Clock();

            const animate = () => {
                raf = requestAnimationFrame(animate);
                const t = reduce ? 0 : clock.getElapsedTime();
                core.rotation.y = t * 0.15;
                core.rotation.x = Math.sin(t * 0.3) * 0.2;
                wire.rotation.copy(core.rotation);
                const s = 1 + Math.sin(t * 1.5) * 0.04;
                core.scale.setScalar(s); wire.scale.setScalar(s);
                points.rotation.y = t * 0.05;
                points.rotation.x = t * 0.02;
                bubbles.forEach((b) => {
                    const d = b.userData;
                    b.position.y = Math.sin(t * d.sp + d.off) * 1.4 + Math.sin(d.ang) * 0.2;
                    b.rotation.x = t * (0.4 + d.rx);
                    b.rotation.y = t * (0.4 + d.ry);
                });

                // Аватарки на гранях — группа едет вместе с ядром
                avatarGroup.rotation.copy(core.rotation);
                avatarGroup.scale.copy(core.scale);
                if (avatarTextures.length) {
                    let visible = 0;
                    for (const tl of tiles) if (tl.userData.state !== 'idle') visible++;
                    // Спавн новой аватарки на свободной грани, повёрнутой к камере
                    if (!reduce && t > nextSpawn && visible < MAX_VISIBLE) {
                        const candidates = tiles.filter((tl) => {
                            if (tl.userData.state !== 'idle') return false;
                            _wn.copy(tl.userData.normal).applyQuaternion(avatarGroup.quaternion);
                            return _wn.z > 0.35; // фронтальная грань
                        });
                        if (candidates.length) {
                            const tl = candidates[Math.floor(Math.random() * candidates.length)];
                            tl.material.map = avatarTextures[Math.floor(Math.random() * avatarTextures.length)];
                            tl.material.needsUpdate = true;
                            tl.visible = true;
                            tl.userData.state = 'in';
                            tl.userData.t0 = t;
                            tl.userData.dur = 0.6;
                            tl.userData.hold = 3 + Math.random() * 4;
                        }
                        nextSpawn = t + 0.8 + Math.random() * 1.2;
                    }
                    // Обновление состояний плиток
                    for (const tl of tiles) {
                        const u = tl.userData;
                        if (u.state === 'idle') continue;
                        const e = t - u.t0;
                        if (u.state === 'in') {
                            const k = Math.min(e / u.dur, 1);
                            tl.material.opacity = k;
                            tl.scale.setScalar(0.7 + 0.3 * k);
                            if (k >= 1) { u.state = 'show'; u.t0 = t; }
                        } else if (u.state === 'show') {
                            tl.material.opacity = 1;
                            tl.scale.setScalar(1);
                            if (e > u.hold) { u.state = 'out'; u.t0 = t; u.dur = 0.6; }
                        } else if (u.state === 'out') {
                            const k = Math.min(e / u.dur, 1);
                            tl.material.opacity = 1 - k;
                            tl.scale.setScalar(1 - 0.25 * k);
                            if (k >= 1) { u.state = 'idle'; tl.visible = false; }
                        }
                    }
                }

                camera.position.x += (mx * 1.3 - camera.position.x) * 0.05;
                camera.position.y += (-my * 1.1 - camera.position.y) * 0.05;
                camera.lookAt(0, 0, 0);
                renderer.render(scene, camera);
            };
            animate();

            const onResize = () => {
                if (!mountRef.current) return;
                const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
                renderer.setSize(w, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            };
            window.addEventListener('resize', onResize);

            cleanup = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('resize', onResize);
                avatarTextures.forEach((tex: any) => tex.dispose?.());
                tileGeo.dispose();
                scene.traverse((obj: any) => {
                    if (obj.geometry) obj.geometry.dispose?.();
                    if (obj.material) {
                        const m = obj.material;
                        (Array.isArray(m) ? m : [m]).forEach((mm: any) => mm.dispose?.());
                    }
                });
            };
        })();

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            cleanup();
            if (renderer) {
                try { renderer.dispose(); renderer.domElement?.remove(); } catch { }
            }
        };
    }, []);

    return <div ref={mountRef} className={className} aria-hidden="true" />;
};

export default Landing3D;
