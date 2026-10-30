import React, { useEffect, useRef, useState } from 'react';
import { buildAward, createAwardEnvironment } from './awardGeometry';
import { CollectibleTraits } from '../data/awardCollectibles';

export type AwardShape = 'trophy' | 'medal' | 'crystal';
// A single GPU context serves all cards. Idle cards retain a canvas snapshot.
let studio: { renderer: any; environment: any; users: number } | null = null;
const AwardModel: React.FC<{ model: AwardShape; color: string; palette?: CollectibleTraits['palette']; finish?: CollectibleTraits['finish'] }> = ({ model, color, palette, finish }) => {
    const host = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let disposed = false;
        let cleanup = () => {};
        setFailed(false);
        (async () => {
            // @ts-ignore — the project uses three without separate type declarations.
            const T = await import('three');
            if (disposed || !host.current) return;
            if (!studio) {
                const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.setSize(240, 240);
                renderer.toneMapping = T.ACESFilmicToneMapping;
                renderer.toneMappingExposure = 1.15;
                renderer.outputColorSpace = T.SRGBColorSpace;
                studio = { renderer, environment: createAwardEnvironment(T, renderer), users: 0 };
            }
            const stage = studio;
            stage.users++;
            const { renderer } = stage;
            const canvas = document.createElement('canvas');
            canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
            canvas.tabIndex = 0;
            canvas.setAttribute('aria-label', 'Вращать награду: потяните мышью или используйте стрелки');
            canvas.setAttribute('role', 'group');
            const context = canvas.getContext('2d', { willReadFrequently: true })!;
            host.current.appendChild(canvas);
            const scene = new T.Scene();
            scene.environment = stage.environment.texture;
            const camera = new T.PerspectiveCamera(31, 1, 0.1, 30);
            camera.position.set(0, 0.9, 5.5); camera.lookAt(0, 0.04, 0);
            const group = buildAward(T, model, color, palette, finish);
            scene.add(group);
            scene.add(new T.HemisphereLight(0xe2ecff, 0x172038, 0.7));
            const key = new T.DirectionalLight(0xfff3dc, 3); key.position.set(-3, 4, 5); scene.add(key);
            const rim = new T.DirectionalLight(0xabcfff, 2.8); rim.position.set(3, 2, -3); scene.add(rim);
            const fill = new T.DirectionalLight(0xffffff, 0.7); fill.position.set(3, 0, 4); scene.add(fill);
            let yaw = -0.27;
            let pitch = 0;
            let start: { x: number; y: number } | null = null;
            let frame = 0;
            const draw = () => {
                group.rotation.set(pitch, yaw, 0);
                renderer.render(scene, camera);
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(renderer.domElement, 0, 0);
                // Materialize the snapshot before the shared drawing buffer is reused.
                context.putImageData(context.getImageData(0, 0, canvas.width, canvas.height), 0, 0);
            };
            const scheduleDraw = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); };
            const down = (e: PointerEvent) => { start = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
            const move = (e: PointerEvent) => {
                if (!start) return;
                yaw += (e.clientX - start.x) * 0.013;
                pitch = Math.max(-0.45, Math.min(0.45, pitch + (e.clientY - start.y) * 0.008));
                start = { x: e.clientX, y: e.clientY }; scheduleDraw();
            };
            const up = () => { start = null; };
            const keydown = (e: KeyboardEvent) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
                e.preventDefault();
                if (e.key === 'Home') { yaw = -0.27; pitch = 0; }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') yaw += e.key === 'ArrowLeft' ? -0.15 : 0.15;
                else pitch = Math.max(-0.45, Math.min(0.45, pitch + (e.key === 'ArrowUp' ? -0.1 : 0.1)));
                scheduleDraw();
            };
            canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
            canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
            canvas.addEventListener('keydown', keydown);
            draw();
            cleanup = () => {
                cancelAnimationFrame(frame);
                canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
                canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
                canvas.removeEventListener('keydown', keydown);
                const materials = new Set<any>();
                group.traverse((item: any) => { item.geometry?.dispose(); if (item.material) materials.add(item.material); });
                materials.forEach(material => material.dispose());
                canvas.remove();
                if (--stage.users === 0) { stage.environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); studio = null; }
            };
        })().catch(() => { if (!disposed) setFailed(true); });
        return () => { disposed = true; cleanup(); };
    }, [model, color, palette, finish]);
    return <div ref={host} className="award-model" style={{ '--award-color': color } as React.CSSProperties}>
        {failed && <span role="img" aria-label="Награда" style={{ color, fontSize: 64 }}>{model === 'trophy' ? '🏆' : model === 'medal' ? '🏅' : '💎'}</span>}
    </div>;
};
export default AwardModel;
