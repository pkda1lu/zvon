import React, { useState, useEffect, useRef } from 'react';

// Адаптивный линейный график: area-заливка + линия + точки. Ширину берём из
// контейнера через ResizeObserver, чтобы SVG корректно тянулся без искажений.
const LineChart: React.FC<{ data: any[]; color: string }> = ({ data, color }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(600);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) setWidth(e.contentRect.width);
        });
        ro.observe(el);
        setWidth(el.clientWidth || 600);
        return () => ro.disconnect();
    }, []);

    if (!data || data.length === 0) {
        return <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>Нет данных за период</div>;
    }

    const height = 180;
    const pad = { top: 22, right: 14, bottom: 26, left: 34 };
    const innerW = Math.max(width - pad.left - pad.right, 10);
    const innerH = height - pad.top - pad.bottom;
    const max = Math.max(...data.map(d => d.count), 1);
    const n = data.length;

    const xFor = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yFor = (v: number) => pad.top + innerH - (v / max) * innerH;

    const pts = data.map((d, i) => ({ x: xFor(i), y: yFor(d.count), d }));
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const baseline = pad.top + innerH;
    const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${baseline} L${pts[0].x.toFixed(1)},${baseline} Z`;
    const gradId = `lc-grad-${color.replace(/[^a-z0-9]/gi, '')}`;

    // Горизонтальные линии сетки + подписи по оси Y (0, середина, максимум).
    const yTicks = [0, Math.round(max / 2), max];
    const fmtDate = (s: string) => { const [, m, day] = (s || '').split('-'); return day && m ? `${day}.${m}` : s; };
    const labelIdx = n <= 1 ? [0] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];

    return (
        <div ref={containerRef} style={{ width: '100%' }}>
            <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {yTicks.map((t, i) => {
                    const y = yFor(t);
                    return (
                        <g key={i}>
                            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--glass-border)" strokeWidth="1" strokeDasharray="3 4" />
                            <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--text-faint)">{t}</text>
                        </g>
                    );
                })}

                <path d={areaPath} fill={`url(#${gradId})`} />
                <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

                {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke="var(--bg-main, #0c0c14)" strokeWidth="1.5">
                        <title>{`${p.d.count}`}</title>
                    </circle>
                ))}

                {labelIdx.map(i => (
                    <text key={i} x={xFor(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--text-faint)">
                        {fmtDate(data[i]._id)}
                    </text>
                ))}
            </svg>
        </div>
    );
};

export default LineChart;
