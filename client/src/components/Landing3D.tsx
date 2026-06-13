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
const Landing3D: React.FC<{ className?: string }> = ({ className }) => {
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
