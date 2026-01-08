import React, { useState } from 'react';
import { Server, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import MemberContextMenu from './MemberContextMenu';
import './ServerMembers.css';

interface ServerMembersProps {
    server: Server;
    onUserClick: (userId: string) => void;
}

const ServerMembers: React.FC<ServerMembersProps> = ({ server, onUserClick }) => {
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, user: User } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, user: User) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, user });
    };

    return (
        <div className="server-members">
            <div className="members-list">
                {(() => {
                    // Group members by highest role
                    const onlineMembers = server.members.filter(m => m.user.status !== 'offline');
                    const offlineMembers = server.members.filter(m => m.user.status === 'offline');

                    // Get all server roles sorted by position
                    const serverRoles = [...(server.roles || [])].sort((a, b) => (b.position || 0) - (a.position || 0));

                    // Map role ID to members
                    const roleGroups: Record<string, typeof server.members> = {};
                    const noRoleMembers: typeof server.members = [];

                    onlineMembers.forEach(member => {
                        const memberRoles = (member.roles || []).filter((r: any) => typeof r === 'object') as any[];
                        memberRoles.sort((a, b) => (b.position || 0) - (a.position || 0));

                        if (memberRoles.length > 0) {
                            const highestRole = memberRoles[0];
                            if (!roleGroups[highestRole._id]) {
                                roleGroups[highestRole._id] = [];
                            }
                            roleGroups[highestRole._id].push(member);
                        } else {
                            noRoleMembers.push(member);
                        }
                    });

                    return (
                        <>
                            {serverRoles.map(role => {
                                const membersInRole = roleGroups[role._id];
                                if (!membersInRole || membersInRole.length === 0) return null;

                                return (
                                    <div key={role._id} className="member-group">
                                        <div className="group-header">{role.name.toUpperCase()} — {membersInRole.length}</div>
                                        {membersInRole.map(member => {
                                            const sortedRoles = [...(member.roles || [])] as any[];
                                            sortedRoles.sort((a, b) => (b.position || 0) - (a.position || 0));
                                            const colorRole = sortedRoles.find(r => r.color && r.color !== '#99AAB5');
                                            const memberColor = colorRole ? colorRole.color : 'inherit';

                                            return (
                                                <div
                                                    key={member.user._id}
                                                    className="member-item"
                                                    onClick={() => onUserClick(member.user._id)}
                                                    onContextMenu={(e) => handleContextMenu(e, member.user)}
                                                >
                                                    <div className="member-avatar">
                                                        {getAvatarUrl(member.user.avatar) ? (
                                                            <img src={getAvatarUrl(member.user.avatar)!} alt={member.user.username} />
                                                        ) : (
                                                            <span>{member.user.username.charAt(0).toUpperCase()}</span>
                                                        )}
                                                        <div className={`status-indicator ${member.user.status}`}></div>
                                                    </div>
                                                    <span className="member-name" style={{ color: memberColor }}>
                                                        {member.nickname || member.user.username}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {noRoleMembers.length > 0 && (
                                <div className="member-group">
                                    <div className="group-header">ОНЛАЙН — {noRoleMembers.length}</div>
                                    {noRoleMembers.map(member => (
                                        <div
                                            key={member.user._id}
                                            className="member-item"
                                            onClick={() => onUserClick(member.user._id)}
                                            onContextMenu={(e) => handleContextMenu(e, member.user)}
                                        >
                                            <div className="member-avatar">
                                                {getAvatarUrl(member.user.avatar) ? (
                                                    <img src={getAvatarUrl(member.user.avatar)!} alt={member.user.username} />
                                                ) : (
                                                    <span>{member.user.username.charAt(0).toUpperCase()}</span>
                                                )}
                                                <div className={`status-indicator ${member.user.status}`}></div>
                                            </div>
                                            <span className="member-name">{member.nickname || member.user.username}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {offlineMembers.length > 0 && (
                                <div className="member-group">
                                    <div className="group-header">ОФФЛАЙН — {offlineMembers.length}</div>
                                    {offlineMembers.map(member => {
                                        const sortedRoles = [...(member.roles || [])] as any[];
                                        sortedRoles.sort((a, b) => (b.position || 0) - (a.position || 0));
                                        const colorRole = sortedRoles.find(r => r.color && r.color !== '#99AAB5');
                                        const memberColor = colorRole ? colorRole.color : 'inherit';

                                        return (
                                            <div
                                                key={member.user._id}
                                                className="member-item offline"
                                                onClick={() => onUserClick(member.user._id)}
                                                onContextMenu={(e) => handleContextMenu(e, member.user)}
                                            >
                                                <div className="member-avatar">
                                                    {getAvatarUrl(member.user.avatar) ? (
                                                        <img src={getAvatarUrl(member.user.avatar)!} alt={member.user.username} />
                                                    ) : (
                                                        <span>{member.user.username.charAt(0).toUpperCase()}</span>
                                                    )}
                                                    <div className={`status-indicator ${member.user.status}`}></div>
                                                </div>
                                                <span className="member-name" style={{ color: memberColor }}>
                                                    {member.nickname || member.user.username}
                                                </span>
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
                />
            )}
        </div>
    );
};

export default ServerMembers;
