import React, { useEffect, useRef } from 'react';

/**
 * Фоновая WebGL-сцена для лендинга (тема Zvon — глобальная связь):
 *  - реалистичная Земля (текстуры суши/облаков + атмосферное свечение);
 *  - спутники на орбитах вокруг планеты;
 *  - звёздное небо из частиц;
 *  - параллакс по движению мыши.
 *
 * three подключается динамически (npm i three) — поэтому импорт помечен
 * @ts-ignore, чтобы проверка типов не падала до установки пакета.
 */
const TEX = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`;

const Landing3D: React.FC<{ className?: string; avatars?: string[] }> = ({ className }) => {
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

            // Группа планеты — двигается/масштабируется по скроллу (кинематограф).
            const planet = new THREE.Group();
            scene.add(planet);

            // Свет: мягкая заливка + «солнце» сбоку для объёмной терминаторной тени.
            scene.add(new THREE.AmbientLight(0x3a4f6b, 1.4));
            const sun = new THREE.DirectionalLight(0xfff4e6, 3.2);
            sun.position.set(5, 2, 4);
            scene.add(sun);
            const rim = new THREE.PointLight(0x3a86ff, 1.7, 60);
            rim.position.set(-6, -1, 2);
            scene.add(rim);

            const R = 1.5; // радиус Земли
            const loader = new THREE.TextureLoader();
            const load = (name: string) => {
                const t = loader.load(TEX(name), () => { }, undefined, () => {
                    console.warn('[Landing3D] не удалось загрузить текстуру', name);
                });
                return t;
            };

            // ===== Земля =====
            const dayMap = load('earth_day.jpg');
            dayMap.colorSpace = THREE.SRGBColorSpace;
            const normalMap = load('earth_normal.jpg');
            const specMap = load('earth_specular.jpg');
            const earthMat = new THREE.MeshStandardMaterial({
                map: dayMap,
                normalMap,
                normalScale: new THREE.Vector2(0.85, 0.85),
                roughnessMap: specMap, // океаны (светлые в spec) → более гладкие/блестящие
                roughness: 0.8,
                metalness: 0.0,
                // Самосвечение по дневной текстуре — планета яркая и сочная,
                // ночная сторона не проваливается в чёрный.
                emissiveMap: dayMap,
                emissive: 0xffffff,
                emissiveIntensity: 0.4,
            });
            const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64), earthMat);
            earth.rotation.z = -0.41; // наклон оси ~23.5°
            planet.add(earth);

            // ===== Облака =====
            const cloudsMap = load('earth_clouds.png');
            cloudsMap.colorSpace = THREE.SRGBColorSpace;
            const clouds = new THREE.Mesh(
                new THREE.SphereGeometry(R * 1.012, 64, 64),
                new THREE.MeshStandardMaterial({
                    map: cloudsMap,
                    alphaMap: cloudsMap,
                    transparent: true,
                    opacity: 0.85,
                    depthWrite: false,
                    roughness: 1,
                    metalness: 0,
                })
            );
            clouds.rotation.z = earth.rotation.z;
            planet.add(clouds);

            // ===== Атмосферное свечение (Fresnel-halo) =====
            const atmoMat = new THREE.ShaderMaterial({
                uniforms: { glowColor: { value: new THREE.Color(0x3a86ff) } },
                vertexShader: `
                    varying vec3 vNormal;
                    void main() {
                        vNormal = normalize(normalMatrix * normal);
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 glowColor;
                    varying vec3 vNormal;
                    void main() {
                        float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
                        gl_FragColor = vec4(glowColor, 1.0) * intensity;
                    }
                `,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending,
                transparent: true,
                depthWrite: false,
            });
            const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.22, 64, 64), atmoMat);
            planet.add(atmosphere);

            // ===== Звёзды =====
            // Спрайт-звезда: мягкое радиальное свечение на canvas.
            const starSprite = (() => {
                const S = 64;
                const cv = document.createElement('canvas');
                cv.width = cv.height = S;
                const ctx = cv.getContext('2d')!;
                const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
                g.addColorStop(0, 'rgba(255,255,255,1)');
                g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
                g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, S, S);
                const tex = new THREE.CanvasTexture(cv);
                tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            })();

            const COUNT = 1400;
            const positions = new Float32Array(COUNT * 3);
            const colors = new Float32Array(COUNT * 3);
            const starTint = new THREE.Color();
            for (let i = 0; i < COUNT; i++) {
                // Распределяем по сферической оболочке вокруг сцены (звёздный купол).
                const r = 7 + Math.random() * 9;
                const theta = Math.acos(2 * Math.random() - 1);
                const phi = Math.random() * Math.PI * 2;
                positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
                positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
                positions[i * 3 + 2] = r * Math.cos(theta);
                // Лёгкая вариация цвета: тёплые/нейтральные/холодные звёзды.
                const h = 0.55 + (Math.random() - 0.5) * 0.18;
                const l = 0.7 + Math.random() * 0.3;
                starTint.setHSL(h, 0.35 * Math.random(), l);
                colors[i * 3] = starTint.r;
                colors[i * 3 + 1] = starTint.g;
                colors[i * 3 + 2] = starTint.b;
            }
            const pGeo = new THREE.BufferGeometry();
            pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const stars = new THREE.Points(pGeo, new THREE.PointsMaterial({
                map: starSprite,
                size: 0.13,
                sizeAttenuation: true,
                vertexColors: true,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }));
            scene.add(stars);

            // ===== Спутники на орбитах =====
            // Текстура солнечной панели: тёмно-синее поле с сеткой ячеек.
            const panelTexture = (() => {
                const cw = 128, ch = 64;
                const cv = document.createElement('canvas');
                cv.width = cw; cv.height = ch;
                const ctx = cv.getContext('2d')!;
                ctx.fillStyle = '#0b1f4d';
                ctx.fillRect(0, 0, cw, ch);
                ctx.strokeStyle = 'rgba(90,150,255,0.55)';
                ctx.lineWidth = 1;
                for (let x = 0; x <= cw; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
                for (let y = 0; y <= ch; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
                const tex = new THREE.CanvasTexture(cv);
                tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            })();

            const makeSatellite = (accent: number) => {
                const sat = new THREE.Group();

                // Корпус — золотая фольга (цилиндр).
                const busMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1.0, roughness: 0.35 });
                const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 16), busMat);
                bus.rotation.z = Math.PI / 2; // ось корпуса вдоль X
                sat.add(bus);
                // Торцы корпуса — тёмный металл.
                const capMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.9, roughness: 0.4 });
                const capGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.03, 16);
                const cap1 = new THREE.Mesh(capGeo, capMat); cap1.rotation.z = Math.PI / 2; cap1.position.x = 0.13; sat.add(cap1);
                const cap2 = new THREE.Mesh(capGeo, capMat); cap2.rotation.z = Math.PI / 2; cap2.position.x = -0.13; sat.add(cap2);

                // Солнечные панели — два крыла на штангах по оси Z.
                const panelMat = new THREE.MeshStandardMaterial({
                    map: panelTexture, emissive: 0x18316b, emissiveIntensity: 0.5,
                    metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide,
                });
                const armMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.8, roughness: 0.4 });
                const panelGeo = new THREE.BoxGeometry(0.04, 0.22, 0.34);
                const armGeo = new THREE.BoxGeometry(0.012, 0.012, 0.16);
                for (const dir of [1, -1]) {
                    const arm = new THREE.Mesh(armGeo, armMat); arm.position.z = dir * 0.18; sat.add(arm);
                    const wing = new THREE.Mesh(panelGeo, panelMat); wing.position.z = dir * 0.44; sat.add(wing);
                }

                // Параболическая тарелка-антенна спереди.
                const dishMat = new THREE.MeshStandardMaterial({ color: 0xeef2f6, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide });
                const dish = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), dishMat);
                dish.rotation.z = -Math.PI / 2; dish.position.x = 0.2; sat.add(dish);
                const feed = new THREE.Mesh(
                    new THREE.SphereGeometry(0.02, 8, 8),
                    new THREE.MeshBasicMaterial({ color: accent })
                );
                feed.position.x = 0.28; sat.add(feed);

                sat.scale.setScalar(0.85);
                return sat;
            };

            const satColors = [0x00e5ff, 0xa155ff, 0x38f9d7, 0xffd166];
            const satellites: any[] = [];
            const SAT_N = 5;
            for (let i = 0; i < SAT_N; i++) {
                const sat = makeSatellite(satColors[i % satColors.length]);
                const orbitR = R + 0.9 + i * 0.45 + Math.random() * 0.2;
                const incl = (Math.random() - 0.5) * 1.4;
                const node = Math.random() * Math.PI * 2; // долгота восходящего узла
                const phase = Math.random() * Math.PI * 2;
                const speed = 0.35 + Math.random() * 0.3;
                sat.userData = { orbitR, incl, node, phase, speed };
                planet.add(sat);
                satellites.push(sat);

                // Тонкое кольцо орбиты.
                const ring = new THREE.Mesh(
                    new THREE.RingGeometry(orbitR - 0.004, orbitR + 0.004, 128),
                    new THREE.MeshBasicMaterial({
                        color: satColors[i % satColors.length],
                        transparent: true, opacity: 0.12,
                        side: THREE.DoubleSide, depthWrite: false,
                        blending: THREE.AdditiveBlending,
                    })
                );
                ring.rotation.x = Math.PI / 2 + incl;
                ring.rotation.y = node;
                planet.add(ring);
            }

            const satPos = (d: any, t: number) => {
                const a = d.phase + t * d.speed;
                // Орбита в плоскости XZ, затем наклон (incl) и поворот узла (node).
                const x0 = Math.cos(a) * d.orbitR;
                const z0 = Math.sin(a) * d.orbitR;
                // наклон вокруг оси X
                const y1 = -z0 * Math.sin(d.incl);
                const z1 = z0 * Math.cos(d.incl);
                // поворот узла вокруг Y
                const x = x0 * Math.cos(d.node) + z1 * Math.sin(d.node);
                const z = -x0 * Math.sin(d.node) + z1 * Math.cos(d.node);
                return new THREE.Vector3(x, y1, z);
            };

            let mx = 0, my = 0;
            const onMove = (e: MouseEvent) => {
                mx = (e.clientX / window.innerWidth - 0.5);
                my = (e.clientY / window.innerHeight - 0.5);
            };
            window.addEventListener('mousemove', onMove);

            // ===== Скролл-кинематограф: «остановки» планеты =====
            // Каждая остановка соответствует full-screen сцене лендинга.
            // x/y — смещение в мире (низ-влево, низ-вправо…), s — масштаб (зум).
            const STOPS = [
                { x: 0.0, y: 0.0, s: 1.0 },   // 0 — герой, в центре
                { x: -2.7, y: -1.5, s: 1.55 }, // 1 — вниз-влево, текст справа
                { x: 2.7, y: -1.5, s: 1.65 },  // 2 — вниз-вправо, текст слева
                { x: -2.5, y: 1.4, s: 1.4 },   // 3 — вверх-влево, текст внизу-справа
                { x: 0.0, y: -0.2, s: 1.15 },  // 4 — снова в центр, CTA
            ];
            const SEGMENTS = STOPS.length - 1;
            // Лендинг скроллится НЕ окном, а контейнером (.landing-container, overflow:auto).
            // Находим реальный скролл-контейнер и читаем его scrollTop прямо в кадре.
            const findScroller = (): any => {
                let n: any = el.parentElement;
                while (n && n !== document.body) {
                    const oy = getComputedStyle(n).overflowY;
                    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n;
                    n = n.parentElement;
                }
                return window;
            };
            const scroller: any = findScroller();
            const readTop = () => (scroller === window ? (window.scrollY || 0) : (scroller.scrollTop || 0));
            const readVh = () => (scroller === window ? (window.innerHeight || 1) : (scroller.clientHeight || 1));
            const smooth = (a: number) => a * a * (3 - 2 * a);
            // На узких экранах смещение в углы уменьшаем, чтобы планета не улетала.
            const rf = () => Math.min(1, (window.innerWidth || 1000) / 1100);

            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const clock = new THREE.Clock();
            const _v = new THREE.Vector3();

            const animate = () => {
                raf = requestAnimationFrame(animate);
                const t = reduce ? 0 : clock.getElapsedTime();

                earth.rotation.y = t * 0.06;
                clouds.rotation.y = t * 0.085;
                stars.rotation.y = t * 0.01;

                satellites.forEach((sat) => {
                    const d = sat.userData;
                    const p = satPos(d, t);
                    sat.position.copy(p);
                    // Ориентируем спутник «по движению» (смотрит вперёд по орбите).
                    const ahead = satPos(d, t + 0.05);
                    sat.lookAt(ahead);
                    sat.rotateY(t * 0.5);
                });

                // Скролл: интерполяция между остановками + плавный лерп планеты.
                const scrollP = Math.max(0, Math.min(1, readTop() / (SEGMENTS * readVh())));
                const seg = scrollP * SEGMENTS;
                const i0 = Math.min(SEGMENTS, Math.floor(seg));
                const i1 = Math.min(SEGMENTS, i0 + 1);
                const f = smooth(seg - i0);
                const factor = rf();
                const tx = (STOPS[i0].x + (STOPS[i1].x - STOPS[i0].x) * f) * factor;
                const ty = STOPS[i0].y + (STOPS[i1].y - STOPS[i0].y) * f;
                const ts = STOPS[i0].s + (STOPS[i1].s - STOPS[i0].s) * f;
                planet.position.x += (tx - planet.position.x) * 0.08;
                planet.position.y += (ty - planet.position.y) * 0.08;
                const cs = planet.scale.x + (ts - planet.scale.x) * 0.08;
                planet.scale.setScalar(cs);

                camera.position.x += (mx * 0.9 - camera.position.x) * 0.05;
                camera.position.y += (-my * 0.7 - camera.position.y) * 0.05;
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
                [dayMap, normalMap, specMap, cloudsMap, starSprite, panelTexture].forEach((tx: any) => tx.dispose?.());
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
