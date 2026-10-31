/** Smooth bevels without blending normals across intentional hard edges. */
export function smoothAwardNormals(T: any, geometry: any, crease = Math.PI / 3) {
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
        if (Math.abs(n.z) > 0.99999) continue;
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
