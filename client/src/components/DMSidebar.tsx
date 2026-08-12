import React, { useState, useEffect } from 'react';
import { DirectMessage, User, Server } from '../types';
import { PlusIcon, ShieldIcon, ChevronDownIcon, ChevronRightIcon, TrashIcon } from './Icons';
import UserAvatar from './UserAvatar';
import VoiceControlPanel from './VoiceControlPanel';
import UserBadges, { resolveServerTag } from './UserBadges';
import ActiveContacts from './ActiveContacts';
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
}

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
    onUserClick
}) => {
    const { interfaceScale } = useAppearance();
    // Чаты «от имени модерации», где текущий пользователь — модератор.
    // Их прячем из общего списка и собираем в один хаб «Модерация».
    const myModerationDMs = dms.filter(dm => {
        const mid = getModeratorId(dm);
        return !!mid && mid === currentUser._id;
    });
    const regularDMs = dms.filter(dm => {
        const mid = getModeratorId(dm);
        return !(mid && mid === currentUser._id);
    });

    const moderationUnread = myModerationDMs.reduce((acc, dm) => acc + (unreadCounts[dm._id] || 0), 0);
    const isModerationSelected = !!selectedDM && myModerationDMs.some(d => d._id === selectedDM._id);

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
        const displayName = maskModeration ? 'Модерация' : (dm.name || (isGroup ? otherParticipants.map(p => p.displayName || p.username).join(', ') : (otherUser?.displayName || otherUser?.username)));
        const avatarUser = maskModeration ? { username: 'Модерация', avatar: null } : (isGroup ? null : otherUser);

        return (
            <div
                key={dm._id}
                className={`dm-item ${sub ? 'dm-subitem' : ''} ${isSelected ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''} ${isGroup ? 'group-dm' : ''}`}
                onClick={() => onDMSelect(dm)}
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
                    </div>
                    {!isGroup && !maskModeration && otherUser?.activity?.name && (
                        <span className="dm-activity">
                            {otherUser.activity.type === 'listening' ? `Слушает в ${otherUser.activity.name}`
                                : otherUser.activity.type === 'watching' ? `Смотрит в ${otherUser.activity.name}`
                                : otherUser.activity.type === 'using' ? `Использует ${otherUser.activity.name}`
                                : otherUser.activity.type === 'streaming' ? `В эфире: ${otherUser.activity.name}`
                                : `Играет в ${otherUser.activity.name}`}
                        </span>
                    )}
                    {isGroup && (
                        <span className="dm-activity">{dm.participants.length} участников</span>
                    )}
                </div>
                {unreadCount > 0 && (
                    <div className="dm-unread-badge">{unreadCount}</div>
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
                <div className="dm-list-title">
                    <span>ЛИЧНЫЕ СООБЩЕНИЯ</span>
                    <button
                        className="add-dm-button"
                        title="Начать переписку"
                        onClick={onAddDM}
                    >
                        <PlusIcon size={16 * interfaceScale} />
                    </button>
                </div>

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

                    {regularDMs.map(dm => renderDMItem(dm))}
                </div>
            </div>
            <VoiceControlPanel />
        </div>
    );
};

export default React.memo(DMSidebar);
