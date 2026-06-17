import React, { useState } from 'react';
import { User } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import UserAvatar from './UserAvatar';
import UserBadges from './UserBadges';
import { MonitorIcon, CloseIcon } from './Icons';
import { useWindowSettings } from '../contexts/WindowSettingsContext';
import { formatClockTime } from '../utils/time';
import StreamerBlur from './StreamerBlur';
import './UserProfileCard.css';

// Секунды → «5 ч 30 мин» / «45 мин» / «меньше минуты».
const formatPlaytime = (seconds: number): string => {
    const total = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
    if (m > 0) return `${m} мин`;
    return 'меньше минуты';
};

interface ProfilePreviewProps {
    user: User;
    memberData?: {
        nickname?: string;
        bio?: string;
        avatar?: string;
        banner?: string;
        bannerColor?: string;
        roles?: any[];
        joinedAt?: string;
    } | null;
    server?: any;
    type: 'full' | 'compact' | 'server-full' | 'server-compact';
    onClose?: () => void;
    onAvatarClick?: () => void;
    
    // Additional data for full profile
    mutualFriends?: any[];
    mutualServers?: any[];
    developments?: { bots: any[], miniApps: any[] };
    
    // For actions
    actionButtons?: React.ReactNode;
}

const ActivityTimer: React.FC<{ startTime: number }> = ({ startTime }) => {
    const [elapsed, setElapsed] = useState('');
    React.useEffect(() => {
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

const ProfilePreview: React.FC<ProfilePreviewProps> = ({ 
    user, memberData, server, type, onClose, onAvatarClick, 
    mutualFriends = [], mutualServers = [], developments = { bots: [], miniApps: [] },
    actionButtons
}) => {
    const [activeTab, setActiveTab] = useState<'contacts' | 'activity' | 'developments'>('contacts');
    const { streamerModeEnabled, censorInfo } = useWindowSettings();

    const isServerType = type.startsWith('server-');
    const isCompact = type.endsWith('compact');

    const rawDisplayName = (isServerType && memberData?.nickname) || user.displayName || user.username;
    const displayName = rawDisplayName; 
    const bio = (isServerType && memberData?.bio) || user.bio;
    const avatar = (isServerType && memberData?.avatar) || user.avatar;
    const banner = (isServerType && memberData?.banner) || user.banner;
    const bannerColor = (isServerType && memberData?.bannerColor) || user.bannerColor || '#5865f2';
    const roles = (isServerType && memberData?.roles) || [];

    const statusColor = user.status === 'online' ? '#23a559' : 
                        user.status === 'away' ? '#f0b232' : 
                        user.status === 'busy' ? '#f23f42' : '#80848e';

    const lastActiveText = () => {
        if (user.status === 'online') return 'В сети';
        if (!user.lastActiveAt) return 'Оффлайн';
        const date = new Date(user.lastActiveAt);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const timeStr = formatClockTime(date);
        if (isToday) return `был(-а) в сети сегодня в ${timeStr}`;
        return `был(-а) в сети ${date.toLocaleDateString('ru-RU')} в ${timeStr}`;
    };

    const handleAvatarClick = () => {
        if (isCompact && onAvatarClick) {
            onAvatarClick();
        }
    };

    const handleFriendClick = (friendId: string) => {
        window.dispatchEvent(new CustomEvent('open-dm', { detail: { userId: friendId } }));
        if (onClose) onClose();
    };

    const handleServerClick = (serverId: string) => {
        window.dispatchEvent(new CustomEvent('select-server', { detail: { serverId } }));
        if (onClose) onClose();
    };

    const getActivityTitle = (type: string | null) => {
        switch (type) {
            case 'playing': return 'ИГРАЕТ В';
            case 'listening': return 'СЛУШАЕТ';
            case 'watching': return 'СМОТРИТ';
            case 'streaming': return 'В ЭФИРЕ';
            case 'competing': return 'СОРЕВНУЕТСЯ В';
            case 'sitting': return 'СИДИТ В';
            default: return 'ЗАНИМАЕТСЯ';
        }
    };

    const handleWatchStream = () => {
        const link = user.settings?.streamerMode?.streamerLink;
        if (link) {
            // @ts-ignore
            if (window.electron) window.electron.ipc.send('open-external-url', link);
            else window.open(link, '_blank');
        }
    };

    const compactProfileContent = (
        <div className="compact-profile-wrapper">
            <div 
                className="profile-banner" 
                style={{ 
                    backgroundColor: bannerColor, 
                    backgroundImage: banner ? `url(${getFullUrl(banner)})` : 'none', 
                    backgroundSize: 'cover',
                    height: '120px'
                }}
            >
            </div>

            <div className="profile-header">
                <div className="profile-avatar-container" onClick={handleAvatarClick} style={{ cursor: isCompact && onAvatarClick ? 'pointer' : 'default' }}>
                    <UserAvatar
                        user={{...user, avatar}}
                        size={80}
                        className={`profile-avatar ${user.status}`}
                        animate={true}
                    />
                    <div className="profile-status-indicator" style={{ backgroundColor: statusColor }}></div>
                </div>
                {actionButtons && <div className="profile-actions-header">{actionButtons}</div>}
            </div>

            <div className="profile-body" style={{ marginTop: '40px' }}>
                <div className="profile-names">
                    <div className="profile-names-top">
                        <span className="profile-nickname" style={{ fontSize: '20px' }}>{displayName}</span>
                        {user.isBot && <span className="bot-badge-mini">BOT</span>}
                        <UserBadges badges={user.badges} size={18} className="profile-badges" />
                    </div>
                    <span className="profile-username sub">
                        <StreamerBlur>@{user.username}</StreamerBlur>
                    </span>
                </div>

                <div className="profile-divider"></div>

                <div className="info-tab">
                    {bio && (
                        <section>
                            <h4>О СЕБЕ</h4>
                            <StreamerBlur>
                                <p className="bio-text">{bio}</p>
                            </StreamerBlur>
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

                    {user.primaryServer && typeof user.primaryServer === 'object' && (
                        <section>
                            <h4>ОСНОВНОЙ СЕРВЕР</h4>
                            <StreamerBlur>
                                <div className="mutual-item" onClick={() => handleServerClick((user.primaryServer as any)._id)} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
                                    <div className="mutual-avatar server">
                                        {user.primaryServer.icon ? <img src={getAvatarUrl(user.primaryServer.icon)!} alt="" /> : <span>{user.primaryServer.name.charAt(0).toUpperCase()}</span>}
                                    </div>
                                    <span>{user.primaryServer.name}</span>
                                </div>
                            </StreamerBlur>
                        </section>
                    )}

                    <section>
                        <h4>ДАТА РЕГИСТРАЦИИ</h4>
                        <p>{new Date(user.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </section>
                    
                    {isServerType && memberData && (
                        <section>
                            <h4>ДАТА ВСТУПЛЕНИЯ НА СЕРВЕР</h4>
                            <p>{new Date(memberData.joinedAt || user.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );

    if (isCompact) {
        return (
            <div className="user-profile-card popout" style={{ width: '340px' }}>
                {compactProfileContent}
            </div>
        );
    }

    return (
        <div className="user-profile-card modal-style full-profile panel-hero" style={{ width: '1100px', flexDirection: 'row', height: '720px', maxWidth: '95vw' }}>
            <div className="panel-hero-bg" aria-hidden="true">
                <div className="blob cyan" />
                <div className="blob purple" />
                <div className="blob pink" />
            </div>

            {onClose && (
                <div className="profile-close-wrapper" onClick={onClose}>
                    <div className="profile-close-circle">
                        <CloseIcon />
                    </div>
                    <span className="profile-close-text">ESC</span>
                </div>
            )}

            <div className="full-profile-left" style={{ width: '340px', borderRight: '1px solid var(--glass-border)', overflowY: 'auto' }}>
                {compactProfileContent}
            </div>
            
            <div className="full-profile-right" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '40px' }}>
                <div className="profile-tabs-sidebar">
                    <button className={`profile-tab-item ${activeTab === 'contacts' ? 'active' : ''}`} onClick={() => setActiveTab('contacts')}>
                        <span>Общие контакты</span>
                    </button>
                    {!user.isBot && (
                        <>
                            <button className={`profile-tab-item ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                                <span>Активность</span>
                            </button>
                            <button className={`profile-tab-item ${activeTab === 'developments' ? 'active' : ''}`} onClick={() => setActiveTab('developments')}>
                                <span>Разработки</span>
                            </button>
                        </>
                    )}
                </div>

                <div className="profile-tab-content-full">
                    {activeTab === 'contacts' && (
                        <div className="contacts-tab">
                            <section>
                                <h4 className="full-tab-section-title">ОБЩИЕ ДРУЗЬЯ ({mutualFriends.length})</h4>
                                <div className="mutual-list-members">
                                    {mutualFriends.length > 0 ? mutualFriends.map(friend => (
                                        <div key={friend._id} className="member-item" onClick={() => handleFriendClick(friend._id)}>
                                            <div className="member-avatar-wrap">
                                                <UserAvatar user={friend} size={32} className="member-avatar" />
                                                <div className={`status-indicator ${friend.status}`}></div>
                                            </div>
                                            <div className="member-info">
                                                <div className="member-name-row">
                                                    <span className="member-name"><StreamerBlur>{friend.username}</StreamerBlur></span>
                                                    <UserBadges badges={friend.badges} size={14} />
                                                </div>
                                            </div>
                                        </div>
                                    )) : <div className="empty-mutual">Нет общих друзей.</div>}
                                </div>
                            </section>
                            
                            <section style={{ marginTop: '30px' }}>
                                <h4 className="full-tab-section-title">ОБЩИЕ СЕРВЕРЫ ({mutualServers.length})</h4>
                                <div className="mutual-list-members">
                                    {mutualServers.length > 0 ? mutualServers.map(srv => (
                                        <div key={srv._id} className="member-item" onClick={() => handleServerClick(srv._id)}>
                                            <div className="member-avatar-wrap">
                                                <div className="member-avatar server" style={{ width: 32, height: 32, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {srv.icon ? <img src={getAvatarUrl(srv.icon)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 14, fontWeight: 800 }}>{srv.name.charAt(0).toUpperCase()}</span>}
                                                </div>
                                            </div>
                                            <div className="member-info">
                                                <div className="member-name-row">
                                                    <span className="member-name">{srv.name}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <div className="empty-mutual">Нет общих серверов.</div>}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'activity' && !user.isBot && (
                        <div className="activity-tab">
                            {user.activity ? (
                                <div className="profile-activity-section-full">
                                    <h4 className="section-title">СЕЙЧАС: {getActivityTitle(user.activity.type)}</h4>
                                    <div className="activity-content-full">
                                        {user.activity.assets?.largeImage && /[./]|^https?:/.test(user.activity.assets.largeImage) && (
                                            <div className="activity-image-wrapper-full">
                                                <img src={getFullUrl(user.activity.assets.largeImage)!} alt="" className="activity-large-image" />
                                            </div>
                                        )}
                                        <div className="activity-details-full">
                                            <div className="activity-name-full">{user.activity.name}</div>
                                            <div className="activity-state-full">{user.activity.state || `В приложении ${user.activity.name}`}</div>
                                            {user.activity.timestamps?.start && <ActivityTimer startTime={user.activity.timestamps.start} />}
                                            
                                            <div className="activity-actions-full" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                                {user.activity.miniAppData && (
                                                    <button 
                                                        className="profile-action-btn primary" 
                                                        style={{ height: '40px', width: 'auto', padding: '0 20px' }}
                                                        onClick={() => {
                                                            window.dispatchEvent(new CustomEvent('open-mini-app', { 
                                                                detail: { app: user.activity?.miniAppData } 
                                                            }));
                                                            if (onClose) onClose();
                                                        }}
                                                    >
                                                        <MonitorIcon size={16} />
                                                        <span>Запустить приложение</span>
                                                    </button>
                                                )}

                                                {user.activity.type === 'streaming' && user.settings?.streamerMode?.streamerLink && (
                                                    <button 
                                                        className="profile-action-btn primary" 
                                                        style={{ height: '40px', width: 'auto', padding: '0 20px', backgroundColor: 'var(--secondary-neon)' }}
                                                        onClick={handleWatchStream}
                                                    >
                                                        <MonitorIcon size={16} />
                                                        <span>Смотреть</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-mutual">Нет текущей активности.</div>
                            )}

                            {Array.isArray((user as any).topGames) && (user as any).topGames.length > 0 && (
                                <div className="profile-favorite-games" style={{ marginTop: '24px' }}>
                                    <h4 className="section-title">ЛЮБИМЫЕ ИГРЫ</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                                        {(user as any).topGames.map((g: any, i: number) => (
                                            <div key={`${g.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '10px 12px', border: '1px solid var(--glass-border)' }}>
                                                {g.image ? (
                                                    <img src={getFullUrl(g.image)!} alt="" style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'var(--glass-bg-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{g.name?.[0]?.toUpperCase() || '🎮'}</div>
                                                )}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{formatPlaytime(g.totalSeconds)}</div>
                                                </div>
                                                {i === 0 && <span style={{ fontSize: '16px' }} title="Любимая игра">⭐</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'developments' && !user.isBot && (
                        <div className="developments-tab">
                            <section>
                                <h4 className="full-tab-section-title">ЧАТ-БОТЫ ({developments.bots.length})</h4>
                                <div className="mutual-list-members">
                                    {developments.bots.length > 0 ? developments.bots.map(bot => (
                                        <div key={bot._id} className="member-item">
                                            <div className="member-avatar-wrap">
                                                <UserAvatar user={bot} size={32} className="member-avatar" />
                                                <div className="bot-badge-mini" style={{ position: 'absolute', bottom: -2, right: -2, fontSize: 8 }}>BOT</div>
                                            </div>
                                            <div className="member-info">
                                                <div className="member-name-row">
                                                    <span className="member-name"><StreamerBlur>{bot.username}</StreamerBlur></span>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <div className="empty-mutual">Нет опубликованных ботов.</div>}
                                </div>
                            </section>

                            <section style={{ marginTop: '30px' }}>
                                <h4 className="full-tab-section-title">МИНИ-ПРИЛОЖЕНИЯ ({developments.miniApps.length})</h4>
                                <div className="mutual-list-members">
                                    {developments.miniApps.length > 0 ? developments.miniApps.map(app => (
                                        <div key={app._id} className="member-item">
                                            <div className="member-avatar-wrap">
                                                <div className="member-avatar server" style={{ width: 32, height: 32, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {app.avatar ? <img src={getAvatarUrl(app.avatar)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 14, fontWeight: 800 }}>{app.name.charAt(0).toUpperCase()}</span>}
                                                </div>
                                            </div>
                                            <div className="member-info">
                                                <div className="member-name-row">
                                                    <span className="member-name">{app.name}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <div className="empty-mutual">Нет опубликованных мини-приложений.</div>}
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfilePreview;
