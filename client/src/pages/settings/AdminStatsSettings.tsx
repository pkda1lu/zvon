import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { UsersIcon, LayoutGridIcon, ChatIcon } from '../../components/Icons';

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
    const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

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

const AdminStatsSettings: React.FC = () => {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await axios.get('/api/admin/stats');
                setStats(res.data);
            } catch (err) {
                console.error('Failed to fetch stats:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) return <div className="settings-content-inner"><p>Загрузка статистики...</p></div>;
    if (!stats) return <div className="settings-content-inner"><p>Ошибка загрузки данных.</p></div>;

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Статистика проекта</h2>
            <p className="settings-description">Общие показатели и динамика роста платформы за последние 30 дней.</p>

            <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                <div className="settings-card" style={{ margin: 0, padding: '24px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--primary-neon)', marginBottom: '12px' }}><UsersIcon size={32} /></div>
                    <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.totals.users}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Пользователей</div>
                </div>
                <div className="settings-card" style={{ margin: 0, padding: '24px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--secondary-neon)', marginBottom: '12px' }}><LayoutGridIcon size={32} /></div>
                    <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.totals.servers}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Серверов</div>
                </div>
                <div className="settings-card" style={{ margin: 0, padding: '24px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--accent-pink)', marginBottom: '12px' }}><ChatIcon size={32} /></div>
                    <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.totals.messages}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Сообщений</div>
                </div>
            </div>

            <div className="settings-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 700 }}>Новые пользователи (30д)</h3>
                <LineChart data={stats.charts.users} color="var(--primary-neon)" />
            </div>

            <div className="settings-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 700 }}>Созданные сервера (30д)</h3>
                <LineChart data={stats.charts.servers} color="var(--secondary-neon)" />
            </div>

            <div className="settings-card" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 700 }}>Активность сообщений (30д)</h3>
                <LineChart data={stats.charts.messages} color="var(--accent-pink)" />
            </div>
        </div>
    );
};

export default AdminStatsSettings;
