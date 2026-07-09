import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Server, AuditLogEntry } from '../../types';
import { getAvatarUrl } from '../../utils/avatar';

interface Props {
    server: Server;
}

const formatAuditAction = (action: string) => {
    const actions: Record<string, string> = {
        'SERVER_UPDATE': 'обновил настройки сервера',
        'SERVER_TRANSFER': 'передал сервер',
        'CHANNEL_CREATE': 'создал канал',
        'CHANNEL_UPDATE': 'изменил канал',
        'CHANNEL_DELETE': 'удалил канал',
        'MEMBER_KICK': 'выгнал пользователя',
        'MEMBER_BAN': 'забанил пользователя',
        'MEMBER_UNBAN': 'разбанил пользователя',
        'MEMBER_JOIN': 'присоединился к серверу',
        'MEMBER_LEAVE': 'покинул сервер',
        'MEMBER_UPDATE': 'обновил профиль участника',
        'MEMBER_TIMEOUT': 'изменил мут участника',
        'ROLE_CREATE': 'создал роль',
        'ROLE_UPDATE': 'изменил роль',
        'ROLE_DELETE': 'удалил роль',
        'INVITE_CREATE': 'создал приглашение',
        'INVITE_DELETE': 'удалил приглашение',
        'MESSAGE_DELETE': 'удалил сообщение',
        'MESSAGE_PIN': 'закрепил сообщение',
        'MESSAGE_UNPIN': 'открепил сообщение',
        'EMOJI_CREATE': 'добавил эмодзи',
        'EMOJI_UPDATE': 'переименовал эмодзи',
        'EMOJI_DELETE': 'удалил эмодзи',
    };
    return actions[action] || action;
};

const translateKey = (key: string) => {
    const keys: Record<string, string> = {
        'name': 'Название', 'description': 'Описание', 'icon': 'Иконка', 'banner': 'Баннер',
        'permissions': 'Права', 'color': 'Цвет', 'hoist': 'Отображение', 'topic': 'Тема',
        'roles': 'Роли', 'nickname': 'Никнейм', 'expiresAt': 'Срок', 'owner': 'Владелец',
        'communicationDisabledUntil': 'Мут до'
    };
    return keys[key] || key;
};

// yyyy-mm-dd для значения нативного input[type=date] (отображается как дд.мм.гггг через lang="ru-RU").
const toDateInputValue = (d: Date) => d.toISOString().slice(0, 10);

const ServerAuditLogSettings: React.FC<Props> = ({ server }) => {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [after, setAfter] = useState(() => toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    const [before, setBefore] = useState(() => toDateInputValue(new Date()));

    const fetchLogs = useCallback(async (refresh = false) => {
        setIsLoading(true);
        try {
            const lastLog = !refresh && logs.length > 0 ? logs[logs.length - 1] : null;
            const res = await axios.get(`/api/servers/${server._id}/audit-logs`, {
                params: {
                    limit: 30,
                    before: lastLog ? lastLog.createdAt : (before ? new Date(before).toISOString() : undefined),
                    after: after ? new Date(after).toISOString() : undefined,
                }
            });
            setLogs(refresh ? res.data : [...logs, ...res.data]);
            setHasMore(res.data.length === 30);
        } catch (err) {
            console.error('Failed to fetch audit logs', err);
        } finally {
            setIsLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server._id, after, before]);

    useEffect(() => { fetchLogs(true); }, [server._id, after, before]);

    const filteredLogs = logs.filter(log => {
        if (actionFilter && log.action !== actionFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            const matches =
                log.executor?.username?.toLowerCase().includes(q) ||
                (log.target as any)?.username?.toLowerCase().includes(q) ||
                formatAuditAction(log.action).toLowerCase().includes(q) ||
                (log.reason || '').toLowerCase().includes(q);
            if (!matches) return false;
        }
        return true;
    });

    const actionOptions = Array.from(new Set(logs.map(l => l.action)));

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Действия</h2>
            <p className="settings-description">Здесь отображаются все административные действия, совершённые на этом сервере.</p>

            <div className="server-settings-audit-filters">
                <input className="settings-input" placeholder="Поиск по пользователю, действию или причине..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className="settings-input" style={{ maxWidth: '220px' }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                    <option value="">Все действия</option>
                    {actionOptions.map(a => <option key={a} value={a}>{formatAuditAction(a)}</option>)}
                </select>
                <input type="date" lang="ru-RU" className="settings-input" style={{ maxWidth: '160px' }} value={after} onChange={(e) => setAfter(e.target.value)} title="С даты" />
                <input type="date" lang="ru-RU" className="settings-input" style={{ maxWidth: '160px' }} value={before} onChange={(e) => setBefore(e.target.value)} title="По дату" />
            </div>

            <div className="audit-logs-list">
                {filteredLogs.map(log => (
                    <div key={log._id} className="audit-log-item">
                        <div className="audit-log-header">
                            <div className="audit-log-avatar">
                                {getAvatarUrl(log.executor?.avatar) ? <img src={getAvatarUrl(log.executor?.avatar)!} alt="" /> : <span>{log.executor?.username?.charAt(0).toUpperCase()}</span>}
                            </div>
                            <div className="audit-log-text">
                                <div className="audit-log-main">
                                    <strong>{log.executor?.username}</strong>
                                    <span className="audit-action-text"> {formatAuditAction(log.action)} </span>
                                    {log.target && <span className="audit-target">{(log.target as any).username || (log.target as any).name || (log.target as any).content}</span>}
                                </div>
                                <div className="audit-log-date">{new Date(log.createdAt).toLocaleString('ru-RU')}</div>
                            </div>
                        </div>
                        {log.changes && log.changes.length > 0 && (
                            <div className="audit-log-changes">
                                {log.changes.map((c, i) => (
                                    <div key={i} className="audit-change-entry">
                                        <span className="change-key">{translateKey(c.key)}:</span>
                                        {c.oldValue !== undefined && <span className="change-old">{String(c.oldValue)}</span>}
                                        <span className="change-arrow">→</span>
                                        <span className="change-new">{String(c.newValue)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {log.reason && <div className="audit-log-reason">Причина: {log.reason}</div>}
                    </div>
                ))}
                {filteredLogs.length === 0 && !isLoading && (
                    <div className="server-settings-empty-state">Ничего не найдено.</div>
                )}
                {hasMore && (
                    <button className="load-more-btn-simple" onClick={() => fetchLogs()} disabled={isLoading}>
                        {isLoading ? 'Загрузка...' : 'Загрузить ещё'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ServerAuditLogSettings;
