import React, { useState } from 'react';
import { User } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import UserAvatar from './UserAvatar';
import UserBadges from './UserBadges';
import UserProfileCard from './UserProfileCard';
import './UserProfileCard.css';

interface ProfilePreviewProps {
    user: User;
    memberData?: {
        nickname?: string;
        bio?: string;
        avatar?: string;
        banner?: string;
        roles?: any[];
    } | null;
    server?: any;
    type: 'full' | 'compact' | 'server-full' | 'server-compact';
    onClose?: () => void;
}

const ProfilePreview: React.FC<ProfilePreviewProps> = ({ user, memberData, server, type, onClose: onParentClose }) => {
    const [showModal, setShowModal] = useState(false);

    const isServerType = type.startsWith('server-');
    const isCompact = type.endsWith('compact');

    const displayName = (isServerType && memberData?.nickname) || user.displayName || user.username;
    const bio = (isServerType && memberData?.bio) || user.bio;
    const avatar = (isServerType && memberData?.avatar) || user.avatar;
    const banner = (isServerType && memberData?.banner) || user.banner;
    const roles = (isServerType && memberData?.roles) || [];

    const handleAvatarClick = () => {
        if (isCompact) {
            setShowModal(true);
        }
    };

    const statusColor = user.status === 'online' ? '#23a559' : 
                        user.status === 'away' ? '#f0b232' : 
                        user.status === 'busy' ? '#f23f42' : '#80848e';

    return (
        <>
            <div className={`user-profile-card ${isCompact ? 'popout' : 'modal-style'}`} style={{ 
                position: 'relative', 
                width: '100%', 
                maxWidth: isCompact ? '340px' : '600px',
                minHeight: bio ? 'unset' : '200px'
            }}>
                <div 
                    className="profile-banner" 
                    style={{ 
                        backgroundColor: '#5865f2', 
                        backgroundImage: banner ? `url(${getFullUrl(banner)})` : 'none', 
                        backgroundSize: 'cover',
                        height: isCompact ? '120px' : '180px'
                    }}
                >
                    {onParentClose && <button className="profile-close-button" onClick={onParentClose}>×</button>}
                </div>

                <div className="profile-header">
                    <div className="profile-avatar-container" onClick={handleAvatarClick} style={{ cursor: isCompact ? 'pointer' : 'default' }}>
                        <UserAvatar
                            user={{...user, avatar}}
                            size={isCompact ? 80 : 120}
                            className={`profile-avatar ${user.status}`}
                        />
                        <div className="profile-status-indicator" style={{ backgroundColor: statusColor }}></div>
                    </div>
                </div>

                <div className="profile-body">
                    <div className="profile-names">
                        <div className="profile-names-top">
                            <span className="profile-nickname" style={{ fontSize: isCompact ? '20px' : '24px' }}>{displayName}</span>
                            {user.isBot && <span className="bot-badge-mini">BOT</span>}
                            <UserBadges badges={user.badges} size={isCompact ? 18 : 22} className="profile-badges" />
                        </div>
                        <span className="profile-username sub">@{user.username}</span>
                    </div>

                    {bio || !isCompact || roles.length > 0 ? <div className="profile-divider"></div> : null}

                    <div className="info-tab">
                        {bio && (
                            <section>
                                <h4>О СЕБЕ</h4>
                                <p className="bio-text">{bio}</p>
                            </section>
                        )}

                        {isServerType && server && (
                            <section>
                                <h4>РОЛИ</h4>
                                <div className="roles-list">
                                    {roles.length > 0 ? (
                                        roles.map((rid: string) => {
                                            const role = server.roles?.find((r: any) => r._id === rid);
                                            if (!role) return null;
                                            return (
                                                <div key={rid} className="role-chip" style={{ borderColor: role.color + '44' }}>
                                                    <div className="role-dot" style={{ backgroundColor: role.color }} />
                                                    <span style={{ color: role.color || '#fff' }}>{role.name}</span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <span className="no-roles">Нет ролей</span>
                                    )}
                                </div>
                            </section>
                        )}

                        {!isCompact && (
                            <>
                                <section>
                                    <h4>ДАТА РЕГИСТРАЦИИ</h4>
                                    <p>{new Date(user.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                </section>
                                {user.primaryServer && typeof user.primaryServer === 'object' && (
                                    <section>
                                        <h4>ОСНОВНОЙ СЕРВЕР</h4>
                                        <div className="mutual-item" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
                                            <div className="mutual-avatar server">
                                                {user.primaryServer.icon ? <img src={getAvatarUrl(user.primaryServer.icon)!} alt="" /> : <span>{user.primaryServer.name.charAt(0).toUpperCase()}</span>}
                                            </div>
                                            <span>{user.primaryServer.name}</span>
                                        </div>
                                    </section>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {showModal && (
                <UserProfileCard 
                    userId={user._id} 
                    serverId={isServerType ? server?._id : undefined}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    );
};

export default ProfilePreview;
