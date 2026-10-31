/** Smooth bevels without blending normals across intentional hard edges. */
export function smoothAwardNormals(T: any, geometry: any, crease = Math.PI / 3, preserveCaps = true) {
    geometry.computeVertexNormals();
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < positions.count; i++) {
        const key = `${Math.round(positions.getX(i) * 1e5)},${Math.round(positions.getY(i) * 1e5)},${Math.round(positions.getZ(i) * 1e5)}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(i); else buckets.set(key, [i]);
    }
    const original = normals.array.slice(), cutoff = Math.cos(crease);
    for (const bucket of buckets.values()) for (const i of bucket) {
        const n = new T.Vector3(original[i * 3], original[i * 3 + 1], original[i * 3 + 2]);
        // Preserve the flat front/back faces of extrusions; smooth only the bevel wall.
        if (preserveCaps && Math.abs(n.z) > 0.99999) continue;
        const sum = new T.Vector3();
        for (const j of bucket) {
            const other = new T.Vector3(original[j * 3], original[j * 3 + 1], original[j * 3 + 2]);
            if (n.dot(other) >= cutoff) sum.add(other);
        }
        sum.normalize(); normals.setXYZ(i, sum.x, sum.y, sum.z);
    }
    normals.needsUpdate = true;
    return geometry;
}

/** Add interior vertices before bending a flat relief onto a curved body. */
export function subdivideAwardRelief(T: any, source: any, maxEdge = 0.035) {
    const positions = source.getAttribute('position'), uv = source.getAttribute('uv'), index = source.index;
    const vertices: number[] = [], coords: number[] = [];
    const vertex = (i: number) => ({ p: new T.Vector3().fromBufferAttribute(positions, i), uv: new T.Vector2().fromBufferAttribute(uv, i) });
    const midpoint = (a: any, b: any) => ({ p: a.p.clone().add(b.p).multiplyScalar(0.5), uv: a.uv.clone().add(b.uv).multiplyScalar(0.5) });
    const split = (a: any, b: any, c: any, depth = 0) => {
        const edges = [a.p.distanceToSquared(b.p), b.p.distanceToSquared(c.p), c.p.distanceToSquared(a.p)];
        const longest = Math.max(...edges);
        if (longest <= maxEdge * maxEdge || depth >= 12) {
            for (const v of [a, b, c]) { vertices.push(v.p.x, v.p.y, v.p.z); coords.push(v.uv.x, v.uv.y); }
        } else if (longest === edges[0]) { const m = midpoint(a, b); split(a, m, c, depth + 1); split(m, b, c, depth + 1); }
        else if (longest === edges[1]) { const m = midpoint(b, c); split(a, b, m, depth + 1); split(a, m, c, depth + 1); }
        else { const m = midpoint(c, a); split(a, b, m, depth + 1); split(m, b, c, depth + 1); }
    };
    const count = index ? index.count : positions.count;
    for (let i = 0; i < count; i += 3) split(vertex(index ? index.getX(i) : i), vertex(index ? index.getX(i + 1) : i + 1), vertex(index ? index.getX(i + 2) : i + 2));
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(coords, 2));
    source.dispose(); return geometry;
}

/** Linear-data microstructure maps; no low-resolution painted colour texture. */
export function createAwardSurface(T: any) {
    const size = 256, normal = new Uint8Array(size * size * 4), roughness = new Uint8Array(size * size * 4);
    let seed = 71937;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = (seed >>> 24) / 255, i = (y * size + x) * 4;
        normal[i] = 128 + Math.round(Math.sin(x * 1.7 + y * 0.3) * 7 + (noise - 0.5) * 5);
        normal[i + 1] = 128 + Math.round(Math.cos(y * 1.9 + x * 0.4) * 7);
        normal[i + 2] = 255; normal[i + 3] = 255;
        roughness[i] = roughness[i + 1] = roughness[i + 2] = 210 + Math.round(noise * 35);
        roughness[i + 3] = 255;
    }
    const texture = (data: Uint8Array) => {
        const map = new T.DataTexture(data, size, size, T.RGBAFormat);
        map.wrapS = map.wrapT = T.RepeatWrapping;
        map.minFilter = T.LinearMipmapLinearFilter; map.magFilter = T.LinearFilter;
        map.generateMipmaps = true; map.needsUpdate = true;
        return map;
    };
    return { normal: texture(normal), roughness: texture(roughness) };
}

/** A closed thin sculpted sheet, including its rim and a usable UV chart. */
export function solidAwardSheet(T: any, cols: number, rows: number, sample: (u: number, v: number) => any, thickness: number) {
    const points: number[] = [], uv: number[] = [], front: number[] = [];
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
        const p = sample(x / cols * 2 - 1, y / rows);
        points.push(p.x, p.y, p.z); uv.push(x / cols, y / rows);
        if (y < rows && x < cols) { const a = y * (cols + 1) + x; front.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1); }
    }
    const surface = new T.BufferGeometry();
    surface.setAttribute('position', new T.Float32BufferAttribute(points, 3)); surface.setIndex(front); surface.computeVertexNormals();
    const normals = surface.getAttribute('normal'), count = points.length / 3, positions: number[] = [], indices = [...front];
    for (const side of [1, -1]) for (let i = 0; i < count; i++) {
        positions.push(points[i * 3] + normals.getX(i) * thickness / 2 * side, points[i * 3 + 1] + normals.getY(i) * thickness / 2 * side, points[i * 3 + 2] + normals.getZ(i) * thickness / 2 * side);
    }
    for (let i = 0; i < front.length; i += 3) indices.push(front[i + 2] + count, front[i + 1] + count, front[i] + count);
    const boundary: number[] = [];
    for (let x = 0; x <= cols; x++) boundary.push(x);
    for (let y = 1; y <= rows; y++) boundary.push(y * (cols + 1) + cols);
    for (let x = cols - 1; x >= 0; x--) boundary.push(rows * (cols + 1) + x);
    for (let y = rows - 1; y > 0; y--) boundary.push(y * (cols + 1));
    for (let i = 0; i < boundary.length; i++) { const a = boundary[i], b = boundary[(i + 1) % boundary.length]; indices.push(b, a, a + count, b, a + count, b + count); }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute([...uv, ...uv], 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    geometry.userData.closedSheet = true;
    surface.dispose(); return geometry;
}
