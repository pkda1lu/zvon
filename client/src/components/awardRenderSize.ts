/** Keep large views and browser zoom sharp without unbounded GPU allocations. */
export function awardRenderSize(width: number, height: number, pixelRatio: number) {
    const ratio = Math.max(1.5, Math.min(4, pixelRatio || 1));
    const w = Math.max(1, width), h = Math.max(1, height);
    const scale = Math.min(ratio, 2048 / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
