import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { getFullUrl } from '../../utils/avatar';
import PostsModeration from '../../components/posts/PostsModeration';

const PROBLEM_CATEGORIES: Record<string, string> = {
    bug: 'Ошибка / Баг',
    voice: 'Голос / Звонки',
    performance: 'Производительность',
    ui: 'Интерфейс',
    payment: 'Демонстрация Экрана',
    other: 'Другое',
};

// Рендер «на что пожаловались»: текст/фото сообщения, карточка мини-приложения
// или профиль. Берёт сохранённый снимок (contentSnapshot), с фолбэком на старое
// поле messageContext для жалоб, поданных до появления снимков.
const ReportedContent: React.FC<{ report: any }> = ({ report }) => {
    const snap = report.contentSnapshot;
    const box: React.CSSProperties = { fontSize: '13px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--primary-neon)', marginTop: '4px' };
    const label: React.CSSProperties = { fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', fontWeight: 600 };

    if (!snap) {
        if (report.messageContext) {
            return (
                <div style={box}>
                    <div style={label}>Цитата из сообщения:</div>
                    {report.messageContext.content || <span style={{ color: 'var(--text-dim)' }}>(без текста)</span>}
                </div>
            );
        }
        return null;
    }

    if (snap.kind === 'message') {
        const atts = snap.attachments || [];
        const isImg = (a: any) => (a.type || '').startsWith('image') || /\.(png|jpe?g|gif|webp|avif)$/i.test(a.url || '');
        const imgs = atts.filter(isImg);
        const files = atts.filter((a: any) => !isImg(a));
        return (
            <div style={box}>
                <div style={label}>Сообщение{snap.authorName ? ` от ${snap.authorName}` : ''}:</div>
                {snap.text && <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-main)' }}>{snap.text}</div>}
                {imgs.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: snap.text ? '8px' : 0 }}>
                        {imgs.map((a: any, i: number) => (
                            <a key={i} href={getFullUrl(a.url)!} target="_blank" rel="noreferrer">
                                <img src={getFullUrl(a.url)!} alt="" style={{ maxWidth: '160px', maxHeight: '160px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />
                            </a>
                        ))}
                    </div>
                )}
                {files.map((a: any, i: number) => (
                    <a key={i} href={getFullUrl(a.url)!} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: '6px', color: 'var(--primary-neon)', fontSize: '13px' }}>📎 {a.filename || 'файл'}</a>
                ))}
                {!snap.text && imgs.length === 0 && files.length === 0 && <div style={{ color: 'var(--text-dim)' }}>(пустое сообщение)</div>}
            </div>
        );
    }

    if (snap.kind === 'miniapp') {
        return (
            <div style={box}>
                <div style={label}>Мини-приложение:</div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {snap.appAvatar && <img src={getFullUrl(snap.appAvatar)!} alt="" style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover' }} />}
                    <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{snap.appName}</div>
                        {snap.appUrl && <a href={snap.appUrl} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--secondary-neon)', wordBreak: 'break-all' }}>{snap.appUrl}</a>}
                    </div>
                </div>
                {snap.appDescription && <div style={{ marginTop: '8px', color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{snap.appDescription}</div>}
            </div>
        );
    }

    // profile / bot
    return (
        <div style={box}>
            <div style={label}>{snap.kind === 'bot' ? 'Бот:' : 'Профиль:'}</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {snap.avatar && <img src={getFullUrl(snap.avatar)!} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />}
                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{snap.username}</div>
            </div>
            {snap.bio && <div style={{ marginTop: '8px', color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{snap.bio}</div>}
        </div>
    );
};

const ModerationSettings: React.FC = () => {
    const { user } = useAuth();
    const { confirm, prompt, alert } = useDialog();
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'pending' | 'resolved' | 'dismissed'>('pending');
    const [mainTab, setMainTab] = useState<'reports' | 'marketplace' | 'problems' | 'posts'>('reports');

    // --- Жалобы на проблемы приложения (кнопка «Репорт» в сайдбаре) ---
    const [problems, setProblems] = useState<any[]>([]);
    const [problemFilter, setProblemFilter] = useState<'pending' | 'resolved' | 'dismissed'>('pending');
    const [problemLoading, setProblemLoading] = useState(false);

    // --- Витрина (модерация мини-приложений) ---
    const [mpTab, setMpTab] = useState<'pending' | 'reports' | 'approved' | 'blocked'>('pending');
    const [mpApps, setMpApps] = useState<any[]>([]);
    const [mpThemes, setMpThemes] = useState<any[]>([]);
    const [mpReports, setMpReports] = useState<any[]>([]);
    const [mpLoading, setMpLoading] = useState(false);

    const fetchReports = async (status: string) => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/moderation/reports?status=${status}`);
            setReports(res.data);
        } catch (err) { }
        setLoading(false);
    };

    const fetchMarketplace = async (tab: typeof mpTab) => {
        setMpLoading(true);
        try {
            if (tab === 'reports') {
                const res = await axios.get('/api/moderation/marketplace/reports?status=pending');
                setMpReports(res.data);
                setMpApps([]);
                setMpThemes([]);
            } else {
                const res = await axios.get(`/api/moderation/marketplace?status=${tab}`);
                setMpApps(res.data.miniApps || []);
                setMpThemes(res.data.themes || []);
                setMpReports([]);
            }
        } catch (err) { }
        setMpLoading(false);
    };

    useEffect(() => {
        fetchReports(filter);
    }, [filter]);

    useEffect(() => {
        if (mainTab === 'marketplace') fetchMarketplace(mpTab);
    }, [mainTab, mpTab]);

    const fetchProblems = async (status: string) => {
        setProblemLoading(true);
        try {
            const res = await axios.get(`/api/moderation/problem-reports?status=${status}`);
            setProblems(res.data);
        } catch (err) { }
        setProblemLoading(false);
    };

    useEffect(() => {
        if (mainTab === 'problems') fetchProblems(problemFilter);
    }, [mainTab, problemFilter]);

    const resolveProblem = async (id: string, status: 'resolved' | 'dismissed', note: string) => {
        try {
            await axios.post(`/api/moderation/problem-reports/${id}/resolve`, { status, note });
            fetchProblems(problemFilter);
        } catch { }
    };

    /*
     * Действия витрины принимают тип. Раньше он был вшит как 'miniapp' в
     * каждый адрес, и добавить второй вид объекта было нельзя, хотя сервер
     * работает по общей схеме /marketplace/:type/:id/...
     */
    type MpKind = 'miniapp' | 'theme';

    const approveItem = async (kind: MpKind, id: string) => {
        try { await axios.post(`/api/moderation/marketplace/${kind}/${id}/approve`); fetchMarketplace(mpTab); } catch { }
    };
    const rejectItem = async (kind: MpKind, id: string) => {
        const reason = await prompt('Причина отклонения:', kind === 'theme' ? 'Не соответствует правилам оформления' : 'Не соответствует правилам витрины');
        if (reason === null) return;
        try { await axios.post(`/api/moderation/marketplace/${kind}/${id}/reject`, { reason }); fetchMarketplace(mpTab); } catch { }
    };
    const blockItem = async (kind: MpKind, id: string) => {
        const reason = await prompt(kind === 'theme' ? 'Причина блокировки темы:' : 'Причина блокировки приложения:', 'Нарушение правил');
        if (reason === null) return;
        try { await axios.post(`/api/moderation/marketplace/${kind}/${id}/block`, { reason }); fetchMarketplace(mpTab); } catch { }
    };
    const unblockItem = async (kind: MpKind, id: string) => {
        if (!(await confirm('Разблокировать? Объект вернётся в черновики, автор сможет подать его повторно.'))) return;
        try { await axios.post(`/api/moderation/marketplace/${kind}/${id}/unblock`); fetchMarketplace(mpTab); } catch { }
    };

    // Прежние имена оставлены для мини-приложений — вызовы ниже не менялись.
    const approveApp = (id: string) => approveItem('miniapp', id);
    const rejectApp = (id: string) => rejectItem('miniapp', id);
    const blockApp = (id: string) => blockItem('miniapp', id);
    const unblockApp = (id: string) => unblockItem('miniapp', id);
    const resolveMpReport = async (id: string, status: 'resolved' | 'dismissed', note: string) => {
        try { await axios.post(`/api/moderation/reports/${id}/resolve`, { status, note }); fetchMarketplace(mpTab); } catch { }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Модерация</h2>
            <p className="settings-description">Управление жалобами на сообщения, профили пользователей, сервера и витрину.</p>

            <div style={{ marginBottom: '24px', display: 'flex', gap: '10px', borderBottom: '1px solid var(--glass-border)' }}>
                <button
                    onClick={() => setMainTab('reports')}
                    style={{
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        color: mainTab === 'reports' ? 'var(--primary-neon)' : 'var(--text-dim)',
                        fontWeight: 700, fontSize: '14px',
                        borderBottom: `2px solid ${mainTab === 'reports' ? 'var(--primary-neon)' : 'transparent'}`,
                        marginBottom: '-1px'
                    }}
                >
                    Жалобы
                </button>
                <button
                    onClick={() => setMainTab('marketplace')}
                    style={{
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        color: mainTab === 'marketplace' ? 'var(--primary-neon)' : 'var(--text-dim)',
                        fontWeight: 700, fontSize: '14px',
                        borderBottom: `2px solid ${mainTab === 'marketplace' ? 'var(--primary-neon)' : 'transparent'}`,
                        marginBottom: '-1px'
                    }}
                >
                    Витрина
                </button>
                <button
                    onClick={() => setMainTab('problems')}
                    style={{
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        color: mainTab === 'problems' ? 'var(--primary-neon)' : 'var(--text-dim)',
                        fontWeight: 700, fontSize: '14px',
                        borderBottom: `2px solid ${mainTab === 'problems' ? 'var(--primary-neon)' : 'transparent'}`,
                        marginBottom: '-1px'
                    }}
                >
                    Проблемы
                </button>
                <button
                    onClick={() => setMainTab('posts')}
                    style={{
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        color: mainTab === 'posts' ? 'var(--primary-neon)' : 'var(--text-dim)',
                        fontWeight: 700, fontSize: '14px',
                        borderBottom: `2px solid ${mainTab === 'posts' ? 'var(--primary-neon)' : 'transparent'}`,
                        marginBottom: '-1px'
                    }}
                >
                    Посты
                </button>
            </div>

            {mainTab === 'posts' ? (
                <PostsModeration />
            ) : mainTab === 'marketplace' ? (
                <>
                    <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {([
                            ['pending', 'На модерации'],
                            ['reports', 'Жалобы'],
                            ['approved', 'Опубликовано'],
                            ['blocked', 'Заблокировано'],
                        ] as [typeof mpTab, string][]).map(([key, label]) => (
                            <div
                                key={key}
                                onClick={() => setMpTab(key)}
                                style={{ cursor: 'pointer', padding: '10px 20px', background: mpTab === key ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', color: mpTab === key ? 'black' : 'white', borderRadius: '12px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }}
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {mpLoading ? (
                            <div style={{ color: 'var(--text-dim)', padding: '20px' }}>Загрузка...</div>
                        ) : mpTab === 'reports' ? (
                            mpReports.length === 0 ? (
                                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>Жалоб на мини-приложения нет. 🛡️</div>
                            ) : mpReports.map(report => (
                                <div key={report._id} className="settings-card" style={{ margin: 0, padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '14px' }}>
                                            <strong style={{ color: 'var(--text-dim)' }}>От:</strong> {report.reporter?.username}
                                            <div style={{ marginTop: '6px' }}>
                                                <strong style={{ color: 'var(--text-dim)' }}>Приложение:</strong> {report.reportedMiniApp?.name || '—'}
                                                {report.reportedMiniApp?.owner?.username && <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginLeft: '6px' }}>(владелец: {report.reportedMiniApp.owner.username})</span>}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'right' }}>{new Date(report.createdAt).toLocaleString('ru-RU')}</div>
                                    </div>
                                    <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--primary-neon)', marginBottom: '8px', fontSize: '14px' }}>
                                            {report.reason === 'harassment' ? 'Домогательства' :
                                            report.reason === 'spam' ? 'Спам' :
                                            report.reason === 'inappropriate_content' ? 'Контент' :
                                            report.reason === 'scam' ? 'Мошенничество' : 'Другое'}
                                        </div>
                                        {report.description && <div style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.5, marginBottom: '12px' }}>{report.description}</div>}
                                        <ReportedContent report={report} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                                        <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => resolveMpReport(report._id, 'dismissed', 'Отклонено модератором')}>Отклонить жалобу</button>
                                        {report.reportedMiniApp?._id && !report.reportedMiniApp?.isBlocked && (
                                            <button className="settings-btn settings-btn-danger" onClick={async () => {
                                                await blockApp(report.reportedMiniApp._id);
                                                await resolveMpReport(report._id, 'resolved', 'Приложение заблокировано');
                                            }}>Заблокировать приложение</button>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            /* Пусто — только когда нет ни приложений, ни тем:
                               иначе при пустом списке приложений заглушка
                               перекрывала бы темы, ждущие проверки. */
                            mpApps.length === 0 && mpThemes.length === 0 ? (
                                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>
                                    {mpTab === 'pending' ? 'Нет объектов на рассмотрении.' : mpTab === 'approved' ? 'Нет опубликованных объектов.' : 'Нет заблокированных объектов.'}
                                </div>
                            ) : (<>
                            {/* Темы оформления. Показываем не текст, а сами
                                цвета и фон — проверять оформление по названию
                                бессмысленно. */}
                            {mpThemes.map(t => (
                                <div key={t._id} className="settings-card" style={{ margin: 0, padding: '20px' }}>
                                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '16px' }}>
                                        <div style={{
                                            width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
                                            background: t.customBackground
                                                ? `center / cover url(${getFullUrl(t.customBackground)})`
                                                : (t.theme === 'amoled' ? '#000' : '#12121a'),
                                            border: '1px solid var(--glass-border)',
                                        }} />
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '15px' }}>{t.name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                                Автор: {t.creator?.username || '—'} · основа: {t.theme === 'amoled' ? 'AMOLED' : 'тёмная'}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                                            {['primary', 'secondary', 'accent'].map(k => (
                                                <div key={k} title={k} style={{
                                                    width: '22px', height: '22px', borderRadius: '7px',
                                                    background: t.customColors?.[k] || '#000',
                                                    border: '1px solid var(--glass-border)',
                                                }} />
                                            ))}
                                        </div>
                                    </div>
                                    {t.customBackground && (
                                        <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--text-dim)', wordBreak: 'break-all' }}>
                                            Фон: {t.customBackground}
                                        </div>
                                    )}
                                    {t.blockReason && mpTab === 'blocked' && (
                                        <div style={{ marginBottom: '16px', color: 'var(--danger)', fontSize: '13px' }}>Причина блокировки: {t.blockReason}</div>
                                    )}
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                                        {mpTab === 'pending' && (<>
                                            <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => rejectItem('theme', t._id)}>Отклонить</button>
                                            <button className="settings-btn success-glass" onClick={() => approveItem('theme', t._id)}>Одобрить</button>
                                        </>)}
                                        {mpTab === 'approved' && (
                                            <button className="settings-btn danger-glass" onClick={() => blockItem('theme', t._id)}>Заблокировать</button>
                                        )}
                                        {mpTab === 'blocked' && (
                                            <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => unblockItem('theme', t._id)}>Разблокировать</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {mpApps.map(app => (
                                <div key={app._id} className="settings-card" style={{ margin: 0, padding: '20px' }}>
                                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '16px' }}>
                                        {app.avatar
                                            ? <img src={getFullUrl(app.avatar)!} alt="" style={{ width: '52px', height: '52px', borderRadius: '14px', objectFit: 'cover' }} />
                                            : <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)' }} />}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '15px' }}>{app.name}</div>
                                            {app.url && <a href={app.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--secondary-neon)', wordBreak: 'break-all' }}>{app.url}</a>}
                                            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Владелец: {app.owner?.username || '—'}</div>
                                        </div>
                                    </div>
                                    {app.description && <div style={{ marginBottom: '16px', color: 'var(--text-dim)', fontSize: '14px', whiteSpace: 'pre-wrap' }}>{app.description}</div>}
                                    {app.blockReason && mpTab === 'blocked' && <div style={{ marginBottom: '16px', color: 'var(--danger)', fontSize: '13px' }}>Причина блокировки: {app.blockReason}</div>}
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                                        {mpTab === 'pending' && (
                                            <>
                                                <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => rejectApp(app._id)}>Отклонить</button>
                                                <button className="settings-btn success-glass" onClick={() => approveApp(app._id)}>Одобрить</button>
                                            </>
                                        )}
                                        {mpTab === 'approved' && (
                                            <button className="settings-btn settings-btn-danger" onClick={() => blockApp(app._id)}>Заблокировать</button>
                                        )}
                                        {mpTab === 'blocked' && (
                                            <button className="settings-btn success-glass" onClick={() => unblockApp(app._id)}>Разблокировать</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            </>)
                        )}
                    </div>
                </>
            ) : mainTab === 'problems' ? (
                <>
                    <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
                        {([
                            ['pending', 'Ожидают'],
                            ['resolved', 'Решено'],
                            ['dismissed', 'Отклонено'],
                        ] as ['pending' | 'resolved' | 'dismissed', string][]).map(([key, label]) => (
                            <div
                                key={key}
                                onClick={() => setProblemFilter(key)}
                                style={{ cursor: 'pointer', padding: '10px 20px', background: problemFilter === key ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', color: problemFilter === key ? 'black' : 'white', borderRadius: '12px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }}
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {problemLoading ? (
                            <div style={{ color: 'var(--text-dim)', padding: '20px' }}>Загрузка...</div>
                        ) : problems.length === 0 ? (
                            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>{problemFilter === 'pending' ? 'Жалоб на проблемы нет. 🛡️' : 'Список пока пуст.'}</div>
                        ) : problems.map(p => (
                            <div key={p._id} className="settings-card" style={{ margin: 0, padding: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '16px' }}>{p.subject}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                            <span style={{ color: 'var(--secondary-neon)', fontWeight: 600 }}>{PROBLEM_CATEGORIES[p.category] || 'Другое'}</span>
                                            {' · '}От: {p.reporter?.username || '—'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <div>{new Date(p.createdAt).toLocaleString('ru-RU')}</div>
                                        {p.status !== 'pending' && <div style={{ color: 'var(--primary-neon)', fontWeight: 600, marginTop: '6px' }}>{p.status === 'resolved' ? 'РЕШЕНО' : 'ОТКЛОНЕНО'}</div>}
                                    </div>
                                </div>

                                <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                    <div style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{p.description}</div>
                                    {p.steps && (
                                        <div style={{ marginTop: '12px' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '4px' }}>ШАГИ ВОСПРОИЗВЕДЕНИЯ:</div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{p.steps}</div>
                                        </div>
                                    )}
                                    {Array.isArray(p.attachments) && p.attachments.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                                            {p.attachments.map((a: any, i: number) => (
                                                (a.type || '').startsWith('image') ? (
                                                    <a key={i} href={getFullUrl(a.url)!} target="_blank" rel="noreferrer">
                                                        <img src={getFullUrl(a.url)!} alt="" style={{ maxWidth: '140px', maxHeight: '140px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />
                                                    </a>
                                                ) : (a.type || '').startsWith('video') ? (
                                                    <video key={i} src={getFullUrl(a.url)!} controls style={{ maxWidth: '220px', maxHeight: '160px', borderRadius: '8px', border: '1px solid var(--glass-border)' }} />
                                                ) : (
                                                    <a key={i} href={getFullUrl(a.url)!} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-neon)', fontSize: '13px' }}>📎 {a.filename || 'файл'}</a>
                                                )
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {p.status !== 'pending' ? (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--glass-border)' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                                            <strong>Обработал ({p.resolvedBy?.username || '—'}):</strong> {p.resolutionNote || 'Без комментария'}
                                        </div>
                                        <button className="settings-btn" style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => resolveProblem(p._id, 'resolved' as any, '')}>Вернуть в ожидание</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                                        <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={async () => {
                                            const note = await prompt('Комментарий (необязательно):', 'Не является проблемой');
                                            if (note === null) return;
                                            resolveProblem(p._id, 'dismissed', note);
                                        }}>Отклонить</button>
                                        <button className="settings-btn success-glass" onClick={async () => {
                                            const note = await prompt('Комментарий к решению (необязательно):', 'Исправлено');
                                            if (note === null) return;
                                            resolveProblem(p._id, 'resolved', note);
                                        }}>Решено</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
                        <div
                            onClick={() => setFilter('pending')}
                            style={{ cursor: 'pointer', padding: '10px 20px', background: filter === 'pending' ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', color: filter === 'pending' ? 'black' : 'white', borderRadius: '12px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }}
                        >
                            Ожидают ({filter === 'pending' ? reports.length : '...'})
                        </div>
                        <div 
                            onClick={() => setFilter('resolved')} 
                            style={{ cursor: 'pointer', padding: '10px 20px', background: filter === 'resolved' ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', color: filter === 'resolved' ? 'black' : 'white', borderRadius: '12px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }}
                        >
                            Решено
                        </div>
                        <div 
                            onClick={() => setFilter('dismissed')} 
                            style={{ cursor: 'pointer', padding: '10px 20px', background: filter === 'dismissed' ? 'var(--primary-neon)' : 'rgba(255,255,255,0.05)', color: filter === 'dismissed' ? 'black' : 'white', borderRadius: '12px', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }}
                        >
                            Отклонено
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {loading ? (
                            <div style={{ color: 'var(--text-dim)', padding: '20px' }}>Загрузка...</div>
                        ) : reports.length === 0 ? (
                            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>{filter === 'pending' ? 'Жалоб нет. Всё спокойно! 🛡️' : 'Список пока пуст.'}</div>
                        ) : (
                            reports.map(report => (
                                <div key={report._id} className="settings-card" style={{ margin: 0, padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', marginBottom: '6px' }}>
                                                <strong style={{ color: 'var(--text-dim)' }}>От:</strong> {report.reporter?.username}
                                            </div>
                                            <div style={{ fontSize: '14px' }}>
                                                <strong style={{ color: 'var(--text-dim)' }}>На:</strong> {report.reportedUser?.username || report.reportedMiniApp?.name || report.reportedServer?.name || 'Unknown'}
                                                {report.reportedServer && <span style={{ fontSize: '11px', marginLeft: '6px', color: 'var(--accent-pink)' }}>(Сервер)</span>}
                                                {report.reportedMiniApp && <span style={{ fontSize: '11px', marginLeft: '6px', color: 'var(--secondary-neon)' }}>(Приложение)</span>}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'right' }}>
                                            <div>{new Date(report.createdAt).toLocaleString('ru-RU')}</div>
                                            {report.status !== 'pending' && <div style={{ color: 'var(--primary-neon)', fontWeight: 600, marginTop: '6px' }}>{report.status === 'resolved' ? 'РЕШЕНО' : 'ОТКЛОНЕНО'}</div>}
                                        </div>
                                    </div>
                                    
                                    <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--primary-neon)', marginBottom: '8px', fontSize: '14px' }}>
                                            {report.reason === 'harassment' ? 'Домогательства' :
                                            report.reason === 'spam' ? 'Спам' :
                                            report.reason === 'inappropriate_content' ? 'Контент' :
                                            report.reason === 'scam' ? 'Мошенничество' : 'Другое'}
                                        </div>
                                        {report.description && <div style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.5, marginBottom: (report.contentSnapshot || report.messageContext) ? '12px' : 0 }}>{report.description}</div>}

                                        <ReportedContent report={report} />
                                    </div>

                                    {report.status !== 'pending' && (
                                        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
                                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                                                <strong>Решение модератора ({report.resolvedBy?.username}):</strong> {report.resolutionNote || 'Без комментария'}
                                            </div>
                                            <button className="settings-btn" style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={async () => {
                                                if (await confirm('Вы уверены, что хотите отменить вердикт и вернуть жалобу в список ожидания?')) {
                                                    try {
                                                        await axios.post(`/api/moderation/reports/${report._id}/unresolve`);
                                                        if (report.status === 'resolved' && await confirm('Хотите также РАЗБАНИТЬ этого пользователя?')) {
                                                            await axios.post('/api/moderation/unban', { userId: report.reportedUser._id });
                                                            await alert('Пользователь разбанен.');
                                                        }
                                                        fetchReports(filter);
                                                    } catch (e) { }
                                                }
                                            }}>Отменить решение</button>
                                        </div>
                                    )}

                                    {report.status === 'pending' && (
                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                                            <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={async () => {
                                                try {
                                                    await axios.post(`/api/moderation/reports/${report._id}/resolve`, { status: 'dismissed', note: 'Отклонено модератором' });
                                                    fetchReports(filter);
                                                } catch (e) { }
                                            }}>Отклонить</button>
                                            
                                            <button className="settings-btn" style={{ background: 'rgba(240, 178, 50, 0.2)', color: '#f0b232', boxShadow: 'none' }} onClick={async () => {
                                                const reason = await prompt('Укажите причину временного бана:', 'Нарушение правил сообщества');
                                                if (reason) {
                                                    try {
                                                        await axios.post('/api/moderation/ban', { userId: report.reportedUser._id, type: 'temporary', durationHours: 24, reason });
                                                        await axios.post(`/api/moderation/reports/${report._id}/resolve`, { status: 'resolved', note: 'Временный бан на 24ч' });
                                                        fetchReports(filter);
                                                        await alert('Пользователь забанен на 24 часа');
                                                    } catch (e) { }
                                                }
                                            }}>Бан 24ч</button>
                                            
                                            <button className="settings-btn settings-btn-danger" onClick={async () => {
                                                if (await confirm(`Вы уверены, что хотите забанить ${report.reportedUser.username} НАВСЕГДА?`)) {
                                                    const reason = await prompt('Укажите причину перманентного бана:', 'Грубое нарушение правил');
                                                    if (reason) {
                                                        try {
                                                            await axios.post('/api/moderation/ban', { userId: report.reportedUser._id, type: 'permanent', reason });
                                                            await axios.post(`/api/moderation/reports/${report._id}/resolve`, { status: 'resolved', note: 'Перманентный бан' });
                                                            fetchReports(filter);
                                                            await alert('Пользователь забанен навсегда');
                                                        } catch (e) { }
                                                    }
                                                }
                                            }}>Пермабан</button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default ModerationSettings;
