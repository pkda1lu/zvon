import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Круговая (donut) диаграмма с плавной анимацией заполнения.
const Donut: React.FC<{ percent: number; color: string; centerMain: string; centerSub?: string; size?: number }> = ({ percent, color, centerMain, centerSub, size = 150 }) => {
    const stroke = 12;
    const r = size / 2 - stroke;
    const circ = 2 * Math.PI * r;
    const pct = Math.min(100, Math.max(0, percent || 0));
    const offset = circ * (1 - pct / 100);
    return (
        <svg width={size} height={size} style={{ display: 'block' }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--glass-border)" strokeWidth={stroke} />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
            />
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize="26" fontWeight="800" fill="#fff">{centerMain}</text>
            {centerSub && <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="var(--text-dim)">{centerSub}</text>}
        </svg>
    );
};

const fmtBytes = (b: number) => {
    if (!b || b < 0) return '0 Б';
    const u = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

const fmtRate = (bps: number) => `${fmtBytes(bps)}/с`;

const fmtUptime = (sec: number) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}д ${h}ч ${m}м`;
    if (h > 0) return `${h}ч ${m}м`;
    return `${m}м`;
};

// Цвет по уровню нагрузки: зелёный → жёлтый → красный.
const loadColor = (pct: number) => pct >= 85 ? '#ff4757' : pct >= 60 ? '#f0b232' : '#23a559';

const Card: React.FC<{ title: string; children: React.ReactNode; footer?: React.ReactNode }> = ({ title, children, footer }) => (
    <div className="settings-card" style={{ margin: 0, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-dim)', margin: 0 }}>{title}</h3>
        {children}
        {footer && <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5 }}>{footer}</div>}
    </div>
);

const AdminInfraSettings: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        let alive = true;
        const fetchData = async () => {
            try {
                const res = await axios.get('/api/admin/infrastructure');
                if (!alive) return;
                setData(res.data);
                setError(false);
            } catch {
                if (alive) setError(true);
            } finally {
                if (alive) setLoading(false);
            }
        };
        fetchData();
        timerRef.current = setInterval(fetchData, 2000); // реальное время — опрос каждые 2с
        return () => { alive = false; if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    if (loading) return <div className="settings-content-inner"><h2 className="settings-page-title">Инфраструктура</h2><p>Загрузка метрик сервера...</p></div>;
    if (error || !data) return <div className="settings-content-inner"><h2 className="settings-page-title">Инфраструктура</h2><p>Не удалось получить метрики сервера.</p></div>;

    const cpu = data.cpu || {};
    const mem = data.memory || {};
    const storage = data.storage || {};
    const net = data.network || {};

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Инфраструктура</h2>
            <p className="settings-description">
                Состояние сервера в реальном времени · {data.hostname} ({data.platform}) · аптайм {fmtUptime(data.uptime || 0)}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <Card
                    title="Процессор"
                    footer={<>{cpu.cores} ядер{cpu.loadavg ? ` · LA ${cpu.loadavg.map((n: number) => n.toFixed(2)).join(' / ')}` : ''}{cpu.model ? <><br />{cpu.model}</> : ''}</>}
                >
                    <Donut percent={cpu.usage} color={loadColor(cpu.usage)} centerMain={`${Math.round(cpu.usage)}%`} centerSub="загрузка" />
                </Card>

                <Card
                    title="Оперативная память"
                    footer={`${fmtBytes(mem.used)} из ${fmtBytes(mem.total)}`}
                >
                    <Donut percent={mem.usage} color={loadColor(mem.usage)} centerMain={`${Math.round(mem.usage)}%`} centerSub={fmtBytes(mem.used)} />
                </Card>

                <Card
                    title="Хранилище"
                    footer={storage.unavailable ? 'Недоступно на этой ОС' : `${fmtBytes(storage.used)} из ${fmtBytes(storage.total)}`}
                >
                    <Donut percent={storage.usage} color={loadColor(storage.usage)} centerMain={`${Math.round(storage.usage)}%`} centerSub={storage.unavailable ? '—' : `${fmtBytes(storage.free)} своб.`} />
                </Card>

                <Card
                    title="Сеть"
                    footer={net.unavailable ? 'Недоступно на этой ОС' : <>↓ {fmtRate(net.rxRate)}<br />↑ {fmtRate(net.txRate)}</>}
                >
                    <Donut percent={net.usage} color="var(--primary-neon)" centerMain={fmtBytes((net.rxRate || 0) + (net.txRate || 0))} centerSub="в секунду" />
                </Card>
            </div>
        </div>
    );
};

export default AdminInfraSettings;
