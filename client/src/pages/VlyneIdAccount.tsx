import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import VlyneIdNav from '../components/VlyneIdNav';
import VibeBackground from '../components/VibeBackground';
import './VlyneIdDocs.css';
import './VlyneIdAccount.css';

/**
 * Личный кабинет Vlyne ID — что система знает о человеке и где он вошёл.
 *
 * Живёт на поддомене, а значит в отдельном origin: токен сессии Zvon с
 * основного домена сюда не попадает, и вход выполняется здесь заново. Это не
 * недоработка, а следствие того же правила, которое защищает вкладки друг от
 * друга; зато API общий — nginx проксирует /api на тот же сервер.
 *
 * Смысл кабинета — не дублировать настройки Zvon, а собрать в одном месте
 * ответ на вопрос «кто и откуда пользуется моим аккаунтом»: список входов
 * рядом со списком устройств и выданных приложениям доступов.
 */

type Tab = 'overview' | 'activity' | 'devices' | 'apps' | 'data';

interface Session {
    id: string;
    browser: string;
    os: string;
    deviceType: string;
    deviceName: string;
    ip: string;
    country: string;
    countryCode: string;
    city: string;
    createdAt: string;
    lastActiveAt: string;
    current: boolean;
}

interface Activity {
    id: string;
    action: string;
    title: string;
    client: string | null;
    scopes: string[] | null;
    createdAt: string;
}

interface ConnectedApp {
    clientId: string;
    name: string;
    description: string;
    logo: string | null;
    firstParty: boolean;
    scopeDetails: { scope: string; title: string }[];
    createdAt: string;
    lastUsedAt: string;
}

const TABS: [Tab, string][] = [
    ['overview', 'Обзор'],
    ['activity', 'Активность'],
    ['devices', 'Устройства'],
    ['apps', 'Приложения'],
    ['data', 'Мои данные']
];

const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const flag = (code?: string) => {
    if (!code) return '🏳️';
    return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(c.charCodeAt(0) + 127397));
};

// ===== Вход =====

const SignIn: React.FC = () => {
    const { login, verifyLogin } = useAuth();
    const [step, setStep] = useState<'password' | 'code'>('password');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            if (step === 'password') {
                const data = await login(email, password);
                // Двухфакторная включена — сервер не выдал токен, а прислал
                // признак и адрес, на который ушёл код.
                if (data?.requires2FA) {
                    setEmail(data.email || email);
                    setStep('code');
                }
            } else {
                await verifyLogin(email, code);
            }
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось войти. Проверьте данные.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="vida-signin">
            <motion.form
                className="vida-signin-card"
                onSubmit={submit}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
                <h1>Личный кабинет</h1>
                <p className="vida-signin-lead">
                    Это тот же аккаунт, что и в Zvon: отдельной регистрации не нужно.
                </p>

                {step === 'password' ? (
                    <>
                        <label className="vida-field">
                            <span>Почта или имя пользователя</span>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="username"
                                required
                            />
                        </label>
                        <label className="vida-field">
                            <span>Пароль</span>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </label>
                    </>
                ) : (
                    <label className="vida-field">
                        <span>Код из письма</span>
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                        />
                    </label>
                )}

                {error && <div className="vida-error">{error}</div>}

                <button className="vidoc-btn vidoc-btn-primary vida-submit" type="submit" disabled={busy}>
                    {busy ? 'Подождите…' : step === 'password' ? 'Войти' : 'Подтвердить'}
                </button>

                <p className="vida-signin-note">
                    Пароль проверяется тем же сервером, что и в Zvon. Забыли — восстановите
                    на <a href="https://zvonserver.ru/login">zvonserver.ru</a>.
                </p>
            </motion.form>
        </div>
    );
};

// ===== Кабинет =====

const VlyneIdAccount: React.FC = () => {
    const { user, token, logout, loading } = useAuth();
    const [tab, setTab] = useState<Tab>('overview');

    const [sessions, setSessions] = useState<Session[]>([]);
    const [activity, setActivity] = useState<Activity[]>([]);
    const [activityCursor, setActivityCursor] = useState<string | null>(null);
    const [activityMore, setActivityMore] = useState(false);
    const [apps, setApps] = useState<ConnectedApp[]>([]);
    const [loaded, setLoaded] = useState<Record<string, boolean>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [notice, setNotice] = useState('');

    // На поддомене разделы живут в корне, на основном домене — под /vlyneid.
    const homePath = /^vlyneid\./i.test(window.location.hostname) ? '/' : '/vlyneid';

    const loadActivity = useCallback(async (before?: string | null) => {
        const { data } = await axios.get('/api/vlyne-id/activity', {
            params: { limit: 30, ...(before ? { before } : {}) }
        });
        setActivity((prev) => (before ? [...prev, ...data.entries] : data.entries));
        setActivityMore(data.hasMore);
        setActivityCursor(data.nextBefore);
    }, []);

    // Каждая вкладка тянет своё и только один раз: открывать четыре запроса
    // на входе в кабинет незачем, большинство уйдёт впустую.
    useEffect(() => {
        if (!token || loaded[tab]) return;
        let cancelled = false;

        (async () => {
            try {
                if (tab === 'devices') {
                    const { data } = await axios.get('/api/sessions');
                    if (!cancelled) setSessions(data || []);
                } else if (tab === 'activity') {
                    await loadActivity();
                } else if (tab === 'apps') {
                    const { data } = await axios.get('/api/vlyne-id/grants');
                    if (!cancelled) setApps(data || []);
                }
                if (!cancelled) setLoaded((p) => ({ ...p, [tab]: true }));
            } catch (e) {
                if (!cancelled) setNotice('Не удалось загрузить данные. Попробуйте обновить страницу.');
            }
        })();

        return () => { cancelled = true; };
    }, [tab, token, loaded, loadActivity]);

    const copyId = async () => {
        const id = String((user as any)?._id || '');
        try {
            await navigator.clipboard.writeText(id);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch { /* доступ к буферу запрещён — идентификатор виден на экране */ }
    };

    const revokeSession = async (s: Session) => {
        setBusy(s.id);
        try {
            await axios.delete(`/api/sessions/${s.id}`);
            // Завершили сессию, из которой смотрим, — здесь мы больше не вошли.
            if (s.current) { logout(); return; }
            setSessions((prev) => prev.filter((x) => x.id !== s.id));
        } catch {
            setNotice('Не удалось завершить сессию');
        } finally {
            setBusy(null);
        }
    };

    const revokeOtherSessions = async () => {
        setBusy('others');
        try {
            await axios.delete('/api/sessions/others');
            setSessions((prev) => prev.filter((s) => s.current));
            setNotice('Остальные сессии завершены');
        } catch {
            setNotice('Не удалось завершить сессии');
        } finally {
            setBusy(null);
        }
    };

    const revokeApp = async (app: ConnectedApp) => {
        setBusy(app.clientId);
        try {
            await axios.delete(`/api/vlyne-id/grants/${app.clientId}`);
            setApps((prev) => prev.filter((a) => a.clientId !== app.clientId));
        } catch {
            setNotice('Не удалось отключить приложение');
        } finally {
            setBusy(null);
        }
    };

    const exportData = async () => {
        setBusy('export');
        try {
            // Выгрузка отдаётся с заголовком Authorization, поэтому обычной
            // ссылкой её не скачать — забираем ответ и сохраняем сами.
            const res = await axios.get('/api/personal-data/export', { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vlyne-id-данные-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            setNotice('Не удалось сформировать выгрузку');
        } finally {
            setBusy(null);
        }
    };

    if (loading) {
        return (
            <div className="vidoc">
                <VlyneIdNav />
                <div className="vida-loading"><div className="vida-spinner" /></div>
            </div>
        );
    }

    if (!token || !user) {
        // Живой фон — только на экране входа. Внутри кабинета под ним лежат
        // плотные списки устройств и действий: там движение за текстом мешает
        // читать, а здесь страница почти пустая и без него выглядит мёртвой.
        return (
            <div className="vidoc vidoc-lively">
                <VibeBackground />
                <div className="vidoc-above">
                    <VlyneIdNav actions={[{ label: 'О Vlyne ID', to: homePath }]} />
                    <SignIn />
                </div>
            </div>
        );
    }

    const u = user as any;

    return (
        <div className="vidoc">
            <VlyneIdNav actions={[{ label: 'О Vlyne ID', to: homePath }]} />

            <div className="vida-wrap">
                <header className="vida-head">
                    <img className="vida-avatar" src={getAvatarUrl(u.avatar) || undefined} alt="" />
                    <div className="vida-head-text">
                        <h1>{u.username}</h1>
                        <div className="vida-head-sub">{u.email}</div>
                    </div>
                    <button className="vidoc-btn vidoc-btn-ghost" onClick={logout}>Выйти</button>
                </header>

                <div className="vida-tabs">
                    {TABS.map(([id, label]) => (
                        <button
                            key={id}
                            className={tab === id ? 'active' : ''}
                            onClick={() => setTab(id)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {notice && (
                    <div className="vida-notice" onClick={() => setNotice('')}>{notice}</div>
                )}

                {tab === 'overview' && (
                    <div className="vida-grid">
                        <div className="vida-card">
                            <div className="vida-card-label">Ваш Vlyne ID</div>
                            <div className="vida-id">
                                <code>{String(u._id)}</code>
                                <button className="vida-copy" onClick={copyId}>
                                    {copied ? 'Скопировано' : 'Копировать'}
                                </button>
                            </div>
                            <p className="vida-card-text">
                                Постоянный идентификатор аккаунта. Приложения экосистемы узнают вас
                                по нему, и он не меняется при смене почты или имени.
                            </p>
                        </div>

                        <div className="vida-card">
                            <div className="vida-card-label">Учётная запись</div>
                            <dl className="vida-dl">
                                <dt>Имя пользователя</dt><dd>{u.username}</dd>
                                <dt>Почта</dt>
                                <dd>
                                    {u.email}{' '}
                                    <span className={u.isVerified ? 'vida-badge ok' : 'vida-badge warn'}>
                                        {u.isVerified ? 'подтверждена' : 'не подтверждена'}
                                    </span>
                                </dd>
                                <dt>Двухфакторная</dt>
                                <dd>
                                    <span className={u.is2FAEnabled ? 'vida-badge ok' : 'vida-badge warn'}>
                                        {u.is2FAEnabled ? 'включена' : 'выключена'}
                                    </span>
                                </dd>
                                <dt>Аккаунт создан</dt><dd>{fmtDate(u.createdAt)}</dd>
                            </dl>
                            <p className="vida-card-text">
                                Изменить эти данные можно в настройках Zvon — здесь они
                                показаны так, как их видят приложения экосистемы.
                            </p>
                        </div>
                    </div>
                )}

                {tab === 'activity' && (
                    <>
                        <p className="vida-section-lead">
                            Действия, записанные от вашего имени. Если видите вход, которого не
                            совершали, — смените пароль и завершите чужие сессии во вкладке
                            «Устройства».
                        </p>
                        {!loaded.activity ? (
                            <div className="vida-loading"><div className="vida-spinner" /></div>
                        ) : activity.length === 0 ? (
                            <div className="vida-empty">Записей пока нет.</div>
                        ) : (
                            <>
                                <div className="vida-list">
                                    {activity.map((a) => (
                                        <div className="vida-row" key={a.id}>
                                            <div className="vida-row-body">
                                                <div className="vida-row-title">{a.title}</div>
                                                {a.client && (
                                                    <div className="vida-row-meta">Приложение: {a.client}</div>
                                                )}
                                                {a.scopes && a.scopes.length > 0 && (
                                                    <div className="vida-row-meta">Права: {a.scopes.join(', ')}</div>
                                                )}
                                            </div>
                                            <div className="vida-row-side">{fmtDate(a.createdAt)}</div>
                                        </div>
                                    ))}
                                </div>
                                {activityMore && (
                                    <button
                                        className="vidoc-btn vidoc-btn-ghost vida-more"
                                        onClick={() => loadActivity(activityCursor)}
                                    >
                                        Показать ещё
                                    </button>
                                )}
                            </>
                        )}
                    </>
                )}

                {tab === 'devices' && (
                    <>
                        <p className="vida-section-lead">
                            Где выполнен вход в аккаунт. Завершение сессии выбрасывает это
                            устройство из аккаунта немедленно.
                        </p>
                        {!loaded.devices ? (
                            <div className="vida-loading"><div className="vida-spinner" /></div>
                        ) : (
                            <>
                                <div className="vida-list">
                                    {sessions.map((s) => (
                                        <div className="vida-row" key={s.id}>
                                            <div className="vida-row-body">
                                                <div className="vida-row-title">
                                                    {s.deviceName || s.os}
                                                    {s.current && <span className="vida-badge ok">это устройство</span>}
                                                </div>
                                                <div className="vida-row-meta">
                                                    {flag(s.countryCode)} {[s.city, s.country].filter(Boolean).join(', ') || 'Место неизвестно'} · {s.ip}
                                                </div>
                                                <div className="vida-row-meta">
                                                    {s.browser} · активность {fmtDate(s.lastActiveAt)}
                                                </div>
                                            </div>
                                            <div className="vida-row-side">
                                                <button
                                                    className="vida-danger"
                                                    onClick={() => revokeSession(s)}
                                                    disabled={busy === s.id}
                                                >
                                                    Завершить
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {sessions.length > 1 && (
                                    <button
                                        className="vidoc-btn vidoc-btn-ghost vida-more"
                                        onClick={revokeOtherSessions}
                                        disabled={busy === 'others'}
                                    >
                                        Завершить все, кроме текущей
                                    </button>
                                )}
                            </>
                        )}
                    </>
                )}

                {tab === 'apps' && (
                    <>
                        <p className="vida-section-lead">
                            Приложения, которым вы разрешили вход через Vlyne ID. Отключение
                            обрывает доступ сразу, даже если приложение уже вошло.
                        </p>
                        {!loaded.apps ? (
                            <div className="vida-loading"><div className="vida-spinner" /></div>
                        ) : apps.length === 0 ? (
                            <div className="vida-empty">
                                Ни одно стороннее приложение пока не подключено.
                            </div>
                        ) : (
                            <div className="vida-list">
                                {apps.map((app) => (
                                    <div className="vida-row" key={app.clientId}>
                                        <div className="vida-row-body">
                                            <div className="vida-row-title">
                                                {app.name}
                                                {app.firstParty && <span className="vida-badge">Vlyne</span>}
                                            </div>
                                            <div className="vida-row-meta">
                                                Доступ: {app.scopeDetails.map((s) => s.title).join(', ') || 'только идентификатор'}
                                            </div>
                                            <div className="vida-row-meta">
                                                Подключено {fmtDate(app.createdAt)}
                                            </div>
                                        </div>
                                        <div className="vida-row-side">
                                            <button
                                                className="vida-danger"
                                                onClick={() => revokeApp(app)}
                                                disabled={busy === app.clientId}
                                            >
                                                Отключить
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="vida-hint">
                            Самого Zvon в этом списке не будет: он не входит через Vlyne ID,
                            а выдаёт его — ваш аккаунт Zvon и есть Vlyne ID. Где выполнен вход
                            в сам Zvon, показано во вкладке «Устройства».
                        </div>
                    </>
                )}

                {tab === 'data' && (
                    <>
                        <p className="vida-section-lead">
                            Всё, что хранится о вас, можно забрать одним файлом — это право
                            закреплено статьёй 14 152-ФЗ.
                        </p>
                        <div className="vida-card">
                            <div className="vida-card-label">Выгрузка персональных данных</div>
                            <p className="vida-card-text">
                                Файл JSON: учётная запись, сессии и устройства, согласия, ваши
                                сообщения, диалоги, друзья, серверы и подписки на уведомления.
                                Сообщения других людей в выгрузку не входят — они не ваши данные.
                            </p>
                            <button
                                className="vidoc-btn vidoc-btn-primary"
                                onClick={exportData}
                                disabled={busy === 'export'}
                            >
                                {busy === 'export' ? 'Формируем…' : 'Скачать выгрузку'}
                            </button>
                        </div>

                        <div className="vida-card">
                            <div className="vida-card-label">Документы</div>
                            <p className="vida-card-text">
                                <a href="https://zvonserver.ru/policy">Политика обработки персональных данных</a>
                                {' · '}
                                <a href="https://zvonserver.ru/consent">Согласие на обработку</a>
                                {' · '}
                                <a href="https://zvonserver.ru/security">Безопасность</a>
                            </p>
                        </div>

                        <div className="vida-card">
                            <div className="vida-card-label">Удаление аккаунта</div>
                            <p className="vida-card-text">
                                Удаление затрагивает все проекты экосистемы сразу, поэтому оно
                                вынесено в настройки Zvon, где показаны последствия целиком:{' '}
                                <a href="https://zvonserver.ru/">Настройки → Учётная запись</a>.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default VlyneIdAccount;
