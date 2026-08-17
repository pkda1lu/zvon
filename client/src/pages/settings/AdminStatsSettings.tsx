import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UsersIcon, LayoutGridIcon, ChatIcon, SparklesIcon, MicIcon, PhoneIcon } from '../../components/Icons';
import LineChart from '../../components/LineChart';
import { ChoiceGroup } from './SettingsUI';

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

const AdminStatsSettings: React.FC = () => {
    const [range, setRange] = useState('30d');
    const [after, setAfter] = useState(() => toLocalDateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
    const [before, setBefore] = useState(() => toLocalDateInputValue(new Date()));
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (range !== 'custom') {
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
        if (after) params.after = after;
        if (before) params.before = before;

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
                                                            src={u.avatar || '/default-avatar.png'}
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
                                                            src={u.avatar || '/default-avatar.png'}
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
