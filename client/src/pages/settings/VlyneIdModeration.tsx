import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useDialog } from '../../contexts/DialogContext';

/**
 * Разбор заявок на подключение приложений к Vlyne ID.
 *
 * Отдельный файл, а не ещё одна ветка в ModerationSettings: тот и так на
 * тысячу строк с разметкой в атрибутах, и дописывать туда третью систему
 * значило бы окончательно закрыть его для правок.
 *
 * Одобрение здесь создаёт клиента само — модератор не переносит поля в консоль.
 * Он отвечает за решение, а не за аккуратность копирования.
 */

type Status = 'pending' | 'changes_requested' | 'approved' | 'rejected';

interface Message {
    role: 'applicant' | 'moderator';
    text: string;
    author: string | null;
    createdAt: string;
}

interface AppRequest {
    id: string;
    name: string;
    description: string;
    homepageUrl: string;
    privacyPolicyUrl: string;
    type: 'public' | 'confidential';
    redirectUris: string[];
    requestedScopes: string[];
    scopeDetails: { scope: string; title: string }[];
    purpose: string;
    status: Status;
    contactEmail: string;
    messages: Message[];
    clientId: string | null;
    createdAt: string;
    applicant: {
        id: string;
        username: string;
        avatar: string | null;
        email: string;
        registeredAt: string;
    } | null;
    moderator: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
    pending: 'Ждёт решения',
    changes_requested: 'Отправлены вопросы',
    approved: 'Одобрена',
    rejected: 'Отклонена'
};

const STATUS_COLOR: Record<Status, string> = {
    pending: 'var(--primary-neon)',
    changes_requested: '#faa61a',
    approved: '#23a559',
    rejected: '#f04747'
};

const FILTERS: [string, string][] = [
    ['open', 'Открытые'],
    ['approved', 'Одобренные'],
    ['rejected', 'Отклонённые'],
    ['all', 'Все']
];

const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const VlyneIdModeration: React.FC = () => {
    const { alert, confirm } = useDialog();
    const [filter, setFilter] = useState('open');
    const [list, setList] = useState<AppRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (status: string) => {
        setLoading(true);
        try {
            // «Открытые» на сервере — это и pending, и changes_requested:
            // заявка с заданными вопросами не должна выпадать из очереди.
            const query = status === 'open' ? '' : `?status=${status}`;
            const res = await axios.get(`/api/vlyne-id/admin/applications${query}`);
            setList(res.data || []);
        } catch {
            setList([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(filter); }, [filter, load]);

    const decide = async (req: AppRequest, action: 'approve' | 'reject' | 'request_changes') => {
        if (action !== 'approve' && !comment.trim()) {
            alert('Объясните решение — этот текст уйдёт разработчику письмом.');
            return;
        }
        if (action === 'approve') {
            const ok = await confirm(
                `Одобрить «${req.name}»? Приложение будет создано сразу и сможет запрашивать: ` +
                `${req.scopeDetails.map((s) => s.title).join(', ') || 'только идентификатор'}.`
            );
            if (!ok) return;
        }

        setBusy(true);
        try {
            const { data } = await axios.post(
                `/api/vlyne-id/admin/applications/${req.id}/decision`,
                { action, comment: comment.trim() }
            );
            setComment('');
            if (action === 'approve' && data.clientId) {
                alert(`Приложение создано. Идентификатор: ${data.clientId}. Разработчик увидит его в кабинете.`);
            }
            await load(filter);
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Не удалось сохранить решение');
        } finally {
            setBusy(false);
        }
    };

    const card: React.CSSProperties = {
        background: 'var(--glass-bg, rgba(255,255,255,0.03))',
        border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
        borderRadius: '14px',
        padding: '18px',
        marginBottom: '12px'
    };

    return (
        <div>
            <p className="settings-description" style={{ marginTop: 0 }}>
                Заявки сторонних сервисов на вход через Vlyne ID. Одобрение сразу создаёт
                приложение — вручную ничего заводить не нужно.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
                {FILTERS.map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setFilter(id)}
                        style={{
                            padding: '7px 14px',
                            fontSize: '13px',
                            fontWeight: 600,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: filter === id ? '#fff' : 'var(--text-dim)',
                            background: filter === id ? 'var(--primary-neon)' : 'transparent',
                            border: `1px solid ${filter === id ? 'transparent' : 'var(--glass-border)'}`
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px' }}>Загрузка…</div>
            ) : list.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px' }}>
                    Заявок в этой категории нет.
                </div>
            ) : list.map((req) => {
                const isOpen = openId === req.id;
                const editable = req.status === 'pending' || req.status === 'changes_requested';

                return (
                    <div key={req.id} style={card}>
                        <div
                            style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}
                            onClick={() => { setOpenId(isOpen ? null : req.id); setComment(''); }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <strong style={{ fontSize: '15px' }}>{req.name}</strong>
                                    <span style={{
                                        padding: '2px 9px', fontSize: '11px', fontWeight: 700, borderRadius: '6px',
                                        color: STATUS_COLOR[req.status], background: 'rgba(255,255,255,0.06)'
                                    }}>
                                        {STATUS_LABEL[req.status]}
                                    </span>
                                    <span style={{
                                        padding: '2px 9px', fontSize: '11px', borderRadius: '6px',
                                        color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)'
                                    }}>
                                        {req.type === 'confidential' ? 'серверное' : 'публичное'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '12.5px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                    {req.applicant?.username || 'аккаунт удалён'} · {fmtDate(req.createdAt)}
                                    {req.messages.length > 0 && ` · сообщений: ${req.messages.length}`}
                                </div>
                            </div>
                            <span style={{ color: 'var(--text-dim)', fontSize: '18px' }}>{isOpen ? '▴' : '▾'}</span>
                        </div>

                        {isOpen && (
                            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
                                {/* Кто просит — часть решения: у свежесозданного аккаунта
                                    и у давнего участника разный вес одной и той же заявки. */}
                                <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '14px' }}>
                                    <div><b>Заявитель:</b> {req.applicant?.username} ({req.applicant?.email})</div>
                                    <div><b>В Zvon с:</b> {fmtDate(req.applicant?.registeredAt)}</div>
                                    <div><b>Почта для ответа:</b> {req.contactEmail}</div>
                                    {req.homepageUrl && (
                                        <div><b>Сайт:</b> <a href={req.homepageUrl} target="_blank" rel="noreferrer noopener">{req.homepageUrl}</a></div>
                                    )}
                                    {req.privacyPolicyUrl && (
                                        <div><b>Политика:</b> <a href={req.privacyPolicyUrl} target="_blank" rel="noreferrer noopener">{req.privacyPolicyUrl}</a></div>
                                    )}
                                    {req.description && <div><b>Описание:</b> {req.description}</div>}
                                </div>

                                <div style={{ fontSize: '13px', marginBottom: '14px' }}>
                                    <b style={{ color: 'var(--text-dim)' }}>Запрошенные права:</b>
                                    <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {req.requestedScopes.map((s) => (
                                            <code key={s} style={{
                                                padding: '3px 8px', fontSize: '12px', borderRadius: '6px',
                                                background: 'rgba(0,106,255,0.12)', color: '#9fc0ff'
                                            }}>{s}</code>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ fontSize: '13px', marginBottom: '14px' }}>
                                    <b style={{ color: 'var(--text-dim)' }}>Адреса возврата:</b>
                                    <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {req.redirectUris.map((u) => (
                                            <code key={u} style={{ fontSize: '12px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{u}</code>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <b style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Зачем нужен доступ:</b>
                                    <div style={{
                                        marginTop: '6px', padding: '12px 14px', fontSize: '13.5px', lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--glass-border)', borderRadius: '10px'
                                    }}>
                                        {req.purpose}
                                    </div>
                                </div>

                                {req.messages.length > 0 && (
                                    <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {req.messages.map((m, i) => (
                                            <div key={i} style={{
                                                padding: '10px 12px', borderRadius: '10px', fontSize: '13px',
                                                background: m.role === 'moderator' ? 'rgba(0,106,255,0.08)' : 'rgba(255,255,255,0.03)',
                                                border: '1px solid var(--glass-border)'
                                            }}>
                                                <div style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                                                    {m.role === 'moderator' ? `Модератор ${m.author || ''}` : 'Заявитель'} · {fmtDate(m.createdAt)}
                                                </div>
                                                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {req.clientId && (
                                    <div style={{ fontSize: '13px', marginBottom: '14px' }}>
                                        <b style={{ color: 'var(--text-dim)' }}>Создано приложение:</b>{' '}
                                        <code>{req.clientId}</code>
                                    </div>
                                )}

                                {editable && (
                                    <>
                                        <textarea
                                            value={comment}
                                            onChange={(e) => setComment(e.target.value)}
                                            rows={3}
                                            placeholder="Комментарий для разработчика — уйдёт письмом и появится в его кабинете"
                                            style={{
                                                width: '100%', padding: '11px 13px', fontFamily: 'inherit', fontSize: '13.5px',
                                                color: 'var(--text-normal, #fff)', background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid var(--glass-border)', borderRadius: '10px',
                                                outline: 'none', resize: 'vertical', boxSizing: 'border-box'
                                            }}
                                        />
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                                            <button
                                                className="settings-btn"
                                                style={{ background: '#23a559', color: '#fff', border: 'none' }}
                                                disabled={busy}
                                                onClick={() => decide(req, 'approve')}
                                            >
                                                Одобрить и создать
                                            </button>
                                            <button
                                                className="settings-btn"
                                                style={{ background: 'rgba(250,166,26,0.15)', color: '#faa61a', border: '1px solid rgba(250,166,26,0.3)' }}
                                                disabled={busy}
                                                onClick={() => decide(req, 'request_changes')}
                                            >
                                                Задать вопросы
                                            </button>
                                            <button
                                                className="settings-btn settings-btn-danger"
                                                disabled={busy}
                                                onClick={() => decide(req, 'reject')}
                                            >
                                                Отклонить
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default VlyneIdModeration;
