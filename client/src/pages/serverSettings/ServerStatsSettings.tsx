import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Server } from '../../types';
import { UsersIcon, ChatIcon } from '../../components/Icons';
import LineChart from '../../components/LineChart';
import { ChoiceGroup } from '../settings/SettingsUI';

interface Props {
    server: Server;
}

const RANGES = [
    { value: '7d', label: '7 дней' },
    { value: '30d', label: '30 дней' },
    { value: '90d', label: '90 дней' },
];

const ServerStatsSettings: React.FC<Props> = ({ server }) => {
    const [range, setRange] = useState('30d');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        axios.get(`/api/servers/${server._id}/stats`, { params: { range } })
            .then(res => setStats(res.data))
            .catch(err => console.error('Failed to fetch server stats', err))
            .finally(() => setLoading(false));
    }, [server._id, range]);

    if (loading || !stats) return <div className="settings-content-inner"><p>Загрузка статистики...</p></div>;

    const rangeLabel = RANGES.find(r => r.value === range)?.label || '';

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Статистика сервера</h2>
            <p className="settings-description">Показатели и динамика роста сервера. Данные об участниках собираются с момента этого обновления, поэтому за старый период график может быть неполным.</p>

            <ChoiceGroup options={RANGES} value={range} onChange={setRange} className="full-width" />

            <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', margin: '24px 0 32px' }}>
                <div className="settings-card" style={{ margin: 0, padding: '24px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--primary-neon)', marginBottom: '12px' }}><UsersIcon size={32} /></div>
                    <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.totals.members}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Участников</div>
                </div>
                <div className="settings-card" style={{ margin: 0, padding: '24px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--accent-pink)', marginBottom: '12px' }}><ChatIcon size={32} /></div>
                    <div style={{ fontSize: '32px', fontWeight: 800 }}>{stats.totals.messages}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Сообщений</div>
                </div>
            </div>

            <div className="settings-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 700 }}>Участники ({rangeLabel})</h3>
                <LineChart data={stats.charts.members} color="var(--primary-neon)" />
            </div>

            <div className="settings-card" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 700 }}>Активность сообщений ({rangeLabel})</h3>
                <LineChart data={stats.charts.messages} color="var(--accent-pink)" />
            </div>
        </div>
    );
};

export default ServerStatsSettings;
