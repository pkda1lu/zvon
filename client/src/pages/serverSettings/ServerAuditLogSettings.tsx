import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Server, AuditLogEntry } from '../../types';
import { getAvatarUrl } from '../../utils/avatar';
import { ChoiceGroup, CustomSelect, CustomSelectOption } from '../settings/SettingsUI';

interface Props {
    server: Server;
}

const RANGES = [
    { value: '7d', label: '7 дней' },
    { value: '30d', label: '30 дней' },
    { value: '90d', label: '90 дней' },
    { value: 'custom', label: 'Свой период' },
];

const ALL_SERVER_ACTIONS: Record<string, string> = {
    'SERVER_UPDATE': 'Обновление настроек сервера',
    'SERVER_TRANSFER': 'Передача сервера',
    'CHANNEL_CREATE': 'Создание канала',
    'CHANNEL_UPDATE': 'Изменение канала',
    'CHANNEL_DELETE': 'Удаление канала',
    'MEMBER_KICK': 'Кик пользователя',
    'MEMBER_BAN': 'Бан пользователя',
    'MEMBER_UNBAN': 'Разбан пользователя',
    'MEMBER_JOIN': 'Вход участника',
    'MEMBER_LEAVE': 'Выход участника',
    'MEMBER_UPDATE': 'Обновление профиля участника',
    'MEMBER_TIMEOUT': 'Мут участника',
    'ROLE_CREATE': 'Создание роли',
    'ROLE_UPDATE': 'Изменение роли',
    'ROLE_DELETE': 'Удаление роли',
    'INVITE_CREATE': 'Создание приглашения',
    'INVITE_DELETE': 'Удаление приглашения',
    'MESSAGE_DELETE': 'Удаление сообщения',
    'MESSAGE_PIN': 'Закрепление сообщения',
    'MESSAGE_UNPIN': 'Открепление сообщения',
    'EMOJI_CREATE': 'Добавление эмодзи',
    'EMOJI_UPDATE': 'Переименование эмодзи',
    'EMOJI_DELETE': 'Удаление эмодзи',
};

const formatAuditAction = (action: string) => {
    return ALL_SERVER_ACTIONS[action] || action;
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

const toLocalDateInputValue = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

const ServerAuditLogSettings: React.FC<Props> = ({ server }) => {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedActions, setSelectedActions] = useState<string[]>([]);
    const [range, setRange] = useState('7d');
    const [after, setAfter] = useState(() => toLocalDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    const [before, setBefore] = useState(() => toLocalDateInputValue(new Date()));

    const actionSelectOptions: CustomSelectOption[] = Object.entries(ALL_SERVER_ACTIONS).map(([val, label]) => ({
        id: val,
        name: label
    }));

    useEffect(() => {
        if (range !== 'custom') {
            const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;
            setAfter(toLocalDateInputValue(new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
            setBefore(toLocalDateInputValue(new Date()));
        }
    }, [range]);

    const fetchLogs = useCallback(async (refresh = false) => {
        setIsLoading(true);
        try {
            const lastLog = !refresh && logs.length > 0 ? logs[logs.length - 1] : null;

            let afterISO: string | undefined;
            if (after) {
                const aDate = new Date(`${after}T00:00:00`);
                afterISO = aDate.toISOString();
            }

            let beforeISO: string | undefined;
            if (lastLog) {
                beforeISO = lastLog.createdAt;
            } else if (before) {
                const bDate = new Date(`${before}T23:59:59.999`);
                beforeISO = bDate.toISOString();
            }

            const res = await axios.get(`/api/servers/${server._id}/audit-logs`, {
                params: {
                    limit: 30,
                    before: beforeISO,
                    after: afterISO,
                    actions: selectedActions.length > 0 ? selectedActions.join(',') : undefined
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
    }, [server._id, after, before, selectedActions]);

    useEffect(() => { fetchLogs(true); }, [server._id, after, before, selectedActions]);

    const filteredLogs = logs.filter(log => {
        if (selectedActions.length > 0 && !selectedActions.includes(log.action)) return false;
        if (search) {
            const q = search.toLowerCase();
            const matches =
                log.executor?.username?.toLowerCase().includes(q) ||
                (log.target as any)?.username?.toLowerCase().includes(q) ||
                (log.target as any)?.name?.toLowerCase().includes(q) ||
                formatAuditAction(log.action).toLowerCase().includes(q) ||
                (log.reason || '').toLowerCase().includes(q);
            if (!matches) return false;
        }
        return true;
    });

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Журнал действий</h2>
            <p className="settings-description">История административных событий и действий участников на сервере за выбранный период.</p>

            <div className="server-settings-audit-filters" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {/* Строка 1: Поиск и Фильтр действий */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        className="settings-input"
                        placeholder="Поиск по пользователю, действию или причине..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ flex: '1 1 260px', minWidth: '220px' }}
                    />
                    
                    <div style={{ flex: '1 1 240px' }}>
                        <CustomSelect
                            options={actionSelectOptions}
                            selectedValues={selectedActions}
                            onMultiChange={setSelectedActions}
                            multiple={true}
                            placeholder="Все действия (выберите фильтр)"
                        />
                    </div>
                </div>

                {/* Строка 2: Период времени и дат от / до */}
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
                                    onChange={(e) => setAfter(e.target.value)}
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
                                    onChange={(e) => setBefore(e.target.value)}
                                    title="По дату (включительно до 23:59)"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="audit-logs-list">
                {filteredLogs.map(log => (
                    <div key={log._id} className="audit-log-item" style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid var(--glass-border, rgba(255,255,255,0.06))' }}>
                        <div className="audit-log-header" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <div className="audit-log-avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--primary-neon)' }}>
                                {getAvatarUrl(log.executor?.avatar) ? (
                                    <img src={getAvatarUrl(log.executor?.avatar)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                                        {log.executor?.username?.charAt(0).toUpperCase() || 'S'}
                                    </span>
                                )}
                            </div>
                            <div className="audit-log-text" style={{ flex: 1 }}>
                                <div className="audit-log-main" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <strong style={{ color: 'var(--text-normal)' }}>{log.executor?.username || 'Система'}</strong>
                                    <span className="audit-action-badge" style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'var(--primary-neon-transparent, rgba(88,101,242,0.2))', color: 'var(--primary-neon, #5865f2)' }}>
                                        {formatAuditAction(log.action)}
                                    </span>
                                    {log.target && (
                                        <span className="audit-target" style={{ fontWeight: 600, color: 'var(--text-bright, #fff)' }}>
                                            {(log.target as any).username || (log.target as any).name || (log.target as any).content}
                                        </span>
                                    )}
                                </div>
                                <div className="audit-log-date" style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                    {format24hDateTime(log.createdAt)}
                                </div>
                            </div>
                        </div>

                        {log.changes && log.changes.length > 0 && (
                            <div className="audit-log-changes" style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', fontSize: '12px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '4px', textTransform: 'uppercase' }}>Изменения:</div>
                                {log.changes.map((c, i) => (
                                    <div key={i} className="audit-change-entry" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className="change-key" style={{ fontWeight: 600, color: 'var(--text-dim)' }}>{translateKey(c.key)}:</span>
                                        {c.oldValue !== undefined && <span className="change-old" style={{ color: '#ef4444', textDecoration: 'line-through' }}>{String(c.oldValue)}</span>}
                                        <span className="change-arrow" style={{ color: 'var(--text-dim)' }}>→</span>
                                        <span className="change-new" style={{ color: '#22c55e', fontWeight: 600 }}>{String(c.newValue)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {log.reason && (
                            <div className="audit-log-reason" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-normal)', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: '4px' }}>
                                💬 <strong>Причина:</strong> {log.reason}
                            </div>
                        )}
                    </div>
                ))}
                {filteredLogs.length === 0 && !isLoading && (
                    <div className="server-settings-empty-state">За выбранный период действий не найдено.</div>
                )}
                {hasMore && (
                    <button className="load-more-btn-simple" onClick={() => fetchLogs()} disabled={isLoading} style={{ width: '100%', padding: '10px', marginTop: '12px', borderRadius: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', color: 'var(--text-normal)', cursor: 'pointer' }}>
                        {isLoading ? 'Загрузка...' : 'Загрузить ещё'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ServerAuditLogSettings;
