import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { UsersIcon, LayoutGridIcon, ChatIcon } from '../../components/Icons';
import LineChart from '../../components/LineChart';

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
