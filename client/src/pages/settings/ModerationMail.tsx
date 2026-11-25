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
    replyAddress: string;
    attachments: { filename: string; size: number }[];
}

function IncomingMail() {
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
                                    <ReplyThread key={inbox.validity + ':' + message.uid} message={message} validity={inbox.validity} />
                                </>
                            )}
                        </article>
                    )}
                </div>
            )}
        </div>
    );
}

interface Reply {
    _id: string;
    author: string;
    to: string;
    text: string;
    status: string;
    createdAt: string;
}

const REPLY_STATUS: Record<string, string> = {
    sent: 'Принято SMTP', pending: 'Отправляется',
    rejected: 'Отклонено SMTP', unknown: 'Доставка не подтверждена',
};

function ReplyThread({ message, validity }: { message: Message; validity: string }) {
    const [replies, setReplies] = useState<Reply[]>([]);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [requestId, setRequestId] = useState('');
    const endpoint = '/api/moderation/mail/inbox/' + message.uid + '/replies';

    useEffect(() => {
        const controller = new AbortController();
        axios.get<Reply[]>(endpoint, { params: { validity }, signal: controller.signal })
            .then(({ data }) => {
                if (!controller.signal.aborted) setReplies(previous => [
                    ...data, ...previous.filter(reply => !data.some(item => item._id === reply._id))
                ]);
            }).catch(() => {
                if (!controller.signal.aborted) setError('Не удалось загрузить ответы');
            });
        return () => controller.abort();
    }, [endpoint, validity]);

    async function send(event: React.FormEvent) {
        event.preventDefault();
        if (busy || !text.trim()) return;
        const id = requestId || crypto.randomUUID();
        setRequestId(id);
        setBusy(true);
        setError('');
        try {
            const { data } = await axios.post<Reply>(endpoint, { validity, requestId: id, text });
            setReplies(previous => [...previous.filter(reply => reply._id !== data._id), data]);
            setText('');
            setRequestId('');
        } catch (error) {
            setError(axios.isAxiosError(error) ? error.response?.data?.message || 'Статус отправки неизвестен. Повтори проверку кнопкой отправки.' : 'Не удалось отправить ответ');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="moderation-reply-thread">
            <h4>Ответы поддержки</h4>
            {replies.map(reply => (
                <div className="moderation-letter" key={reply._id}>
                    <strong>{reply.author} · {REPLY_STATUS[reply.status] || reply.status}</strong>
                    <small>{reply.to} · {new Date(reply.createdAt).toLocaleString('ru-RU')}</small>
                    <div className="moderation-letter-text">{reply.text}</div>
                </div>
            ))}
            {error && <p role="alert">{error}</p>}
            {message.replyAddress && <form onSubmit={send}>
                <label htmlFor="support-reply">Ответ для {message.replyAddress}</label>
                <textarea id="support-reply" className="settings-input" rows={5} maxLength={10000}
                    value={text} disabled={busy || !!requestId} onChange={event => setText(event.target.value)} required />
                <button type="submit" className="settings-btn" disabled={busy || !text.trim()}>
                    {busy ? 'Отправка…' : requestId ? 'Проверить отправку' : 'Отправить ответ'}
                </button>
            </form>}
        </section>
    );
}

const PURPOSES: Record<string, string> = {
    verify: 'Подтверждение почты', register: 'Регистрация', login: 'Вход и 2FA',
    reset: 'Сброс пароля', 'password-change': 'Смена пароля', 'email-change': 'Смена почты', vlyne: 'Решение по заявке Vlyne ID',
};

function AutomaticMail() {
    const [page, setPage] = useState(1);
    const [error, setError] = useState(false);
    const [result, setResult] = useState<{ items: { _id: string; purpose: string; to: string; createdAt: string; status: string }[]; hasMore: boolean } | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        axios.get('/api/moderation/mail/automatic', { params: { page }, signal: controller.signal })
            .then(({ data }) => { if (!controller.signal.aborted) setResult(data); })
            .catch(() => { if (!controller.signal.aborted) setError(true); });
        return () => controller.abort();
    }, [page]);
    const move = (next: number) => { setResult(null); setError(false); setPage(next); };
    if (error) return <p role="alert">Не удалось загрузить журнал автоматических писем.</p>;
    if (!result) return <p role="status">Загрузка журнала…</p>;
    return (
        <div className="settings-content-inner moderation-mail">
            <h2>Автоматические письма</h2>
            <p>Получатель, назначение и статус отправки за последние 90 дней.</p>
            {result.items.length === 0 && <p>Записей пока нет.</p>}
            {result.items.map(item => <article className="moderation-letter" key={item._id}>
                <strong>{PURPOSES[item.purpose] || item.purpose}</strong>
                <span>{item.to}</span>
                <small>{new Date(item.createdAt).toLocaleString('ru-RU')} · {REPLY_STATUS[item.status] || item.status}</small>
            </article>)}
            <div className="moderation-mail-pages">
                <button className="settings-btn secondary" disabled={page === 1} onClick={() => move(page - 1)}>Назад</button>
                <button className="settings-btn secondary" disabled={!result.hasMore} onClick={() => move(page + 1)}>Далее</button>
            </div>
        </div>
    );
}

export default function ModerationMail() {
    const [automatic, setAutomatic] = useState(false);
    return (
        <div className="settings-content-inner moderation-mail">
            <nav className="zv-tabs" aria-label="Виды писем">
                <button className={`zv-tab ${!automatic ? 'active' : ''}`} aria-pressed={!automatic} onClick={() => setAutomatic(false)}>Обращения</button>
                <button className={`zv-tab ${automatic ? 'active' : ''}`} aria-pressed={automatic} onClick={() => setAutomatic(true)}>Автоматические</button>
            </nav>
            {automatic ? <AutomaticMail /> : <IncomingMail />}
        </div>
    );
}
