import React, { useState } from 'react';
import { Server, Channel, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { useSocket } from '../contexts/SocketContext';
import CreateChannelModal from './CreateChannelModal';
import { HashtagIcon, SpeakerIcon, PlusIcon, SettingsIcon } from './Icons';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useVoice } from '../contexts/VoiceContext';
import './ServerSidebar.css';

import InviteModal from './InviteModal';
import MemberContextMenu from './MemberContextMenu';

interface ServerSidebarProps {
  server: Server;
  selectedChannel: Channel | null;
  onChannelSelect: (channel: Channel) => void;
  onChannelCreated?: () => void;
  onUserClick: (userId: string) => void;
  onOpenSettings: () => void;
  onServerClick: () => void;
  unreadCounts: Record<string, number>;
  style?: React.CSSProperties;
}

const ServerSidebar: React.FC<ServerSidebarProps> = ({
  server,
  selectedChannel,
  onChannelSelect,
  onChannelCreated,
  onUserClick,
  onOpenSettings,
  onServerClick,
  unreadCounts,
  style
}) => {
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const { speakingUsers } = useVoice();

  const ownerId = typeof server.owner === 'object' ? (server.owner as any)._id : server.owner;
  const currentUserId = currentUser?._id;
  const isOwner = String(ownerId) === String(currentUserId);
  const { hasPermission } = usePermissions(currentUser!, server);

  const canManageServer = hasPermission('MANAGE_SERVER');
  const canManageChannels = hasPermission('MANAGE_CHANNELS');
  const canInvite = true; // For now assume everyone can invite or add more logic later

  console.log('ServerSidebar Debug:', {
    serverName: server.name,
    ownerId,
    currentUserId,
    isOwner,
    serverIcon: server.icon
  });

  console.log('ServerSidebar Debug:', {
    serverName: server.name,
    ownerId,
    currentUserId: currentUser?._id,
    isOwner
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [voiceStates, setVoiceStates] = useState<Record<string, User[]>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, user: User } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, user: User) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, user });
  };

  const textChannels = server.channels.filter(ch => ch.type === 'text');
  const voiceChannels = server.channels.filter(ch => ch.type === 'voice');

  React.useEffect(() => {
    if (socket) {
      socket.emit('join-server', server._id);

      socket.on('server-voice-states', (states) => {
        setVoiceStates(states);
      });

      socket.on('voice-channel-users-update', (data) => {
        setVoiceStates(prev => ({
          ...prev,
          [data.channelId]: data.users
        }));
      });

      return () => {
        socket.emit('leave-server', server._id);
        socket.off('server-voice-states');
        socket.off('voice-channel-users-update');
      };
    }
  }, [socket, server._id]);

  const handleChannelCreated = () => {
    if (onChannelCreated) {
      onChannelCreated();
    }
    setShowCreateModal(false);
  };

  return (
    <div className="server-sidebar" style={style}>
      <div className="server-header">
        <div className="server-header-left" onClick={onServerClick} style={{ cursor: 'pointer' }}>
          {server.icon ? (
            <div className="server-header-icon">
              <img src={getAvatarUrl(server.icon)!} alt={server.name} />
            </div>
          ) : (
            <div className="server-header-icon-placeholder">
              {server.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h2>{server.name}</h2>
        </div>
        <div className="server-header-actions">
          <button
            className="invite-button"
            onClick={() => setShowInviteModal(true)}
            title="Пригласить друзей"
          >
            <PlusIcon size={18} />
          </button>
          {canManageServer && (
            <button
              className="settings-button"
              onClick={onOpenSettings}
              title="Настройки сервера"
            >
              <SettingsIcon size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="channels-list">
        {textChannels.length > 0 && (
          <div className="channel-category">
            <div className="category-header">
              <span>ТЕКСТОВЫЕ КАНАЛЫ</span>
              {canManageChannels && (
                <button
                  className="add-channel-button"
                  onClick={() => setShowCreateModal(true)}
                  title="Создать канал"
                >
                  <PlusIcon size={18} />
                </button>
              )}
            </div>
            {textChannels.map((channel) => (
              <div
                key={channel._id}
                className={`channel-item ${selectedChannel?._id === channel._id ? 'active' : ''} ${unreadCounts[channel._id] > 0 ? 'unread' : ''}`}
                onClick={() => onChannelSelect(channel)}
              >
                <span className="channel-icon">#</span>
                <span className="channel-name">{channel.name}</span>
                {unreadCounts[channel._id] > 0 && (
                  <div className="channel-unread-badge">{unreadCounts[channel._id]}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div className="channel-category">
            <div className="category-header">
              <span>ГОЛОСОВЫЕ КАНАЛЫ</span>
              {canManageChannels && (
                <button
                  className="add-channel-button"
                  onClick={() => setShowCreateModal(true)}
                  title="Создать канал"
                >
                  <PlusIcon size={18} />
                </button>
              )}
            </div>
            {voiceChannels.map((channel) => (
              <div key={channel._id}>
                <div
                  className={`channel-item ${selectedChannel?._id === channel._id ? 'active' : ''} ${unreadCounts[channel._id] > 0 ? 'unread' : ''}`}
                  onClick={() => onChannelSelect(channel)}
                >
                  <span className="channel-icon"><SpeakerIcon size={18} /></span>
                  <span className="channel-name">{channel.name}</span>
                  {unreadCounts[channel._id] > 0 && (
                    <div className="channel-unread-badge">{unreadCounts[channel._id]}</div>
                  )}
                </div>
                {/* Voice Users List */}
                {voiceStates[channel._id] && voiceStates[channel._id].length > 0 && (
                  <div className="voice-channel-users">
                    {voiceStates[channel._id].map(u => (
                      <div
                        key={u._id}
                        className={`voice-user-item ${speakingUsers.has(u._id) ? 'speaking' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onUserClick(u._id); }}
                        onContextMenu={(e) => handleContextMenu(e, u)}
                      >
                        <div className={`voice-user-avatar ${speakingUsers.has(u._id) ? 'speaking' : ''}`}>
                          {getAvatarUrl(u.avatar) ? (
                            <img src={getAvatarUrl(u.avatar)!} alt={u.username} />
                          ) : (
                            <span>{u.username.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <span className={`voice-user-name ${speakingUsers.has(u._id) ? 'speaking' : ''}`}>
                          {server.members.find(m => {
                            const mId = typeof m.user === 'string' ? m.user : m.user?._id;
                            return String(mId) === String(u._id);
                          })?.nickname || u.username}
                        </span>
                        {(u as any).isScreenSharing && (
                          <div className="live-badge">В ЭФИРЕ</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {(textChannels.length === 0 && voiceChannels.length === 0) && (
          <div className="empty-channels">
            <button
              className="create-first-channel-button"
              onClick={() => setShowCreateModal(true)}
            >
              + Создать канал
            </button>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateChannelModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          serverId={server._id}
          onChannelCreated={handleChannelCreated}
        />
      )}

      {showInviteModal && (
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          serverId={server._id}
          serverName={server.name}
        />
      )}

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

export default ServerSidebar;
