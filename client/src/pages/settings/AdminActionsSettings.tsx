import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAvatarUrl } from '../../utils/avatar';
import { ChoiceGroup, CustomSelect, CustomSelectOption } from './SettingsUI';

const RANGES = [
    { value: '7d', label: '7 дней' },
    { value: '30d', label: '30 дней' },
    { value: '90d', label: '90 дней' },
    { value: 'custom', label: 'Свой период' },
];

const ACTION_MAP: Record<string, string> = {
    'USER_REGISTER': 'Регистрация пользователя',
    'USER_LOGIN': 'Вход в аккаунт',
    'USER_DELETE': 'Удаление аккаунта',
    'USER_BLOCK': 'Блокировка аккаунта',
    'USER_UNBLOCK': 'Разблокировка аккаунта',
    'USER_UPDATE': 'Обновление профиля',
    'SERVER_CREATE': 'Создание сервера',
    'SERVER_DELETE': 'Удаление сервера',
    'SERVER_UPDATE': 'Обновление сервера',
    'SERVER_MEMBER_BAN': 'Бан на сервере',
    'BOT_CREATE': 'Создание бота',
    'BOT_DELETE': 'Удаление бота',
    'MINIAPP_CREATE': 'Создание мини-приложения',
    'MODERATION_REPORT_RESOLVE': 'Решение жалобы',
    'MODERATION_BAN': 'Бан модератором',
    'MODERATION_NOTIFY': 'Предупреждение модератора'
};

const ACTION_OPTIONS: CustomSelectOption[] = Object.entries(ACTION_MAP).map(([val, label]) => ({
    id: val,
    name: label
}));

const toLocalDateInputValue = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const translateKey = (key: string) => {
    const keys: Record<string, string> = {
        'name': 'Название', 'description': 'Описание', 'icon': 'Иконка', 'banner': 'Баннер',
        'permissions': 'Права', 'color': 'Цвет', 'hoist': 'Отображение', 'topic': 'Тема',
        'roles': 'Роли', 'nickname': 'Никнейм', 'expiresAt': 'Срок', 'owner': 'Владелец',
        'communicationDisabledUntil': 'Мут до', 'username': 'Имя пользователя', 'email': 'Email',
        'status': 'Статус', 'bio': 'О себе', 'isBanned': 'Бан', 'role': 'Системная роль'
    };
    return keys[key] || key;
};

const format24hDateTime = (dateInput: string | Date) => {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
};

const AdminActionsSettings: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedActions, setSelectedActions] = useState<string[]>([]);
    const [range, setRange] = useState('7d');
    const [after, setAfter] = useState(() => toLocalDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    const [before, setBefore] = useState(() => toLocalDateInputValue(new Date()));
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

    const toggleLogCollapse = (id: string) => {
        setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
    };

    useEffect(() => {
        if (range !== 'custom') {
            const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;
            setAfter(toLocalDateInputValue(new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
            setBefore(toLocalDateInputValue(new Date()));
        }
    }, [range]);

    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page) });
            if (selectedActions.length > 0) {
                params.set('actions', selectedActions.join(','));
            }
            if (after) {
                const aDate = new Date(`${after}T00:00:00`);
                params.set('after', aDate.toISOString());
            }
            if (before) {
                const bDate = new Date(`${before}T23:59:59.999`);
                params.set('before', bDate.toISOString());
            }
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
    }, [selectedActions, after, before, page, debouncedSearch]);

    const getActionLabel = (action: string) => {
        return ACTION_MAP[action] || action;
    };

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
            <p className="settings-description">Глобальный аудит событий платформы с выбором нескольких типов действий и фильтрацией по периодам.</p>

            <div className="server-settings-audit-filters" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {/* Строка 1: Поиск и фильтр действий */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        className="settings-input"
                        placeholder="Поиск по пользователю, серверу или причине..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ flex: '1 1 260px', minWidth: '220px' }}
                    />

                    <div style={{ flex: '1 1 240px' }}>
                        <CustomSelect
                            options={ACTION_OPTIONS}
                            selectedValues={selectedActions}
                            onMultiChange={(vals) => { setSelectedActions(vals); setPage(1); }}
                            multiple={true}
                            placeholder="Все действия (выберите фильтр)"
                        />
                    </div>
                </div>

                {/* Строка 2: Выбор периода времени и даты от / до */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '0 1 auto' }}>
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
                                    onChange={(e) => { setAfter(e.target.value); setPage(1); }}
                                    title="С даты"
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
                                    onChange={(e) => { setBefore(e.target.value); setPage(1); }}
                                    title="По дату (включительно до 23:59)"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="audit-logs-list">
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Загрузка логов...</div>
                ) : logs.length === 0 ? (
                    <div className="server-settings-empty-state">За указанный период действий не найдено.</div>
                ) : (
                    logs.map(log => {
                        const target = getTargetLabel(log);
                        const isExpanded = !!expandedLogs[log._id];
                        const hasDetails = (Array.isArray(log.details?.changes) && log.details.changes.length > 0) || log.details?.serverName || log.details?.reason || (log.details?.changes && !Array.isArray(log.details.changes));

                        return (
                            <div key={log._id} className="audit-log-item" style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid var(--glass-border, rgba(255,255,255,0.06))' }}>
                                <div
                                    className="audit-log-header"
                                    onClick={() => hasDetails && toggleLogCollapse(log._id)}
                                    style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: hasDetails ? 'pointer' : 'default' }}
                                >
                                    <div className="audit-log-avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--secondary-neon, #a855f7)' }}>
                                        {log.executor && getAvatarUrl(log.executor.avatar) ? (
                                            <img src={getAvatarUrl(log.executor.avatar)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                                                {log.executor?.username?.charAt(0).toUpperCase() || 'S'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="audit-log-text" style={{ flex: 1 }}>
                                        <div className="audit-log-main" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <strong style={{ color: 'var(--text-normal)' }}>{log.executor?.username || 'Система'}</strong>
                                            <span className="audit-action-badge" style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
                                                {getActionLabel(log.action)}
                                            </span>
                                            {target && <span className="audit-target" style={{ fontWeight: 600, color: 'var(--text-bright, #fff)' }}>{target}</span>}
                                        </div>
                                        <div className="audit-log-date" style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                            {format24hDateTime(log.createdAt)}
                                        </div>
                                    </div>
                                    {hasDetails && (
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '4px'
                                            }}
                                            title={isExpanded ? 'Свернуть детали' : 'Развернуть детали'}
                                        >
                                            <svg
                                                width="18"
                                                height="18"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="var(--text-dim, #94a3b8)"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}
                                            >
                                                <polyline points="6 9 12 15 18 9"></polyline>
                                            </svg>
                                        </div>
                                    )}
                                </div>

                                {isExpanded && Array.isArray(log.details?.changes) && log.details.changes.length > 0 && (
                                    <div className="audit-log-changes" style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', fontSize: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase' }}>Изменения:</div>
                                        {log.details.changes.map((c: any, i: number) => (
                                            <div key={i} className="audit-change-entry" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                <span className="change-key" style={{ fontWeight: 600, color: 'var(--text-dim)', minWidth: '100px' }}>{translateKey(c.key)}:</span>
                                                {c.oldValue !== undefined && (
                                                    <span className="change-old" style={{ color: '#ef4444', textDecoration: 'line-through', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                                        <span style={{ fontSize: '10px', opacity: 0.7, marginRight: '4px' }}>[До]:</span>
                                                        {String(c.oldValue)}
                                                    </span>
                                                )}
                                                <span className="change-arrow" style={{ color: 'var(--text-dim)', fontWeight: 700 }}>→</span>
                                                <span className="change-new" style={{ color: '#22c55e', fontWeight: 600, background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                                    <span style={{ fontSize: '10px', opacity: 0.8, marginRight: '4px' }}>[После]:</span>
                                                    {String(c.newValue)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {isExpanded && (log.details?.serverName || log.details?.reason || (log.details?.changes && !Array.isArray(log.details.changes))) && (
                                    <div className="audit-log-reason" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-normal)', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                                        {log.details.serverName && <div><strong>Сервер:</strong> {log.details.serverName}</div>}
                                        {log.details.reason && <div><strong>Причина:</strong> {log.details.reason}</div>}
                                        {log.details.changes && !Array.isArray(log.details.changes) && (
                                            <div style={{ marginTop: '4px' }}>
                                                <strong>Детали:</strong> {JSON.stringify(log.details.changes)}
                                            </div>
                                        )}
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
