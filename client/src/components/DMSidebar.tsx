import React from 'react';
import { DirectMessage, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { UsersIcon, PlusIcon } from './Icons';
import UserAvatar from './UserAvatar';
import VoiceControlPanel from './VoiceControlPanel';
import './DMSidebar.css';

interface DMSidebarProps {
    dms: DirectMessage[];
    selectedDM: DirectMessage | null;
    onDMSelect: (dm: DirectMessage) => void;
    onShowFriends: () => void;
    showFriends: boolean;
    currentUser: User;
    unreadCounts: Record<string, number>;
    style?: React.CSSProperties;
}

const DMSidebar: React.FC<DMSidebarProps> = ({
    dms,
    selectedDM,
    onDMSelect,
    onShowFriends,
    showFriends,
    currentUser,
    unreadCounts,
    style
}) => {
    return (
        <div className="dm-sidebar" style={style}>
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
                    <button className="add-dm-button" title="Начать переписку">
                        <PlusIcon size={16} />
                    </button>
                </div>

                <div className="dm-list">
                    {dms.map(dm => {
                        const otherUser = dm.participants.find(p => p._id !== currentUser._id);
                        if (!otherUser) return null;

                        const isSelected = selectedDM?._id === dm._id;
                        const unreadCount = unreadCounts[dm._id] || 0;

                        return (
                            <div
                                key={dm._id}
                                className={`dm-item ${isSelected ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`}
                                onClick={() => onDMSelect(dm)}
                            >
                                <div className="dm-avatar-wrap">
                                    <UserAvatar
                                        user={otherUser}
                                        size={32}
                                        className="dm-avatar"
                                    />
                                    <div className={`status-indicator ${otherUser.status}`}></div>
                                </div>
                                <div className="dm-info">
                                    <span className="dm-name">{otherUser.username}</span>
                                    {otherUser.activity && (
                                        <span className="dm-activity">Играет в {otherUser.activity.name}</span>
                                    )}
                                </div>
                                {unreadCount > 0 && (
                                    <div className="dm-unread-badge">{unreadCount}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <VoiceControlPanel />
        </div>
    );
};

export default DMSidebar;
