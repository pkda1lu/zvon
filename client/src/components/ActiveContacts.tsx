import React from 'react';
import { User } from '../types';
import UserAvatar from './UserAvatar';
import './ActiveContacts.css';

interface ActiveContactsProps {
    friends: User[];
    onUserClick: (userId: string, event?: React.MouseEvent) => void;
}

const ActiveContacts: React.FC<ActiveContactsProps> = ({ friends, onUserClick }) => {
    // Filter friends who have an active activity
    const activeFriends = friends.filter(f => f.activity && f.status !== 'offline');

    if (activeFriends.length === 0) {
        return (
            <div className="active-contacts-sidebar empty">
                <h3 className="section-title">Активные контакты</h3>
                <div className="empty-active-state">
                    <p>Пока никто не играет. Когда ваши друзья начнут во что-то играть или участвовать в активностях, это появится здесь!</p>
                </div>
            </div>
        );
    }

    const formatTime = (startTime: string | number) => {
        const start = new Date(startTime).getTime();
        const now = Date.now();
        const diffMs = now - start;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);

        if (diffHours > 0) return `${diffHours} ч.`;
        return `${diffMins} мин.`;
    };

    return (
        <div className="active-contacts-sidebar">
            <h3 className="section-title">Активные контакты</h3>
            <div className="active-contacts-list custom-scrollbar">
                {activeFriends.map(friend => (
                    <div 
                        key={friend._id} 
                        className="active-card glass-panel-base"
                        onClick={(e) => onUserClick(friend._id, e)}
                    >
                        <div className="active-card-header">
                            <div className="active-user-info">
                                <UserAvatar user={friend} size={32} className="active-avatar" />
                                <div className="active-user-details">
                                    <span className="active-username">{friend.username}</span>
                                    <span className="active-activity-name">
                                        {friend.activity?.name} — {friend.activity?.timestamps?.start ? formatTime(friend.activity.timestamps.start) : 'только что'}
                                    </span>
                                </div>
                            </div>
                            {friend.activity?.assets?.largeImage && (
                                <div className="active-game-mini-icon">
                                    <img src={friend.activity.assets.largeImage} alt="" />
                                </div>
                            )}
                        </div>
                        
                        <div className="active-card-content">
                            <div className="active-game-info">
                                {friend.activity?.assets?.largeImage && (
                                    <div className="active-game-icon">
                                        <img src={friend.activity.assets.largeImage} alt="" />
                                    </div>
                                )}
                                <div className="active-game-details">
                                    <div className="active-game-title">
                                        {friend.activity?.type === 'playing' ? 'Играет в ' : ''}
                                        {friend.activity?.name}
                                    </div>
                                    <div className="active-game-subtitle">
                                        {friend.activity?.state || 'В процессе'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ActiveContacts;
