import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Server, User, Role } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { CloseIcon, PlusIcon } from './Icons';
import { usePermissions } from '../hooks/usePermissions';
import './UserProfileCard.css';

interface UserProfileCardProps {
    userId: string;
    onClose: () => void;
    serverId?: string; // Optional context for roles (deprecated by currentServer but kept for compatibility)
    currentUser?: User | null;
    currentServer?: Server | null;
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({ userId, onClose, serverId, currentUser, currentServer }) => {
    const [profileData, setProfileData] = useState<{
        user: User;
        mutualServers: Array<{ _id: string; name: string; icon: string }>;
        mutualFriends: User[];
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'info' | 'mutualFriends' | 'mutualServers'>('info');
    const [memberRoles, setMemberRoles] = useState<Role[]>([]);
    const [allServerRoles, setAllServerRoles] = useState<Role[]>([]);
    const [isManagingRoles, setIsManagingRoles] = useState(false);

    // Check permissions
    const { hasPermission } = usePermissions(currentUser || null, currentServer || null);
    const canManageRoles = hasPermission('MANAGE_ROLES');
    const canManageServer = hasPermission('MANAGE_SERVER');
    const canEditRoles = (canManageRoles || canManageServer) && serverId;

    useEffect(() => {
        if (serverId && canEditRoles) {
            // Check if currentServer has fully populated roles
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
        const newRoles = hasRole
            ? memberRoles.filter(r => r._id !== roleId)
            : [...memberRoles, allServerRoles.find(r => r._id === roleId)!];

        // Optimistic update
        setMemberRoles(newRoles);

        try {
            await axios.put(`/api/servers/${serverId}/members/${userId}/roles`, {
                roles: newRoles.map(r => r._id)
            });
        } catch (err) {
            console.error('Failed to update roles', err);
            // In a real app, we should revert on error
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            if (!userId) return;

            setLoading(true);
            setError('');

            try {
                // Fetch basic user profile
                const response = await axios.get(`/api/users/profile/${userId}`);
                setProfileData(response.data);

                // Load member data if in server (for roles)
                if (serverId) {
                    try {
                        const memberRes = await axios.get(`/api/servers/${serverId}/members/${userId}`);
                        if (memberRes.data.roles) {
                            // Ensure we only keep valid role objects and sort them
                            const validRoles = memberRes.data.roles.filter((r: any) => r && typeof r === 'object' && r._id);
                            validRoles.sort((a: Role, b: Role) => (b.position || 0) - (a.position || 0));
                            setMemberRoles(validRoles);
                        }
                    } catch (memberErr) {
                        console.error('Failed to fetch member info:', memberErr);
                        setMemberRoles([]);
                    }
                } else {
                    setMemberRoles([]);
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

    if (loading) return (
        <div className="user-profile-overlay" onClick={onClose}>
            <div className="user-profile-card loading" onClick={e => e.stopPropagation()}>
                <div className="loading-spinner"></div>
            </div>
        </div>
    );

    if (error || !profileData) return (
        <div className="user-profile-overlay" onClick={onClose}>
            <div className="user-profile-card error" onClick={e => e.stopPropagation()}>
                <p>{error || 'Ошибка'}</p>
                <button onClick={onClose}>Закрыть</button>
            </div>
        </div>
    );

    const { user, mutualServers, mutualFriends } = profileData;

    return (
        <div className="user-profile-overlay" onClick={onClose}>
            <div className="user-profile-card" onClick={e => e.stopPropagation()}>
                <div
                    className="profile-banner"
                    style={{
                        backgroundColor: '#5865f2',
                        backgroundImage: user.banner ? `url(${getFullUrl(user.banner)})` : 'none',
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
                        <div className={`profile-avatar ${user.status}`}>
                            {getAvatarUrl(user.avatar) ? (
                                <img src={getAvatarUrl(user.avatar)!} alt={user.username} />
                            ) : (
                                <span>{user.username.charAt(0).toUpperCase()}</span>
                            )}
                            <div className={`profile-status-indicator ${user.status}`}></div>
                        </div>
                    </div>

                    <div className="profile-badge-container">
                        {/* Badges could go here */}
                    </div>
                </div>

                <div className="profile-body">
                    <div className="profile-names">
                        <span className="profile-username">{user.username}</span>
                    </div>

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
                                    <p className="bio-text">{user.bio || 'Пользователь ничего не рассказал о себе.'}</p>
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
                                                                // Check if member already has this role (handle both object and ID comparison)
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
            </div>
        </div>
    );
};

export default UserProfileCard;
