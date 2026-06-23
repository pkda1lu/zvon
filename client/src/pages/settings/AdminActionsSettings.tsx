import React, { useState, useEffect } from 'react';
import axios from 'axios';
import UserAvatar from '../../components/UserAvatar';

const AdminActionsSettings: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [hours, setHours] = useState('24');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    // Отложенное значение поиска — запрос уходит после паузы в наборе.
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ hours, page: String(page) });
            if (debouncedSearch) params.set('search', debouncedSearch);
            const res = await axios.get(`/api/admin/actions?${params.toString()}`);
            setLogs(Array.isArray(res.data.logs) ? res.data.logs : []);
            setTotalPages(res.data.pages || 1);
        } catch (err) {
            console.error('Fetch logs error:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
    }, [hours, page, debouncedSearch]);

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'USER_REGISTER': return 'Регистрация';
            case 'USER_LOGIN': return 'Вход';
            case 'USER_DELETE': return 'Удаление аккаунта';
            case 'USER_BLOCK': return 'Блокировка';
            case 'USER_UNBLOCK': return 'Разблокировка';
            case 'USER_UPDATE': return 'Обновление профиля';
            case 'SERVER_CREATE': return 'Создание сервера';
            case 'SERVER_DELETE': return 'Удаление сервера';
            case 'SERVER_UPDATE': return 'Обновление сервера';
            case 'SERVER_MEMBER_BAN': return 'Бан на сервере';
            case 'BOT_CREATE': return 'Создание бота';
            case 'BOT_DELETE': return 'Удаление бота';
            case 'MINIAPP_CREATE': return 'Создание мини-приложения';
            case 'MODERATION_REPORT_RESOLVE': return 'Решение жалобы';
            case 'MODERATION_BAN': return 'Бан модератором';
            default: return action;
        }
    };

    const getActionColor = (action: string) => {
        if (action.includes('DELETE') || action.includes('BAN') || action.includes('BLOCK')) return 'var(--danger)';
        if (action.includes('CREATE') || action.includes('REGISTER')) return 'var(--success)';
        if (action.includes('UPDATE')) return 'var(--warning)';
        return 'var(--primary-neon)';
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Журнал действий</h2>
            <p className="settings-description">Глобальный аудит событий платформы с фильтрацией по времени.</p>

            <div style={{ marginBottom: '16px' }}>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск по пользователю, серверу, действию или причине..."
                    style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '1px solid var(--glass-border)',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'var(--text-main)',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box',
                    }}
                />
            </div>

            <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
                {['1', '12', '24', '168'].map(h => (
                    <div 
                        key={h}
                        onClick={() => { setHours(h); setPage(1); }} 
                        style={{ 
                            cursor: 'pointer', 
                            padding: '10px 20px', 
                            background: hours === h ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', 
                            color: hours === h ? 'black' : 'white', 
                            borderRadius: '12px', 
                            fontWeight: 600, 
                            fontSize: '14px', 
                            transition: 'all 0.2s' 
                        }}
                    >
                        {h === '1' ? 'Час' : h === '168' ? 'Неделя' : `${h}ч`}
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Загрузка логов...</div>
                ) : logs.length === 0 ? (
                    <div className="settings-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>За указанный период действий не найдено.</div>
                ) : (
                    logs.map(log => (
                        <div key={log._id} className="settings-card" style={{ margin: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
                            <div style={{ width: '120px', color: 'var(--text-dim)', fontSize: '12px' }}>
                                {new Date(log.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                <div style={{ fontSize: '10px' }}>{new Date(log.createdAt).toLocaleDateString('ru-RU')}</div>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '150px' }}>
                                {log.executor ? (
                                    <>
                                        <UserAvatar user={log.executor} size={24} />
                                        <span style={{ fontWeight: 600 }}>{log.executor.username}</span>
                                    </>
                                ) : (
                                    <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>System</span>
                                )}
                            </div>

                            <div style={{ 
                                fontWeight: 700, 
                                color: getActionColor(log.action),
                                background: `${getActionColor(log.action)}15`,
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                minWidth: '140px',
                                textAlign: 'center'
                            }}>
                                {getActionLabel(log.action)}
                            </div>

                            <div style={{ flex: 1, color: 'var(--text-main)' }}>
                                {log.targetModel === 'User' && log.target && (
                                    <span>Пользователь: <strong>{log.target.username}</strong></span>
                                )}
                                {log.targetModel === 'Server' && log.target && (
                                    <span>Сервер: <strong>{log.target.name}</strong></span>
                                )}
                                {log.targetModel === 'MiniApp' && log.target && (
                                    <span>Мини-приложение: <strong>{log.target.name}</strong></span>
                                )}
                                {!log.target && log.details?.username && (
                                    <span>Объект: <strong>{log.details.username}</strong> (удалён)</span>
                                )}
                                {!log.target && log.details?.name && (
                                    <span>Объект: <strong>{log.details.name}</strong> (удалён)</span>
                                )}
                                {(log.details?.serverName || log.details?.reason) && (
                                    <span style={{ color: 'var(--text-dim)', fontSize: '12px', marginLeft: '8px' }}>
                                        {log.details.serverName && `· ${log.details.serverName}`}
                                        {log.details.reason && ` · причина: ${log.details.reason}`}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {totalPages > 1 && (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
                    <button 
                        className="settings-btn" 
                        disabled={page === 1} 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        style={{ padding: '8px 16px', opacity: page === 1 ? 0.5 : 1 }}
                    >
                        Назад
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', fontWeight: 700 }}>{page} / {totalPages}</div>
                    <button 
                        className="settings-btn" 
                        disabled={page === totalPages} 
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        style={{ padding: '8px 16px', opacity: page === totalPages ? 0.5 : 1 }}
                    >
                        Вперёд
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdminActionsSettings;
