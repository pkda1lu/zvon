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

            // ===== Далёкое Солнце (процедурное, на шейдерах) =====
            // Кипящая поверхность (FBM-шум), асимметричные протуберанцы по краю
            // и мягкое гало — без текстур, всё считается в реальном времени.
            const GLSL_NOISE = `
              vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
              vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
              vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
              vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
              float snoise(vec3 v){
                const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
                vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
                vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
                vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
                i=mod289(i);
                vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
                float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
                vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
                vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
                vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
                vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
                vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
                vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
                vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
                p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
                vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
                return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
              }
              float fbm(vec3 p){ float f=0.0,a=0.5; for(int i=0;i<5;i++){ f+=a*snoise(p); p*=2.0; a*=0.5; } return f*0.5+0.5; }
            `;
            const sunUniforms = { uTime: { value: 0 } };

            const sunGroup = new THREE.Group();
            // Размещаем солнце вдоль того же луча камеры, но ближе звёздной
            // оболочки (r=7..16) — экранно так же (верхний левый угол),
            // но звёзды всегда остаются позади солнца.
            sunGroup.position.set(-3.94, 2.21, -3.95);
            scene.add(sunGroup);

            const SUN_R = 0.54;
            const sunSurfMat = new THREE.ShaderMaterial({
                uniforms: sunUniforms,
                vertexShader: `varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
                fragmentShader: GLSL_NOISE + `
                    uniform float uTime; varying vec3 vPos;
                    void main(){
                      vec3 p = normalize(vPos);
                      float n  = fbm(p*2.6 + vec3(0.0, uTime*0.06, uTime*0.03));
                      float n2 = fbm(p*6.0 - vec3(uTime*0.10));
                      float h = n*0.6 + n2*0.4;
                      vec3 c1 = vec3(0.30,0.05,0.0);
                      vec3 c2 = vec3(0.82,0.30,0.03);
                      vec3 c3 = vec3(0.92,0.64,0.22);
                      vec3 col = mix(c1,c2, smoothstep(0.18,0.55,h));
                      col = mix(col,c3, smoothstep(0.55,0.85,h));
                      col += pow(max(h-0.72,0.0),2.0)*2.0;
                      gl_FragColor = vec4(col,1.0);
                    }`,
            });
            const sunSurface = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 64), sunSurfMat);
            sunGroup.add(sunSurface);

            const promMat = new THREE.ShaderMaterial({
                uniforms: sunUniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
                vertexShader: `varying vec3 vPos; varying vec3 vN; void main(){ vPos=position; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
                fragmentShader: GLSL_NOISE + `
                    uniform float uTime; varying vec3 vPos; varying vec3 vN;
                    void main(){
                      float rim = pow(1.0 - max(dot(vN, vec3(0.0,0.0,1.0)), 0.0), 2.0);
                      vec3 dir = normalize(vPos);
                      float region = fbm(dir*1.05 + vec3(0.0, uTime*0.04, 0.0));
                      region = pow(smoothstep(0.52, 0.82, region), 1.6);
                      float tongue = fbm(dir*4.8 + vec3(uTime*0.22, 0.0, uTime*0.1));
                      float e = rim * region * smoothstep(0.30, 0.9, tongue);
                      vec3 col = mix(vec3(1.0,0.38,0.03), vec3(1.0,0.80,0.30), tongue) * e * 3.0;
                      gl_FragColor = vec4(col, e);
                    }`,
            });
            const prominences = new THREE.Mesh(new THREE.SphereGeometry(SUN_R * 1.14, 64, 64), promMat);
            sunGroup.add(prominences);

            const coronaMat = new THREE.ShaderMaterial({
                uniforms: sunUniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
                vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
                fragmentShader: GLSL_NOISE + `
                    uniform float uTime; varying vec2 vUv;
                    void main(){
                      vec2 p = vUv*2.0-1.0;
                      float r = length(p);
                      float glow = smoothstep(0.85, 0.0, r);
                      glow = pow(glow, 2.2);
                      vec3 col = mix(vec3(1.0,0.42,0.05), vec3(1.0,0.70,0.22), glow);
                      gl_FragColor = vec4(col, clamp(glow,0.0,1.0)*0.55);
                    }`,
            });
            const sunCorona = new THREE.Mesh(new THREE.PlaneGeometry(SUN_R * 9, SUN_R * 9), coronaMat);
            sunGroup.add(sunCorona);

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
                sunUniforms.uTime.value = t;
                sunSurface.rotation.y = t * 0.02;
                prominences.rotation.y = sunSurface.rotation.y;
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
                [dayMap, normalMap, specMap, moonMap, satelliteMap, cloudsMap, starSprite].forEach((tx: any) => tx.dispose?.());
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
