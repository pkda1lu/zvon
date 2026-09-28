import React from 'react';

/*
 * Подробности записи журнала — общие для журнала сервера и глобального журнала.
 * Сервер кладёт контекст в details (канал, текст сообщения, срок, статус,
 * причина…), здесь он показывается по-русски, с датами и понятными значениями.
 */

const LABELS: Record<string, string> = {
    channelName: 'Канал', channelType: 'Тип канала', messagePreview: 'Сообщение', attachments: 'Вложений',
    inviteCode: 'Приглашение', uses: 'Использований', roleName: 'Роль', roleColor: 'Цвет роли', emojiName: 'Эмодзи',
    status: 'Статус', note: 'Комментарий', reason: 'Причина', previousReason: 'Прежняя причина',
    previousStatus: 'Прежний статус', previousNote: 'Прежний комментарий', reporter: 'Автор жалобы',
    reportedUser: 'На кого жалоба', itemType: 'Тип', category: 'Категория', type: 'Вид', durationHours: 'Длительность, ч',
    expiresAt: 'До', active: 'Активен', wasActive: 'Был активен', blocks: 'Блоков', serverName: 'Сервер',
    username: 'Пользователь', name: 'Название',
};

const VALUE_MAP: Record<string, Record<string, string>> = {
    status: { resolved: 'Решено', dismissed: 'Отклонено', pending: 'Ожидает' },
    previousStatus: { resolved: 'Решено', dismissed: 'Отклонено', pending: 'Ожидает' },
    itemType: { bot: 'Бот', miniapp: 'Мини-приложение', theme: 'Тема' },
    channelType: { text: 'Текстовый', voice: 'Голосовой', room: '3D-комната', category: 'Категория' },
    type: { temporary: 'Временный', permanent: 'Навсегда' },
    category: { bug: 'Ошибка / Баг', ui: 'Интерфейс', voice: 'Голос / Звонки', feature: 'Предложение', other: 'Другое' },
};

// Служебные поля показываются отдельно или не показываются вовсе.
const HIDDEN = new Set(['changes', 'meta', 'targetName', 'channelId', 'messageId']);

const isIsoDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

export const formatAuditValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
    if (VALUE_MAP[key] && typeof value === 'string' && VALUE_MAP[key][value]) return VALUE_MAP[key][value];
    if (isIsoDate(value)) return new Date(value as string).toLocaleString('ru-RU');
    if (Array.isArray(value)) return value.map(v => formatAuditValue(key, v)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

export const AuditDetails: React.FC<{ details?: Record<string, any> | null; showMeta?: boolean }> = ({ details, showMeta }) => {
    if (!details) return null;
    const entries = Object.entries(details).filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== undefined && v !== '');
    const meta = showMeta ? details.meta : null;
    if (entries.length === 0 && !meta) return null;
    return (
        <div className="audit-log-details">
            {entries.map(([k, v]) => (
                <div key={k} className="audit-log-detail">
                    <span className="audit-log-detail-key">{LABELS[k] || k}</span>
                    <span className={`audit-log-detail-value ${k === 'messagePreview' ? 'is-quote' : ''}`}>
                        {k === 'roleColor' && typeof v === 'string'
                            ? <><span className="audit-log-swatch" style={{ background: v }} />{v}</>
                            : formatAuditValue(k, v)}
                    </span>
                </div>
            ))}
            {meta && (meta.ip || meta.userAgent) && (
                <div className="audit-log-detail audit-log-detail--meta">
                    <span className="audit-log-detail-key">Клиент</span>
                    <span className="audit-log-detail-value">{[meta.ip, meta.userAgent].filter(Boolean).join(' · ')}</span>
                </div>
            )}
        </div>
    );
};

export const hasAuditDetails = (details?: Record<string, any> | null, showMeta?: boolean) =>
    !!details && (Object.entries(details).some(([k, v]) => !HIDDEN.has(k) && v !== null && v !== undefined && v !== '') || (!!showMeta && !!details.meta));
