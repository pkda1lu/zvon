import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import VlyneIdNav from '../components/VlyneIdNav';
import VibeBackground from '../components/VibeBackground';
import VlyneIdSignIn from '../components/VlyneIdSignIn';
import './VlyneIdDocs.css';
import './VlyneIdAccount.css';
import './VlyneIdDevCabinet.css';

/**
 * Кабинет разработчика Vlyne ID.
 *
 * Заменяет собой переписку с поддержкой и ручное заведение клиента в консоли.
 * Разработчик заполняет заявку, видит её состояние и переписку с модератором,
 * а после одобрения получает здесь же идентификатор приложения и секрет.
 *
 * Реестр клиентов при этом остаётся непубличным: заявку по-прежнему читает
 * человек. Автоматизирован не допуск, а всё вокруг него — чтобы решение
 * принимал модератор, а поля переносила машина.
 */

type Tab = 'requests' | 'apps' | 'new';

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
    decidedAt: string | null;
}

interface OwnClient {
    clientId: string;
    type: 'public' | 'confidential';
    name: string;
    description: string;
    redirectUris: string[];
    allowedScopes: string[];
    scopeDetails: { scope: string; title: string }[];
    isActive: boolean;
    createdAt: string;
    lastUsedAt: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
    pending: 'На рассмотрении',
    changes_requested: 'Нужны уточнения',
    approved: 'Одобрена',
    rejected: 'Отклонена'
};

const STATUS_CLASS: Record<Status, string> = {
    pending: 'wait',
    changes_requested: 'warn',
    approved: 'ok',
    rejected: 'bad'
};

/** Права, которые можно попросить. Совпадают со справочником на сервере. */
const SCOPE_OPTIONS: [string, string, string][] = [
    ['profile', 'Профиль', 'Имя, аватар, баннер и описание'],
    ['email', 'Адрес почты', 'Почта и признак её подтверждения'],
    ['telegram', 'Привязка Telegram', 'Идентификатор и имя в Telegram'],
    ['offline_access', 'Долгий вход', 'Не спрашивать вход при каждом запуске']
];

const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const emptyForm = {
    name: '',
    description: '',
    homepageUrl: '',
    privacyPolicyUrl: '',
    type: 'public' as 'public' | 'confidential',
    redirectUris: [''],
    requestedScopes: ['profile'] as string[],
    purpose: '',
    contactEmail: ''
};

const VlyneIdDevCabinet: React.FC = () => {
    const { user, token, logout, loading } = useAuth();
    const { confirm } = useDialog();
    const [tab, setTab] = useState<Tab>('requests');

    const [requests, setRequests] = useState<AppRequest[]>([]);
    const [clients, setClients] = useState<OwnClient[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [form, setForm] = useState({ ...emptyForm });
    const [secret, setSecret] = useState<{ clientId: string; value: string } | null>(null);
    const [copied, setCopied] = useState('');

    const homePath = /^vlyneid\./i.test(window.location.hostname) ? '/' : '/vlyneid';
    const docsPath = /^vlyneid\./i.test(window.location.hostname) ? '/developers' : '/vlyneid/developers';

    const load = useCallback(async () => {
        try {
            const [r, c] = await Promise.all([
                axios.get('/api/vlyne-id/applications'),
                axios.get('/api/vlyne-id/my-clients')
            ]);
            setRequests(r.data || []);
            setClients(c.data || []);
        } catch {
            setNotice('Не удалось загрузить заявки. Попробуйте обновить страницу.');
        }
    }, []);

    useEffect(() => {
        if (token) load();
    }, [token, load]);

    const copy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(''), 1600);
        } catch { /* буфер недоступен — значение видно на экране */ }
    };

    // ---- Новая заявка ----

    const setField = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

    const setUri = (i: number, value: string) =>
        setForm((f) => ({ ...f, redirectUris: f.redirectUris.map((u, k) => (k === i ? value : u)) }));

    const addUri = () => setForm((f) => ({ ...f, redirectUris: [...f.redirectUris, ''] }));

    const removeUri = (i: number) =>
        setForm((f) => ({ ...f, redirectUris: f.redirectUris.filter((_, k) => k !== i) }));

    const toggleScope = (scope: string) =>
        setForm((f) => ({
            ...f,
            requestedScopes: f.requestedScopes.includes(scope)
                ? f.requestedScopes.filter((s) => s !== scope)
                : [...f.requestedScopes, scope]
        }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy('submit');
        try {
            const payload = {
                ...form,
                redirectUris: form.redirectUris.map((u) => u.trim()).filter(Boolean),
                contactEmail: form.contactEmail.trim() || (user as any)?.email
            };
            await axios.post('/api/vlyne-id/applications', payload);
            setForm({ ...emptyForm });
            setTab('requests');
            setNotice('Заявка отправлена. Решение придёт сюда и на почту.');
            await load();
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось отправить заявку');
        } finally {
            setBusy(null);
        }
    };

    // ---- Переписка ----

    const sendReply = async (id: string) => {
        if (!reply.trim()) return;
        setBusy(id);
        try {
            const { data } = await axios.post(`/api/vlyne-id/applications/${id}/messages`, { text: reply });
            setRequests((prev) => prev.map((r) => (r.id === id ? data : r)));
            setReply('');
        } catch (err: any) {
            setNotice(err?.response?.data?.message || 'Не удалось отправить сообщение');
        } finally {
            setBusy(null);
        }
    };

    const removeClient = async (c: OwnClient) => {
        // Тип и адреса возврата у одобренного приложения менять нельзя — их
        // проверял модератор. Поэтому ошибку в них исправляют так: удалить и
        // подать заявку заново. Предупреждаем прямо, что это значит.
        const ok = await confirm(
            `Удалить «${c.name}»? Приложение перестанет работать немедленно, а все ` +
            'выданные ему доступы пользователей будут отозваны. Отменить удаление нельзя — ' +
            'чтобы подключиться снова, понадобится новая заявка.'
        );
        if (!ok) return;

        setBusy(c.clientId);
        try {
            await axios.delete(`/api/vlyne-id/my-clients/${c.clientId}`);
            setNotice(`Приложение «${c.name}» удалено`);
            if (secret && secret.clientId === c.clientId) setSecret(null);
            await load();
        } catch (err: any) {
            setNotice(err?.response?.data?.message || 'Не удалось удалить приложение');
        } finally {
            setBusy(null);
        }
    };

    const rotateSecret = async (clientId: string) => {
        setBusy(clientId);
        try {
            const { data } = await axios.post(`/api/vlyne-id/my-clients/${clientId}/secret`);
            setSecret({ clientId, value: data.clientSecret });
        } catch (err: any) {
            setNotice(err?.response?.data?.message || 'Не удалось выпустить секрет');
        } finally {
            setBusy(null);
        }
    };

    // ---- Экраны ----

    if (loading) {
        return (
            <div className="vidoc">
                <VlyneIdNav />
                <div className="vida-loading"><div className="vida-spinner" /></div>
            </div>
        );
    }

    if (!token || !user) {
        return (
            <div className="vidoc vidoc-lively">
                <VibeBackground />
                <div className="vidoc-above">
                    <VlyneIdNav actions={[{ label: 'О Vlyne ID', to: homePath }]} />
                    <VlyneIdSignIn
                        title="Кабинет разработчика"
                        lead="Тот же аккаунт Vlyne ID. Заявки на подключение подаются от его имени."
                    />
                </div>
            </div>
        );
    }

    const openRequest = requests.find((r) => r.id === openId) || null;

    return (
        <div className="vidoc">
            <VlyneIdNav actions={[
                { label: 'Документация', to: docsPath },
                { label: 'Выйти', to: homePath }
            ]} />

            <div className="vida-wrap vdev-wrap">
                <motion.header
                    className="vida-hero"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="vida-hero-glow" />
                    <div className="vida-hero-row">
                        <div className="vdev-mark">{'</>'}</div>
                        <div className="vida-head-text">
                            <h1>Кабинет разработчика</h1>
                            <div className="vida-head-sub">
                                {(user as any).username} · заявки на подключение к Vlyne ID
                            </div>
                        </div>
                        <button className="vidoc-btn vidoc-btn-ghost vida-logout" onClick={logout}>Выйти</button>
                    </div>

                    <div className="vida-stats">
                        <div className="vida-stat">
                            <div className="vida-stat-n">{requests.filter((r) => r.status === 'pending').length}</div>
                            <div className="vida-stat-l">на рассмотрении</div>
                        </div>
                        <div className="vida-stat">
                            <div className="vida-stat-n warn">{requests.filter((r) => r.status === 'changes_requested').length}</div>
                            <div className="vida-stat-l">ждут ответа</div>
                        </div>
                        <div className="vida-stat">
                            <div className="vida-stat-n ok">{clients.length}</div>
                            <div className="vida-stat-l">приложений</div>
                        </div>
                        <div className="vida-stat">
                            <div className="vida-stat-n">{requests.length}</div>
                            <div className="vida-stat-l">заявок всего</div>
                        </div>
                    </div>
                </motion.header>

                <div className="vida-tabs">
                    <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>Мои заявки</button>
                    <button className={tab === 'apps' ? 'active' : ''} onClick={() => setTab('apps')}>Мои приложения</button>
                    <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>Новая заявка</button>
                </div>

                {notice && <div className="vida-notice" onClick={() => setNotice('')}>{notice}</div>}

                {/* ===== Заявки ===== */}
                {tab === 'requests' && (
                    requests.length === 0 ? (
                        <div className="vida-empty">
                            Заявок пока нет.{' '}
                            <button className="vdev-link" onClick={() => setTab('new')}>Подать первую</button>
                        </div>
                    ) : (
                        <div className="vdev-list">
                            {requests.map((r) => (
                                <div className={`vdev-item ${openId === r.id ? 'open' : ''}`} key={r.id}>
                                    <button
                                        className="vdev-item-head"
                                        onClick={() => { setOpenId(openId === r.id ? null : r.id); setReply(''); }}
                                    >
                                        <div className="vdev-item-main">
                                            <div className="vdev-item-title">
                                                {r.name}
                                                <span className={`vida-badge ${STATUS_CLASS[r.status]}`}>
                                                    {STATUS_LABEL[r.status]}
                                                </span>
                                            </div>
                                            <div className="vida-row-meta">
                                                Подана {fmtDate(r.createdAt)}
                                                {r.messages.length > 0 && ` · сообщений: ${r.messages.length}`}
                                            </div>
                                        </div>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                            <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                    </button>

                                    {openId === r.id && (
                                        <div className="vdev-item-body">
                                            {r.status === 'approved' && r.clientId && (
                                                <div className="vdev-approved">
                                                    <div className="vida-card-label">Приложение подключено</div>
                                                    <div className="vida-id">
                                                        <code>{r.clientId}</code>
                                                        <button className="vida-copy" onClick={() => copy(r.clientId!, r.id)}>
                                                            {copied === r.id ? 'Скопировано' : 'Копировать'}
                                                        </button>
                                                    </div>
                                                    <p className="vida-card-text">
                                                        Идентификатор приложения. Секрет (если он нужен) выпускается
                                                        во вкладке «Мои приложения».
                                                    </p>
                                                </div>
                                            )}

                                            <dl className="vida-dl vdev-dl">
                                                <dt>Тип</dt>
                                                <dd>{r.type === 'confidential' ? 'серверное (с секретом)' : 'публичное (браузер, десктоп, мобильное)'}</dd>
                                                <dt>Права</dt>
                                                <dd>{r.scopeDetails.map((sc) => sc.title).join(', ') || 'только идентификатор'}</dd>
                                                <dt>Адреса возврата</dt>
                                                <dd className="vdev-uris">{r.redirectUris.map((u) => <code key={u}>{u}</code>)}</dd>
                                                <dt>Зачем</dt>
                                                <dd className="vdev-purpose">{r.purpose}</dd>
                                            </dl>

                                            {r.messages.length > 0 && (
                                                <div className="vdev-thread">
                                                    {r.messages.map((m, i) => (
                                                        <div className={`vdev-msg ${m.role}`} key={i}>
                                                            <div className="vdev-msg-who">
                                                                {m.role === 'moderator' ? 'Модератор' : 'Вы'}
                                                                <span>{fmtDate(m.createdAt)}</span>
                                                            </div>
                                                            <div className="vdev-msg-text">{m.text}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {(r.status === 'pending' || r.status === 'changes_requested') && (
                                                <div className="vdev-reply">
                                                    <textarea
                                                        value={openId === r.id ? reply : ''}
                                                        onChange={(e) => setReply(e.target.value)}
                                                        placeholder={r.status === 'changes_requested'
                                                            ? 'Ответьте на вопросы модератора — заявку не нужно подавать заново'
                                                            : 'Добавить уточнение к заявке'}
                                                        rows={3}
                                                    />
                                                    <button
                                                        className="vidoc-btn vidoc-btn-primary"
                                                        onClick={() => sendReply(r.id)}
                                                        disabled={busy === r.id || !reply.trim()}
                                                    >
                                                        Отправить
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                )}

                {/* ===== Приложения ===== */}
                {tab === 'apps' && (
                    clients.length === 0 ? (
                        <div className="vida-empty">Одобренных приложений пока нет.</div>
                    ) : (
                        <div className="vdev-list">
                            {clients.map((c) => (
                                <div className="vida-card" key={c.clientId}>
                                    <div className="vdev-app-head">
                                        <div>
                                            <div className="vdev-item-title">
                                                {c.name}
                                                {!c.isActive && <span className="vida-badge bad">отключено</span>}
                                            </div>
                                            <div className="vida-row-meta">
                                                {c.type === 'confidential' ? 'серверное' : 'публичное'} ·
                                                создано {fmtDate(c.createdAt)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="vida-id" style={{ marginTop: 14 }}>
                                        <code>{c.clientId}</code>
                                        <button className="vida-copy" onClick={() => copy(c.clientId, c.clientId)}>
                                            {copied === c.clientId ? 'Скопировано' : 'Копировать'}
                                        </button>
                                    </div>

                                    <dl className="vida-dl vdev-dl" style={{ marginTop: 16 }}>
                                        <dt>Права</dt>
                                        <dd>{c.scopeDetails.map((sc) => sc.title).join(', ') || 'только идентификатор'}</dd>
                                        <dt>Адреса возврата</dt>
                                        <dd className="vdev-uris">{c.redirectUris.map((u) => <code key={u}>{u}</code>)}</dd>
                                    </dl>

                                    {c.type === 'public' && (
                                        <p className="vida-card-text">
                                            У публичного приложения секрета нет: его код выполняется
                                            у пользователя, хранить секрет негде. Подлинность
                                            подтверждается PKCE.
                                        </p>
                                    )}

                                    {c.type === 'confidential' && (
                                        <div className="vdev-secret">
                                            {secret && secret.clientId === c.clientId ? (
                                                <>
                                                    <div className="vida-card-label">Новый секрет</div>
                                                    <div className="vida-id">
                                                        <code>{secret.value}</code>
                                                        <button className="vida-copy" onClick={() => copy(secret.value, 'secret')}>
                                                            {copied === 'secret' ? 'Скопировано' : 'Копировать'}
                                                        </button>
                                                    </div>
                                                    <p className="vida-card-text">
                                                        Сохраните сейчас: у нас хранится только его хеш, показать
                                                        второй раз невозможно. Старый секрет уже не действует.
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        className="vidoc-btn vidoc-btn-ghost"
                                                        onClick={() => rotateSecret(c.clientId)}
                                                        disabled={busy === c.clientId}
                                                    >
                                                        Выпустить новый секрет
                                                    </button>
                                                    <p className="vida-card-text">
                                                        Секрет не хранится в открытом виде, поэтому «показать ещё раз»
                                                        невозможно — только выпустить новый. Старый при этом перестаёт
                                                        работать сразу.
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className="vdev-danger-zone">
                                        <button
                                            className="vida-danger"
                                            onClick={() => removeClient(c)}
                                            disabled={busy === c.clientId}
                                        >
                                            Удалить приложение
                                        </button>
                                        <span>
                                            Тип и адреса возврата изменить нельзя — их одобрял модератор.
                                            Чтобы исправить их, удалите приложение и подайте заявку заново.
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {/* ===== Новая заявка ===== */}
                {tab === 'new' && (
                    <form className="vdev-form" onSubmit={submit}>
                        <p className="vida-section-lead">
                            Заявку читает человек. Главное поле — «зачем»: по нему и принимается
                            решение, остальное анкетные данные.
                        </p>

                        <div className="vida-card">
                            <div className="vida-card-label">О приложении</div>
                            <label className="vida-field">
                                <span>Название</span>
                                <input value={form.name} onChange={(e) => setField('name', e.target.value)} maxLength={60} required />
                            </label>
                            <label className="vida-field">
                                <span>Краткое описание</span>
                                <input value={form.description} onChange={(e) => setField('description', e.target.value)} maxLength={300} />
                            </label>
                            <label className="vida-field">
                                <span>Сайт приложения</span>
                                <input value={form.homepageUrl} onChange={(e) => setField('homepageUrl', e.target.value)} placeholder="https://" />
                            </label>
                            <label className="vida-field">
                                <span>Политика конфиденциальности</span>
                                <input value={form.privacyPolicyUrl} onChange={(e) => setField('privacyPolicyUrl', e.target.value)} placeholder="https://" />
                            </label>
                        </div>

                        <div className="vida-card">
                            <div className="vida-card-label">Тип приложения</div>
                            <div className="vdev-radios">
                                <label className={form.type === 'public' ? 'active' : ''}>
                                    <input type="radio" checked={form.type === 'public'} onChange={() => setField('type', 'public')} />
                                    <div>
                                        <strong>Публичное</strong>
                                        <span>Браузер, десктоп, мобильное. Секрет хранить негде</span>
                                    </div>
                                </label>
                                <label className={form.type === 'confidential' ? 'active' : ''}>
                                    <input type="radio" checked={form.type === 'confidential'} onChange={() => setField('type', 'confidential')} />
                                    <div>
                                        <strong>Серверное</strong>
                                        <span>Код выполняется на вашем сервере, секрет хранить можно</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="vida-card">
                            <div className="vida-card-label">Адреса возврата</div>
                            <p className="vida-card-text" style={{ marginTop: 0, marginBottom: 14 }}>
                                Сверяются посимвольно — ни префиксов, ни шаблонов. Укажите сразу и
                                отладочные, иначе локальная разработка не заработает.
                            </p>
                            {form.redirectUris.map((uri, i) => (
                                <div className="vdev-uri-row" key={i}>
                                    <input
                                        value={uri}
                                        onChange={(e) => setUri(i, e.target.value)}
                                        placeholder="https://ваш-сервис/auth/callback"
                                    />
                                    {form.redirectUris.length > 1 && (
                                        <button type="button" className="vida-danger" onClick={() => removeUri(i)}>Убрать</button>
                                    )}
                                </div>
                            ))}
                            <button type="button" className="vdev-link" onClick={addUri}>+ Ещё адрес</button>
                        </div>

                        <div className="vida-card">
                            <div className="vida-card-label">Какие права нужны</div>
                            <p className="vida-card-text" style={{ marginTop: 0, marginBottom: 14 }}>
                                Идентификатор аккаунта выдаётся всегда. Просите только то, без чего
                                приложение не работает: лишние права уменьшают шанс одобрения — и шанс,
                                что человек нажмёт «Разрешить».
                            </p>
                            <div className="vdev-scopes">
                                {SCOPE_OPTIONS.map(([scope, title, desc]) => (
                                    <label key={scope} className={form.requestedScopes.includes(scope) ? 'active' : ''}>
                                        <input
                                            type="checkbox"
                                            checked={form.requestedScopes.includes(scope)}
                                            onChange={() => toggleScope(scope)}
                                        />
                                        <div>
                                            <strong>{title}</strong>
                                            <span>{desc}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="vida-card">
                            <div className="vida-card-label">Зачем приложению доступ</div>
                            <textarea
                                className="vdev-textarea"
                                value={form.purpose}
                                onChange={(e) => setField('purpose', e.target.value)}
                                rows={6}
                                maxLength={1500}
                                placeholder="Что за сервис, кто им пользуется и как именно вы используете каждое из запрошенных прав."
                                required
                            />
                            <div className="vdev-counter">{form.purpose.length} / 1500, минимум 30</div>
                        </div>

                        <div className="vida-card">
                            <div className="vida-card-label">Почта для ответа</div>
                            <label className="vida-field">
                                <input
                                    value={form.contactEmail}
                                    onChange={(e) => setField('contactEmail', e.target.value)}
                                    placeholder={(user as any).email}
                                    type="email"
                                />
                            </label>
                            <p className="vida-card-text" style={{ marginTop: 0 }}>
                                По умолчанию — почта аккаунта. Решение придёт письмом и появится здесь.
                            </p>
                        </div>

                        {error && <div className="vida-error">{error}</div>}

                        <button className="vidoc-btn vidoc-btn-primary vdev-submit" type="submit" disabled={busy === 'submit'}>
                            {busy === 'submit' ? 'Отправляем…' : 'Отправить заявку'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default VlyneIdDevCabinet;
