import React, { useState, useEffect, useRef } from 'react';

export interface ChartDataItem {
    _id: string; // YYYY-MM-DD or date string
    count: number;
    secondaryCount?: number;
    label?: string;
}

interface LineChartProps {
    data: ChartDataItem[];
    color?: string;
    secondaryColor?: string;
    type?: 'line' | 'bar'; // 'line' for cumulative dynamics, 'bar' for daily actions/breakdown
    title?: string;
    height?: number;
    unit?: string;
}

const fillMissingDays = (items: ChartDataItem[], isLine = false): ChartDataItem[] => {
    if (!items || items.length === 0) return [];
    
    const isDateStr = (s: string) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!items.every(item => isDateStr(item._id))) return items;

    const map = new Map<string, ChartDataItem>();
    items.forEach(item => map.set(item._id, item));

    // Используем точную первую и последнюю даты из пришедшего массива периода
    const startStr = items[0]._id;
    const endStr = items[items.length - 1]._id;

    const startParts = startStr.split('-').map(Number);
    const endParts = endStr.split('-').map(Number);

    const start = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
    const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));

    const result: ChartDataItem[] = [];
    let runningCount = 0;

    const cur = new Date(start);
    while (cur <= end) {
        const y = cur.getUTCFullYear();
        const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
        const d = String(cur.getUTCDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        if (map.has(dateStr)) {
            const item = map.get(dateStr)!;
            runningCount = item.count;
            result.push(item);
        } else {
            // Для накопительной линии сохраняем предыдущее суммарное значение, для столбцов — 0
            result.push({ _id: dateStr, count: isLine ? runningCount : 0 });
        }

        cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return result;
};

// Адаптивный график для статистики: динамика (линейная с градиентом) или действия по дням (столбчатый / ступенчатый).
// Поддерживает drag selection диапазона дат с подсчетом суммы (столбцы) или прироста (накопительный).
const LineChart: React.FC<LineChartProps> = ({
    data: rawData,
    color = 'var(--primary-neon, #5865f2)',
    secondaryColor = 'var(--accent-pink, #f472b6)',
    type = 'line',
    title,
    height = 180,
    unit = ''
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(600);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    // Выделение диапазона дат зажатием мыши
    const [isSelecting, setIsSelecting] = useState(false);
    const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
    const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);

    const data = fillMissingDays(rawData, type === 'line');

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

    // Сброс выделения при изменении данных
    useEffect(() => {
        setSelectedRange(null);
        setHoveredIdx(null);
    }, [rawData]);

    // Глобальное завершение drag при отпускании мыши
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isSelecting) {
                setIsSelecting(false);
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isSelecting]);

    const hasAnyData = data && data.length > 0 && data.some(d => (d.count && d.count > 0) || (d.secondaryCount && d.secondaryCount > 0));

    if (!hasAnyData) {
        return (
            <div ref={containerRef} style={{ width: '100%' }}>
                {title && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-normal)' }}>{title}</span>
                    </div>
                )}
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
                    Нет данных за выбранный период
                </div>
            </div>
        );
    }

    const pad = { top: 26, right: 16, bottom: 28, left: 36 };
    const innerW = Math.max(width - pad.left - pad.right, 10);
    const innerH = Math.max(height - pad.top - pad.bottom, 10);
    const maxVal = Math.max(...data.map(d => Math.max(d.count || 0, d.secondaryCount || 0)), 1);
    const n = data.length;

    const xFor = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yFor = (v: number) => pad.top + innerH - (v / maxVal) * innerH;

    const pts = data.map((d, i) => ({ x: xFor(i), y: yFor(d.count || 0), d }));
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const baseline = pad.top + innerH;
    const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${baseline} L${pts[0].x.toFixed(1)},${baseline} Z`;
    const gradId = `lc-grad-${color.replace(/[^a-z0-9]/gi, '')}-${Math.random().toString(36).substr(2, 4)}`;

    // Горизонтальные линии сетки (0, 50%, 100%)
    const yTicks = [0, Math.round(maxVal / 2), maxVal];
    const fmtDate = (s: string) => {
        if (!s) return '';
        const parts = s.split('-');
        if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
        return s;
    };

    const labelIdx = n <= 1 ? [0] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
    const barWidth = Math.max(2, Math.min(24, (innerW / n) * 0.65));

    // Вычисление индекса по координате X мыши с учетом масштаба SVG viewBox/width
    const getIndexFromX = (clientX: number) => {
        const svgEl = svgRef.current;
        if (!svgEl) return 0;
        const rect = svgEl.getBoundingClientRect();
        if (rect.width <= 0) return 0;

        // Переводим clientX в локальные координаты SVG (где ширина равна width)
        const scaleX = width / rect.width;
        const localX = (clientX - rect.left) * scaleX;

        // Ограничиваем координату внутренней рабочей областью графика
        const relX = Math.max(0, Math.min(innerW, localX - pad.left));
        if (n <= 1) return 0;
        const idx = Math.round((relX / innerW) * (n - 1));
        return Math.max(0, Math.min(n - 1, idx));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const idx = getIndexFromX(e.clientX);
        setIsSelecting(true);
        setDragStartIdx(idx);
        setSelectedRange({ start: idx, end: idx });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const idx = getIndexFromX(e.clientX);
        setHoveredIdx(idx);

        if (isSelecting && dragStartIdx !== null) {
            const start = Math.min(dragStartIdx, idx);
            const end = Math.max(dragStartIdx, idx);
            setSelectedRange({ start, end });
        }
    };

    // Подсчет статистики выделенного диапазона
    let rangeStatsText = '';
    if (selectedRange && selectedRange.start !== selectedRange.end) {
        const sItem = data[selectedRange.start];
        const eItem = data[selectedRange.end];
        const rangeData = data.slice(selectedRange.start, selectedRange.end + 1);

        if (type === 'line') {
            // Накопительный график: рост от и до
            const startVal = sItem?.count || 0;
            const endVal = eItem?.count || 0;
            const diff = Math.round((endVal - startVal) * 10) / 10;
            const sign = diff > 0 ? '+' : '';
            rangeStatsText = `${fmtDate(sItem?._id)} - ${fmtDate(eItem?._id)}: ${startVal} → ${endVal} ${unit} (${sign}${diff} ${unit})`;
        } else {
            // Столбчатый график: сумма за выбранный диапазон дней
            const sum = Math.round(rangeData.reduce((acc, curr) => acc + (curr.count || 0), 0) * 10) / 10;
            rangeStatsText = `${fmtDate(sItem?._id)} - ${fmtDate(eItem?._id)}: сумма ${sum} ${unit}`;
        }
    }

    const selStartIdx = selectedRange ? selectedRange.start : null;
    const selEndIdx = selectedRange ? selectedRange.end : null;
    const hasActiveRange = selStartIdx !== null && selEndIdx !== null && selStartIdx !== selEndIdx;

    // Адаптивный цвет для текста статистики и подсветки элементов выделения
    // Если передан var(...), используем сам цвет с мягким осветлением или Fallback
    const activeAccentColor = color.startsWith('var(') ? color : color;

    return (
        <div ref={containerRef} style={{ width: '100%', position: 'relative', userSelect: 'none' }}>
            {title && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-normal)' }}>{title}</span>
                        {hasActiveRange && (
                            <button
                                onClick={() => setSelectedRange(null)}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.15))',
                                    color: 'var(--text-dim, #aaa)',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                                title="Сбросить выделение"
                            >
                                Сброс
                            </button>
                        )}
                    </div>
                    {hasActiveRange ? (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: activeAccentColor }}>
                            {rangeStatsText}
                        </span>
                    ) : hoveredIdx !== null && data[hoveredIdx] ? (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: color }}>
                            {fmtDate(data[hoveredIdx]._id)}: {data[hoveredIdx].count} {unit}
                            {data[hoveredIdx].secondaryCount !== undefined && (
                                <span style={{ color: secondaryColor, marginLeft: '8px' }}>
                                    / {data[hoveredIdx].secondaryCount}
                                </span>
                            )}
                        </span>
                    ) : null}
                </div>
            )}

            <svg
                ref={svgRef}
                width={width}
                height={height}
                style={{ display: 'block', overflow: 'visible', cursor: isSelecting ? 'ew-resize' : 'crosshair' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => {
                    setHoveredIdx(null);
                }}
            >
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>

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

                {/* Подсветка выделенного диапазона (Drag Selection Box) - цвет адаптирован под график */}
                {hasActiveRange && selStartIdx !== null && selEndIdx !== null && (
                    <rect
                        x={xFor(selStartIdx) - (type === 'bar' ? barWidth : 4)}
                        y={pad.top}
                        width={Math.max(4, (xFor(selEndIdx) - xFor(selStartIdx)) + (type === 'bar' ? barWidth * 2 : 8))}
                        height={innerH}
                        fill={color}
                        fillOpacity="0.12"
                        stroke={color}
                        strokeOpacity="0.5"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                        rx="4"
                        pointerEvents="none"
                    />
                )}

                {/* График: линия/область или столбцы */}
                {type === 'line' ? (
                    <>
                        <path d={areaPath} fill={`url(#${gradId})`} />
                        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

                        {pts.map((p, i) => {
                            const isHighlighted = selStartIdx !== null && selEndIdx !== null && i >= selStartIdx && i <= selEndIdx;
                            return (
                                <circle
                                    key={i}
                                    cx={p.x}
                                    cy={p.y}
                                    r={hoveredIdx === i || isHighlighted ? 5 : 3}
                                    fill={hoveredIdx === i || isHighlighted ? '#fff' : color}
                                    stroke={isHighlighted ? '#fff' : color}
                                    strokeWidth="2"
                                    style={{ transition: 'r 0.15s ease' }}
                                />
                            );
                        })}
                    </>
                ) : (
                    /* Столбчатый график для действий по дням */
                    data.map((d, i) => {
                        const isZero = !d.count || d.count === 0;
                        const h = isZero ? 3 : Math.max(3, (d.count / maxVal) * innerH);
                        const x = xFor(i) - barWidth / 2;
                        const y = pad.top + innerH - h;
                        const isHover = hoveredIdx === i;
                        const isHighlighted = selStartIdx !== null && selEndIdx !== null && i >= selStartIdx && i <= selEndIdx;

                        return (
                            <g key={i}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={h}
                                    rx={barWidth > 4 ? 2 : 1}
                                    fill={isHighlighted ? '#fff' : (isHover ? '#fff' : color)}
                                    opacity={isHover || isHighlighted ? 1 : (isZero ? 0.35 : 0.85)}
                                    style={{ transition: 'all 0.15s ease' }}
                                />
                            </g>
                        );
                    })
                )}

                {/* Активный ховер маркер */}
                {hoveredIdx !== null && !hasActiveRange && (
                    <line
                        x1={xFor(hoveredIdx)}
                        y1={pad.top}
                        x2={xFor(hoveredIdx)}
                        y2={baseline}
                        stroke={color}
                        strokeWidth="1"
                        strokeDasharray="2 2"
                        opacity="0.6"
                    />
                )}

                {/* Метки по оси X (Даты) */}
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
        </div>
    );
};

export default LineChart;
