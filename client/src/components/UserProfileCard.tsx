import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { CloseIcon, PlusIcon } from './Icons';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { Permissions, hasPermission, computePermissions } from '../utils/permissions';
import './UserProfileCard.css';

interface UserProfileCardProps {
    userId: string;
    onClose: () => void;
    serverId?: string;
}

const ActivityTimer: React.FC<{ startTime: number }> = ({ startTime }) => {
    const [elapsed, setElapsed] = useState('');
    useEffect(() => {
        const update = () => {
            const diff = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(diff / 3600);
            const minutes = Math.floor((diff % 3600) / 60);
            const seconds = diff % 60;
            if (hours > 0) setElapsed(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} прошло`);
            else setElapsed(`${minutes}:${seconds.toString().padStart(2, '0')} прошло`);
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [startTime]);
    return <div className="activity-time">{elapsed}</div>;
};

const UserProfileCard: React.FC<UserProfileCardProps> = ({ userId, onClose, serverId }) => {
    const { socket } = useSocket();
    const { user: currentUser } = useAuth();
    const [profileData, setProfileData] = useState<{
        user: User;
        mutualServers: Array<{ _id: string; name: string; icon: string }>;
        mutualFriends: User[];
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'info' | 'mutualFriends' | 'mutualServers'>('info');
    const [memberData, setMemberData] = useState<any>(null);
    const [server, setServer] = useState<any>(null);
    const [showRoleSelector, setShowRoleSelector] = useState(false);

    const userPerms = (currentUser && server) ? computePermissions(currentUser._id, server) : 0n;
    const canManageRoles = hasPermission(userPerms, Permissions.MANAGE_ROLES);

    useEffect(() => {
        if (socket && userId) {
            const handleUserUpdate = (updatedUser: any) => {
                if (updatedUser._id === userId) {
                    setProfileData(prev => prev ? { ...prev, user: { ...prev.user, ...updatedUser } } : prev);
                }
            };
            socket.on('user-updated', handleUserUpdate);
            return () => { socket.off('user-updated', handleUserUpdate); };
        }
    }, [socket, userId]);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!userId) return;
            setLoading(true);
            setError('');
            try {
                const response = await axios.get(`/api/users/profile/${userId}`);
                setProfileData(response.data);
                if (serverId) {
                    try {
                        const [memberRes, serverRes] = await Promise.all([
                            axios.get(`/api/servers/${serverId}/members/${userId}`),
                            axios.get(`/api/servers/${serverId}`)
                        ]);
                        setMemberData(memberRes.data);
                        setServer(serverRes.data);
                    } catch (memberErr) {
                        setMemberData(null);
                        setServer(null);
                    }
                }
            } catch (err) {
                setError('Не удалось загрузить профиль');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [userId, serverId]);

    if (error) return (
        <div className="user-profile-overlay" onClick={onClose}>
            <div className="user-profile-card error" onClick={e => e.stopPropagation()}>
                <p>{error}</p>
                <button onClick={onClose}>Закрыть</button>
            </div>
        </div>
    );

    if (loading || !profileData) return (
        <div className="user-profile-overlay" onClick={onClose}>
            <div className="user-profile-card loading-skeleton" onClick={e => e.stopPropagation()}>
                <div className="profile-banner skeleton"></div>
                <div className="profile-header"><div className="profile-avatar-container"><div className="profile-avatar skeleton"></div></div></div>
                <div className="profile-body"><div className="skeleton-text large" style={{ width: '60%' }}></div></div>
            </div>
        </div>
    );

    const handleToggleRole = async (roleId: string) => {
        if (!serverId || !userId || !memberData) return;
        const currentRoles = memberData.roles || [];
        const isRemoving = currentRoles.includes(roleId);
        const newRoles = isRemoving
            ? currentRoles.filter((id: string) => id !== roleId)
            : [...currentRoles, roleId];

        try {
            const res = await axios.put(`/api/servers/${serverId}/members/${userId}`, { roles: newRoles });
            setMemberData({ ...memberData, roles: res.data.roles });
        } catch (err) {
            alert('Не удалось обновить роли');
        }
    };

    const { user, mutualServers, mutualFriends } = profileData;

    return (
        <div className="user-profile-overlay" onClick={onClose}>
            <div className="user-profile-card" onClick={e => e.stopPropagation()}>
                <div className="profile-banner" style={{ backgroundColor: '#5865f2', backgroundImage: (memberData?.banner || user.banner) ? `url(${getFullUrl(memberData?.banner || user.banner)})` : 'none', backgroundSize: 'cover' }}>
                    <button className="profile-close-button" onClick={onClose}><CloseIcon /></button>
                </div>

                <div className="profile-header">
                    <div className="profile-avatar-container">
                        <div className={`profile-avatar ${user.status}`}>
                            {getAvatarUrl(memberData?.avatar || user.avatar) ? (
                                <img src={getAvatarUrl(memberData?.avatar || user.avatar)!} alt="" />
                            ) : (
                                <span>{user.username.charAt(0).toUpperCase()}</span>
                            )}
                            <div className={`profile-status-indicator ${user.status}`}></div>
                        </div>
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
                                        <img src={user.activity.assets.largeImage} alt="" className="activity-large-image" />
                                    </div>
                                )}
                                <div className="activity-details">
                                    <div className="activity-name">{user.activity.name}</div>
                                    <div className="activity-state">Играет в {user.activity.name}</div>
                                    {user.activity.timestamps?.start && <ActivityTimer startTime={user.activity.timestamps.start} />}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="profile-divider"></div>

                    <div className="profile-tabs">
                        <button className={activeTab === 'info' ? 'active' : ''} onClick={() => setActiveTab('info')}>Информация</button>
                        <button className={activeTab === 'mutualFriends' ? 'active' : ''} onClick={() => setActiveTab('mutualFriends')}>Общие друзья ({mutualFriends.length})</button>
                        <button className={activeTab === 'mutualServers' ? 'active' : ''} onClick={() => setActiveTab('mutualServers')}>Общие серверы ({mutualServers.length})</button>
                    </div>

                    <div className="profile-tab-content">
                        {activeTab === 'info' && (
                            <div className="info-tab">
                                <section><h4>О СЕБЕ</h4><p className="bio-text">{memberData?.bio || user.bio || 'Пользователь ничего не рассказал о себе.'}</p></section>

                                {serverId && server && (
                                    <section>
                                        <div className="roles-list-header">
                                            <h4>РОЛИ</h4>
                                            {canManageRoles && (
                                                <button className="add-role-btn" onClick={() => setShowRoleSelector(!showRoleSelector)}>
                                                    <PlusIcon size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="roles-list">
                                            {(memberData?.roles || []).length > 0 ? (
                                                memberData.roles.map((rid: string) => {
                                                    const role = server.roles.find((r: any) => r._id === rid);
                                                    if (!role) return null;
                                                    return (
                                                        <div key={rid} className="role-chip" style={{ borderColor: role.color + '44' }}>
                                                            <div className="role-dot" style={{ backgroundColor: role.color }} />
                                                            <span style={{ color: role.color || '#fff' }}>{role.name}</span>
                                                            {canManageRoles && (
                                                                <div className="role-remove-icon" onClick={() => handleToggleRole(rid)}>×</div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <span className="no-roles">Нет ролей</span>
                                            )}

                                            {showRoleSelector && (
                                                <div className="role-selector-dropdown">
                                                    {server.roles.filter((r: any) => r.name !== '@everyone' && !memberData.roles?.includes(r._id)).map((role: any) => (
                                                        <div key={role._id} className="role-select-item-mini" onClick={() => { handleToggleRole(role._id); setShowRoleSelector(false); }}>
                                                            <div className="role-dot" style={{ backgroundColor: role.color }} />
                                                            {role.name}
                                                        </div>
                                                    ))}
                                                    {server.roles.filter((r: any) => r.name !== '@everyone' && !memberData.roles?.includes(r._id)).length === 0 && (
                                                        <div className="no-roles-av">Нет доступных ролей</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                )}

                                <section><h4>ДАТА РЕГИСТРАЦИИ</h4><p>{new Date(user.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p></section>
                            </div>
                        )}
                        {activeTab === 'mutualFriends' && (
                            <div className="mutual-list">
                                {mutualFriends.length > 0 ? mutualFriends.map(friend => (
                                    <div key={friend._id} className="mutual-item">
                                        <div className="mutual-avatar">{getAvatarUrl(friend.avatar) ? <img src={getAvatarUrl(friend.avatar)!} alt="" /> : <span>{friend.username.charAt(0).toUpperCase()}</span>}</div>
                                        <span>{friend.username}</span>
                                    </div>
                                )) : <div className="empty-mutual">Нет общих друзей.</div>}
                            </div>
                        )}
                        {activeTab === 'mutualServers' && (
                            <div className="mutual-list">
                                {mutualServers.length > 0 ? mutualServers.map(server => (
                                    <div key={server._id} className="mutual-item">
                                        <div className="mutual-avatar server">{server.icon ? <img src={getAvatarUrl(server.icon)!} alt="" /> : <span>{server.name.charAt(0).toUpperCase()}</span>}</div>
                                        <span>{server.name}</span>
                                    </div>
                                )) : <div className="empty-mutual">Нет общих серверов.</div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserProfileCard;
