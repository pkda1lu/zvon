import React, { useState, useEffect } from 'react';
import { Server, User } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import MemberContextMenu from './MemberContextMenu';
import UserAvatar from './UserAvatar';
import UserBadges from './UserBadges';
import { useVoice } from '../contexts/VoiceContext';
import { useSocket } from '../contexts/SocketContext';
import './panel-hero.css';
import './ServerMembers.css';

const ACTIVITY_VERBS: Record<string, string> = {
    playing: 'Играет в', streaming: 'В эфире:', listening: 'Слушает', watching: 'Смотрит', competing: 'Соревнуется в', sitting: 'Сидит в'
};

const LiveBadge: React.FC = () => (
    <span className="live-badge nano" style={{ marginLeft: 6 }}>ЭФИР</span>
);

interface ServerMembersProps {
    server: Server;
    onUserClick: (userId: string, event?: React.MouseEvent) => void;
    onBack?: () => void;
    isMobile?: boolean;
}

const ServerMembers: React.FC<ServerMembersProps> = ({ server, onUserClick, onBack, isMobile }) => {
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, user: User } | null>(null);
    const { userStates } = useVoice();
    const { socket } = useSocket();
    const isLive = (userId: string) => !!userStates.get(userId)?.isScreenSharing;

    // Живой ростер голосовых каналов сервера — для "событий сервера" (кто с кем общается в войсе).
    const [voiceStates, setVoiceStates] = useState<Record<string, User[]>>({});
    useEffect(() => {
        if (!socket) return;
        const onSnapshot = (states: Record<string, User[]>) => setVoiceStates(states);
        const onUpdate = (data: { channelId: string; users: User[] }) => setVoiceStates(prev => ({ ...prev, [data.channelId]: data.users }));
        socket.on('server-voice-states', onSnapshot);
        socket.on('voice-channel-users-update', onUpdate);
        return () => {
            socket.off('server-voice-states', onSnapshot);
            socket.off('voice-channel-users-update', onUpdate);
        };
    }, [socket]);

    const showActivity = server.showMemberActivity !== false;

    // До 3 строк "событий" пользователя: текущая активность + голосовой канал (с кем).
    const getActivityLines = (u: User): string[] => {
        if (!showActivity) return [];
        const lines: string[] = [];
        if (u.activity?.name) {
            const verb = ACTIVITY_VERBS[u.activity.type as string] || 'Занимается:';
            lines.push(`${verb} ${u.activity.name}`);
        }
        const voiceChannelId = Object.keys(voiceStates).find(cid => (voiceStates[cid] || []).some(vu => vu._id === u._id));
        if (voiceChannelId) {
            const channel = (server.channels || []).find(c => c._id === voiceChannelId);
            const others = (voiceStates[voiceChannelId] || []).filter(vu => vu._id !== u._id).map(vu => vu.username);
            const suffix = others.length > 0 ? ` с ${others.slice(0, 2).join(' и ')}` : '';
            lines.push(`Общается в #${channel?.name || 'войсе'}${suffix}`);
        }
        return lines.slice(0, 3);
    };

    const handleContextMenu = (e: React.MouseEvent, user: User) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, user });
    };

    // Значок сервера показываем, только если пользователь выбрал показывать именно значок ЭТОГО сервера —
    // его данные (текст/иконка/цвет) у нас уже есть локально, не нужно резолвить другие сервера.
    const getServerTag = (u: User) => {
        if (u.displayedTag?.type !== 'serverTag') return undefined;
        const tagServerId = typeof u.displayedTag.server === 'string' ? u.displayedTag.server : (u.displayedTag.server as any)?._id;
        if (String(tagServerId) !== String(server._id)) return undefined;
        return server.tag?.text ? server.tag : undefined;
    };

    return (
        <div className="server-members panel-hero">
            <div className="panel-hero-bg" aria-hidden="true">
                <div className="blob cyan" />
                <div className="blob purple" />
                <div className="blob pink" />
            </div>
            {isMobile && onBack && (
                <div className="members-mobile-header">
                    <button className="mobile-close-btn" onClick={onBack}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    </button>
                    <span>Участники</span>
                </div>
            )}
            <div className="members-list">
                {(() => {
                    // Get all server roles sorted by position
                    const serverRoles = [...(server.roles || [])].sort((a, b) => (b.position || 0) - (a.position || 0));

                    const onlineMembers = server.members.filter(m => m.user.status !== 'offline');
                    const offlineMembers = server.members.filter(m => m.user.status === 'offline');

                    // Map role ID to members for HOISTED roles
                    const roleGroups: Record<string, typeof server.members> = {};
                    const noRoleMembers: typeof server.members = [];

                    onlineMembers.forEach(member => {
                        const memberRoleIds = member.roles || [];
                        const memberRoles = serverRoles.filter(r => memberRoleIds.includes(r._id));
                        memberRoles.sort((a, b) => (b.position || 0) - (a.position || 0));

                        // Find highest HOISTED role
                        const hoistedRole = memberRoles.find(r => r.hoist);

                        if (hoistedRole) {
                            if (!roleGroups[hoistedRole._id]) {
                                roleGroups[hoistedRole._id] = [];
                            }
                            roleGroups[hoistedRole._id].push(member);
                        } else {
                            noRoleMembers.push(member);
                        }
                    });

                    return (
                        <>
                            {serverRoles.map(role => {
                                const membersInRole = roleGroups[role._id];
                                if (!membersInRole || membersInRole.length === 0 || !role.hoist) return null;

                                return (
                                    <div key={role._id || role.name} className="member-group">
                                        <div className="group-header">{role.name.toUpperCase()} — {membersInRole.length}</div>
                                        {membersInRole.map(member => {
                                            const memberRoleIds = member.roles || [];
                                            const memberRoles = serverRoles.filter(r => memberRoleIds.includes(r._id));
                                            memberRoles.sort((a, b) => (b.position || 0) - (a.position || 0));

                                            const colorRole = memberRoles.find(r => r.color && r.color !== '#99AAB5' && r.color !== '#99aab5');
                                            const memberColor = colorRole ? colorRole.color : 'inherit';

                                            return (
                                                <div
                                                    key={member.user._id}
                                                    className="member-item"
                                                    onClick={(e) => onUserClick(member.user._id, e)}
                                                    onContextMenu={(e) => handleContextMenu(e, member.user)}
                                                >
                                                    <div className="member-avatar-wrap">
                                                        <UserAvatar
                                                            user={member.user}
                                                            size={32}
                                                            className="member-avatar"
                                                        />
                                                        <div className={`status-indicator ${member.user.activity?.type === 'streaming' ? 'streaming' : member.user.status}`}></div>
                                                    </div>
                                                    <div className="member-info">
                                                        <div className="member-name-row">
                                                            <span className="member-name" style={{ color: memberColor }}>
                                                                {member.nickname || member.user.username}
                                                            </span>
                                                            <UserBadges badges={member.user.badges} serverTag={getServerTag(member.user)} size={14} />
                                                            {isLive(member.user._id) && <LiveBadge />}
                                                        </div>
                                                        {getActivityLines(member.user).map((line, i) => (
                                                            <div className="member-activity" key={i}>
                                                                {i === 0 && member.user.activity?.assets?.largeImage && (
                                                                    <img src={getFullUrl(member.user.activity.assets.largeImage)!} alt="" className="member-activity-icon" />
                                                                )}
                                                                <span className="activity-text">{line}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {noRoleMembers.length > 0 && (
                                <div className="member-group">
                                    <div className="group-header">ОНЛАЙН — {noRoleMembers.length}</div>
                                    {noRoleMembers.map(member => {
                                        const memberRoleIds = member.roles || [];
                                        const memberRoles = serverRoles.filter(r => memberRoleIds.includes(r._id));
                                        memberRoles.sort((a, b) => b.position - a.position);
                                        const colorRole = memberRoles.find(r => r.color && r.color !== '#99AAB5' && r.color !== '#99aab5');
                                        const memberColor = colorRole ? colorRole.color : 'inherit';

                                        return (
                                            <div
                                                key={member.user._id}
                                                className="member-item"
                                                onClick={(e) => onUserClick(member.user._id, e)}
                                                onContextMenu={(e) => handleContextMenu(e, member.user)}
                                            >
                                                <div className="member-avatar-wrap">
                                                    <UserAvatar
                                                        user={member.user}
                                                        size={32}
                                                        className="member-avatar"
                                                    />
                                                    <div className={`status-indicator ${member.user.activity?.type === 'streaming' ? 'streaming' : member.user.status}`}></div>
                                                </div>
                                                <div className="member-info">
                                                    <div className="member-name-row">
                                                        <span className="member-name" style={{ color: memberColor }}>{member.nickname || member.user.username}</span>
                                                        <UserBadges badges={member.user.badges} serverTag={getServerTag(member.user)} size={14} />
                                                        {isLive(member.user._id) && <LiveBadge />}
                                                    </div>
                                                    {getActivityLines(member.user).map((line, i) => (
                                                        <div className="member-activity" key={i}>
                                                            {i === 0 && member.user.activity?.assets?.largeImage && (
                                                                <img src={getFullUrl(member.user.activity.assets.largeImage)!} alt="" className="member-activity-icon" />
                                                            )}
                                                            <span className="activity-text">{line}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {offlineMembers.length > 0 && (
                                <div className="member-group">
                                    <div className="group-header">ОФФЛАЙН — {offlineMembers.length}</div>
                                    {offlineMembers.map(member => {
                                        const memberRoleIds = member.roles || [];
                                        const memberRoles = serverRoles.filter(r => memberRoleIds.includes(r._id));
                                        memberRoles.sort((a, b) => b.position - a.position);
                                        const colorRole = memberRoles.find(r => r.color && r.color !== '#99AAB5' && r.color !== '#99aab5');
                                        const memberColor = colorRole ? colorRole.color : 'inherit';

                                        return (
                                            <div
                                                key={member.user._id}
                                                className="member-item offline"
                                                onClick={(e) => onUserClick(member.user._id, e)}
                                                onContextMenu={(e) => handleContextMenu(e, member.user)}
                                            >
                                                <div className="member-avatar-wrap">
                                                    <UserAvatar
                                                        user={member.user}
                                                        size={32}
                                                        className="member-avatar"
                                                    />
                                                    <div className={`status-indicator ${member.user.activity?.type === 'streaming' ? 'streaming' : member.user.status}`}></div>
                                                </div>
                                                <div className="member-name-row">
                                                    <span className="member-name" style={{ color: memberColor }}>
                                                        {member.nickname || member.user.username}
                                                    </span>
                                                    <UserBadges badges={member.user.badges} serverTag={getServerTag(member.user)} size={14} />
                                                    {isLive(member.user._id) && <LiveBadge />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    );
                })()}
            </div>
            {contextMenu && (
                <MemberContextMenu
                    user={contextMenu.user}
                    server={server}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    onOpenProfile={onUserClick}
                    onMention={(username) => window.dispatchEvent(new CustomEvent('zvon-mention-user', { detail: { username } }))}
                />
            )}
        </div>
    );
};

export default ServerMembers;
