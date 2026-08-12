import React, { useEffect, useMemo, useState } from 'react';
import { User, Server } from '../types';
import UserAvatar from './UserAvatar';
import { getFullUrl } from '../utils/avatar';
import { useSocket } from '../contexts/SocketContext';
import { useAppearance } from '../contexts/AppearanceContext';
import { SpeakerIcon } from './Icons';
import './panel-hero.css';
import './ActiveContacts.css';

interface ActiveContactsProps {
    friends: User[];
    servers?: Server[];
    onUserClick: (userId: string, event?: React.MouseEvent) => void;
    variant?: 'sidebar' | 'mobile-row';
}

interface VoiceGroup {
    server: Server;
    channelId: string;
    channelName: string;
    users: User[];
}

const ActiveContacts: React.FC<ActiveContactsProps> = ({ friends, servers = [], onUserClick, variant = 'sidebar' }) => {
    const { socket } = useSocket();
    const { interfaceScale } = useAppearance();
    // Плоская карта channelId -> список пользователей. ID канала уникален глобально,
    // поэтому можно мержить снапшоты со всех серверов пользователя в одну карту без
    // необходимости хранить serverId в самом событии.
    const [voiceStates, setVoiceStates] = useState<Record<string, User[]>>({});

    useEffect(() => {
        if (!socket || servers.length === 0) return;

        const handleServerVoiceStates = (states: Record<string, User[]>) => {
            setVoiceStates(prev => ({ ...prev, ...states }));
        };
        const handleChannelUpdate = (data: { channelId: string; users: User[] }) => {
            setVoiceStates(prev => ({ ...prev, [data.channelId]: data.users }));
        };

        socket.on('server-voice-states', handleServerVoiceStates);
        socket.on('voice-channel-users-update', handleChannelUpdate);
        // Форсируем свежий снапшот при монтировании — компонент мог смонтироваться
        // позже первоначальной загрузки приложения и пропустить исходный снапшот.
        servers.forEach(s => socket.emit('join-server', s._id));

        return () => {
            socket.off('server-voice-states', handleServerVoiceStates);
            socket.off('voice-channel-users-update', handleChannelUpdate);
        };
    }, [socket, servers]);

    const friendIds = useMemo(() => new Set(friends.map(f => f._id)), [friends]);

    const voiceGroups = useMemo<VoiceGroup[]>(() => {
        const groups: VoiceGroup[] = [];
        for (const server of servers) {
            for (const channel of server.channels) {
                if (channel.type !== 'voice') continue;
                const occupants = voiceStates[channel._id];
                if (!occupants || occupants.length === 0) continue;
                const friendsHere = occupants.filter(u => friendIds.has(u._id));
                if (friendsHere.length === 0) continue;
                groups.push({ server, channelId: channel._id, channelName: channel.name, users: friendsHere });
            }
        }
        return groups;
    }, [servers, voiceStates, friendIds]);

    // Друзья в голосовых каналах не должны дублироваться карточкой активности —
    // голосовое присутствие важнее и уже показывает их в отдельной карточке.
    const voiceFriendIds = useMemo(() => {
        const ids = new Set<string>();
        voiceGroups.forEach(g => g.users.forEach(u => ids.add(u._id)));
        return ids;
    }, [voiceGroups]);

    const activeFriends = friends.filter(f => f.activity && (f.activity.name || f.activity.details) && !voiceFriendIds.has(f._id));

    const handleVoiceGroupClick = (group: VoiceGroup) => {
        window.dispatchEvent(new CustomEvent('select-server', { detail: { serverId: group.server._id, channelId: group.channelId } }));
    };

    if (activeFriends.length === 0 && voiceGroups.length === 0) {
        if (variant === 'mobile-row') return null;
        return (
            <div className="active-contacts-sidebar panel-hero empty">
                <div className="panel-hero-bg" aria-hidden="true">
                    <div className="blob cyan" />
                    <div className="blob purple" />
                    <div className="blob pink" />
                </div>
                <h3 className="section-title">Активные контакты</h3>
                <div className="empty-active-state">
                    <div className="empty-active-icon">
                        <svg width={48 * interfaceScale} height={48 * interfaceScale} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 12h.01M9 12h.01M15 12h.01M18 12h.01" />
                            <rect x="2" y="6" width="20" height="12" rx="2" />
                            <path d="M12 12h.01" />
                        </svg>
                    </div>
                    <h4>Тишина...</h4>
                    <p>Пока никто не играет, не стримит и не сидит в голосовом. Когда друзья появятся тут — вы это увидите!</p>
                </div>
            </div>
        );
    }

    if (variant === 'mobile-row') {
        return (
            <div className="active-contacts-mobile-row">
                <div className="active-contacts-mobile-title">АКТИВНЫЕ КОНТАКТЫ</div>
                <div className="active-contacts-list-horizontal custom-scrollbar">
                    {voiceGroups.map(group => (
                        <div
                            key={group.channelId}
                            className="active-card-mobile glass-panel-base"
                            data-type="voice"
                            onClick={() => handleVoiceGroupClick(group)}
                        >
                            <div className="active-avatar-stack-mobile">
                                {group.users.slice(0, 2).map((u, i) => (
                                    <UserAvatar key={u._id} user={u} size={28 * interfaceScale} className="active-avatar" style={{ zIndex: 2 - i }} />
                                ))}
                            </div>
                            <div className="active-info-mobile">
                                <div className="active-username-mobile">
                                    {group.users.map(u => u.username).join(', ')}
                                </div>
                                <div className="active-sub-mobile">В голосовом</div>
                            </div>
                        </div>
                    ))}
                    {activeFriends.map(friend => (
                        <div
                            key={friend._id}
                            className="active-card-mobile glass-panel-base"
                            data-type={friend.activity?.type || 'playing'}
                            onClick={(e) => onUserClick(friend._id, e)}
                        >
                            <div className="active-avatar-wrap-mobile">
                                <UserAvatar user={friend} size={28 * interfaceScale} />
                                <div className={`status-indicator ${friend.status}`}></div>
                            </div>
                            <div className="active-info-mobile">
                                <div className="active-username-mobile">{friend.username}</div>
                                <div className="active-sub-mobile">
                                    {friend.activity?.type === 'streaming' ? 'Стримит' : (friend.activity?.name || 'Играет')}
                                </div>
                            </div>
                        </div>
                    ))}
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
        <div className="active-contacts-sidebar panel-hero">
            <div className="panel-hero-bg" aria-hidden="true">
                <div className="blob cyan" />
                <div className="blob purple" />
                <div className="blob pink" />
            </div>
            <h3 className="section-title">Активные контакты</h3>
            <div className="active-contacts-list custom-scrollbar">
                {voiceGroups.map(group => (
                    <div
                        key={group.channelId}
                        className="active-card glass-panel-base"
                        data-type="voice"
                        onClick={() => handleVoiceGroupClick(group)}
                    >
                        <div className="active-card-header">
                            <div className="active-user-info">
                                <div className="active-voice-avatar-stack">
                                    {group.users.slice(0, 3).map((u, i) => (
                                        <UserAvatar key={u._id} user={u} size={32 * interfaceScale} className="active-avatar active-voice-avatar" style={{ zIndex: 3 - i }} />
                                    ))}
                                    {group.users.length > 3 && (
                                        <div className="active-voice-avatar-more">+{group.users.length - 3}</div>
                                    )}
                                </div>
                                <div className="active-user-details">
                                    <span className="active-username">
                                        {group.users.map(u => u.displayName || u.username).join(', ')}
                                    </span>
                                    <span className="active-activity-name">{group.server.name} · {group.channelName}</span>
                                </div>
                            </div>
                            <div className="active-voice-icon">
                                <SpeakerIcon size={18 * interfaceScale} />
                            </div>
                        </div>
                        <div className="active-card-content">
                            <div className="active-game-info active-voice-info">
                                <div className="active-game-icon active-voice-channel-icon">
                                    <SpeakerIcon size={20 * interfaceScale} />
                                </div>
                                <div className="active-game-details">
                                    <div className="active-game-title">{group.channelName}</div>
                                    <div className="active-game-subtitle">В голосовом на «{group.server.name}»</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {activeFriends.map(friend => (
                    <div
                        key={friend._id}
                        className="active-card glass-panel-base"
                        data-type={friend.activity?.type || 'playing'}
                        onClick={(e) => onUserClick(friend._id, e)}
                    >
                        {friend.activity?.assets?.largeImage && (
                            <div
                                className="active-card-glow"
                                style={{ backgroundImage: `url(${getFullUrl(friend.activity.assets.largeImage)})` }}
                            />
                        )}
                        <div className="active-card-header">
                            <div className="active-user-info">
                                <UserAvatar user={friend} size={32 * interfaceScale} className="active-avatar" />
                                <div className="active-user-details">
                                    <span className="active-username">{friend.displayName || friend.username}</span>
                                    <span className="active-activity-name">
                                        {friend.activity?.name} — {friend.activity?.timestamps?.start ? formatTime(friend.activity.timestamps.start) : 'только что'}
                                    </span>
                                </div>
                            </div>
                            {friend.activity?.assets?.largeImage && (
                                <div className="active-game-mini-icon">
                                    <img src={getFullUrl(friend.activity.assets.largeImage)!} alt="" />
                                </div>
                            )}
                        </div>

                        <div className="active-card-content">
                            <div className="active-game-info">
                                {friend.activity?.assets?.largeImage && (
                                    <div className="active-game-icon">
                                        <img src={getFullUrl(friend.activity.assets.largeImage)!} alt="" />
                                    </div>
                                )}
                                <div className="active-game-details">
                                    <div className="active-game-title">
                                        {friend.activity?.name}
                                    </div>
                                    <div className="active-game-subtitle">
                                        {friend.activity?.state || (friend.activity?.type === 'playing' ? 'Играет' : 'В эфире')}
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
