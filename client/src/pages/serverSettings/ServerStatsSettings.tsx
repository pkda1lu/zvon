import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Server } from '../../types';
import { UsersIcon, ChatIcon, SparklesIcon } from '../../components/Icons';
import LineChart from '../../components/LineChart';
import { ChoiceGroup } from '../settings/SettingsUI';

interface Props {
    server: Server;
}

const RANGES = [
    { value: '7d', label: '7 дней' },
    { value: '30d', label: '30 дней' },
    { value: '90d', label: '90 дней' },
    { value: 'custom', label: 'Свой период' },
];

const toLocalDateInputValue = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const ServerStatsSettings: React.FC<Props> = ({ server }) => {
    const [range, setRange] = useState('30d');
    const [after, setAfter] = useState(() => toLocalDateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
    const [before, setBefore] = useState(() => toLocalDateInputValue(new Date()));
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const params: any = {};
        if (range === 'custom') {
            if (after) params.after = after;
            if (before) params.before = before;
        } else {
            params.range = range;
        }

        axios.get(`/api/servers/${server._id}/stats`, { params })
            .then(res => setStats(res.data))
            .catch(err => console.error('Failed to fetch server stats', err))
            .finally(() => setLoading(false));
    }, [server._id, range, after, before]);

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Статистика сервера</h2>
            <p className="settings-description">Показатели роста и активности участников за выбранный период (включая указанную дату до 23:59).</p>

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
                    Загрузка статистики сервера...
                </div>
            ) : (
                <>
                    {/* Ключевые показатели сервера */}
                    <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <div className="settings-card" style={{ margin: 0, padding: '20px', textAlign: 'center' }}>
                            <div style={{ color: 'var(--primary-neon)', marginBottom: '8px' }}><UsersIcon size={28} /></div>
                            <div style={{ fontSize: '28px', fontWeight: 800 }}>{stats.totals.members}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px' }}>Участников всего</div>
                        </div>
                        <div className="settings-card" style={{ margin: 0, padding: '20px', textAlign: 'center' }}>
                            <div style={{ color: 'var(--accent-pink)', marginBottom: '8px' }}><ChatIcon size={28} /></div>
                            <div style={{ fontSize: '28px', fontWeight: 800 }}>{stats.totals.messages}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px' }}>Сообщений в чатах</div>
                        </div>
                        <div className="settings-card" style={{ margin: 0, padding: '20px', textAlign: 'center' }}>
                            <div style={{ color: '#22c55e', marginBottom: '8px' }}><SparklesIcon size={28} /></div>
                            <div style={{ fontSize: '28px', fontWeight: 800 }}>+{stats.totals.newMembersPeriod}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px' }}>Новых за период</div>
                        </div>
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.members}
                            type="line"
                            color="var(--primary-neon)"
                            title="Динамика количества участников (накопительно)"
                            unit="участников"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.newMembersDaily}
                            type="bar"
                            color="#22c55e"
                            title="Новые участники по дням"
                            unit="новых участников"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.cumulativeMessages}
                            type="line"
                            color="var(--accent-pink)"
                            title="Динамика роста сообщений (накопительно)"
                            unit="сообщений"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
                        <LineChart
                            data={stats.charts.messages}
                            type="bar"
                            color="var(--accent-pink)"
                            title="Сообщения по дням"
                            unit="сообщений"
                        />
                    </div>

                    <div className="settings-card" style={{ padding: '20px' }}>
                        <LineChart
                            data={stats.charts.activeUsersDaily}
                            type="bar"
                            color="#eab308"
                            title="Активные участники по дням (DAU сервера)"
                            unit="активных пользователей"
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default ServerStatsSettings;
