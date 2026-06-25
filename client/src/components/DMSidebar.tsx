import React, { useState, useEffect } from 'react';
import { DirectMessage, User } from '../types';
import { UsersIcon, PlusIcon, ShieldIcon, ChevronDownIcon, ChevronRightIcon, TrashIcon } from './Icons';
import UserAvatar from './UserAvatar';
import VoiceControlPanel from './VoiceControlPanel';
import UserBadges from './UserBadges';
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
    style
}) => {
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
        const maskModeration = !!moderatorId && moderatorId !== currentUser._id;
        const displayName = maskModeration ? 'Модерация' : (dm.name || (isGroup ? otherParticipants.map(p => p.username).join(', ') : otherUser?.username));
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
                        size={32}
                        className="dm-avatar"
                    />
                    {!isGroup && !maskModeration && otherUser && <div className={`status-indicator ${otherUser.status}`}></div>}
                </div>
                <div className="dm-info">
                    <div className="dm-name-row">
                        <span className="dm-name">{displayName}</span>
                        {!isGroup && !maskModeration && otherUser && <UserBadges badges={otherUser.badges} size={12} />}
                    </div>
                    {!isGroup && !maskModeration && otherUser?.activity && (
                        <span className="dm-activity">Играет в {otherUser.activity.name}</span>
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
                        <TrashIcon size={15} />
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
            <div className="dm-sidebar-header">
                <button
                    className={`friends-tab-button ${showFriends ? 'active' : ''}`}
                    onClick={onShowFriends}
                >
                    <div className="icon-wrapper">
                        <UsersIcon size={20} />
                    </div>
                    <span>Друзья</span>
                </button>
            </div>

            <div className="dm-list-container custom-scrollbar">
                <div className="dm-list-title">
                    <span>ЛИЧНЫЕ СООБЩЕНИЯ</span>
                    <button
                        className="add-dm-button"
                        title="Начать переписку"
                        onClick={onAddDM}
                    >
                        <PlusIcon size={16} />
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
                                        <ShieldIcon size={18} color="var(--primary-neon)" />
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
                                    {modExpanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
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

export default DMSidebar;
