import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Server, User, Role } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { CloseIcon, PlusIcon } from './Icons';
import { usePermissions } from '../hooks/usePermissions';
import { useSocket } from '../contexts/SocketContext';
import './UserProfileCard.css';

interface UserProfileCardProps {
    userId: string;
    onClose: () => void;
    serverId?: string;
    currentUser?: User | null;
    currentServer?: Server | null;
}

const ActivityTimer: React.FC<{ startTime: number }> = ({ startTime }) => {
    const [elapsed, setElapsed] = useState('');

    useEffect(() => {
        const update = () => {
            const diff = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(diff / 3600);
            const minutes = Math.floor((diff % 3600) / 60);
            const seconds = diff % 60;

            if (hours > 0) {
                setElapsed(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} прошло`);
            } else {
                setElapsed(`${minutes}:${seconds.toString().padStart(2, '0')} прошло`);
            }
        };

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    return <div className="activity-time">{elapsed}</div>;
};

const UserProfileCard: React.FC<UserProfileCardProps> = ({ userId, onClose, serverId, currentUser, currentServer }) => {
    const { socket } = useSocket();
    const [profileData, setProfileData] = useState<{
        user: User;
        mutualServers: Array<{ _id: string; name: string; icon: string }>;
        mutualFriends: User[];
    } | null>(null);
    const [loading, setLoading] = useState(true);

    // Listen for real-time updates to this user
    useEffect(() => {
        if (socket && userId) {
            const handleUserUpdate = (updatedUser: any) => {
                if (updatedUser._id === userId) {
                    console.log('[UserProfileCard] Real-time activity update for:', userId);
                    setProfileData(prev => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            user: { ...prev.user, ...updatedUser }
                        };
                    });
                }
            };

            socket.on('user-updated', handleUserUpdate);
            return () => {
                socket.off('user-updated', handleUserUpdate);
            };
        }
    }, [socket, userId]);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'info' | 'mutualFriends' | 'mutualServers'>('info');
    const [memberRoles, setMemberRoles] = useState<Role[]>([]);
    const [allServerRoles, setAllServerRoles] = useState<Role[]>([]);
    const [isManagingRoles, setIsManagingRoles] = useState(false);
    const [memberData, setMemberData] = useState<any>(null);

    const { hasPermission } = usePermissions(currentUser || null, currentServer || null);
    const canManageRoles = hasPermission('MANAGE_ROLES');
    const canManageServer = hasPermission('MANAGE_SERVER');
    const canEditRoles = (canManageRoles || canManageServer) && serverId;

    useEffect(() => {
        if (serverId && canEditRoles) {
            const hasPopulatedRoles = currentServer && currentServer.roles && currentServer.roles.length > 0 &&
                typeof currentServer.roles[0] === 'object' && 'name' in currentServer.roles[0];

            if (hasPopulatedRoles) {
                setAllServerRoles(currentServer.roles as Role[]);
            } else {
                axios.get(`/api/servers/${serverId}/roles`)
                    .then(res => setAllServerRoles(res.data))
                    .catch(err => console.error(err));
            }
        }
    }, [serverId, canEditRoles, currentServer]);

    const handleToggleRole = async (roleId: string) => {
        if (!serverId) return;

        const hasRole = memberRoles.some(r => r._id === roleId);
        const roleToAdd = allServerRoles.find(r => r._id === roleId);
        if (!hasRole && !roleToAdd) return;

        const newRolesArr = hasRole
            ? memberRoles.filter(r => r._id !== roleId)
            : [...memberRoles, roleToAdd!];

        setMemberRoles(newRolesArr);

        try {
            await axios.put(`/api/servers/${serverId}/members/${userId}/roles`, {
                roles: newRolesArr.map(r => r._id)
            });
        } catch (err) {
            console.error('Failed to update roles', err);
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            if (!userId) return;

            setLoading(true);
            setError('');

            try {
                console.log('[UserProfileCard] Fetching profile for:', userId);
                const response = await axios.get(`/api/users/profile/${userId}`);
                console.log('[UserProfileCard] Profile data received:', {
                    hasUser: !!response.data.user,
                    mutualFriends: response.data.mutualFriends?.length,
                    mutualServers: response.data.mutualServers?.length
                });
                setProfileData(response.data);

                if (serverId) {
                    try {
                        const memberRes = await axios.get(`/api/servers/${serverId}/members/${userId}`);
                        setMemberData(memberRes.data);
                        if (memberRes.data.roles) {
                            const validRoles = memberRes.data.roles.filter((r: any) => r && typeof r === 'object' && r._id);
                            const sortedRoles = [...validRoles].sort((a: Role, b: Role) => (b.position || 0) - (a.position || 0));
                            setMemberRoles(sortedRoles);
                        }
                    } catch (memberErr) {
                        console.error('Failed to fetch member info:', memberErr);
                        setMemberRoles([]);
                        setMemberData(null);
                    }
                } else {
                    setMemberRoles([]);
                    setMemberData(null);
                }

            } catch (err: any) {
                setError('Не удалось загрузить профиль');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [userId, serverId]);

    if (error) return (
        <div className="user-profile-overlay" onClick={onClose}>
            <div className="user-profile-card error" onClick={e => e.stopPropagation()}>
                <p>{error || 'Ошибка'}</p>
                <button onClick={onClose}>Закрыть</button>
            </div>
        </div>
    );

    return (
        <div className="user-profile-overlay" onClick={onClose}>
            <div className={`user-profile-card ${loading ? 'loading-skeleton' : ''}`} onClick={e => e.stopPropagation()}>
                {loading ? (
                    // Skeleton Loading State
                    <>
                        <div className="profile-banner skeleton"></div>
                        <div className="profile-header">
                            <div className="profile-avatar-container">
                                <div className="profile-avatar skeleton"></div>
                            </div>
                        </div>
                        <div className="profile-body">
                            <div className="profile-names skeleton-text large" style={{ width: '60%', marginBottom: '8px' }}></div>
                            <div className="profile-names skeleton-text" style={{ width: '40%' }}></div>

                            <div className="profile-divider"></div>

                            <div className="profile-tabs">
                                <div className="skeleton-text" style={{ width: '80px', height: '20px' }}></div>
                                <div className="skeleton-text" style={{ width: '80px', height: '20px' }}></div>
                            </div>

                            <div className="info-tab">
                                <div className="skeleton-text" style={{ width: '30%', marginBottom: '8px' }}></div>
                                <div className="skeleton-text" style={{ width: '90%', height: '40px', marginBottom: '16px' }}></div>

                                <div className="skeleton-text" style={{ width: '40%', marginBottom: '8px' }}></div>
                                <div className="skeleton-text" style={{ width: '60%', marginBottom: '16px' }}></div>

                                <div className="skeleton-text" style={{ width: '25%', marginBottom: '8px' }}></div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <div className="skeleton-text" style={{ width: '80px', height: '24px', borderRadius: '4px' }}></div>
                                    <div className="skeleton-text" style={{ width: '60px', height: '24px', borderRadius: '4px' }}></div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : profileData ? (() => {
                    const user = profileData.user;
                    const mutualServers = profileData.mutualServers || [];
                    const mutualFriends = profileData.mutualFriends || [];

                    return (
                        <>
                            <div
                                className="profile-banner"
                                style={{
                                    backgroundColor: '#5865f2',
                                    backgroundImage: (memberData?.banner || user.banner) ? `url(${getFullUrl(memberData?.banner || user.banner)})` : 'none',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center'
                                }}
                            >
                                <button className="profile-close-button" onClick={onClose}>
                                    <CloseIcon />
                                </button>
                            </div>

                            <div className="profile-header">
                                <div className="profile-avatar-container">
                                    <div className={`profile-avatar ${user.status} ${memberData?.avatar ? 'server-specific' : ''}`}>
                                        {getAvatarUrl(memberData?.avatar || user.avatar) ? (
                                            <img src={getAvatarUrl(memberData?.avatar || user.avatar)!} alt={user.username} />
                                        ) : (
                                            <span>{user.username.charAt(0).toUpperCase()}</span>
                                        )}
                                        <div className={`profile-status-indicator ${user.status}`}></div>
                                    </div>
                                </div>

                                <div className="profile-badge-container">
                                </div>
                            </div>

                            <div className="profile-body">
                                <div className="profile-names">
                                    {memberData?.nickname && <span className="profile-nickname">{memberData.nickname}</span>}
                                    <span className={memberData?.nickname ? "profile-username sub" : "profile-username"}>{user.username}</span>
                                </div>

                                {user.activity && (
                                    <div className="profile-activity-section">
                                        <h4 className="section-title">ЗАНИМАЕТСЯ:</h4>
                                        <div className="activity-content">
                                            {user.activity.assets?.largeImage && (
                                                <div className="activity-image-wrapper">
                                                    <img src={user.activity.assets.largeImage} alt={user.activity.name} className="activity-large-image" />
                                                </div>
                                            )}
                                            <div className="activity-details">
                                                <div className="activity-name">{user.activity.name}</div>
                                                <div className="activity-state">Играет в {user.activity.name}</div>
                                                {user.activity.timestamps?.start && (
                                                    <ActivityTimer startTime={user.activity.timestamps.start} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="profile-divider"></div>

                                <div className="profile-tabs">
                                    <button
                                        className={activeTab === 'info' ? 'active' : ''}
                                        onClick={() => setActiveTab('info')}
                                    >
                                        Информация
                                    </button>
                                    <button
                                        className={activeTab === 'mutualFriends' ? 'active' : ''}
                                        onClick={() => setActiveTab('mutualFriends')}
                                    >
                                        Общие друзья ({mutualFriends.length})
                                    </button>
                                    <button
                                        className={activeTab === 'mutualServers' ? 'active' : ''}
                                        onClick={() => setActiveTab('mutualServers')}
                                    >
                                        Общие серверы ({mutualServers.length})
                                    </button>
                                </div>

                                <div className="profile-tab-content">
                                    {activeTab === 'info' && (
                                        <div className="info-tab">
                                            <section>
                                                <h4>О СЕБЕ</h4>
                                                <p className="bio-text">{memberData?.bio || user.bio || 'Пользователь ничего не рассказал о себе.'}</p>
                                            </section>
                                            <section>
                                                <h4>ДАТА РЕГИСТРАЦИИ</h4>
                                                <p>{new Date(user.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                            </section>
                                            <section>
                                                <div className="roles-list-header">
                                                    <h4>РОЛИ</h4>
                                                    {serverId && canEditRoles && (
                                                        <button
                                                            className="add-role-btn"
                                                            onClick={() => setIsManagingRoles(!isManagingRoles)}
                                                            title={isManagingRoles ? "Завершить редактирование" : "Управление ролями"}
                                                        >
                                                            {isManagingRoles ? <CloseIcon size={14} /> : <PlusIcon size={14} />}
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="roles-list">
                                                    {serverId ? (
                                                        <>
                                                            {memberRoles.length > 0 ? (
                                                                memberRoles.map(role => (
                                                                    <div key={role._id} className="role-chip" style={{ borderColor: role.color }}>
                                                                        <span className="role-dot" style={{ backgroundColor: role.color }}></span>
                                                                        <span style={{ color: '#dcddde' }}>{role.name}</span>
                                                                        {isManagingRoles && (
                                                                            <span
                                                                                className="role-remove-icon"
                                                                                onClick={() => handleToggleRole(role._id)}
                                                                            >×</span>
                                                                        )}
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <div className="no-roles">Нет ролей</div>
                                                            )}
                                                            {isManagingRoles && (
                                                                <div className="role-selector-dropdown">
                                                                    {allServerRoles
                                                                        .filter(r => {
                                                                            if (!r || !r._id) return false;
                                                                            return !memberRoles.some(mr => {
                                                                                const mrId = typeof mr === 'string' ? mr : mr?._id;
                                                                                return mrId === r._id;
                                                                            });
                                                                        })
                                                                        .map(role => (
                                                                            <div
                                                                                key={role._id}
                                                                                className="role-select-item-mini"
                                                                                onClick={() => handleToggleRole(role._id)}
                                                                            >
                                                                                <span className="role-dot" style={{ backgroundColor: role.color }} />
                                                                                {role.name}
                                                                            </div>
                                                                        ))}
                                                                    {allServerRoles.filter(r => {
                                                                        if (!r || !r._id) return false;
                                                                        return !memberRoles.some(mr => {
                                                                            const mrId = typeof mr === 'string' ? mr : mr?._id;
                                                                            return mrId === r._id;
                                                                        });
                                                                    }).length === 0 && (
                                                                            <div className="no-roles-av">Нет доступных ролей</div>
                                                                        )}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="no-roles-server">Роли недоступны вне сервера</div>
                                                    )}
                                                </div>
                                            </section>
                                        </div>
                                    )}

                                    {activeTab === 'mutualFriends' && (
                                        <div className="mutual-list">
                                            {mutualFriends.length > 0 ? mutualFriends.map(friend => (
                                                <div key={friend._id} className="mutual-item">
                                                    <div className="mutual-avatar">
                                                        {getAvatarUrl(friend.avatar) ? (
                                                            <img src={getAvatarUrl(friend.avatar)!} alt={friend.username} />
                                                        ) : (
                                                            <span>{friend.username.charAt(0).toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                    <span>{friend.username}</span>
                                                </div>
                                            )) : (
                                                <div className="empty-mutual">Нет общих друзей.</div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'mutualServers' && (
                                        <div className="mutual-list">
                                            {mutualServers.length > 0 ? mutualServers.map(server => (
                                                <div key={server._id} className="mutual-item">
                                                    <div className="mutual-avatar server">
                                                        {server.icon ? (
                                                            <img src={getAvatarUrl(server.icon)!} alt={server.name} />
                                                        ) : (
                                                            <span>{server.name.charAt(0).toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                    <span>{server.name}</span>
                                                </div>
                                            )) : (
                                                <div className="empty-mutual">Нет общих серверов.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    );
                })() : null}
            </div>
        </div>
    );
};

export default UserProfileCard;
