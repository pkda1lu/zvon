import { AWARD_PALETTES, CollectibleTraits } from '../data/awardCollectibles';
import { createAwardSurface, smoothAwardNormals, solidAwardSheet, subdivideAwardRelief } from './awardSurface';
/**
 * Zvon award family: smoked metal, polished silver, rounded chat silhouettes
 * and a sculpted Z matching public/zvonlogonew.png.
 */
export function buildAward(T: any, model: string, color: string, palette?: CollectibleTraits['palette'], finish: CollectibleTraits['finish'] = 'polished') {
    const swatch = AWARD_PALETTES[palette || 'graphite'];
    const roughness = finish === 'satin' ? 0.4 : finish === 'frosted' ? 0.62 : finish === 'brushed' ? 0.46 : finish === 'ceramic' ? 0.16 : 0.19;
    const accentColor = palette ? swatch.accent : color;
    const root = new T.Group();
    const silver = new T.MeshPhysicalMaterial({ color: swatch.metal, metalness: 0.96, roughness, clearcoat: 0.5 });
    const mark = new T.MeshPhysicalMaterial({ color: swatch.mark, metalness: 0.58, roughness: Math.max(0.25, roughness), clearcoat: 0.7, emissive: swatch.metal, emissiveIntensity: 0.15 });
    const graphite = new T.MeshPhysicalMaterial({ color: swatch.body, metalness: finish === 'ceramic' ? 0.08 : 0.8, roughness: finish === 'ceramic' ? 0.16 : Math.max(0.23, roughness), clearcoat: finish === 'frosted' ? 0.1 : 1 });
    const surface = createAwardSurface(T);
    for (const material of [silver, mark, graphite]) {
        material.normalMap = surface.normal; material.roughnessMap = surface.roughness;
        material.normalScale = new T.Vector2(finish === 'polished' ? 0.1 : 0.22, finish === 'polished' ? 0.1 : 0.22);
    }
    if (finish === 'brushed') {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#888'; context.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y++) { context.fillStyle = `rgb(${100 + (y * 37 % 72)},${100 + (y * 37 % 72)},${100 + (y * 37 % 72)})`; context.fillRect(0, y, 128, 1); }
        const grain = new T.CanvasTexture(canvas); grain.wrapS = grain.wrapT = T.RepeatWrapping; grain.repeat.set(4, 2);
        graphite.bumpMap = grain; graphite.bumpScale = 0.012; silver.bumpMap = grain; silver.bumpScale = 0.008;
    }
    const black = new T.MeshPhysicalMaterial({ color: '#101117', metalness: 0.45, roughness: 0.21, clearcoat: 1 });
    const accent = new T.MeshStandardMaterial({ color: accentColor, metalness: 0.45, roughness: 0.25, emissive: accentColor, emissiveIntensity: 0.12 });
    const add = (geometry: any, material: any, x = 0, y = 0, z = 0, parent = root) => {
        const mesh = new T.Mesh(geometry, material);
        mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    const lathe = (points: number[][], material: any, roundProfile = false) => {
        const profile: any[] = [];
        const source = points.map(([r, y]) => new T.Vector2(r, y));
        source.forEach((point, i) => {
            if (!roundProfile || i === 0 || i === source.length - 1) { profile.push(point); return; }
            const a = point.clone().lerp(source[i - 1], 0.18), b = point.clone().lerp(source[i + 1], 0.18);
            profile.push(...new T.QuadraticBezierCurve(a, point, b).getPoints(6));
        });
        return add(new T.LatheGeometry(profile, 192), material);
    };
    const ring = (radius: number, tube: number, y: number, material = silver) => {
        const part = add(new T.TorusGeometry(radius, tube, 24, 192), material, 0, y);
        part.rotation.x = Math.PI / 2; return part;
    };
    const curve = (points: number[][], radius: number, material: any) => add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), 96, radius, 20, false), material);
    const rounded = (w: number, h: number, r: number) => {
        const s = new T.Shape(), x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); s.closePath(); return s;
    };
    const plate = (w: number, h: number, r: number, depth: number, material: any, x: number, y: number, z: number) =>
        add(smoothAwardNormals(T, new T.ExtrudeGeometry(rounded(w, h, r), { depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 10, curveSegments: 64 })), material, x, y, z);
    const logo = (width: number, x: number, y: number, z: number, material = mark) => {
        // Rounded Z with the distinctive speech-tail, traced from the app mark.
        const s = new T.Shape();
        const move = (px: number, py: number) => s.moveTo(px - 450, 450 - py);
        const line = (px: number, py: number) => s.lineTo(px - 450, 450 - py);
        const bezier = (a: number, b: number, c: number, d: number, e: number, f: number) => s.bezierCurveTo(a - 450, 450 - b, c - 450, 450 - d, e - 450, 450 - f);
        move(310, 183); line(583, 183);
        bezier(632, 183, 667, 222, 667, 274);
        bezier(667, 308, 652, 334, 624, 360);
        line(457, 525); line(581, 525);
        bezier(631, 525, 667, 550, 667, 593);
        bezier(667, 622, 645, 644, 613, 658);
        line(613, 700); bezier(613, 713, 607, 717, 595, 709);
        line(547, 679); bezier(537, 673, 524, 670, 506, 670);
        line(313, 670); bezier(264, 670, 231, 640, 231, 594);
        bezier(231, 563, 243, 542, 267, 517);
        line(449, 339); line(310, 339);
        bezier(261, 339, 231, 310, 231, 262);
        bezier(231, 214, 261, 183, 310, 183); s.closePath();
        const geometry = smoothAwardNormals(T, new T.ExtrudeGeometry(s, { depth: 24, bevelEnabled: true, bevelSize: 7, bevelThickness: 7, bevelSegments: 10, curveSegments: 64 }));
        geometry.scale(width / 450, width / 450, width / 450);
        const vertices = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
        for (let i = 0; i < vertices.count; i++) uv.setXY(i, vertices.getX(i) / width + 0.5, vertices.getY(i) / width + 0.5);
        return add(geometry, material, x, y, z);
    };
    const conformCrest = (crest: any, profile: number[][]) => {
        crest.geometry = subdivideAwardRelief(T, crest.geometry);
        const vertices = crest.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i), y = vertices.getY(i) + crest.position.y;
            let r = profile[profile.length - 1][1];
            for (let j = 1; j < profile.length; j++) if (y <= profile[j][0]) { const a = profile[j - 1], b = profile[j], t = Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0]))); r = a[1] + (b[1] - a[1]) * t; break; }
            vertices.setZ(i, vertices.getZ(i) + Math.sqrt(Math.max(0, r * r - x * x)) + 0.012 - crest.position.z);
        }
        smoothAwardNormals(T, crest.geometry, Math.PI / 3, false);
        crest.geometry.userData.conformedRelief = true;
    };
    const base = () => {
        lathe([[0, -1.15], [0.57, -1.15], [0.62, -1.1], [0.62, -1.01], [0.56, -0.96], [0, -0.96]], black, true);
        ring(0.58, 0.018, -0.99);
        ring(0.6, 0.008, -1.09, accent);
        // Three small equalizer bars are milled into the front of each plinth.
        for (let i = -1; i <= 1; i++) plate(0.021, i === 0 ? 0.065 : 0.04, 0.01, 0.008, silver, i * 0.05, -1.045, 0.617);
    };

    if (model === 'trophy') {
        base();
        // A flowing, dark cup with a polished mouth and a silver Z crest.
        const cup = lathe([[0, -0.96], [0.28, -0.96], [0.3, -0.91], [0.2, -0.84], [0.095, -0.72], [0.085, -0.41], [0.16, -0.29], [0.28, -0.23], [0.4, -0.08], [0.51, 0.16], [0.58, 0.47], [0.6, 0.7], [0.58, 0.74], [0.54, 0.73], [0.53, 0.49], [0.46, 0.2], [0.35, -0.04], [0.22, -0.19], [0, -0.23]], graphite, true);
        cup.name = 'trophy-hollow-cup';
        ring(0.574, 0.03, 0.73);
        ring(0.092, 0.015, -0.57, accent);
        ring(0.265, 0.018, -0.92);
        // Open, swept side handles repeat the rounded return strokes of the logo.
        for (const side of [-1, 1]) {
            const handle = curve([[side * 0.56, 0.58, 0], [side * 0.83, 0.67, 0], [side * 0.96, 0.48, 0], [side * 0.88, 0.16, 0], [side * 0.65, -0.05, 0], [side * 0.37, -0.1, 0]], 0.048, silver);
            handle.name = 'trophy-sculpted-handle';
            const vertices = handle.geometry.getAttribute('position'), centerline = handle.geometry.parameters.path;
            for (let i = 0; i < vertices.count; i++) {
                const t = Math.floor(i / 21) / 96, center = centerline.getPointAt(t), swell = 0.85 + Math.sin(t * Math.PI) * 0.32;
                vertices.setXYZ(i, center.x + (vertices.getX(i) - center.x) * swell, center.y + (vertices.getY(i) - center.y) * swell, center.z + (vertices.getZ(i) - center.z) * swell);
            }
            handle.geometry.computeVertexNormals();
            for (const [x, y] of [[0.56, 0.58], [0.37, -0.1]]) { const joint = add(new T.SphereGeometry(0.067, 40, 24), silver, side * x, y); joint.scale.set(0.7, 1, 0.7); }
            curve([[side * 0.81, 0.47, 0], [side * 0.78, 0.28, 0], [side * 0.63, 0.13, 0]], 0.012, accent);
        }
        const crest = logo(0.37, 0, 0.32, 0.573);
        conformCrest(crest, [[-0.08, 0.4], [0.16, 0.51], [0.47, 0.58], [0.7, 0.6]]);
        // Sound-wave grooves form a restrained signature below the crest.
        for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
            const x = side * (0.28 + i * 0.065);
            curve([[x, 0.05 + i * 0.03, 0.39 - i * 0.035], [x * 1.07, 0.22 + i * 0.015, 0.42 - i * 0.04]], 0.009, silver);
        }
    } else if (model === 'medal') {
        // The medal is a physical version of Zvon's rounded-square app icon.
        const ribbon = new T.MeshPhysicalMaterial({ color: '#34374a', roughness: 0.72, metalness: 0, sheen: 0.85, sheenColor: new T.Color('#aab2d1'), normalMap: surface.normal, normalScale: new T.Vector2(0.55, 0.55), roughnessMap: surface.roughness });
        for (const side of [-1, 1]) {
            const stripGroup = new T.Group(); stripGroup.position.set(side * 0.2, 0.91, -0.09); stripGroup.rotation.z = -side * 0.32; root.add(stripGroup);
            const geometry = new T.ExtrudeGeometry(rounded(0.28, 0.88, 0.055), { depth: 0.024, steps: 32, bevelSize: 0.009, bevelThickness: 0.009, bevelSegments: 8, curveSegments: 48 });
            const position = geometry.getAttribute('position');
            for (let i = 0; i < position.count; i++) { const y = position.getY(i); position.setZ(i, position.getZ(i) + Math.sin((y + 0.44) / 0.88 * Math.PI) * 0.04); }
            add(smoothAwardNormals(T, geometry), ribbon, 0, 0, 0, stripGroup);
            for (const x of [-0.105, 0.105]) {
                const points = Array.from({ length: 33 }, (_, i) => { const y = -0.28 + i * 0.68 / 32; return new T.Vector3(x, y, 0.035 + Math.sin((y + 0.44) / 0.88 * Math.PI) * 0.04); });
                add(new T.TubeGeometry(new T.CatmullRomCurve3(points), 48, 0.004, 8, false), silver, 0, 0, 0, stripGroup);
            }
        }
        const hanger = add(new T.TorusGeometry(0.09, 0.021, 24, 128), silver, 0, 0.56); hanger.rotation.y = 0.12;
        plate(1.22, 1.22, 0.32, 0.14, silver, 0, -0.16, -0.08);
        plate(1.12, 1.12, 0.29, 0.075, graphite, 0, -0.16, 0.054);
        logo(0.68, 0, -0.12, 0.16);
        plate(0.19, 0.018, 0.008, 0.007, accent, 0, -0.68, 0.17);
        // Reverse side carries a smaller sculpted maker's mark as well.
        logo(0.3, 0, -0.12, -0.15).rotation.y = Math.PI;
        root.position.y = -0.13;
    } else if (model === 'rose') {
        base();
        const petals = new T.MeshPhysicalMaterial({ color: new T.Color(swatch.body).lerp(new T.Color(swatch.metal), 0.23), metalness: finish === 'ceramic' ? 0.12 : 0.3, roughness: Math.max(0.32, roughness), clearcoat: 0.5, side: T.DoubleSide });
        const petalEdge = new T.MeshPhysicalMaterial({ color: new T.Color(swatch.body).lerp(new T.Color(swatch.metal), 0.4), metalness: 0.32, roughness: 0.35, side: T.DoubleSide });
        const foliage = new T.MeshPhysicalMaterial({ color: new T.Color(swatch.body).lerp(new T.Color('#368571'), 0.45), metalness: 0.5, roughness: 0.34, side: T.DoubleSide });
        for (const material of [petals, petalEdge, foliage]) { material.normalMap = surface.normal; material.roughnessMap = surface.roughness; material.normalScale = new T.Vector2(0.15, 0.15); }
        curve([[0, -0.96, 0], [-0.07, -0.5, 0], [0.04, 0, 0], [0, 0.42, 0]], 0.027, silver);
        const bloom = new T.Group(); bloom.position.set(0, 0.35, 0); bloom.rotation.x = 0.45; root.add(bloom);
        // Individually curved, overlapping petals form an open spiral bud.
        for (let layer = 0; layer < 4; layer++) {
            const count = 8 - layer;
            for (let p = 0; p < count; p++) {
                const angle = p * Math.PI * 2 / count + layer * 0.47;
                const geometry = solidAwardSheet(T, 24, 32, (u, v) => {
                    const spread = (0.67 - layer * 0.075) * (0.18 + 0.82 * Math.sin(v * Math.PI / 2));
                    const a = angle + u * spread;
                    const tip = Math.pow(v, 6);
                    const radius = 0.025 + (0.37 - layer * 0.085) * Math.sin(v * 1.4) + 0.035 * u * u * v + 0.065 * tip + Math.sin(u * 3 + p * 0.7) * tip * 0.016;
                    const y = -0.21 + (0.7 + layer * 0.04) * v - 0.12 * u * u * v - 0.12 * tip * (1 - layer / 4) + Math.sin(u * 2 + p) * tip * 0.012;
                    return new T.Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius);
                }, 0.007);
                const petal = add(geometry, layer % 3 === 0 ? petalEdge : petals, 0, 0, 0, bloom); petal.name = 'rose-solid-petal';
            }
        }
        // A curled central petal, with a visible polished spiral edge.
        add(solidAwardSheet(T, 10, 64, (u, v) => { const a = v * Math.PI * 3 + u * 0.23, r = 0.018 + v * 0.085 + u * 0.012; return new T.Vector3(Math.sin(a) * r, 0.53 - v * 0.2 + u * 0.025, Math.cos(a) * r); }, 0.005), petals, 0, 0, 0, bloom).name = 'rose-curled-heart';
        for (const side of [-1, 1]) {
            const leafMesh = add(solidAwardSheet(T, 20, 40, (u, t) => { const v = 0.002 + t * 0.996; const width = 0.145 * Math.pow(Math.sin(v * Math.PI), 0.85) * (1 + Math.sin(v * Math.PI * 18) * 0.035); return new T.Vector3(u * width, v * 0.5, Math.sin(v * Math.PI) * 0.065 + u * u * 0.025); }, 0.01), foliage, side * 0.02, side === 1 ? -0.62 : -0.31, 0);
            leafMesh.name = 'rose-curved-leaf';
            leafMesh.rotation.z = -side * 0.95; leafMesh.rotation.y = side * 0.24;
            const midrib = new T.CatmullRomCurve3([new T.Vector3(0, 0.01, 0.018), new T.Vector3(0, 0.25, 0.082), new T.Vector3(0, 0.49, 0.018)]);
            leafMesh.add(new T.Mesh(new T.TubeGeometry(midrib, 48, 0.005, 10, false), petalEdge));
            for (const sign of [-1, 1]) for (let j = 1; j <= 4; j++) {
                const v = j / 6;
                const path = new T.CatmullRomCurve3([new T.Vector3(0, v * 0.5, Math.sin(v * Math.PI) * 0.065 + 0.015), new T.Vector3(sign * 0.07, v * 0.5 + 0.04, 0.075), new T.Vector3(sign * 0.11 * Math.sin(v * Math.PI), v * 0.5 + 0.065, 0.06)]);
                leafMesh.add(new T.Mesh(new T.TubeGeometry(path, 20, 0.0025, 6, false), foliage));
            }
        }
        for (const side of [-1, 1]) {
            const thornShape = new T.Shape(); thornShape.moveTo(0, -0.035); thornShape.quadraticCurveTo(0.065, -0.015, 0.1, 0.05); thornShape.quadraticCurveTo(0.025, 0.02, 0, 0.035); thornShape.closePath();
            const thorn = add(smoothAwardNormals(T, new T.ExtrudeGeometry(thornShape, { depth: 0.015, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 6, curveSegments: 32 })), graphite, 0, -0.15 - side * 0.13); thorn.rotation.z = side === -1 ? Math.PI : 0;
        }
        for (let i = 0; i < 5; i++) {
            const a = i * Math.PI * 2 / 5;
            add(solidAwardSheet(T, 8, 16, (u, v) => { const r = 0.04 + v * 0.17, angle = a + u * Math.sin(v * Math.PI) * 0.26; return new T.Vector3(Math.sin(angle) * r, 0.17 - v * 0.1, Math.cos(angle) * r); }, 0.007), foliage);
        }
        plate(0.2, 0.24, 0.055, 0.025, graphite, 0.05, -0.58, 0.06);
        logo(0.13, 0.05, -0.57, 0.115);
    } else if (model === 'star') {
        base();
        const starShape = (radius: number) => {
            const points: any[] = [];
            for (let i = 0; i < 10; i++) { const angle = Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? radius * 0.49 : radius; points.push(new T.Vector2(Math.cos(angle) * r, Math.sin(angle) * r)); }
            const shape = new T.Shape();
            for (let i = 0; i < 10; i++) {
                const current = points[i], prev = points[(i + 9) % 10], next = points[(i + 1) % 10];
                const a = current.clone().lerp(prev, 0.13), b = current.clone().lerp(next, 0.13);
                if (!i) shape.moveTo(a.x, a.y); else shape.lineTo(a.x, a.y);
                shape.quadraticCurveTo(current.x, current.y, b.x, b.y);
            }
            shape.closePath(); return shape;
        };
        lathe([[0, -0.97], [0.22, -0.97], [0.18, -0.84], [0.08, -0.75], [0.07, -0.52], [0.07, -0.27], [0, -0.27]], graphite, true).name = 'star-connected-stand';
        ring(0.19, 0.012, -0.91);
        add(smoothAwardNormals(T, new T.ExtrudeGeometry(starShape(0.86), { depth: 0.16, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.04, bevelSegments: 10, curveSegments: 48 })), silver, 0, 0.12, -0.1).name = 'star-rounded-frame';
        add(smoothAwardNormals(T, new T.ExtrudeGeometry(starShape(0.72), { depth: 0.035, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 10, curveSegments: 48 })), graphite, 0, 0.12, 0.105).name = 'star-inlaid-face';
        const back = add(smoothAwardNormals(T, new T.ExtrudeGeometry(starShape(0.68), { depth: 0.02, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 10, curveSegments: 48 })), graphite, 0, 0.12, -0.125); back.rotation.y = Math.PI;
        logo(0.39, 0, 0.1, 0.18);
        logo(0.28, 0, 0.1, -0.17).rotation.y = Math.PI;
        const orbit = add(new T.TorusGeometry(0.9, 0.016, 24, 192), accent, 0, 0.12);
        orbit.name = 'star-orbit';
        orbit.rotation.set(0.6, -0.4, -0.3);
        for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5; add(new T.SphereGeometry(0.033, 32, 20), mark, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0, orbit).name = 'star-orbit-inlay'; }
    } else if (model === 'bug') {
        base();
        lathe([[0, -0.97], [0.2, -0.97], [0.16, -0.85], [0.09, -0.72], [0.08, -0.64], [0, -0.64]], graphite, true).name = 'bug-display-mount';
        const abdomen = add(new T.SphereGeometry(1, 80, 56), black, 0, -0.08, 0.07);
        abdomen.scale.set(0.49, 0.63, 0.22); abdomen.name = 'bug-abdomen';
        const onShell = (x: number, y: number, lift = 0.012) => new T.Vector3(x, y, 0.15 + 0.26 * Math.sqrt(Math.max(0, 1 - (x / 0.48) ** 2 - ((y + 0.08) / 0.6) ** 2)) + lift);
        for (const side of [-1, 1]) {
            const shell = solidAwardSheet(T, 36, 48, (u, v) => {
                const a = side < 0 ? 0.025 + (u + 1) / 2 * (Math.PI / 2 - 0.06) : Math.PI / 2 + 0.035 + (u + 1) / 2 * (Math.PI / 2 - 0.06);
                const t = 0.035 + v * (Math.PI - 0.07);
                return new T.Vector3(-0.48 * Math.cos(a) * Math.sin(t), -0.08 + 0.6 * Math.cos(t), 0.15 + 0.26 * Math.sin(a) * Math.sin(t));
            }, 0.018);
            add(shell, graphite).name = 'bug-sculpted-wing';
            // Circuit traces follow the dome rather than floating on a flat decal.
            for (const route of [ [[side * 0.24, 0.3], [side * 0.34, 0.19], [side * 0.34, -0.22]], [[side * 0.3, -0.34], [side * 0.28, -0.43], [side * 0.17, -0.49]] ]) {
                const path = route.map(([x, y]) => onShell(x, y));
                add(new T.TubeGeometry(new T.CatmullRomCurve3(path), 64, 0.006, 12, false), accent).name = 'bug-circuit-trace';
                const end = path[path.length - 1];
                add(new T.SphereGeometry(0.016, 24, 16), silver, end.x, end.y, end.z);
            }
        }
        const thoraxRim = add(new T.SphereGeometry(1, 64, 48), silver, 0, 0.43, 0.09); thoraxRim.scale.set(0.4, 0.19, 0.23);
        const thorax = add(new T.SphereGeometry(1, 64, 48), graphite, 0, 0.44, 0.115); thorax.scale.set(0.37, 0.16, 0.23);
        logo(0.21, 0, 0.44, 0.35).name = 'bug-zvon-crest';
        const head = add(new T.SphereGeometry(1, 72, 48), graphite, 0, 0.66, 0.085); head.scale.set(0.31, 0.205, 0.215); head.name = 'bug-head';
        logo(0.12, 0, 0.66, -0.135).rotation.y = Math.PI;
        for (let rib = 0; rib < 4; rib++) {
            const y = -0.46 + rib * 0.18, width = 0.49 * Math.sqrt(1 - ((y + 0.08) / 0.63) ** 2) * 0.83;
            const points = Array.from({ length: 21 }, (_, i) => {
                const x = (i / 20 * 2 - 1) * width;
                return new T.Vector3(x, y, 0.07 - 0.22 * Math.sqrt(Math.max(0, 1 - (x / 0.49) ** 2 - ((y + 0.08) / 0.63) ** 2)) - 0.008);
            });
            add(new T.TubeGeometry(new T.CatmullRomCurve3(points), 64, 0.006, 12, false), silver).name = 'bug-ventral-rib';
        }
        for (const side of [-1, 1]) {
            const bezel = add(new T.SphereGeometry(0.064, 40, 28), silver, side * 0.165, 0.69, 0.268); bezel.scale.set(1, 0.85, 0.5);
            const eye = add(new T.SphereGeometry(0.042, 40, 28), accent, side * 0.165, 0.69, 0.292); eye.scale.set(1, 0.85, 0.6); eye.name = 'bug-eye';
            const antenna = new T.Group(); antenna.position.set(side * 0.17, 0.79, 0.085); root.add(antenna);
            antenna.name = 'bug-antenna'; antenna.userData.awardSwing = true; antenna.userData.awardPhase = side < 0 ? 0 : Math.PI; antenna.userData.awardSwingAmplitude = 0.04;
            add(new T.SphereGeometry(0.028, 32, 20), silver, 0, 0, 0, antenna);
            add(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(), new T.Vector3(side * 0.07, 0.16, 0.015), new T.Vector3(side * 0.2, 0.25, 0.04)]), 80, 0.013, 20, false), silver, 0, 0, 0, antenna);
            add(new T.SphereGeometry(0.037, 40, 28), accent, side * 0.2, 0.25, 0.04, antenna);
            for (let leg = 0; leg < 3; leg++) {
                const limb = new T.Group(); limb.name = 'bug-articulated-leg'; root.add(limb);
                const y = 0.28 - leg * 0.34;
                const points = [new T.Vector3(side * 0.35, y, 0.085), new T.Vector3(side * 0.64, y + (leg === 0 ? 0.13 : 0.05), 0.015), new T.Vector3(side * 0.8, y - 0.12, 0.09), new T.Vector3(side * (leg === 1 ? 0.94 : 0.9), y - (leg === 0 ? 0.14 : 0.25), 0.16)];
                points.forEach((point, i) => add(new T.SphereGeometry(i === 0 ? 0.052 : 0.034, 32, 24), i === 0 ? graphite : silver, point.x, point.y, point.z, limb));
                for (let j = 0; j < points.length - 1; j++) {
                    const a = points[j], b = points[j + 1], direction = b.clone().sub(a), radius = j === 0 ? 0.027 : 0.019;
                    const segment = add(new T.CapsuleGeometry(radius, Math.max(0.001, direction.length() - radius * 2), 12, 32), j === 1 ? silver : graphite, 0, 0, 0, limb);
                    segment.position.copy(a).add(b).multiplyScalar(0.5); segment.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
                }
            }
        }
        plate(0.52, 0.32, 0.065, 0.025, silver, 0, -0.065, 0.39).name = 'bug-processor-frame';
        plate(0.46, 0.26, 0.05, 0.018, black, 0, -0.065, 0.438);
        const code = new T.Group(); code.name = 'bug-code-emblem'; root.add(code);
        for (const points of [ [[-0.105, 0.07], [-0.17, 0], [-0.105, -0.07]], [[-0.028, -0.085], [0.028, 0.085]], [[0.105, 0.07], [0.17, 0], [0.105, -0.07]] ]) {
            const path = points.map(([x, y]) => new T.Vector3(x, y - 0.065, 0.49));
            add(new T.TubeGeometry(new T.CatmullRomCurve3(path), 48, 0.01, 16, false), mark, 0, 0, 0, code);
            for (const p of [path[0], path[path.length - 1]]) add(new T.SphereGeometry(0.01, 20, 16), mark, p.x, p.y, p.z, code);
        }
        for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
            const pin = add(new T.CapsuleGeometry(0.006, 0.045, 8, 20), silver, side * 0.283, -0.16 + i * 0.063, 0.433); pin.rotation.z = Math.PI / 2;
        }
    } else if (model === 'bell') {
        base();
        // Hollow bell with a rolled mouth, crown and an actual hanging clapper.
        lathe([[0.13, 0.64], [0.22, 0.6], [0.33, 0.46], [0.38, 0.24], [0.42, -0.05], [0.52, -0.35], [0.68, -0.51], [0.69, -0.58], [0.63, -0.61], [0.57, -0.53], [0.46, -0.33], [0.36, 0.02], [0.32, 0.28], [0.24, 0.44], [0.12, 0.5], [0.1, 0.54], [0.1, 0.61], [0.13, 0.64]], graphite, true).name = 'bell-hollow-shell';
        ring(0.65, 0.028, -0.57);
        ring(0.51, 0.011, -0.34, accent);
        ring(0.225, 0.018, 0.58);
        const hanger = add(new T.TorusGeometry(0.14, 0.037, 32, 160), silver, 0, 0.78); hanger.rotation.y = 0.1;
        lathe([[0.12, 0.6], [0.16, 0.62], [0.16, 0.65], [0.12, 0.68], [0.1, 0.65], [0.12, 0.6]], silver, true);
        const rod = add(new T.CapsuleGeometry(0.022, 0.78, 12, 32), silver, 0, -0.04);
        const clapper = add(new T.SphereGeometry(0.1, 64, 40), mark, 0, -0.5); clapper.scale.set(0.9, 1.14, 0.9);
        clapper.name = 'bell-rounded-clapper';
        const swing = new T.Group(); swing.position.y = 0.36; root.add(swing);
        root.remove(rod, clapper); swing.add(rod, clapper); rod.position.y -= 0.36; clapper.position.y -= 0.36;
        swing.userData.awardSwing = true;
        add(new T.TorusGeometry(0.045, 0.011, 16, 64), silver, 0, 0, 0, swing).rotation.y = Math.PI / 2;
        conformCrest(logo(0.32, 0, 0.12, 0.405), [[-0.35, 0.52], [-0.05, 0.42], [0.24, 0.38], [0.46, 0.33]]);
        for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
            curve([[side * (0.47 + i * 0.17), 0.46 + i * 0.04, -0.02], [side * (0.6 + i * 0.17), 0.27, -0.02], [side * (0.61 + i * 0.17), 0.04, -0.02]], 0.015, silver);
        }
        lathe([[0, -0.97], [0.19, -0.97], [0.12, -0.85], [0.07, -0.7], [0, -0.7]], silver, true).name = 'bell-foot';
    } else {
        base();
        // A smoked crystal monolith. The Z is its silver core, visible through the face.
        // Alpha also reveals the CSS collection backdrop, which is outside the 3D scene.
        const glass = new T.MeshPhysicalMaterial({ color: new T.Color(swatch.metal).lerp(new T.Color('#ffffff'), 0.65), metalness: 0, roughness: finish === 'frosted' ? 0.28 : finish === 'satin' ? 0.17 : 0.045, transmission: 0.92, thickness: 0.42, ior: 1.48, clearcoat: 1, attenuationColor: new T.Color(swatch.metal), attenuationDistance: 2.2, transparent: true, opacity: finish === 'frosted' ? 0.5 : finish === 'satin' ? 0.38 : 0.25, depthWrite: false, envMapIntensity: 0.7 });
        const points = [[-0.47, -0.68], [0.47, -0.68], [0.58, 0.51], [0.28, 0.96], [-0.28, 0.96], [-0.58, 0.51]];
        const shape = new T.Shape();
        points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
        const body = add(smoothAwardNormals(T, new T.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelSize: 0.055, bevelThickness: 0.045, bevelSegments: 10, curveSegments: 48 })), glass, 0, 0, -0.17);
        body.name = 'crystal-bevelled-glass';
        // Keep the clear faces and reflective cut edges separately shaded, without a wire outline.
        const cap = body.geometry.groups.find((group: any) => group.materialIndex === 0);
        const wall = body.geometry.groups.find((group: any) => group.materialIndex === 1);
        if (cap && wall) {
            const facets = body.geometry.clone(); facets.setDrawRange(wall.start, wall.count);
            body.geometry.setDrawRange(cap.start, cap.count);
            const cutGlass = new T.MeshPhysicalMaterial({ color: swatch.metal, metalness: 0.12, roughness: 0.09, transmission: 0.25, thickness: 0.1, ior: 1.48, clearcoat: 1, envMapIntensity: 1.4, transparent: true, opacity: 0.8, depthWrite: false });
            add(facets, cutGlass, 0, 0, -0.17).name = 'crystal-polished-facets';
        }
        logo(0.62, 0, 0.07, 0.04);
        plate(0.84, 0.13, 0.045, 0.42, graphite, 0, -0.79, -0.21);
        plate(0.62, 0.018, 0.008, 0.012, accent, 0, -0.79, 0.24);
        for (const side of [-1, 1]) {
            curve([[side * 0.37, -0.84, 0.12], [side * 0.47, -0.69, 0.24], [side * 0.48, -0.49, 0.24]], 0.024, silver).name = 'crystal-setting-prong';
            const tip = add(new T.SphereGeometry(0.031, 32, 20), silver, side * 0.48, -0.49, 0.24); tip.scale.set(0.8, 1.1, 0.8);
        }
        lathe([[0, -0.97], [0.32, -0.97], [0.27, -0.87], [0, -0.87]], graphite, true);
    }
    return root;
}

export function createAwardEnvironment(T: any, renderer: any) {
    // Scene-linear HDR radiance, including bright studio softboxes above 1.0.
    const width = 1024, height = 512, data = new Float32Array(width * height * 4);
    const panel = (u: number, v: number, cx: number, cy: number, w: number, h: number) => {
        const dx = Math.max(0, Math.abs(u - cx) - w / 2);
        const dy = Math.max(0, Math.abs(v - cy) - h / 2);
        return Math.exp(-(dx * dx + dy * dy) / 0.00018);
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const u = x / width, v = y / height, i = (y * width + x) * 4;
        const key = panel(u, v, 0.19, 0.34, 0.085, 0.3) * 8;
        const rim = panel(u, v, 0.69, 0.38, 0.035, 0.32) * 5;
        const top = panel(u, v, 0.47, 0.12, 0.25, 0.025) * 4;
        const base = 0.06 + (1 - v) * 0.16;
        data[i] = base + key + rim * 0.72 + top;
        data[i + 1] = base * 1.08 + key * 0.95 + rim * 0.85 + top * 0.96;
        data[i + 2] = base * 1.3 + key * 0.87 + rim + top * 0.9;
        data[i + 3] = 1;
    }
    const texture = new T.DataTexture(data, width, height, T.RGBAFormat, T.FloatType);
    texture.mapping = T.EquirectangularReflectionMapping;
    texture.colorSpace = T.LinearSRGBColorSpace; texture.needsUpdate = true;
    const generator = new T.PMREMGenerator(renderer);
    const target = generator.fromEquirectangular(texture);
    generator.dispose(); texture.dispose();
    return target;
}
