import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ProblemReportModal from '../../components/ProblemReportModal';
import { PROBLEM_CATEGORIES, REPORT_REASONS } from '../../utils/reportLabels';
import './ModerationHistorySettings.css';

const SECTIONS = [
    { id: 'notices', label: 'Сообщения модерации', empty: 'Сообщений от модерации пока нет.' },
    { id: 'reports', label: 'Жалобы', empty: 'Вы ещё не отправляли жалоб.' },
    { id: 'problems', label: 'Проблемы', empty: 'Вы ещё не сообщали о проблемах.' },
] as const;

const STATUS_LABELS = {
    pending: 'На рассмотрении',
    resolved: 'Решено',
    dismissed: 'Отклонено',
};

interface HistoryItem {
    _id: string;
    createdAt: string;
    title?: string;
    message?: string;
    expiresAt?: string | null;
    subject?: string;
    category?: string;
    reason?: string;
    description?: string;
    steps?: string;
    status?: keyof typeof STATUS_LABELS;
    resolutionNote?: string;
}

interface HistoryPage {
    items: HistoryItem[];
    hasMore: boolean;
}

export default function ModerationHistorySettings() {
    const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('notices');
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<HistoryPage | null>(null);
    const [failed, setFailed] = useState(false);
    const [showReport, setShowReport] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        setResult(null);
        setFailed(false);
        axios.get<HistoryPage>('/api/moderation/history', {
            params: { section, page },
            signal: controller.signal,
        }).then(({ data }) => {
            if (!controller.signal.aborted) setResult(data);
        }).catch(() => {
            if (!controller.signal.aborted) setFailed(true);
        });
        return () => controller.abort();
    }, [page, section, revision]);

    return (
        <div className="settings-content-inner moderation-history">
            <div className="moderation-history-heading">
                <h2 className="settings-page-title">Мои обращения</h2>
                <button type="button" className="settings-btn secondary" onClick={() => setShowReport(true)}>
                    Сообщить о проблеме
                </button>
            </div>
            <div className="zv-tabs">
                {SECTIONS.map(({ id, label }) => (
                    <button key={id} type="button" className={`zv-tab ${section === id ? 'active' : ''}`}
                        aria-pressed={section === id} onClick={() => { setSection(id); setPage(1); }}>
                        {label}
                    </button>
                ))}
            </div>
            {failed ? (
                <div role="alert">
                    <p>Не удалось загрузить историю.</p>
                    <button type="button" className="settings-btn secondary" onClick={() => setRevision(value => value + 1)}>
                        Повторить
                    </button>
                </div>
            ) : !result ? (
                <p role="status">Загрузка…</p>
            ) : (
                <>
                    {result.items.length === 0 && (
                        <p>{page === 1 ? SECTIONS.find(item => item.id === section)?.empty : 'На этой странице записей нет.'}</p>
                    )}
                    {result.items.map(item => (
                        <article className="settings-card moderation-history-card" key={item._id}>
                            <header>
                                <h3>{item.title || item.subject || REPORT_REASONS[item.reason || ''] || 'Жалоба'}</h3>
                                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('ru-RU')}</time>
                            </header>
                            {item.status && (
                                <div className="moderation-history-meta">
                                    {STATUS_LABELS[item.status]}{item.category && ` · ${PROBLEM_CATEGORIES[item.category] || 'Другое'}`}
                                </div>
                            )}
                            {(item.message || item.description) && <p>{item.message || item.description}</p>}
                            {item.steps && <p><strong>Шаги воспроизведения</strong>{'\n'}{item.steps}</p>}
                            {item.resolutionNote && <p><strong>Комментарий модерации</strong>{'\n'}{item.resolutionNote}</p>}
                            {item.expiresAt !== undefined && (
                                <p>{item.expiresAt ? `Срок блокировки до ${new Date(item.expiresAt).toLocaleString('ru-RU')}` : 'Бессрочная блокировка'}</p>
                            )}
                        </article>
                    ))}
                    {(page > 1 || result.hasMore) && (
                        <div className="moderation-history-pagination">
                            <button type="button" className="settings-btn secondary" disabled={page === 1}
                                onClick={() => setPage(value => value - 1)}>Назад</button>
                            <span>Страница {page}</span>
                            <button type="button" className="settings-btn secondary" disabled={!result.hasMore}
                                onClick={() => setPage(value => value + 1)}>Далее</button>
                        </div>
                    )}
                </>
            )}
            <ProblemReportModal isOpen={showReport} onClose={() => setShowReport(false)} onSubmitted={() => {
                setSection('problems');
                setPage(1);
                setRevision(value => value + 1);
            }} />
        </div>
    );
}
