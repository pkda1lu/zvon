import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { UsersIcon, LayoutGridIcon, ChatIcon, SparklesIcon, MicIcon, PhoneIcon, GlobeIcon } from '../../components/Icons';
import LineChart from '../../components/LineChart';
import { ChoiceGroup } from './SettingsUI';
import { BRANDS, getBrandColor } from '../../utils/branding';
import { getAvatarUrl } from '../../utils/avatar';

const RANGES = [
    { value: '7d', label: '7 дней' },
    { value: '30d', label: '30 дней' },
    { value: '90d', label: '90 дней' },
    { value: 'all', label: 'Всё время' },
    { value: 'custom', label: 'Свой период' },
];

const toLocalDateInputValue = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export interface BrandStatItem {
    id: string;
    name: string;
    count: number;
    percent: number;
    color: string;
}

interface BrandingPieChartProps {
    brands: BrandStatItem[];
    total: number;
    size?: number;
}

const BrandingPieChart: React.FC<BrandingPieChartProps> = ({ brands = [], total = 0, size = 190 }) => {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const validBrands = brands.filter(b => b.count > 0);
    const hasData = total > 0 && validBrands.length > 0;

    if (!hasData) {
        return (
            <div style={{
                height: `${size}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-faint, #888)',
                fontSize: '13px',
                border: '1px dashed var(--glass-border, rgba(255, 255, 255, 0.1))',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.15)',
                width: '100%'
            }}>
                Нет данных по заходам за выбранный период
            </div>
        );
    }

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * 0.42;
    const innerR = size * 0.26;

    let startAngle = -Math.PI / 2;
    const slices = hasData ? validBrands.map((b) => {
        const fraction = b.count / total;
        const sweepAngle = fraction * 2 * Math.PI;
        const endAngle = startAngle + sweepAngle;

        const isFullCircle = fraction >= 0.9999;
        let pathData = '';

        if (isFullCircle) {
            pathData = `
                M ${cx} ${cy - outerR}
                A ${outerR} ${outerR} 0 1 0 ${cx} ${cy + outerR}
                A ${outerR} ${outerR} 0 1 0 ${cx} ${cy - outerR}
                M ${cx} ${cy - innerR}
                A ${innerR} ${innerR} 0 1 1 ${cx} ${cy + innerR}
                A ${innerR} ${innerR} 0 1 1 ${cx} ${cy - innerR}
                Z
            `;
        } else {
            const x1Outer = cx + outerR * Math.cos(startAngle);
            const y1Outer = cy + outerR * Math.sin(startAngle);
            const x2Outer = cx + outerR * Math.cos(endAngle);
            const y2Outer = cy + outerR * Math.sin(endAngle);

            const x1Inner = cx + innerR * Math.cos(endAngle);
            const y1Inner = cy + innerR * Math.sin(endAngle);
            const x2Inner = cx + innerR * Math.cos(startAngle);
            const y2Inner = cy + innerR * Math.sin(startAngle);

            const largeArc = sweepAngle > Math.PI ? 1 : 0;

            pathData = `
                M ${x1Outer} ${y1Outer}
                A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}
                L ${x1Inner} ${y1Inner}
                A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}
                Z
            `;
        }

        const sliceObj = {
            ...b,
            pathData,
            startAngle,
            endAngle,
            fraction
        };
        startAngle = endAngle;
        return sliceObj;
    }) : [];

    const hoveredBrand = brands.find(b => b.id === hoveredId);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px', flexWrap: 'wrap', width: '100%', padding: '6px 0' }}>
            {/* SVG Donut / Pie */}
            <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
                <svg width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
                    {!hasData ? (
                        <circle
                            cx={cx}
                            cy={cy}
                            r={(outerR + innerR) / 2}
                            fill="none"
                            stroke="rgba(255, 255, 255, 0.08)"
                            strokeWidth={outerR - innerR}
                        />
                    ) : (
                        slices.map((slice) => {
                            const isHovered = hoveredId === slice.id;
                            return (
                                <path
                                    key={slice.id}
                                    d={slice.pathData}
                                    fill={slice.color}
                                    opacity={hoveredId && !isHovered ? 0.35 : 1}
                                    stroke="var(--bg-glass, #18181b)"
                                    strokeWidth={validBrands.length > 1 ? 2 : 0}
                                    style={{
                                        transition: 'opacity 0.2s ease, transform 0.2s ease',
                                        cursor: 'pointer',
                                        transformOrigin: `${cx}px ${cy}px`,
                                        transform: isHovered ? 'scale(1.04)' : 'scale(1)'
                                    }}
                                    onMouseEnter={() => setHoveredId(slice.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                />
                            );
                        })
                    )}
                </svg>

                {/* Center text */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    maxWidth: `${innerR * 1.8}px`
                }}>
                    {hoveredBrand ? (
                        <>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: hoveredBrand.color, lineHeight: 1.1 }}>
                                {hoveredBrand.percent}%
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {hoveredBrand.name}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-faint)' }}>
                                {hoveredBrand.count}
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>
                                {total}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '2px' }}>
                                Всего
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Interactive Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px', flex: '1 1 200px' }}>
                {brands.map((b) => {
                    const isHovered = hoveredId === b.id;
                    return (
                        <div
                            key={b.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: isHovered ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                                border: `1px solid ${isHovered ? b.color : 'var(--glass-border, rgba(255,255,255,0.06))'}`,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={() => setHoveredId(b.id)}
                            onMouseLeave={() => setHoveredId(null)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {b.name}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 600 }}>
                                    {b.count}
                                </span>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: b.color,
                                    background: `${b.color}1a`,
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    border: `1px solid ${b.color}40`,
                                    minWidth: '38px',
                                    textAlign: 'center'
                                }}>
                                    {b.percent}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

interface BrandingTimelineChartProps {
    data: any[];
    brands: BrandStatItem[];
    height?: number;
}

const BrandingTimelineChart: React.FC<BrandingTimelineChartProps> = ({ data = [], brands = [], height = 220 }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(600);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [hiddenBrands, setHiddenBrands] = useState<Record<string, boolean>>({});

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

    const toggleBrand = (brandId: string) => {
        setHiddenBrands(prev => ({
            ...prev,
            [brandId]: !prev[brandId]
        }));
    };

    const activeBrands = brands.filter(b => !hiddenBrands[b.id]);
    const hasAnyData = data && data.length > 0 && data.some(d => brands.some(b => (d[b.id] || 0) > 0));

    if (!hasAnyData) {
        return (
            <div ref={containerRef} style={{ width: '100%' }}>
                <div style={{
                    height: `${height}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-faint, #888)',
                    fontSize: '13px',
                    border: '1px dashed var(--glass-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.15)'
                }}>
                    Нет данных по заходам за выбранный период
                </div>
            </div>
        );
    }

    const pad = { top: 26, right: 16, bottom: 28, left: 36 };
    const innerW = Math.max(width - pad.left - pad.right, 10);
    const innerH = Math.max(height - pad.top - pad.bottom, 10);
    const n = data.length;

    const maxVal = Math.max(
        ...data.map(d => {
            if (activeBrands.length === 0) return 1;
            return Math.max(...activeBrands.map(b => d[b.id] || 0), 1);
        }),
        1
    );

    const xFor = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yFor = (v: number) => pad.top + innerH - (v / maxVal) * innerH;

    const yTicks = [0, Math.round(maxVal / 2), maxVal];
    const fmtDate = (s: string) => {
        if (!s) return '';
        const parts = s.split('-');
        if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
        return s;
    };

    const labelIdx = n <= 1 ? [0] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
    
    const totalSlotWidth = (innerW / Math.max(n, 1)) * 0.75;
    const numBars = Math.max(activeBrands.length, 1);
    const barWidth = Math.max(2, Math.min(14, (totalSlotWidth / numBars) - 1));
    const totalGroupWidth = numBars * barWidth + (numBars - 1);

    const getIndexFromX = (clientX: number) => {
        const svgEl = svgRef.current;
        if (!svgEl) return 0;
        const rect = svgEl.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        const scaleX = width / rect.width;
        const localX = (clientX - rect.left) * scaleX;
        const relX = Math.max(0, Math.min(innerW, localX - pad.left));
        if (n <= 1) return 0;
        const idx = Math.round((relX / innerW) * (n - 1));
        return Math.max(0, Math.min(n - 1, idx));
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const idx = getIndexFromX(e.clientX);
        setHoveredIdx(idx);
    };

    const hoveredItem = hoveredIdx !== null && data[hoveredIdx] ? data[hoveredIdx] : null;

    return (
        <div ref={containerRef} style={{ width: '100%', position: 'relative', userSelect: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {brands.map(b => {
                        const isHidden = !!hiddenBrands[b.id];
                        return (
                            <button
                                key={b.id}
                                type="button"
                                onClick={() => toggleBrand(b.id)}
                                title={isHidden ? `Показать ${b.name} на графике` : `Скрыть ${b.name} из графика`}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: isHidden ? 'rgba(255, 255, 255, 0.03)' : `${b.color}1f`,
                                    border: `1px solid ${isHidden ? 'var(--glass-border, rgba(255,255,255,0.1))' : `${b.color}60`}`,
                                    color: isHidden ? 'var(--text-faint, #666)' : 'var(--text-main)',
                                    opacity: isHidden ? 0.5 : 1,
                                    textDecoration: isHidden ? 'line-through' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '2px',
                                    background: isHidden ? '#555' : b.color
                                }} />
                                <span>{b.name}</span>
                            </button>
                        );
                    })}
                </div>

                {hoveredItem && (
                    <div style={{ fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-dim)' }}>{fmtDate(hoveredItem._id)}:</span>
                        {activeBrands.map(b => (
                            <span key={b.id} style={{ color: b.color }}>
                                {b.name}: {hoveredItem[b.id] ?? 0}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {activeBrands.length === 0 ? (
                <div style={{
                    height: `${height}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-faint, #888)',
                    fontSize: '13px',
                    border: '1px dashed var(--glass-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.15)'
                }}>
                    Все бренды скрыты. Нажмите на бренд в панели выше, чтобы включить его отображение.
                </div>
            ) : (
                <svg
                    ref={svgRef}
                    width={width}
                    height={height}
                    style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoveredIdx(null)}
                >
                    {/* Сетка Y */}
                    {yTicks.map((t, i) => {
                        const y = yFor(t);
                        return (
                            <g key={i}>
                                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--glass-border, rgba(255,255,255,0.08))" strokeWidth="1" strokeDasharray="3 4" />
                                <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--text-faint, #777)">{t}</text>
                            </g>
                        );
                    })}

                    {/* Столбцы для каждого дня */}
                    {data.map((d, i) => {
                        const centerX = xFor(i);
                        const isHover = hoveredIdx === i;
                        const startGroupX = centerX - totalGroupWidth / 2;

                        return (
                            <g key={i}>
                                {activeBrands.map((b, bIdx) => {
                                    const val = d[b.id] || 0;
                                    const barH = val > 0 ? Math.max(3, (val / maxVal) * innerH) : 0;
                                    const barX = startGroupX + bIdx * (barWidth + 1);
                                    const barY = pad.top + innerH - (barH > 0 ? barH : 2);

                                    return (
                                        <rect
                                            key={b.id}
                                            x={barX}
                                            y={barY}
                                            width={barWidth}
                                            height={barH > 0 ? barH : 2}
                                            rx={barWidth > 4 ? 2 : 1}
                                            fill={b.color}
                                            opacity={val > 0 ? (isHover ? 1 : 0.85) : 0.25}
                                            style={{ transition: 'all 0.15s ease' }}
                                        />
                                    );
                                })}
                            </g>
                        );
                    })}

                    {/* Ховер маркер */}
                    {hoveredIdx !== null && (
                        <line
                            x1={xFor(hoveredIdx)}
                            y1={pad.top}
                            x2={xFor(hoveredIdx)}
                            y2={pad.top + innerH}
                            stroke="var(--glass-border, rgba(255,255,255,0.4))"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                        />
                    )}

                    {/* Метки по оси X */}
                    {labelIdx.map(i => (
                        <text
                            key={i}
                            x={xFor(i)}
                            y={height - 6}
                            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                            fontSize="10"
                            fill="var(--text-faint, #888)"
                        >
                            {fmtDate(data[i]._id)}
                        </text>
                    ))}
                </svg>
            )}
        </div>
    );
};

const AdminStatsSettings: React.FC = () => {
    const [range, setRange] = useState('30d');
    const [after, setAfter] = useState(() => toLocalDateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
    const [before, setBefore] = useState(() => toLocalDateInputValue(new Date()));
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (range !== 'custom' && range !== 'all') {
            const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
            const d = new Date();
            d.setDate(d.getDate() - (days - 1));
            setAfter(toLocalDateInputValue(d));
            setBefore(toLocalDateInputValue(new Date()));
        }
    }, [range]);

    useEffect(() => {
        setLoading(true);
        const params: any = { range };
        if (range === 'custom') {
            if (after) params.after = after;
            if (before) params.before = before;
        }

        axios.get('/api/admin/stats', { params })
            .then(res => setStats(res.data))
            .catch(err => console.error('Failed to fetch admin stats', err))
            .finally(() => setLoading(false));
    }, [range, after, before]);

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Статистика платформы</h2>
            <p className="settings-description">Глобальные показатели экосистемы, онлайн пользователей и голосовая активность за выбранный период (включая указанную дату до 23:59).</p>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ flex: '1 1 auto' }}>
                    <ChoiceGroup options={RANGES} value={range} onChange={setRange} />
                </div>

                {range === 'custom' && (
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>С:</span>
                            <input
                                type="date"
                                lang="ru-RU"
                                className="settings-input"
                                style={{ width: '145px' }}
                                value={after}
                                onChange={(e) => setAfter(e.target.value)}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>По (вкл. 23:59):</span>
                            <input
                                type="date"
                                lang="ru-RU"
                                className="settings-input"
                                style={{ width: '145px' }}
                                value={before}
                                onChange={(e) => setBefore(e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {loading || !stats ? (
                <div className="settings-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    Загрузка статистики платформы...
                </div>
            ) : (
                <>
                    {/* Топ-5 пользователей за период */}
                    {stats.topUsers && (
                        <div style={{ marginBottom: '28px' }}>
                            <h3 className="settings-section-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--text-main, #fff)' }}>
                                Лидеры активности за период
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                                {/* Топ по сообщениям */}
                                <div className="settings-card" style={{ margin: 0, padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: 'var(--accent-pink)', fontWeight: 700, fontSize: '14px' }}>
                                        <ChatIcon size={20} />
                                        <span>Топ-5 по сообщениям</span>
                                    </div>
                                    {!stats.topUsers.byMessages || stats.topUsers.byMessages.length === 0 ? (
                                        <div style={{ color: 'var(--text-faint)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>Нет сообщений за период</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {stats.topUsers.byMessages.map((u: any, idx: number) => (
                                                <div key={u._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 800, color: idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#d97706' : 'var(--text-faint)', width: '16px' }}>
                                                            #{idx + 1}
                                                        </span>
                                                        <img
                                                            src={getAvatarUrl(u.avatar) || '/default-avatar.png'}
                                                            alt=""
                                                            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                                                            onError={(e) => { (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="14" fill="%235865f2"/></svg>'; }}
                                                        />
                                                        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{u.displayName || u.username}</div>
                                                            {u.displayName && <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>@{u.username}</div>}
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-pink)', paddingLeft: '8px' }}>
                                                        {u.count} сообщ.
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Топ по голосовым */}
                                <div className="settings-card" style={{ margin: 0, padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#06b6d4', fontWeight: 700, fontSize: '14px' }}>
                                        <MicIcon size={20} />
                                        <span>Топ-5 по часам в голосовых</span>
                                    </div>
                                    {!stats.topUsers.byVoice || stats.topUsers.byVoice.length === 0 ? (
                                        <div style={{ color: 'var(--text-faint)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>Нет голосовой активности</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {stats.topUsers.byVoice.map((u: any, idx: number) => (
                                                <div key={u._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 800, color: idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#d97706' : 'var(--text-faint)', width: '16px' }}>
                                                            #{idx + 1}
                                                        </span>
                                                        <img
                                                            src={getAvatarUrl(u.avatar) || '/default-avatar.png'}
                                                            alt=""
                                                            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                                                            onError={(e) => { (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="14" fill="%235865f2"/></svg>'; }}
                                                        />
                                                        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{u.displayName || u.username}</div>
                                                            {u.displayName && <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>@{u.username}</div>}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', paddingLeft: '8px' }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#06b6d4' }}>
                                                            {u.hours} ч
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                                                            {u.sessionsCount} {u.sessionsCount === 1 ? 'сессия' : u.sessionsCount < 5 ? 'сессии' : 'сессий'}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Группа: Заходы по брендингам платформы */}
                    {(() => {
                        const brandList: BrandStatItem[] = (stats.totals?.branding?.brands && stats.totals.branding.brands.length > 0)
                            ? stats.totals.branding.brands
                            : Object.keys(BRANDS).map((k, idx) => ({
                                id: k,
                                name: BRANDS[k]?.name || k,
                                color: getBrandColor(k, idx),
                                count: stats.totals?.branding?.byBrand?.[k] ?? 0,
                                percent: 0
                            }));

                        return (
                            <div style={{ marginTop: '32px', marginBottom: '16px' }}>
                                <h3 className="settings-section-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main, #fff)' }}>
                                    Заходы по брендингам платформы
                                </h3>
                                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-dim)' }}>
                                    Соотношение посещений брендингов проекта за выбранный период.
                                </p>

                                <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-main)' }}>
                                        Соотношение заходов
                                    </div>
                                    <BrandingPieChart
                                        brands={brandList}
                                        total={stats.totals?.branding?.total ?? 0}
                                        size={190}
                                    />
                                </div>

                                <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-main)' }}>
                                        Динамика заходов по дням
                                    </div>
                                    <BrandingTimelineChart
                                        data={stats.charts?.brandingDaily || []}
                                        brands={brandList}
                                        height={220}
                                    />
                                </div>
                            </div>
                        );
                    })()}

                    {/* Группа: Онлайн и активность */}
                    <div style={{ marginTop: '32px', marginBottom: '16px' }}>
                        <h3 className="settings-section-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main, #fff)' }}>
                            Онлайн и активность
                        </h3>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-dim)' }}>
                            Динамика уникальных пользователей онлайн и авторов сообщений за выбранный период.
                        </p>
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.onlineUsersDaily}
                            type="bar"
                            color="#10b981"
                            title="Уникальные пользователи онлайн по дням (DAU Online)"
                            unit="пользователей онлайн"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.activeUsersDaily}
                            type="bar"
                            color="#eab308"
                            title="Ежедневная активность авторов сообщений (DAU чатов)"
                            unit="активных авторов"
                        />
                    </div>

                    {/* Группа: Голосовая активность и звонки */}
                    <div style={{ marginTop: '32px', marginBottom: '16px' }}>
                        <h3 className="settings-section-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main, #fff)' }}>
                            Голосовая активность и звонки
                        </h3>
                        <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--text-dim)' }}>
                            Проведённые часы, количество сеансов и уникальные пользователи в голосовых каналах.
                        </p>

                        <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                            <div className="settings-card" style={{ margin: 0, padding: '18px 20px', textAlign: 'center' }}>
                                <div style={{ color: '#0ea5e9', marginBottom: '6px' }}><MicIcon size={26} /></div>
                                <div style={{ fontSize: '26px', fontWeight: 800 }}>{stats.totals.totalVoiceHours ?? 0} ч</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Часов в голосовых всего</div>
                            </div>
                            <div className="settings-card" style={{ margin: 0, padding: '18px 20px', textAlign: 'center' }}>
                                <div style={{ color: '#06b6d4', marginBottom: '6px' }}><MicIcon size={26} /></div>
                                <div style={{ fontSize: '26px', fontWeight: 800 }}>{stats.totals.voiceHoursPeriod ?? 0} ч</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>В голосовых за период</div>
                            </div>
                            <div className="settings-card" style={{ margin: 0, padding: '18px 20px', textAlign: 'center' }}>
                                <div style={{ color: '#a855f7', marginBottom: '6px' }}><PhoneIcon size={26} /></div>
                                <div style={{ fontSize: '26px', fontWeight: 800 }}>{stats.totals.voiceSessionsPeriod ?? stats.totals.totalVoiceSessions ?? 0}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Сеансов голосовых</div>
                            </div>
                        </div>
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.voiceHoursDaily}
                            type="bar"
                            color="#06b6d4"
                            title="Количество проведённых часов в голосовых по дням"
                            unit="ч"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.voiceHoursCumulative}
                            type="line"
                            color="#06b6d4"
                            title="Динамика часов в голосовых (накопительно)"
                            unit="ч"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.voiceSessionsDaily}
                            type="bar"
                            color="#a855f7"
                            title="Количество сеансов голосовых по дням"
                            unit="сессий"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.voiceUsersDaily}
                            type="bar"
                            color="#8b5cf6"
                            title="Уникальные пользователи в голосовых по дням (Voice DAU)"
                            unit="пользователей в голосовых"
                        />
                    </div>

                    {/* Группа: Пользователи и рост платформы */}
                    <div style={{ marginTop: '32px', marginBottom: '16px' }}>
                        <h3 className="settings-section-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main, #fff)' }}>
                            Пользователи и рост платформы
                        </h3>
                        <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--text-dim)' }}>
                            Накопительный рост базы аккаунтов и ежедневные новые регистрации.
                        </p>

                        <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                            <div className="settings-card" style={{ margin: 0, padding: '18px 20px', textAlign: 'center' }}>
                                <div style={{ color: 'var(--primary-neon)', marginBottom: '6px' }}><UsersIcon size={26} /></div>
                                <div style={{ fontSize: '26px', fontWeight: 800 }}>{stats.totals.users}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Пользователей всего</div>
                            </div>
                            <div className="settings-card" style={{ margin: 0, padding: '18px 20px', textAlign: 'center' }}>
                                <div style={{ color: '#22c55e', marginBottom: '6px' }}><SparklesIcon size={26} /></div>
                                <div style={{ fontSize: '26px', fontWeight: 800 }}>+{stats.totals.newUsersPeriod}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Новых за период</div>
                            </div>
                        </div>
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.usersCumulative}
                            type="line"
                            color="var(--primary-neon)"
                            title="Динамика роста пользователей (накопительно)"
                            unit="пользователей"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.usersDaily}
                            type="bar"
                            color="var(--primary-neon)"
                            title="Новые регистрации по дням"
                            unit="новых аккаунтов"
                        />
                    </div>

                    {/* Группа: Серверы и сообщества */}
                    <div style={{ marginTop: '32px', marginBottom: '16px' }}>
                        <h3 className="settings-section-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main, #fff)' }}>
                            Серверы и сообщества
                        </h3>
                        <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--text-dim)' }}>
                            Количество созданных серверов и темпы создания новых сообществ.
                        </p>

                        <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                            <div className="settings-card" style={{ margin: 0, padding: '18px 20px', textAlign: 'center' }}>
                                <div style={{ color: 'var(--secondary-neon)', marginBottom: '6px' }}><LayoutGridIcon size={26} /></div>
                                <div style={{ fontSize: '26px', fontWeight: 800 }}>{stats.totals.servers}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Серверов создано</div>
                            </div>
                        </div>
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.serversCumulative}
                            type="line"
                            color="var(--secondary-neon)"
                            title="Динамика роста серверов (накопительно)"
                            unit="серверов"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.serversDaily}
                            type="bar"
                            color="var(--secondary-neon)"
                            title="Новые серверы по дням"
                            unit="новых серверов"
                        />
                    </div>

                    {/* Группа: Сообщения в чатах */}
                    <div style={{ marginTop: '32px', marginBottom: '16px' }}>
                        <h3 className="settings-section-title" style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main, #fff)' }}>
                            Сообщения в чатах
                        </h3>
                        <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--text-dim)' }}>
                            Общее число отправленных сообщений и интенсивность общения по дням.
                        </p>

                        <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                            <div className="settings-card" style={{ margin: 0, padding: '18px 20px', textAlign: 'center' }}>
                                <div style={{ color: 'var(--accent-pink)', marginBottom: '6px' }}><ChatIcon size={26} /></div>
                                <div style={{ fontSize: '26px', fontWeight: 800 }}>{stats.totals.messages}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Всего сообщений</div>
                            </div>
                            <div className="settings-card" style={{ margin: 0, padding: '18px 20px', textAlign: 'center' }}>
                                <div style={{ color: '#f43f5e', marginBottom: '6px' }}><ChatIcon size={26} /></div>
                                <div style={{ fontSize: '26px', fontWeight: 800 }}>{stats.totals.messagesPeriod ?? 0}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Сообщений за период</div>
                            </div>
                        </div>
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.messagesCumulative}
                            type="line"
                            color="var(--accent-pink)"
                            title="Общая динамика сообщений платформы"
                            unit="сообщений"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px' }}>
                        <LineChart
                            data={stats.charts.messagesDaily}
                            type="bar"
                            color="var(--accent-pink)"
                            title="Сообщения по дням"
                            unit="сообщений"
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default AdminStatsSettings;
