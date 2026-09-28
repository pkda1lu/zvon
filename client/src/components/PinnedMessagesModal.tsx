import React, { useLayoutEffect, useRef, useState } from 'react';
import { Message, User } from '../types';
import Modal from './Modal';
import UserAvatar from './UserAvatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import { DocumentIcon, DownloadIcon, MusicIcon, PinIcon, PlayIcon, ChevronRightIcon } from './Icons';
import { getFullUrl } from '../utils/avatar';
import { getMediaKind, formatBytes } from '../utils/mediaKind';
import { downloadFile } from '../utils/transfers';
import './PinnedMessagesModal.css';

/*
 * Закреплённые сообщения — одно окно для каналов и личных переписок.
 *
 * Раньше в ChannelView и DMView было по своей копии: только текст без
 * форматирования, превью 60×60 лишь для картинок и видео, документы и аудио
 * не показывались вовсе, а клик по закрепу ничего не делал.
 *
 * Теперь закреп показан целиком (длинный — свёрнут до ~10 строк с кнопкой
 * «Показать полностью»), с тем же оформлением текста, что и в чате, с
 * картинками и видео сеткой и файлами карточками. Клик по закрепу закрывает
 * окно и прокручивает чат к сообщению.
 */

export interface PinAuthor {
    user: Partial<User> & { _id: string };
    name: string;
    avatarOverride?: string;
    /** Автор скрыт (чат «от имени модерации») — без значков и тегов. */
    masked?: boolean;
}

interface Props {
    open: boolean;
    onClose: () => void;
    messages: Message[];
    resolveAuthor: (msg: Message) => PinAuthor;
    renderContent: (content: string, mentions?: User[]) => React.ReactNode;
    formatDate: (iso: string) => string;
    onJump: (msg: Message) => void;
    onOpenMedia: (msg: Message, visualIndex: number) => void;
    onUnpin?: (msgId: string) => void;
}

const PinContent: React.FC<{ msg: Message; render: Props['renderContent'] }> = ({ msg, render }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [overflows, setOverflows] = useState(false);
    const [expanded, setExpanded] = useState(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (el) setOverflows(el.scrollHeight > el.clientHeight + 2);
    }, [msg.content]);

    if (!msg.content?.trim()) return null;
    return (
        <>
            <div ref={ref} className={`pinned-text ${expanded ? 'expanded' : ''}`}>
                {render(msg.content, (msg as any).mentions || [])}
            </div>
            {(overflows || expanded) && (
                <button
                    className="pinned-more"
                    onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                >
                    {expanded ? 'Свернуть' : 'Показать полностью'}
                </button>
            )}
        </>
    );
};

const PinAttachments: React.FC<{ msg: Message; onOpenMedia: Props['onOpenMedia'] }> = ({ msg, onOpenMedia }) => {
    const atts = msg.attachments || [];
    if (atts.length === 0) return null;
    const visual = atts.filter(a => { const k = getMediaKind(a); return k === 'image' || k === 'video'; });
    const files = atts.filter(a => { const k = getMediaKind(a); return k !== 'image' && k !== 'video'; });
    const shown = visual.slice(0, 4);
    const more = visual.length - shown.length;

    return (
        <>
            {shown.length > 0 && (
                <div className={`pinned-media count-${shown.length}`}>
                    {shown.map((a, i) => {
                        const url = getFullUrl(a.url)!;
                        const isVideo = getMediaKind(a) === 'video';
                        return (
                            <button
                                key={i}
                                className="pinned-media-tile"
                                onClick={e => { e.stopPropagation(); onOpenMedia(msg, i); }}
                                title={a.filename}
                            >
                                {isVideo
                                    ? <video src={`${url}#t=0.1`} muted preload="metadata" playsInline />
                                    : <img src={url} alt="" loading="lazy" />}
                                {isVideo && <span className="pinned-media-play"><PlayIcon size={16} color="#fff" /></span>}
                                {i === shown.length - 1 && more > 0 && <span className="pinned-media-more">+{more}</span>}
                            </button>
                        );
                    })}
                </div>
            )}
            {files.map((a, i) => {
                const kind = getMediaKind(a);
                return (
                    <button
                        key={`f-${i}`}
                        className="pinned-file"
                        onClick={e => { e.stopPropagation(); downloadFile(getFullUrl(a.url)!, a.filename || 'file'); }}
                        title="Скачать"
                    >
                        <span className="pinned-file-icon">
                            {kind === 'audio' ? <MusicIcon size={18} color="currentColor" /> : <DocumentIcon size={18} color="currentColor" />}
                        </span>
                        <span className="pinned-file-info">
                            <span className="pinned-file-name">{a.filename || 'Файл'}</span>
                            <span className="pinned-file-meta">{[kind === 'audio' ? 'Аудио' : 'Файл', formatBytes((a as any).size)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <DownloadIcon size={16} color="currentColor" />
                    </button>
                );
            })}
        </>
    );
};

/** Опрос, пересланное сообщение, встраивания — всё, что не текст и не вложение. */
const PinExtras: React.FC<{ msg: Message; render: Props['renderContent'] }> = ({ msg, render }) => {
    const poll = msg.poll;
    const fwd = msg.forwardedFrom;
    const embeds = msg.embeds || [];
    return (
        <>
            {fwd && (
                <div className="pinned-quote">
                    <span className="pinned-quote-label">Переслано{fwd.authorUsername ? ` от ${fwd.authorUsername}` : ''}</span>
                    {fwd.content && <div className="pinned-text">{render(fwd.content, [])}</div>}
                </div>
            )}
            {poll && (() => {
                const total = poll.options.reduce((n, o) => n + (o.voters?.length || 0), 0);
                return (
                    <div className="pinned-poll">
                        <div className="pinned-poll-q">📊 {poll.question}</div>
                        {poll.options.slice(0, 5).map(o => {
                            const votes = o.voters?.length || 0;
                            const pct = total ? Math.round((votes / total) * 100) : 0;
                            return (
                                <div key={o.id} className="pinned-poll-opt">
                                    <span className="pinned-poll-fill" style={{ '--pct': `${pct}%` } as React.CSSProperties} />
                                    <span className="pinned-poll-text">{o.text}</span>
                                    <span className="pinned-poll-votes">{votes}</span>
                                </div>
                            );
                        })}
                        {poll.options.length > 5 && <div className="pinned-poll-more">и ещё {poll.options.length - 5}</div>}
                        <div className="pinned-poll-total">{total} {total % 10 === 1 && total % 100 !== 11 ? 'голос' : (total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 10 || total % 100 >= 20)) ? 'голоса' : 'голосов'}</div>
                    </div>
                );
            })()}
            {embeds.map((e, i) => (e.title || e.description) ? (
                <div key={i} className="pinned-quote" style={e.color ? { borderLeftColor: e.color } as React.CSSProperties : undefined}>
                    {e.title && <span className="pinned-quote-label">{e.title}</span>}
                    {e.description && <div className="pinned-text">{render(e.description, [])}</div>}
                </div>
            ) : null)}
        </>
    );
};

const PinnedMessagesModal: React.FC<Props> = ({
    open, onClose, messages, resolveAuthor, renderContent, formatDate, onJump, onOpenMedia, onUnpin,
}) => {
    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Закреплённые сообщения"
            subtitle={messages.length ? `${messages.length} · нажмите, чтобы перейти к сообщению` : undefined}
            size="lg"
            className="pinned-modal"
        >
            {messages.length === 0 ? (
                <div className="pinned-empty">
                    <PinIcon size={28} color="var(--text-dim)" />
                    <span>Закреплённых сообщений пока нет</span>
                    <small>Закрепить сообщение можно через его меню (правый клик).</small>
                </div>
            ) : (
                <div className="pinned-list">
                    {messages.map(msg => {
                        const a = resolveAuthor(msg);
                        return (
                            <div
                                key={msg._id}
                                className="pinned-card"
                                role="button"
                                tabIndex={0}
                                onClick={() => { onClose(); onJump(msg); }}
                                onKeyDown={e => { if (e.key === 'Enter') { onClose(); onJump(msg); } }}
                            >
                                <div className="pinned-head">
                                    <UserAvatar user={a.user} avatarOverride={a.avatarOverride} size={28} />
                                    <span className="pinned-name">{a.name}</span>
                                    {!a.masked && <UserBadges badges={(a.user as any).badges} serverTag={resolveServerTag(a.user as any)} size={12} />}
                                    <span className="pinned-date">{formatDate(msg.createdAt)}</span>
                                    <span className="pinned-actions">
                                        {onUnpin && (
                                            <button
                                                className="zv-btn zv-btn--ghost zv-btn--sm"
                                                onClick={e => { e.stopPropagation(); onUnpin(msg._id); }}
                                                title="Открепить"
                                            >
                                                Открепить
                                            </button>
                                        )}
                                        <span className="pinned-go" aria-hidden="true"><ChevronRightIcon size={18} color="currentColor" /></span>
                                    </span>
                                </div>
                                <div className="pinned-body">
                                    <PinContent msg={msg} render={renderContent} />
                                    <PinExtras msg={msg} render={renderContent} />
                                    <PinAttachments msg={msg} onOpenMedia={onOpenMedia} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
};

export default PinnedMessagesModal;
