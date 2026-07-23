import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { motion } from 'framer-motion';
import { PlusIcon, CheckIcon } from './Icons';
import {
  popoverVariants,
  popoverTransition,
  modalPopVariants,
  modalPopTransition,
} from '../animations/transitions';
import ProfilePreview from './ProfilePreview';
import './UserProfileCard.css';

interface UserProfileCardProps {
    userId: string;
    onClose: () => void;
    serverId?: string;
    position?: { x: number, y: number } | null;
    onUserClick?: (userId: string, event?: React.MouseEvent) => void;
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({ userId, onClose, serverId, position, onUserClick }) => {
    const { socket } = useSocket();
    const { user: currentUser } = useAuth();
    const { alert, confirm } = useDialog();
    const [profileData, setProfileData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [memberData, setMemberData] = useState<any>(null);
    const [server, setServer] = useState<any>(null);
    
    // For handling popout to full modal transition
    const [forceFull, setForceFull] = useState(false);
    // Локальный оверрайд serverId: клик по аватарке в полном профиле на сервере снимает привязку к серверу.
    const [localServerId, setLocalServerId] = useState(serverId);
    useEffect(() => { setLocalServerId(serverId); }, [serverId, userId]);
    const [showBotServerSelect, setShowBotServerSelect] = useState(false);
    const [userServers, setUserServers] = useState<any[]>([]);

    const cardRef = useRef<HTMLDivElement>(null);
    const [adjustedPos, setAdjustedPos] = useState({ top: position?.y || 0, left: (position?.x || 0) + 20 });
    const [isVisible, setIsVisible] = useState(false);

    const isPopout = position && !forceFull;

    useEffect(() => {
        if (!isPopout || !cardRef.current) return;

        let isDisposed = false;

        const updatePosition = () => {
            if (!cardRef.current || isDisposed) return;
            const rect = cardRef.current.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const winW = window.innerWidth;
            const winH = window.innerHeight;

            let finalX = position.x + 20;
            let finalY = position.y;

            if (finalX + rect.width > winW - 20) {
                finalX = position.x - rect.width - 20;
            }
            if (finalY + rect.height > winH - 20) {
                finalY = position.y - rect.height;
            }

            if (finalY + rect.height > winH - 10) finalY = winH - rect.height - 10;
            if (finalY < 10) finalY = 10;
            if (finalX < 10) finalX = 10;
            if (finalX + rect.width > winW - 10) finalX = winW - rect.width - 10;

            setAdjustedPos({ top: finalY, left: finalX });
            setIsVisible(true);
        };

        updatePosition();
        const t1 = setTimeout(updatePosition, 30);
        const t2 = setTimeout(updatePosition, 100);
        const t3 = setTimeout(updatePosition, 300);

        return () => {
            isDisposed = true;
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [position, isPopout, profileData, loading]);

    useEffect(() => {
        if (socket && userId) {
            const handleUserUpdate = (updatedUser: any) => {
                if (updatedUser._id === userId) {
                    setProfileData((prev: any) => prev ? { ...prev, user: { ...prev.user, ...updatedUser } } : prev);
                }
            };
            socket.on('user-updated', handleUserUpdate);
            return () => { socket.off('user-updated', handleUserUpdate); };
        }
    }, [socket, userId]);

    const fetchProfile = async () => {
        if (!userId) return;
        setLoading(true);
        setError('');
        try {
            const response = await axios.get(`/api/users/profile/${userId}`);
            setProfileData(response.data);
            if (localServerId) {
                try {
                    const [memberRes, serverRes] = await Promise.all([
                        axios.get(`/api/servers/${localServerId}/members/${userId}`),
                        axios.get(`/api/servers/${localServerId}`)
                    ]);
                    setMemberData(memberRes.data);
                    setServer(serverRes.data);
                } catch (memberErr) {
                    setMemberData(null);
                    setServer(null);
                }
            } else {
                setMemberData(null);
                setServer(null);
            }

            if (response.data.user.isBot) {
                const serversRes = await axios.get('/api/servers/me');
                setUserServers(serversRes.data);
            }
        } catch (err) {
            setError('Не удалось загрузить профиль');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, [userId, localServerId]);

    const handleAddFriend = async () => {
        try {
            await axios.post('/api/friends/request', { userId });
            await alert('Запрос в друзья отправлен');
            fetchProfile();
        } catch (err: any) {
            await alert(err.response?.data?.message || 'Ошибка отправки запроса');
        }
    };

    const handleAcceptFriend = async (friendshipId: string) => {
        try {
            await axios.post(`/api/friends/accept/${friendshipId}`);
            await alert('Запрос принят');
            fetchProfile();
        } catch (err: any) {
            await alert('Ошибка при принятии запроса');
        }
    };

    const handleRemoveFriend = async (friendshipId: string) => {
        const confirmed = await confirm('Вы уверены, что хотите удалить этого пользователя из друзей?');
        if (!confirmed) return;
        try {
            await axios.delete(`/api/friends/${friendshipId}`);
            await alert('Пользователь удален из друзей');
            fetchProfile();
        } catch (err: any) {
            await alert('Ошибка при удалении из друзей');
        }
    };

    const handleAddBotToServer = async (targetServerId: string) => {
        try {
            await axios.post(`/api/bots/${userId}/add-to-server`, { serverId: targetServerId });
            await alert('Бот добавлен на сервер!');
            setShowBotServerSelect(false);
            fetchProfile();
        } catch (err: any) {
            await alert(err.response?.data?.message || 'Ошибка добавления бота');
        }
    };

    if (error) return (
        <div className={`user-profile-overlay ${isPopout ? 'transparent' : ''}`} onClick={onClose}>
            <div
                className={`user-profile-card error ${isPopout ? 'popout' : ''}`}
                onClick={e => e.stopPropagation()}
                style={isPopout ? {
                    position: 'absolute',
                    top: adjustedPos.top,
                    left: adjustedPos.left,
                    visibility: isVisible ? 'visible' : 'hidden',
                    opacity: isVisible ? 1 : 0
                } : undefined}
                ref={cardRef}
            >
                <p>{error}</p>
                <button onClick={onClose}>Закрыть</button>
            </div>
        </div>
    );

    if (loading || !profileData) return (
        <div className={`user-profile-overlay ${isPopout ? 'transparent' : ''}`} onClick={onClose}>
            <div
                className={`user-profile-card loading-skeleton ${isPopout ? 'popout' : ''}`}
                onClick={e => e.stopPropagation()}
                style={isPopout ? {
                    position: 'absolute',
                    top: adjustedPos.top,
                    left: adjustedPos.left,
                    visibility: isVisible ? 'visible' : 'hidden',
                    opacity: isVisible ? 1 : 0
                } : undefined}
                ref={cardRef}
            >
                <div className="profile-banner skeleton"></div>
                <div className="profile-header"><div className="profile-avatar-container"><div className="profile-avatar skeleton"></div></div></div>
                <div className="profile-body"><div className="skeleton-text large" style={{ width: '60%' }}></div></div>
            </div>
        </div>
    );

    const { user, mutualServers, mutualFriends, friendship, developments } = profileData;
    const isMe = currentUser?._id === userId;

    let type: 'full' | 'compact' | 'server-full' | 'server-compact' = 'full';
    if (isPopout) {
        type = localServerId ? 'server-compact' : 'compact';
    } else {
        type = localServerId ? 'server-full' : 'full';
    }

    const handleAvatarClick = () => {
        if (isPopout) {
            setForceFull(true);
        } else if (localServerId) {
            // Клик по аватарке в полном профиле на сервере -> открыть полный профиль без привязки к серверу.
            setLocalServerId(undefined);
        }
    };

    const actionButtons = !isMe ? (
        <>
            {user.isBot ? (
                <div className="bot-action-wrapper">
                    <button className="profile-action-btn primary" onClick={() => setShowBotServerSelect(!showBotServerSelect)}>
                        <PlusIcon size={16} />
                        <span>Добавить на сервер</span>
                    </button>
                    {showBotServerSelect && (
                        <div className="bot-server-selector">
                            {userServers.map(s => (
                                <div key={s._id} className="bot-server-item" onClick={() => handleAddBotToServer(s._id)}>
                                    {s.name}
                                </div>
                            ))}
                            {userServers.length === 0 && <div className="no-servers">Нет серверов для приглашения</div>}
                        </div>
                    )}
                </div>
            ) : (
                <>
                    {!friendship && (
                        <button className="profile-action-btn primary" onClick={handleAddFriend}>
                            <PlusIcon size={16} />
                            <span>В друзья</span>
                        </button>
                    )}
                    {friendship?.status === 'pending' && friendship.recipient === currentUser?._id && (
                        <button className="profile-action-btn success" onClick={() => handleAcceptFriend(friendship._id)}>
                            <CheckIcon size={16} />
                            <span>Принять</span>
                        </button>
                    )}
                    {friendship?.status === 'pending' && friendship.requester === currentUser?._id && (
                        <button className="profile-action-btn secondary disabled">
                            <span>Ожидание</span>
                        </button>
                    )}
                    {friendship?.status === 'accepted' && (
                        <button className="profile-action-btn friends-status" onClick={() => handleRemoveFriend(friendship._id)}>
                            <CheckIcon size={16} />
                            <span className="btn-text-content">Друзья</span>
                        </button>
                    )}
                </>
            )}
        </>
    ) : null;

    return (
        <div className={`user-profile-overlay ${isPopout ? 'transparent' : ''}`} onClick={onClose} style={{ zIndex: 4000 }}>
            <motion.div
                onClick={e => e.stopPropagation()}
                style={isPopout ? {
                    position: 'absolute',
                    top: adjustedPos.top,
                    left: adjustedPos.left,
                    visibility: isVisible ? 'visible' : 'hidden',
                    transformOrigin: position ? `${Math.max(0, position.x - adjustedPos.left)}px ${Math.max(0, position.y - adjustedPos.top)}px` : 'center',
                } : { display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}
                ref={cardRef}
                variants={isPopout ? popoverVariants : modalPopVariants}
                initial="initial"
                animate={isPopout ? (isVisible ? 'animate' : 'initial') : 'animate'}
                transition={isPopout ? popoverTransition : modalPopTransition}
            >
                <ProfilePreview
                    user={user}
                    memberData={memberData}
                    server={server}
                    type={type}
                    onClose={onClose}
                    onAvatarClick={handleAvatarClick}
                    mutualFriends={mutualFriends}
                    mutualServers={mutualServers}
                    developments={developments}
                    actionButtons={actionButtons}
                />
            </motion.div>
        </div>
    );
};

export default UserProfileCard;