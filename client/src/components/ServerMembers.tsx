import React, { useState, useEffect } from 'react';
import { Server, User } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import MemberContextMenu from './MemberContextMenu';
import UserAvatar from './UserAvatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import { useVoice } from '../contexts/VoiceContext';
import { useSocket } from '../contexts/SocketContext';
import { useDominantColor } from '../utils/dominantColor';
import { SpeakerIcon } from './Icons';
import './panel-hero.css';
import './ServerMembers.css';

interface ServerEvent {
    key: string;
    kind: 'game' | 'stream' | 'voice';
    image: string | null;
    timestamp: number;
    text: string;
}

// Мягкая подложка "перехватывает" цвет иконки игры; для эфира — фиксированный фиолетовый;
// для войс-группы — нейтральный цвет по умолчанию.
const STREAM_RGB = '112, 0, 255';
const VOICE_RGB = '0, 229, 255';
const FALLBACK_RGB = '160, 160, 170';

// Иконка площадки стрима — берём фавикон домена из ссылки на стрим (любая платформа, без хардкода списка).
const getStreamPlatformIcon = (streamLink: string): string | null => {
    try {
        const hostname = new URL(streamLink).hostname;
        return `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
    } catch {
        return null;
    }
};

const ServerEventCard: React.FC<{ event: ServerEvent }> = ({ event }) => {
    const extractedRgb = useDominantColor(event.kind === 'game' ? getFullUrl(event.image) : null);
    const rgb = event.kind === 'stream' ? STREAM_RGB : event.kind === 'game' ? (extractedRgb || FALLBACK_RGB) : VOICE_RGB;

    return (
        <div className="server-event-item" style={{ background: `rgba(${rgb}, 0.1)` }}>
            {event.image ? (
                <img src={getFullUrl(event.image)!} alt="" className="server-event-icon" />
            ) : event.kind === 'voice' ? (
                <div className="server-event-icon-placeholder" style={{ background: `rgba(${rgb}, 0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SpeakerIcon size={18} color={`rgb(${rgb})`} />
                </div>
            ) : (
                <div className="server-event-icon-placeholder" style={{ background: `rgba(${rgb}, 0.25)` }} />
            )}
            <span className="server-event-text">{event.text}</span>
        </div>
    );
};

const ACTIVITY_VERBS: Record<string, string> = {
    playing: 'Играет в', streaming: 'В эфире:', listening: 'Слушает', watching: 'Смотрит', competing: 'Соревнуется в', sitting: 'Сидит в'
};

// Третье лицо — для общей ленты событий сервера (в отличие от ACTIVITY_VERBS, который читается
// как продолжение имени владельца строки в списке участников). Раздельно ед./мн. число, т.к. группа
// может состоять как из одного, так и из нескольких участников ("один играет" / "двое играют").
const ACTIVITY_VERBS_FEED: Record<string, { one: string; many: string }> = {
    playing: { one: 'играет в', many: 'играют в' },
    streaming: { one: 'стримит в', many: 'стримят в' },
    listening: { one: 'слушает', many: 'слушают' },
    watching: { one: 'смотрит', many: 'смотрят' },
    competing: { one: 'соревнуется в', many: 'соревнуются в' },
    sitting: { one: 'сидит в', many: 'сидят в' }
};
const DEFAULT_ACTIVITY_VERB = { one: 'занимается:', many: 'занимаются:' };

// Склонение "пользователь/пользователя/пользователей" по числу N.
const pluralUsers = (n: number): string => {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'пользователей';
    if (mod10 === 1) return 'пользователь';
    if (mod10 >= 2 && mod10 <= 4) return 'пользователя';
    return 'пользователей';
};

// Список имён для события: 1-2 имени полностью, дальше — "ПЕРВЫЙ и ещё N пользователя(-ей)",
// чтобы длинный список участников не раздувал текст события.
const formatEventNames = (usernames: string[]): string => {
    if (usernames.length <= 2) return usernames.join(' и ');
    const rest = usernames.length - 1;
    return `${usernames[0]} и ещё ${rest} ${pluralUsers(rest)}`;
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
    // Сокет присоединён к комнатам ВСЕХ серверов пользователя одновременно (см. join-server в Main.tsx),
    // поэтому события по чужим каналам тоже долетают сюда — отфильтровываем их по каналам этого сервера,
    // иначе в списке "текущих событий" утекают войс-статусы с других серверов.
    const serverChannelIds = React.useMemo(() => new Set((server.channels || []).map(c => c._id)), [server.channels]);
    const [voiceStates, setVoiceStates] = useState<Record<string, User[]>>({});
    useEffect(() => {
        if (!socket) return;
        const onSnapshot = (states: Record<string, User[]>) => {
            const filtered: Record<string, User[]> = {};
            Object.entries(states).forEach(([cid, users]) => {
                if (serverChannelIds.has(cid)) filtered[cid] = users;
            });
            // Мёрджим, а не заменяем целиком: этот снапшот может относиться к другому серверу
            // (join-server рассылает его во все комнаты, в которых сейчас числится сокет).
            setVoiceStates(prev => ({ ...prev, ...filtered }));
        };
        const onUpdate = (data: { channelId: string; users: User[] }) => {
            if (!serverChannelIds.has(data.channelId)) return;
            setVoiceStates(prev => ({ ...prev, [data.channelId]: data.users }));
        };
        socket.on('server-voice-states', onSnapshot);
        socket.on('voice-channel-users-update', onUpdate);
        return () => {
            socket.off('server-voice-states', onSnapshot);
            socket.off('voice-channel-users-update', onUpdate);
        };
    }, [socket, serverChannelIds]);

    const showActivity = server.showMemberActivity !== false;

    // Единственная "свежая" строка события пользователя: активность (с известным временем начала)
    // или войс-канал (без метки времени на клиенте — считается менее свежим, чем активная активность).
    const getPrimaryActivity = (u: User): { text: string; icon: string | null } | null => {
        if (!showActivity) return null;

        const candidates: { text: string; icon: string | null; timestamp: number }[] = [];

        if (u.activity?.name) {
            const verb = ACTIVITY_VERBS[u.activity.type as string] || 'Занимается:';
            candidates.push({
                text: `${verb} ${u.activity.name}`,
                icon: u.activity.assets?.largeImage || null,
                timestamp: u.activity.timestamps?.start || 0
            });
        }
        const voiceChannelId = Object.keys(voiceStates).find(cid => (voiceStates[cid] || []).some(vu => vu._id === u._id));
        if (voiceChannelId) {
            const channel = (server.channels || []).find(c => c._id === voiceChannelId);
            const others = (voiceStates[voiceChannelId] || []).filter(vu => vu._id !== u._id).map(vu => vu.username);
            const suffix = others.length > 0 ? ` с ${others.slice(0, 2).join(' и ')}` : '';
            candidates.push({ text: `Общается в #${channel?.name || 'войсе'}${suffix}`, icon: null, timestamp: 0 });
        }

        if (candidates.length === 0) return null;
        return candidates.reduce((freshest, c) => (c.timestamp > freshest.timestamp ? c : freshest));
    };

    // Лента "текущие события" — до 3 самых свежих событий (активности + войс-группы),
    // отображается ОДИН РАЗ над списком участников, а не размазана по каждому его члену.
    // Несколько участников одной игры/активности объединяются в одно событие; эфиры остаются
    // отдельными событиями (каждый стример — своя трансляция).
    const serverEvents = React.useMemo<ServerEvent[]>(() => {
        if (!showActivity) return [];

        const streamEvents: ServerEvent[] = [];
        const groups = new Map<string, { type: string; name: string; image: string | null; timestamp: number; usernames: string[] }>();

        server.members.map(m => m.user).filter(u => u?.activity?.name).forEach(u => {
            const a = u.activity!;
            if (a.type === 'streaming') {
                // Без ссылки на стрим (площадка неизвестна) такое событие не показываем.
                const streamLink = u.settings?.streamerMode?.streamerLink;
                if (!streamLink) return;
                streamEvents.push({
                    key: `stream-${u._id}`,
                    kind: 'stream',
                    image: getStreamPlatformIcon(streamLink),
                    timestamp: a.timestamps?.start || 0,
                    text: `${u.username} стримит в ${a.name}`
                });
                return;
            }
            const groupKey = `${a.type}:${a.name}`;
            const existing = groups.get(groupKey);
            if (existing) {
                existing.usernames.push(u.username);
                existing.timestamp = Math.max(existing.timestamp, a.timestamps?.start || 0);
                if (!existing.image && a.assets?.largeImage) existing.image = a.assets.largeImage;
            } else {
                groups.set(groupKey, {
                    type: a.type || 'playing',
                    name: a.name!,
                    image: a.assets?.largeImage || null,
                    timestamp: a.timestamps?.start || 0,
                    usernames: [u.username]
                });
            }
        });

        const gameEvents: ServerEvent[] = Array.from(groups.entries()).map(([groupKey, g]) => {
            const verbForm = ACTIVITY_VERBS_FEED[g.type] || DEFAULT_ACTIVITY_VERB;
            const verb = g.usernames.length === 1 ? verbForm.one : verbForm.many;
            const namesText = formatEventNames(g.usernames);
            return {
                key: `game-${groupKey}`,
                kind: 'game',
                image: g.image,
                timestamp: g.timestamp,
                text: `${namesText} ${verb} ${g.name}`
            };
        });

        const voiceEvents: ServerEvent[] = Object.entries(voiceStates)
            .filter(([, users]) => (users || []).length >= 2)
            .map(([channelId, users]) => {
                const channel = (server.channels || []).find(c => c._id === channelId);
                const names = users.map(u => u.username);
                const namesText = formatEventNames(names);
                return {
                    key: `voice-${channelId}`,
                    kind: 'voice',
                    image: null,
                    timestamp: 0,
                    text: `${namesText} общаются в #${channel?.name || 'войсе'}`
                };
            });

        return [...gameEvents, ...streamEvents, ...voiceEvents]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);
    }, [showActivity, server.members, server.channels, voiceStates]);

    const handleContextMenu = (e: React.MouseEvent, user: User) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, user });
    };

    // Значок сервера показываем на всех серверах и в профиле — независимо от того, на каком сервере
    // пользователь его выбрал (displayedTag.server приходит populated с сервера).
    const getServerTag = (u: User) => resolveServerTag(u);

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
            {serverEvents.length > 0 && (
                <div className="server-events-feed">
                    <div className="server-events-feed-header">Текущие события</div>
                    {serverEvents.map(ev => <ServerEventCard key={ev.key} event={ev} />)}
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
                                                            avatarOverride={member.avatar || undefined}
                                                            size={32}
                                                            className="member-avatar"
                                                        />
                                                        <div className={`status-indicator ${member.user.activity?.type === 'streaming' ? 'streaming' : member.user.status}`}></div>
                                                    </div>
                                                    <div className="member-info">
                                                        <div className="member-name-row">
                                                            <span className="member-name" style={{ color: memberColor }}>
                                                                {member.nickname || member.user.displayName || member.user.username}
                                                            </span>
                                                            <UserBadges badges={member.user.badges} serverTag={getServerTag(member.user)} size={14} />
                                                            {isLive(member.user._id) && <LiveBadge />}
                                                        </div>
                                                        {(() => {
                                                            const primary = getPrimaryActivity(member.user);
                                                            if (!primary) return null;
                                                            return (
                                                                <div className="member-activity">
                                                                    {primary.icon && (
                                                                        <img src={getFullUrl(primary.icon)!} alt="" className="member-activity-icon" />
                                                                    )}
                                                                    <span className="activity-text">{primary.text}</span>
                                                                </div>
                                                            );
                                                        })()}
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
                                                        avatarOverride={member.avatar || undefined}
                                                        size={32}
                                                        className="member-avatar"
                                                    />
                                                    <div className={`status-indicator ${member.user.activity?.type === 'streaming' ? 'streaming' : member.user.status}`}></div>
                                                </div>
                                                <div className="member-info">
                                                    <div className="member-name-row">
                                                        <span className="member-name" style={{ color: memberColor }}>{member.nickname || member.user.displayName || member.user.username}</span>
                                                        <UserBadges badges={member.user.badges} serverTag={getServerTag(member.user)} size={14} />
                                                        {isLive(member.user._id) && <LiveBadge />}
                                                    </div>
                                                    {(() => {
                                                        const primary = getPrimaryActivity(member.user);
                                                        if (!primary) return null;
                                                        return (
                                                            <div className="member-activity">
                                                                {primary.icon && (
                                                                    <img src={getFullUrl(primary.icon)!} alt="" className="member-activity-icon" />
                                                                )}
                                                                <span className="activity-text">{primary.text}</span>
                                                            </div>
                                                        );
                                                    })()}
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
                                                        avatarOverride={member.avatar || undefined}
                                                        size={32}
                                                        className="member-avatar"
                                                    />
                                                    <div className={`status-indicator ${member.user.activity?.type === 'streaming' ? 'streaming' : member.user.status}`}></div>
                                                </div>
                                                <div className="member-name-row">
                                                    <span className="member-name" style={{ color: memberColor }}>
                                                        {member.nickname || member.user.displayName || member.user.username}
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
