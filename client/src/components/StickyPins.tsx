import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Message } from '../types';
import { PinIcon, CameraIcon, DocumentIcon } from './Icons';
import UserBadges, { resolveServerTag } from './UserBadges';
import { getFullUrl } from '../utils/avatar';
import { getMediaKind } from '../utils/mediaKind';
import { iosSpring } from '../animations/transitions';
import './StickyPins.css';

/*
 * Плашка закреплённых над чатом — как в Telegram.
 *
 * Раньше она всегда показывала только последний закреп, а клик по ней лишь
 * открывал список. Теперь: клик по плашке прокручивает чат к показанному
 * закрепу и переключает её на предыдущий (слева — полоски «какой из N»),
 * а список всех закрепов открывает отдельная кнопка справа.
 */

interface StickyPinsProps {
    pinnedMessages: Message[];
    onOpenPins: () => void;
    /** Прокрутить чат к сообщению. Без него клик открывает список, как раньше. */
    onJump?: (msg: Message) => void;
    /** Имя автора для плашки (в чате «от имени модерации» — «Модерация»). */
    authorName?: (msg: Message) => string;
    /** Автор скрыт — без значков. */
    isMasked?: (msg: Message) => boolean;
}

const MAX_BARS = 4;

const StickyPins: React.FC<StickyPinsProps> = ({ pinnedMessages, onOpenPins, onJump, authorName, isMasked }) => {
    const [index, setIndex] = useState(0);
    const count = pinnedMessages.length;

    // Новый закреп или открепление — начинаем с самого свежего.
    useEffect(() => { setIndex(0); }, [count, pinnedMessages[0]?._id]);

    const pin = count ? pinnedMessages[Math.min(index, count - 1)] : null;
    const firstAtt = pin?.attachments?.[0];
    const attKind = firstAtt ? getMediaKind(firstAtt) : null;
    const name = pin ? (authorName ? authorName(pin) : (pin.author.displayName || pin.author.username)) : '';
    const snippet = pin
        ? (pin.content?.trim()
            || (pin.poll ? `📊 ${pin.poll.question}` : '')
            || (pin.forwardedFrom?.content ? `↪ ${pin.forwardedFrom.content}` : '')
            || (pin.embeds?.[0]?.title || pin.embeds?.[0]?.description || '')
            || (pin.attachments?.length
            ? (attKind === 'image' ? 'Фото' : attKind === 'video' ? 'Видео' : attKind === 'audio' ? 'Аудио' : (firstAtt?.filename || 'Файл'))
            : ''))
        : '';

    // Полоски-индикатор: при многих закрепах показываем «окно» из MAX_BARS.
    const bars = Math.min(count, MAX_BARS);
    const windowStart = Math.min(Math.max(0, index - (MAX_BARS - 1)), Math.max(0, count - MAX_BARS));
    const activeBar = index - windowStart;

    const handleClick = () => {
        if (!pin) return;
        if (!onJump) { onOpenPins(); return; }
        onJump(pin);
        if (count > 1) setIndex(i => (i + 1) % count);
    };

    return (
        <AnimatePresence initial={false}>
            {pin && (
                <motion.div
                    className="sticky-pins-container"
                    initial={{ opacity: 0, y: -12, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={iosSpring}
                    style={{ overflow: 'hidden' }}
                >
                    <div className="sticky-pin-header">
                        <button
                            type="button"
                            className="sticky-pin-main"
                            onClick={handleClick}
                            title={onJump ? 'Перейти к закреплённому сообщению' : 'Закреплённые сообщения'}
                        >
                            {count > 1 ? (
                                <span className="sticky-pin-bars" aria-hidden="true">
                                    {Array.from({ length: bars }, (_, i) => (
                                        <span key={i} className={i === activeBar ? 'active' : ''} />
                                    ))}
                                </span>
                            ) : (
                                <span className="sticky-pin-icon-wrap">
                                    <PinIcon size={14} fill="var(--primary-neon)" color="var(--primary-neon)" />
                                </span>
                            )}

                            {firstAtt && (attKind === 'image' || attKind === 'video') && (
                                <span className="sticky-pin-media-preview">
                                    {attKind === 'image'
                                        ? <img src={getFullUrl(firstAtt.url)!} alt="" />
                                        : <span className="video-placeholder-mini"><CameraIcon size={14} /></span>}
                                </span>
                            )}
                            {firstAtt && attKind !== 'image' && attKind !== 'video' && !pin.content?.trim() && (
                                <span className="sticky-pin-media-preview">
                                    <span className="video-placeholder-mini"><DocumentIcon size={14} color="currentColor" /></span>
                                </span>
                            )}

                            <span className="sticky-pin-content">
                                <span className="sticky-pin-label">
                                    {count > 1 ? `Закреплённое сообщение #${count - index}` : 'Закреплённое сообщение'}
                                </span>
                                <span className="sticky-pin-snippet">
                                    <strong>{name}</strong>
                                    {!isMasked?.(pin) && <UserBadges badges={pin.author.badges} serverTag={resolveServerTag(pin.author)} size={12} />}
                                    <strong>:</strong> {snippet}
                                </span>
                            </span>
                        </button>

                        <button type="button" className="sticky-pin-list-btn" onClick={onOpenPins} title="Все закреплённые сообщения">
                            <PinIcon size={15} color="currentColor" />
                            {count > 1 && <span>{count}</span>}
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default StickyPins;
