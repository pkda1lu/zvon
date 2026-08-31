import React, { useState, useEffect, useCallback } from 'react';
import { DirectMessage, User, Server } from '../types';
import { PlusIcon, ShieldIcon, ChevronDownIcon, ChevronRightIcon, TrashIcon, ChatIcon, BellOffIcon } from './Icons';
import UserAvatar from './UserAvatar';
import VoiceControlPanel from './VoiceControlPanel';
import UserBadges, { resolveServerTag } from './UserBadges';
import ActiveContacts from './ActiveContacts';
import DMContextMenu from './DMContextMenu';
import { useAppearance } from '../contexts/AppearanceContext';
import './panel-hero.css';
import './DMSidebar.css';

interface DMSidebarProps {
    dms: DirectMessage[];
    selectedDM: DirectMessage | null;
    onDMSelect: (dm: DirectMessage) => void;
    onShowFriends: () => void;
    showFriends: boolean;
    currentUser: User;
    unreadCounts: Record<string, number>;
    onAddDM?: () => void;
    onDeleteDM?: (dm: DirectMessage) => void;
    style?: React.CSSProperties;
    isMobile?: boolean;
    friends?: User[];
    servers?: Server[];
    onUserClick?: (userId: string, event?: React.MouseEvent) => void;
    /** Открыть (или создать) переписку с пользователем — из вкладки «Друзья». */
    onStartDM?: (userId: string) => void;
}

/**
 * Короткое время последнего сообщения: сегодня — часы, вчера — «вчера»,
 * в пределах недели — день, дальше — дата. Ровно столько, сколько помещается
 * в строку списка, не отвлекая от имени.
 */
const formatShortTime = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'вчера';
    if (now.getTime() - d.getTime() < 7 * 24 * 3600 * 1000) {
        return d.toLocaleDateString('ru-RU', { weekday: 'short' });
    }
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

/**
 * Превью последнего сообщения.
 *
 * Имя автора показываем только там, где оно что-то добавляет: «Вы» в любом
 * чате и имя собеседника в группе. В переписке один на один подписывать чужую
 * реплику именем незачем — оно уже стоит заголовком строки.
 */
const buildPreview = (
    dm: DirectMessage,
    currentUserId: string,
    isGroup: boolean,
    maskModeration: boolean,
): { prefix: string; text: string } | null => {
    const last = dm.lastMessage;
    if (!last) return null;

    const isMine = last.authorId === currentUserId;
    const prefix = isMine ? 'Вы: '
        : (isGroup && !maskModeration && last.authorName) ? `${last.authorName}: `
        : '';

    // Вложение без подписи — показываем, что это вложение, а не пустую строку.
    const text = last.content?.trim()
        || (last.attachmentCount > 0
            ? (last.attachmentCount === 1 ? 'Вложение' : `Вложения (${last.attachmentCount})`)
            : (last.type === 'missed-call' ? 'Пропущенный звонок' : ''));

    if (!text) return null;
    return { prefix, text };
};

// ID модератора у чата «от имени модерации» (или null, если это обычный чат).
const getModeratorId = (dm: DirectMessage): string | null =>
    dm.isModeration ? (typeof dm.moderator === 'object' ? dm.moderator?._id ?? null : dm.moderator ?? null) : null;

const DMSidebar: React.FC<DMSidebarProps> = ({
    dms,
    selectedDM,
    onDMSelect,
    onShowFriends,
    showFriends,
    currentUser,
    unreadCounts,
    onAddDM,
    onDeleteDM,
    style,
    isMobile = false,
    friends = [],
    servers = [],
    onUserClick,
    onStartDM
}) => {
    const { interfaceScale } = useAppearance();
    // Чаты «от имени модерации», где текущий пользователь — модератор.
    // Их прячем из общего списка и собираем в один хаб «Модерация».
    const myModerationDMs = dms.filter(dm => {
        const mid = getModeratorId(dm);
        return !!mid && mid === currentUser._id;
    });
    /*
     * Порядок списка — строго по свежести, как в любом мессенджере.
     *
     * Непрочитанное выделяется оформлением, а не позицией: если поднимать
     * непрочитанные выше всего, старый непрочитанный чат встанет над тем, куда
     * вы только что написали, и список начнёт переставляться неочевидно.
     *
     * updatedAt — то же поле, по которому сортирует сервер и которое он
     * обновляет при отправке. Main меняет его при новом сообщении, поэтому
     * пересортировка происходит сразу, без перезагрузки.
     */
    const regularDMs = React.useMemo(() => dms
        .filter(dm => {
            const mid = getModeratorId(dm);
            return !(mid && mid === currentUser._id);
        })
        .slice()
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
        [dms, currentUser._id]);

    const moderationUnread = myModerationDMs.reduce((acc, dm) => acc + (unreadCounts[dm._id] || 0), 0);
    const isModerationSelected = !!selectedDM && myModerationDMs.some(d => d._id === selectedDM._id);

    /*
     * Вкладка панели. Друзья и переписки — разные задачи: в одном случае вы
     * ищете, кому написать, в другом продолжаете разговор. Раньше они делили
     * одно место, а входа в друзей из этой панели не было вовсе — пропсы
     * onShowFriends и showFriends принимались, но в разметке не использовались.
     */
    const [tab, setTab] = useState<'chats' | 'friends'>('chats');

    // Друзья: сначала те, кто в сети, внутри — по имени. Офлайн внизу, потому
    // что написать сейчас можно в основном тем, кто на месте.
    const sortedFriends = React.useMemo(() => {
        const rank = (u: User) => (u.status && u.status !== 'offline') ? 0 : 1;
        return friends.slice().sort((a, b) => {
            const r = rank(a) - rank(b);
            if (r !== 0) return r;
            return (a.displayName || a.username || '').localeCompare(b.displayName || b.username || '', 'ru');
        });
    }, [friends]);

    // Счётчик на вкладке «Чаты»: непрочитанное видно, даже когда открыты друзья.
    const totalUnread = React.useMemo(
        () => Object.values(unreadCounts).reduce((a, n) => a + (n || 0), 0),
        [unreadCounts]);

    const [menu, setMenu] = useState<{ dm: DirectMessage; x: number; y: number } | null>(null);

    /*
     * Приглушённые переписки. Инициализируем из профиля, дальше держим локально:
     * ответ сервера подтверждает запись, но перезапрашивать весь профиль ради
     * одного переключателя незачем — галочка должна отзываться сразу.
     */
    const [mutedIds, setMutedIds] = useState<Set<string>>(
        () => new Set((currentUser.mutedDMs || []).map(String)));
    useEffect(() => {
        setMutedIds(new Set((currentUser.mutedDMs || []).map(String)));
    }, [currentUser.mutedDMs]);

    const handleToggleMute = useCallback((dm: DirectMessage, muted: boolean) => {
        setMutedIds(prev => {
            const next = new Set(prev);
            if (muted) next.add(dm._id); else next.delete(dm._id);
            return next;
        });
    }, []);

    const [modExpanded, setModExpanded] = useState(false);
    // Авто-разворачиваем хаб, когда выбран один из чатов модерации.
    useEffect(() => { if (isModerationSelected) setModExpanded(true); }, [isModerationSelected]);

    const renderDMItem = (dm: DirectMessage, sub = false) => {
        const isGroup = dm.participants.length > 2 || !!dm.name;
        const otherParticipants = dm.participants.filter(p => p._id !== currentUser._id);
        const otherUser = otherParticipants[0];
        if (!otherUser && !isGroup) return null;

        const isSelected = selectedDM?._id === dm._id;
        const unreadCount = unreadCounts[dm._id] || 0;
        // Чат «от имени модерации»: для пользователя (не модератора)
        // собеседник отображается как «Модерация».
        const moderatorId = getModeratorId(dm);
        const maskModeration = !!moderatorId && moderatorId !== currentUser._id;
        const displayName = maskModeration ? 'Модерация' : (dm.name || (isGroup ? otherParticipants.map(p => p.displayName || p.username).join(', ') : (otherUser?.displayName || otherUser?.username)));
        const avatarUser = maskModeration ? { username: 'Модерация', avatar: null } : (isGroup ? null : otherUser);
        const preview = buildPreview(dm, currentUser._id, isGroup, maskModeration);
        const isDmMuted = mutedIds.has(dm._id);

        return (
            <div
                key={dm._id}
                className={`dm-item ${sub ? 'dm-subitem' : ''} ${isSelected ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''} ${isGroup ? 'group-dm' : ''} ${isDmMuted ? 'muted' : ''}`}
                onClick={() => onDMSelect(dm)}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ dm, x: e.clientX, y: e.clientY }); }}
            >
                <div className="dm-avatar-wrap">
                    <UserAvatar
                        user={avatarUser}
                        size={32 * interfaceScale}
                        className="dm-avatar"
                    />
                    {!isGroup && !maskModeration && otherUser && <div className={`status-indicator ${otherUser.status}`}></div>}
                </div>
                <div className="dm-info">
                    <div className="dm-name-row">
                        <span className="dm-name">{displayName}</span>
                        {!isGroup && !maskModeration && otherUser && <UserBadges badges={otherUser.badges} serverTag={resolveServerTag(otherUser)} size={12 * interfaceScale} />}
                        {dm.lastMessage && <span className="dm-time">{formatShortTime(dm.lastMessage.createdAt)}</span>}
                    </div>
                    {/*
                        Под именем — последнее сообщение, как в любом мессенджере.
                        Раньше здесь была активность собеседника («Играет в …»),
                        а для списка переписок это подменяло главное: о чём и когда
                        был разговор. Активность осталась в списке друзей, где она
                        к месту.
                    */}
                    <span className="dm-preview">
                        {preview
                            ? <>
                                {preview.prefix && <span className="dm-preview-author">{preview.prefix}</span>}
                                <span className="dm-preview-text">{preview.text}</span>
                              </>
                            : <span className="dm-preview-empty">Нет сообщений</span>}
                    </span>
                </div>
                {/* У приглушённого чата счётчик приглушён же: непрочитанное
                    видно, но не притягивает взгляд наравне с остальными. */}
                {unreadCount > 0 && (
                    <div className={`dm-unread-badge ${isDmMuted ? 'muted' : ''}`}>{unreadCount}</div>
                )}
                {isDmMuted && unreadCount === 0 && (
                    <BellOffIcon size={14 * interfaceScale} className="dm-muted-icon" />
                )}
                {onDeleteDM && (
                    <button
                        className="dm-delete-button"
                        title="Удалить чат"
                        onClick={(e) => { e.stopPropagation(); onDeleteDM(dm); }}
                    >
                        <TrashIcon size={15 * interfaceScale} />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="dm-sidebar panel-hero" style={style}>
            <div className="panel-hero-bg" aria-hidden="true">
                <div className="blob cyan" />
                <div className="blob purple" />
                <div className="blob pink" />
            </div>


            <div className="dm-list-container custom-scrollbar">
                {isMobile && onUserClick && (
                    <ActiveContacts
                        variant="mobile-row"
                        friends={friends}
                        servers={servers}
                        onUserClick={onUserClick}
                    />
                )}
                <div className="dm-tabs" role="tablist">
                    <button
                        role="tab"
                        aria-selected={tab === 'chats'}
                        className={`dm-tab ${tab === 'chats' ? 'active' : ''}`}
                        onClick={() => setTab('chats')}
                    >
                        Чаты
                        {totalUnread > 0 && <span className="dm-tab-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
                    </button>
                    <button
                        role="tab"
                        aria-selected={tab === 'friends'}
                        className={`dm-tab ${tab === 'friends' ? 'active' : ''}`}
                        onClick={() => setTab('friends')}
                    >
                        Друзья
                        {friends.length > 0 && <span className="dm-tab-count">{friends.length}</span>}
                    </button>
                    <button
                        className="add-dm-button"
                        title={tab === 'chats' ? 'Начать переписку' : 'Добавить друга'}
                        onClick={() => { if (tab === 'chats') onAddDM?.(); else onShowFriends(); }}
                    >
                        <PlusIcon size={16 * interfaceScale} />
                    </button>
                </div>

                {tab === 'friends' ? (
                    <div className="dm-list">
                        {/* Заявки, поиск и удаление живут в полной панели друзей —
                            здесь только быстрый доступ, чтобы написать. */}
                        <button className="dm-friends-all" onClick={onShowFriends}>
                            Все друзья и заявки
                        </button>

                        {sortedFriends.length === 0 ? (
                            <div className="dm-empty">
                                Друзей пока нет.<br />Добавьте — и переписки появятся здесь.
                            </div>
                        ) : sortedFriends.map(f => (
                            <div
                                key={f._id}
                                className="dm-item friend-item"
                                onClick={() => onStartDM?.(f._id)}
                                title={`Написать ${f.displayName || f.username}`}
                            >
                                {/* Клик по аватарке — профиль, по строке — переписка.
                                    Так же устроены остальные списки пользователей. */}
                                <div className="dm-avatar-wrap">
                                    <UserAvatar
                                        user={f}
                                        size={32 * interfaceScale}
                                        className="dm-avatar"
                                        onClick={(e) => { e.stopPropagation(); onUserClick?.(f._id, e); }}
                                    />
                                    <div className={`status-indicator ${f.status}`} />
                                </div>
                                <div className="dm-info">
                                    <div className="dm-name-row">
                                        <span className="dm-name">{f.displayName || f.username}</span>
                                        <UserBadges badges={f.badges} serverTag={resolveServerTag(f)} size={12 * interfaceScale} />
                                    </div>
                                    {f.activity?.name && (
                                        <span className="dm-activity">
                                            {f.activity.type === 'listening' ? `Слушает в ${f.activity.name}`
                                                : f.activity.type === 'watching' ? `Смотрит в ${f.activity.name}`
                                                : f.activity.type === 'using' ? `Использует ${f.activity.name}`
                                                : f.activity.type === 'streaming' ? `В эфире: ${f.activity.name}`
                                                : `Играет в ${f.activity.name}`}
                                        </span>
                                    )}
                                </div>
                                <ChatIcon size={15 * interfaceScale} className="friend-dm-hint" />
                            </div>
                        ))}
                    </div>
                ) : (
                <div className="dm-list">
                    {/* Хаб «Модерация»: единый чат, внутри которого все переписки,
                        начатые модератором от имени модерации. */}
                    {myModerationDMs.length > 0 && (
                        <>
                            <div
                                className={`dm-item moderation-hub ${isModerationSelected ? 'active' : ''} ${moderationUnread > 0 ? 'unread' : ''}`}
                                onClick={() => setModExpanded(e => !e)}
                            >
                                <div className="dm-avatar-wrap">
                                    <div className="moderation-hub-icon">
                                        <ShieldIcon size={18 * interfaceScale} color="var(--primary-neon)" />
                                    </div>
                                </div>
                                <div className="dm-info">
                                    <div className="dm-name-row">
                                        <span className="dm-name">Модерация</span>
                                    </div>
                                    <span className="dm-activity">{myModerationDMs.length} переписок</span>
                                </div>
                                {moderationUnread > 0 && (
                                    <div className="dm-unread-badge">{moderationUnread}</div>
                                )}
                                <div className="moderation-hub-chevron">
                                    {modExpanded ? <ChevronDownIcon size={16 * interfaceScale} /> : <ChevronRightIcon size={16 * interfaceScale} />}
                                </div>
                            </div>
                            {modExpanded && (
                                <div className="moderation-subchats">
                                    {myModerationDMs.map(dm => renderDMItem(dm, true))}
                                </div>
                            )}
                        </>
                    )}

                    {regularDMs.length === 0 && myModerationDMs.length === 0 && (
                        <div className="dm-empty">
                            Переписок пока нет.<br />Откройте вкладку «Друзья», чтобы начать.
                        </div>
                    )}
                    {regularDMs.map(dm => renderDMItem(dm))}
                </div>
                )}
            </div>
            <VoiceControlPanel />

            {menu && (() => {
                // Собеседник для действий над человеком. У групп его нет, а у
                // чата «от имени модерации» скрываем намеренно: блокировать
                // модерацию — значит отрезать себе канал обращений.
                const mid = getModeratorId(menu.dm);
                const isGroup = menu.dm.participants.length > 2 || !!menu.dm.name;
                const other = (isGroup || mid)
                    ? null
                    : menu.dm.participants.find(p => p._id !== currentUser._id) || null;
                return (
                    <DMContextMenu
                        dm={menu.dm}
                        x={menu.x}
                        y={menu.y}
                        otherUser={other}
                        isMuted={mutedIds.has(menu.dm._id)}
                        onToggleMute={handleToggleMute}
                        onDelete={onDeleteDM}
                        onOpenProfile={onUserClick}
                        onClose={() => setMenu(null)}
                    />
                );
            })()}
        </div>
    );
};

export default React.memo(DMSidebar);
