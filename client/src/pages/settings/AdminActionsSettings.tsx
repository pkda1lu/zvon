import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAvatarUrl } from '../../utils/avatar';

const toDateInputValue = (d: Date) => d.toISOString().slice(0, 10);

const ACTION_OPTIONS = [
    'USER_REGISTER', 'USER_LOGIN', 'USER_DELETE', 'USER_BLOCK', 'USER_UNBLOCK', 'USER_UPDATE',
    'SERVER_CREATE', 'SERVER_DELETE', 'SERVER_UPDATE', 'SERVER_MEMBER_BAN',
    'BOT_CREATE', 'BOT_DELETE', 'MINIAPP_CREATE', 'MODERATION_REPORT_RESOLVE', 'MODERATION_BAN'
];

const AdminActionsSettings: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionFilter, setActionFilter] = useState('');
    const [after, setAfter] = useState(() => toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    const [before, setBefore] = useState(() => toDateInputValue(new Date()));
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
            const params = new URLSearchParams({ page: String(page) });
            if (actionFilter) params.set('action', actionFilter);
            if (after) params.set('after', new Date(after).toISOString());
            if (before) params.set('before', new Date(before).toISOString());
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actionFilter, after, before, page, debouncedSearch]);

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

    // Название и, если применимо, ссылка на удалённый объект — одной строкой, как в серверном журнале.
    const getTargetLabel = (log: any): string | null => {
        if (log.targetModel === 'User' && log.target) return log.target.username;
        if (log.targetModel === 'Server' && log.target) return log.target.name;
        if (log.targetModel === 'MiniApp' && log.target) return log.target.name;
        if (!log.target && log.details?.username) return `${log.details.username} (удалён)`;
        if (!log.target && log.details?.name) return `${log.details.name} (удалён)`;
        return null;
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Журнал действий</h2>
            <p className="settings-description">Глобальный аудит событий платформы с поиском и фильтрацией по действию и периоду.</p>

            <div className="server-settings-audit-filters">
                <input className="settings-input" placeholder="Поиск по пользователю, серверу, действию или причине..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className="settings-input" style={{ maxWidth: '220px' }} value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
                    <option value="">Все действия</option>
                    {ACTION_OPTIONS.map(a => <option key={a} value={a}>{getActionLabel(a)}</option>)}
                </select>
                <input type="date" lang="ru-RU" className="settings-input" style={{ maxWidth: '160px' }} value={after} onChange={(e) => { setAfter(e.target.value); setPage(1); }} title="С даты" />
                <input type="date" lang="ru-RU" className="settings-input" style={{ maxWidth: '160px' }} value={before} onChange={(e) => { setBefore(e.target.value); setPage(1); }} title="По дату" />
            </div>

            <div className="audit-logs-list">
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Загрузка логов...</div>
                ) : logs.length === 0 ? (
                    <div className="server-settings-empty-state">За указанный период действий не найдено.</div>
                ) : (
                    logs.map(log => {
                        const target = getTargetLabel(log);
                        return (
                            <div key={log._id} className="audit-log-item">
                                <div className="audit-log-header">
                                    <div className="audit-log-avatar">
                                        {log.executor && getAvatarUrl(log.executor.avatar) ? (
                                            <img src={getAvatarUrl(log.executor.avatar)!} alt="" />
                                        ) : (
                                            <span>{log.executor?.username?.charAt(0).toUpperCase() || 'S'}</span>
                                        )}
                                    </div>
                                    <div className="audit-log-text">
                                        <div className="audit-log-main">
                                            <strong>{log.executor?.username || 'Система'}</strong>
                                            <span className="audit-action-text"> {getActionLabel(log.action)} </span>
                                            {target && <span className="audit-target">{target}</span>}
                                        </div>
                                        <div className="audit-log-date">{new Date(log.createdAt).toLocaleString('ru-RU')}</div>
                                    </div>
                                </div>
                                {(log.details?.serverName || log.details?.reason) && (
                                    <div className="audit-log-reason">
                                        {log.details.serverName && `Сервер: ${log.details.serverName}`}
                                        {log.details.serverName && log.details.reason && ' · '}
                                        {log.details.reason && `Причина: ${log.details.reason}`}
                                    </div>
                                )}
                            </div>
                        );
                    })
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
