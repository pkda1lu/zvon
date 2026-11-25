import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './ModerationMail.css';

interface Letter {
    uid: number;
    subject: string;
    from: string;
    date: string;
    unread: boolean;
}

interface Inbox {
    items: Letter[];
    validity: string;
    hasMore: boolean;
}

interface Message extends Letter {
    text: string;
    attachments: { filename: string; size: number }[];
}

export default function ModerationMail() {
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [inbox, setInbox] = useState<Inbox | null>(null);
    const [selection, setSelection] = useState<Letter | null>(null);
    const [message, setMessage] = useState<Message | null>(null);
    const [error, setError] = useState('');
    const [messageError, setMessageError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        axios.get<Inbox>('/api/moderation/mail/inbox', { params: { page }, signal: controller.signal })
            .then(({ data }) => { if (!controller.signal.aborted) setInbox(data); })
            .catch(error => {
                if (!controller.signal.aborted) setError(error.response?.data?.message || 'Не удалось загрузить письма');
            });
        return () => controller.abort();
    }, [page, revision]);

    useEffect(() => {
        if (!selection || !inbox) return;
        const controller = new AbortController();
        axios.get<Message>('/api/moderation/mail/inbox/' + selection.uid, {
            params: { validity: inbox.validity }, signal: controller.signal
        }).then(({ data }) => { if (!controller.signal.aborted) setMessage(data); })
            .catch(error => {
                if (!controller.signal.aborted) setMessageError(error.response?.data?.message || 'Не удалось открыть письмо');
            });
        return () => controller.abort();
    }, [selection, inbox]);

    function loadPage(next: number) {
        setInbox(null);
        setSelection(null);
        setMessage(null);
        setError('');
        setPage(next);
        setRevision(value => value + 1);
    }

    return (
        <div className="settings-content-inner moderation-mail">
            <header className="moderation-mail-header">
                <h2 className="settings-page-title">Входящая почта</h2>
                <button className="settings-btn secondary" onClick={() => loadPage(1)}>Обновить</button>
            </header>
            {error ? <p role="alert">{error}</p> : !inbox ? <p role="status">Загрузка писем…</p> : (
                <div className="moderation-mail-layout">
                    <section aria-label="Список писем">
                        {inbox.items.length === 0 && <p>На этой странице писем нет.</p>}
                        {inbox.items.map(letter => (
                            <button type="button" key={letter.uid} className="moderation-letter"
                                aria-pressed={selection?.uid === letter.uid} onClick={() => {
                                    setMessage(null);
                                    setMessageError('');
                                    setSelection({ ...letter });
                                }}>
                                <strong>{letter.subject}</strong>
                                <span>{letter.from || 'Отправитель не указан'}</span>
                                <small>{new Date(letter.date).toLocaleString('ru-RU')}{letter.unread ? ' · Непрочитано в ящике' : ''}</small>
                            </button>
                        ))}
                        <div className="moderation-mail-pages">
                            <button className="settings-btn secondary" disabled={page === 1} onClick={() => loadPage(page - 1)}>Назад</button>
                            <button className="settings-btn secondary" disabled={!inbox.hasMore} onClick={() => loadPage(page + 1)}>Далее</button>
                        </div>
                    </section>
                    {selection && (
                        <article className="settings-card">
                            <h3>{selection.subject}</h3>
                            <p>{selection.from}</p>
                            {messageError ? <p role="alert">{messageError}</p> : !message ? <p role="status">Загрузка письма…</p> : (
                                <>
                                    <div className="moderation-letter-text">{message.text || 'В письме нет текста.'}</div>
                                    {message.attachments.length > 0 && <ul aria-label="Вложения">
                                        {message.attachments.map((attachment, index) => (
                                            <li key={index}>{attachment.filename} · {Math.ceil(attachment.size / 1024)} КБ</li>
                                        ))}
                                    </ul>}
                                </>
                            )}
                        </article>
                    )}
                </div>
            )}
        </div>
    );
}
