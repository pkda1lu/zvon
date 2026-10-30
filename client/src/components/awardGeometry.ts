import { AWARD_PALETTES, CollectibleTraits } from '../data/awardCollectibles';
/**
 * Zvon award family: smoked metal, polished silver, rounded chat silhouettes
 * and a sculpted Z matching public/zvonlogonew.png.
 */
export function buildAward(T: any, model: string, color: string, palette?: CollectibleTraits['palette'], finish: CollectibleTraits['finish'] = 'polished') {
    const swatch = AWARD_PALETTES[palette || 'graphite'];
    const roughness = finish === 'satin' ? 0.4 : finish === 'frosted' ? 0.62 : 0.19;
    const accentColor = palette ? swatch.accent : color;
    const root = new T.Group();
    const silver = new T.MeshPhysicalMaterial({ color: swatch.metal, metalness: 0.96, roughness, clearcoat: 0.5 });
    const mark = new T.MeshPhysicalMaterial({ color: swatch.mark, metalness: 0.58, roughness: Math.max(0.25, roughness), clearcoat: 0.7, emissive: swatch.metal, emissiveIntensity: 0.15 });
    const graphite = new T.MeshPhysicalMaterial({ color: swatch.body, metalness: 0.8, roughness: Math.max(0.23, roughness), clearcoat: finish === 'frosted' ? 0.1 : 1 });
    const black = new T.MeshPhysicalMaterial({ color: '#101117', metalness: 0.45, roughness: 0.21, clearcoat: 1 });
    const accent = new T.MeshStandardMaterial({ color: accentColor, metalness: 0.45, roughness: 0.25, emissive: accentColor, emissiveIntensity: 0.12 });
    const add = (geometry: any, material: any, x = 0, y = 0, z = 0, parent = root) => {
        const mesh = new T.Mesh(geometry, material);
        mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    const lathe = (points: number[][], material: any) => add(new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), 96), material);
    const ring = (radius: number, tube: number, y: number, material = silver) => {
        const part = add(new T.TorusGeometry(radius, tube, 12, 96), material, 0, y);
        part.rotation.x = Math.PI / 2; return part;
    };
    const curve = (points: number[][], radius: number, material: any) => add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), 48, radius, 12, false), material);
    const rounded = (w: number, h: number, r: number) => {
        const s = new T.Shape(), x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); s.closePath(); return s;
    };
    const plate = (w: number, h: number, r: number, depth: number, material: any, x: number, y: number, z: number) =>
        add(new T.ExtrudeGeometry(rounded(w, h, r), { depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 4, curveSegments: 24 }), material, x, y, z);
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
        const geometry = new T.ExtrudeGeometry(s, { depth: 24, bevelEnabled: true, bevelSize: 7, bevelThickness: 7, bevelSegments: 4, curveSegments: 24 });
        geometry.scale(width / 450, width / 450, width / 450);
        return add(geometry, material, x, y, z);
    };
    const base = () => {
        lathe([[0, -1.15], [0.57, -1.15], [0.62, -1.1], [0.62, -1.01], [0.56, -0.96], [0, -0.96]], black);
        ring(0.58, 0.018, -0.99);
        ring(0.6, 0.008, -1.09, accent);
        // Three small equalizer bars are milled into the front of each plinth.
        for (let i = -1; i <= 1; i++) plate(0.021, i === 0 ? 0.065 : 0.04, 0.01, 0.008, silver, i * 0.05, -1.045, 0.617);
    };

    if (model === 'trophy') {
        base();
        // A flowing, dark cup with a polished mouth and a silver Z crest.
        lathe([[0, -0.96], [0.28, -0.96], [0.3, -0.91], [0.2, -0.84], [0.095, -0.72], [0.085, -0.41], [0.16, -0.29], [0.28, -0.23], [0.4, -0.08], [0.51, 0.16], [0.58, 0.47], [0.6, 0.7], [0.58, 0.74], [0.54, 0.73], [0.53, 0.49], [0.46, 0.2], [0.35, -0.04], [0.22, -0.19], [0, -0.23]], graphite);
        ring(0.574, 0.03, 0.73);
        ring(0.092, 0.015, -0.57, accent);
        ring(0.265, 0.018, -0.92);
        // Open, swept side handles repeat the rounded return strokes of the logo.
        for (const side of [-1, 1]) {
            curve([[side * 0.56, 0.58, 0], [side * 0.83, 0.67, 0], [side * 0.96, 0.48, 0], [side * 0.88, 0.16, 0], [side * 0.65, -0.05, 0], [side * 0.37, -0.1, 0]], 0.048, silver);
            curve([[side * 0.81, 0.47, 0], [side * 0.78, 0.28, 0], [side * 0.63, 0.13, 0]], 0.012, accent);
        }
        logo(0.37, 0, 0.32, 0.573);
        // Sound-wave grooves form a restrained signature below the crest.
        for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
            const x = side * (0.28 + i * 0.065);
            curve([[x, 0.05 + i * 0.03, 0.39 - i * 0.035], [x * 1.07, 0.22 + i * 0.015, 0.42 - i * 0.04]], 0.009, silver);
        }
    } else if (model === 'medal') {
        // The medal is a physical version of Zvon's rounded-square app icon.
        const ribbon = new T.MeshPhysicalMaterial({ color: '#2c2d39', roughness: 0.58, sheen: 0.6, sheenColor: new T.Color('#9ba2be') });
        for (const side of [-1, 1]) {
            const strip = plate(0.28, 0.88, 0.035, 0.025, ribbon, side * 0.2, 0.91, -0.09);
            strip.rotation.z = -side * 0.32;
            const seam = add(new T.BoxGeometry(0.018, 0.84, 0.008), accent, side * 0.2, 0.91, -0.025);
            seam.rotation.z = -side * 0.32;
        }
        add(new T.TorusGeometry(0.085, 0.023, 12, 40), silver, 0, 0.56);
        plate(1.22, 1.22, 0.32, 0.14, silver, 0, -0.16, -0.08);
        plate(1.12, 1.12, 0.29, 0.075, graphite, 0, -0.16, 0.054);
        logo(0.68, 0, -0.12, 0.16);
        plate(0.19, 0.018, 0.008, 0.007, accent, 0, -0.68, 0.17);
        // Reverse side carries a smaller sculpted maker's mark as well.
        logo(0.3, 0, -0.12, -0.15).rotation.y = Math.PI;
        root.position.y = -0.13;
    } else {
        base();
        // A smoked crystal monolith. The Z is its silver core, visible through the face.
        const glass = new T.MeshPhysicalMaterial({ color: new T.Color(swatch.body).lerp(new T.Color(swatch.metal), 0.4), metalness: 0.12, roughness: finish === 'frosted' ? 0.4 : finish === 'satin' ? 0.23 : 0.12, transmission: 0.72, thickness: 0.35, ior: 1.45, clearcoat: 1, transparent: true, opacity: 0.5, depthWrite: false });
        const points = [[-0.47, -0.68], [0.47, -0.68], [0.58, 0.51], [0.28, 0.96], [-0.28, 0.96], [-0.58, 0.51]];
        const shape = new T.Shape();
        points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
        const body = add(new T.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelSize: 0.065, bevelThickness: 0.045, bevelSegments: 1 }), glass, 0, 0, -0.17);
        const outline = new T.LineSegments(new T.EdgesGeometry(body.geometry, 25), new T.LineBasicMaterial({ color: '#bfc8dc', transparent: true, opacity: 0.5 }));
        outline.position.copy(body.position); root.add(outline);
        logo(0.62, 0, 0.07, 0.04);
        plate(0.84, 0.13, 0.045, 0.42, graphite, 0, -0.79, -0.21);
        plate(0.62, 0.018, 0.008, 0.012, accent, 0, -0.79, 0.24);
        for (const side of [-1, 1]) curve([[side * 0.47, -0.67, 0.21], [side * 0.51, -0.1, 0.21], [side * 0.56, 0.48, 0.21], [side * 0.27, 0.94, 0.21]], 0.012, silver);
        lathe([[0, -0.97], [0.32, -0.97], [0.27, -0.87], [0, -0.87]], graphite);
    }
    return root;
}

export function createAwardEnvironment(T: any, renderer: any) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#aebdd0'); gradient.addColorStop(0.48, '#323b50'); gradient.addColorStop(1, '#111523');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
    // Reflections of large photographic softboxes, rather than point-light dots.
    ctx.filter = 'blur(12px)';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(130, 70, 120, 220);
    ctx.fillStyle = '#cadcff'; ctx.fillRect(650, 110, 65, 250);
    ctx.fillStyle = '#fff0d2'; ctx.fillRect(400, 25, 280, 35);
    const texture = new T.CanvasTexture(canvas); texture.mapping = T.EquirectangularReflectionMapping; texture.colorSpace = T.SRGBColorSpace;
    const generator = new T.PMREMGenerator(renderer);
    const target = generator.fromEquirectangular(texture);
    generator.dispose(); texture.dispose();
    return target;
}
