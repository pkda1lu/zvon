import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './Verification.css';

type Target = { kind: 'profile'; id: string } | { kind: 'server'; id: string };
const STATUS = { pending: 'На рассмотрении', evidence: 'Нужно подтверждение', approved: 'Одобрено', rejected: 'Отклонено' };
type Action = 'reply' | 'evidence' | 'approved' | 'rejected';
interface RequestItem {
    _id: string;
    kind: Target['kind'];
    targetName: string;
    status: keyof typeof STATUS;
    applicant?: { _id: string; username: string };
    messages?: { _id: string; moderator: boolean; action?: Action; text: string; createdAt: string }[];
}

const endpoint = '/api/verification/requests';

export function VerificationDisclosure({ target }: { target: Target }) {
    return <details className="verification-disclosure">
        <summary>Верификация</summary>
        <VerificationPanel target={target} />
    </details>;
}

export default function VerificationPanel({ target, moderation = false }: { target?: Target; moderation?: boolean }) {
    const { user } = useAuth();
    const targetRequest = target && user ? `${target.kind}:${target.id}:${user._id}` : null;
    const [selected, setSelected] = useState<string | null>(null);
    const requestId = targetRequest || selected;
    const [item, setItem] = useState<RequestItem | null>(null);
    const [items, setItems] = useState<RequestItem[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [text, setText] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setLoadFailed(false);
        setError('');
        const url = requestId ? `${endpoint}/${encodeURIComponent(requestId)}` : endpoint;
        axios.get(url, { params: requestId ? undefined : { page, moderation: moderation ? '1' : undefined }, signal: controller.signal })
            .then(({ data }) => {
                if (controller.signal.aborted) return;
                if (requestId) setItem(data);
                else {
                    setItems(data.items);
                    setHasMore(data.hasMore);
                }
            }).catch((failure) => {
                if (controller.signal.aborted) return;
                if (targetRequest && failure.response?.status === 404) setItem(null);
                else setLoadFailed(true);
            }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [requestId, targetRequest, moderation, page, revision]);

    const open = item?.status === 'pending' || item?.status === 'evidence';
    const canStart = Boolean(target && (!item || item.status === 'rejected'));
    const ownRequest = Boolean(user && item?.applicant?._id === user._id);
    const canDecide = moderation && Boolean(item?.applicant) && !ownRequest;

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting || !text.trim() || !requestId) return;
        const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const action = canDecide && button?.name === 'action' ? button.value : 'reply';
        setSubmitting(true);
        setError('');
        try {
            const { data } = canStart && target
                ? await axios.post(endpoint, { kind: target.kind, target: target.id, text })
                : await axios.post(`${endpoint}/${encodeURIComponent(requestId)}/messages`, { text, action });
            setItem(data);
            setText('');
            setRevision(value => value + 1);
        } catch (failure) {
            setError(axios.isAxiosError(failure) ? failure.response?.data?.message || 'Не удалось отправить сообщение.' : 'Не удалось отправить сообщение.');
        } finally {
            setSubmitting(false);
        }
    }

    function select(id: string | null) {
        setItem(null);
        setText('');
        setLoading(true);
        setSelected(id);
    }

    return <section className="settings-card verification-panel">
        <div className="verification-toolbar">
            {!target && <h3>{requestId ? item?.targetName || 'Заявка' : moderation ? 'Заявки на верификацию' : 'Мои заявки на верификацию'}</h3>}
            <div className="verification-actions">
                {selected && <button type="button" className="settings-btn secondary" disabled={submitting} onClick={() => select(null)}>К заявкам</button>}
                <button type="button" className="settings-btn secondary" disabled={loading || submitting} onClick={() => setRevision(value => value + 1)}>Обновить</button>
            </div>
        </div>
        {loading ? <p role="status">Загрузка…</p> : loadFailed ? <p role="alert">Не удалось загрузить заявки.</p> : !requestId ? <>
            {items.length ? <ul className="verification-list">{items.map(entry => <li key={entry._id}>
                <button type="button" className="settings-btn secondary" onClick={() => select(entry._id)}>{entry.targetName}</button>
                <span>{entry.kind === 'profile' ? 'Личный аккаунт' : 'Сообщество'} · {STATUS[entry.status]}{moderation && entry.applicant ? ` · @${entry.applicant.username}` : ''}</span>
            </li>)}</ul> : <p>Заявок пока нет.</p>}
            {(page > 1 || hasMore) && <div className="verification-actions">
                <button type="button" className="settings-btn secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Назад</button>
                <button type="button" className="settings-btn secondary" disabled={!hasMore} onClick={() => setPage(value => value + 1)}>Дальше</button>
            </div>}
        </> : <>
            {item && <>
                <p role="status">{STATUS[item.status]}</p>
                <ol className="verification-thread" aria-label="Переписка по заявке">{item.messages?.map(message => <li key={message._id}>
                    <div><strong>{message.moderator ? 'Модератор' : 'Заявитель'}</strong> {message.action && message.action !== 'reply' && <span>· {STATUS[message.action]} </span>}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></div>
                    <p>{message.text}</p>
                </li>)}</ol>
            </>}
            {(open || canStart) && <form className="verification-reply" onSubmit={submit}>
                {moderation && ownRequest && <p>Решение по вашей заявке может принять другой модератор.</p>}
                <label>{canStart ? 'Кого представляет аккаунт или сообщество? Добавьте ссылки на официальные страницы.' : canDecide ? 'Сообщение или пояснение к решению' : 'Сообщение'}
                    <textarea rows={3} maxLength={4000} required value={text} onChange={event => setText(event.target.value)} />
                </label>
                {error && <p role="alert">{error}</p>}
                <div className="verification-actions">
                    <button type="submit" className="settings-btn" disabled={submitting}>{canStart ? 'Отправить заявку' : 'Ответить'}</button>
                    {canDecide && <>
                        <button type="submit" name="action" value="evidence" className="settings-btn secondary" disabled={submitting}>Запросить подтверждение</button>
                        <button type="submit" name="action" value="approved" className="settings-btn" disabled={submitting}>Одобрить</button>
                        <button type="submit" name="action" value="rejected" className="settings-btn settings-btn-danger" disabled={submitting}>Отказать</button>
                    </>}
                </div>
            </form>}
        </>}
    </section>;
}
