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
            scene.add(new THREE.AmbientLight(0x33465f, 1.25));
            const sun = new THREE.DirectionalLight(0xfff4e6, 3.2);
            sun.position.set(5, 2, 4);
            scene.add(sun);
            const rim = new THREE.PointLight(0x5aa7ff, 0.85, 60);
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
            const moonMap = load('moon_2k.jpg');
            moonMap.colorSpace = THREE.SRGBColorSpace;
            const sunMap = load('sun_2k.jpg');
            sunMap.colorSpace = THREE.SRGBColorSpace;
            const satelliteMap = load('satellite_goesr.png');
            satelliteMap.colorSpace = THREE.SRGBColorSpace;
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
                uniforms: { glowColor: { value: new THREE.Color(0x4f9cff) } },
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
                        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 5.0);
                        gl_FragColor = vec4(glowColor, 1.0) * intensity * 0.42;
                    }
                `,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending,
                transparent: true,
                depthWrite: false,
            });
            const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.13, 64, 64), atmoMat);
            planet.add(atmosphere);

            // ===== Далёкое Солнце =====
            const coronaTexture = (() => {
                const S = 512;
                const cv = document.createElement('canvas');
                cv.width = cv.height = S;
                const ctx = cv.getContext('2d')!;
                const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S / 2);
                g.addColorStop(0, 'rgba(255,245,190,0.95)');
                g.addColorStop(0.2, 'rgba(255,176,64,0.55)');
                g.addColorStop(0.46, 'rgba(255,92,22,0.18)');
                g.addColorStop(1, 'rgba(255,92,22,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, S, S);
                const tex = new THREE.CanvasTexture(cv);
                tex.colorSpace = THREE.SRGBColorSpace;
                return tex;
            })();

            const sunGroup = new THREE.Group();
            sunGroup.position.set(-5.7, 3.2, -8.5);
            scene.add(sunGroup);

            const sunSurface = new THREE.Mesh(
                new THREE.SphereGeometry(0.78, 64, 64),
                new THREE.MeshBasicMaterial({
                    map: sunMap,
                    color: 0xfff0c0,
                    toneMapped: false,
                })
            );
            sunGroup.add(sunSurface);

            const sunCorona = new THREE.Sprite(new THREE.SpriteMaterial({
                map: coronaTexture,
                color: 0xffb25a,
                transparent: true,
                opacity: 0.58,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }));
            sunCorona.scale.set(4.8, 4.8, 1);
            sunGroup.add(sunCorona);

            const sunCoreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: coronaTexture,
                color: 0xfff1a8,
                transparent: true,
                opacity: 0.35,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }));
            sunCoreGlow.scale.set(2.1, 2.1, 1);
            sunGroup.add(sunCoreGlow);

            const sunLight = new THREE.PointLight(0xffc875, 2.0, 80);
            sunLight.position.copy(sunGroup.position);
            scene.add(sunLight);

            // ===== Луна на орбите вокруг Земли =====
            const moonOrbit = new THREE.Group();
            moonOrbit.rotation.set(0.35, 0.08, -0.22);
            planet.add(moonOrbit);

            const moon = new THREE.Mesh(
                new THREE.SphereGeometry(R * 0.24, 48, 48),
                new THREE.MeshStandardMaterial({
                    map: moonMap,
                    bumpMap: moonMap,
                    bumpScale: 0.025,
                    roughness: 0.95,
                    metalness: 0,
                })
            );
            moon.position.set(R + 2.85, 0.28, 0.4);
            moonOrbit.add(moon);

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

            // ===== Спутники на эллиптических орбитах =====
            const makeSatellite = (scale = 1) => {
                const sat = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: satelliteMap,
                    transparent: true,
                    depthWrite: false,
                    alphaTest: 0.04,
                    toneMapped: false,
                }));
                sat.scale.set(0.78 * scale, 0.44 * scale, 1);
                return sat;
            };

            const satellites: any[] = [];
            const SAT_ORBITS = [
                { a: R + 2.35, e: 0.12, incl: 0.58, node: 0.75, arg: 0.25, phase: 0.4, speed: 0.22, scale: 0.82 },
                { a: R + 3.05, e: 0.2, incl: -0.42, node: 2.45, arg: 1.25, phase: 2.8, speed: 0.16, scale: 0.68 },
                { a: R + 3.8, e: 0.08, incl: 0.28, node: -1.1, arg: 2.2, phase: 4.6, speed: 0.12, scale: 0.58 },
            ];
            SAT_ORBITS.forEach((orbit) => {
                const sat = makeSatellite(orbit.scale);
                sat.userData = orbit;
                planet.add(sat);
                satellites.push(sat);
            });

            const satPos = (d: any, t: number) => {
                const mean = d.phase + t * d.speed;
                let eccentric = mean;
                for (let k = 0; k < 3; k++) {
                    eccentric -= (eccentric - d.e * Math.sin(eccentric) - mean) / (1 - d.e * Math.cos(eccentric));
                }
                const b = d.a * Math.sqrt(1 - d.e * d.e);
                const ox = d.a * (Math.cos(eccentric) - d.e);
                const oz = b * Math.sin(eccentric);
                const ca = Math.cos(d.arg), sa = Math.sin(d.arg);
                const x0 = ox * ca - oz * sa;
                const z0 = ox * sa + oz * ca;
                const y1 = -z0 * Math.sin(d.incl);
                const z1 = z0 * Math.cos(d.incl);
                const cn = Math.cos(d.node), sn = Math.sin(d.node);
                return new THREE.Vector3(x0 * cn + z1 * sn, y1, -x0 * sn + z1 * cn);
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
                sunSurface.rotation.y = t * 0.018;
                sunCorona.material.rotation = t * 0.012;
                sunCoreGlow.material.rotation = -t * 0.018;
                moonOrbit.rotation.y = t * 0.18;
                moon.rotation.y = t * 0.045;

                satellites.forEach((sat) => {
                    const d = sat.userData;
                    const p = satPos(d, t);
                    sat.position.copy(p);
                    const ahead = satPos(d, t + 0.08);
                    sat.material.rotation = Math.atan2(ahead.y - p.y, ahead.x - p.x) * 0.35 + Math.sin(t * 0.6 + d.phase) * 0.08;
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
                [dayMap, normalMap, specMap, moonMap, sunMap, satelliteMap, cloudsMap, coronaTexture, starSprite].forEach((tx: any) => tx.dispose?.());
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
