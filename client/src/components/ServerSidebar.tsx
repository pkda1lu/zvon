import React, { useState, useEffect } from 'react';
import { Server, Channel, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { useSocket } from '../contexts/SocketContext';
import CreateChannelModal from './CreateChannelModal';
import { HashtagIcon, SpeakerIcon, PlusIcon, SettingsIcon } from './Icons';
import { useAuth } from '../contexts/AuthContext';
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

  const isOwner = String(server.ownerId) === String(currentUser?._id);

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

  useEffect(() => {
    if (socket) {
      socket.emit('join-server', server._id);
      socket.on('server-voice-states', (states) => setVoiceStates(states));
      socket.on('voice-channel-users-update', (data) => {
        setVoiceStates(prev => ({ ...prev, [data.channelId]: data.users }));
      });
      return () => {
        socket.emit('leave-server', server._id);
        socket.off('server-voice-states');
        socket.off('voice-channel-users-update');
      };
    }
  }, [socket, server._id]);

  const handleChannelCreated = () => {
    if (onChannelCreated) onChannelCreated();
    setShowCreateModal(false);
  };

  return (
    <div className="server-sidebar" style={style}>
      <div className="server-header">
        <div className="server-header-left" onClick={onServerClick} style={{ cursor: 'pointer' }}>
          {server.icon ? (
            <div className="server-header-icon"><img src={getAvatarUrl(server.icon)!} alt="" /></div>
          ) : (
            <div className="server-header-icon-placeholder">{server.name.charAt(0).toUpperCase()}</div>
          )}
          <h2>{server.name}</h2>
        </div>
        <div className="server-header-actions">
          <button className="invite-button" onClick={() => setShowInviteModal(true)} title="Пригласить друзей"><PlusIcon size={18} /></button>
          {isOwner && <button className="settings-button" onClick={onOpenSettings} title="Настройки сервера"><SettingsIcon size={18} /></button>}
        </div>
      </div>

      <div className="channels-list">
        {textChannels.length > 0 && (
          <div className="channel-category">
            <div className="category-header">
              <span>ТЕКСТОВЫЕ КАНАЛЫ</span>
              {isOwner && <button className="add-channel-button" onClick={() => setShowCreateModal(true)} title="Создать канал"><PlusIcon size={18} /></button>}
            </div>
            {textChannels.map((channel) => (
              <div key={channel._id} className={`channel-item ${selectedChannel?._id === channel._id ? 'active' : ''} ${unreadCounts[channel._id] > 0 ? 'unread' : ''}`} onClick={() => onChannelSelect(channel)}>
                <span className="channel-icon">#</span>
                <span className="channel-name">{channel.name}</span>
                {unreadCounts[channel._id] > 0 && <div className="channel-unread-badge">{unreadCounts[channel._id]}</div>}
              </div>
            ))}
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div className="channel-category">
            <div className="category-header">
              <span>ГОЛОСОВЫЕ КАНАЛЫ</span>
              {isOwner && <button className="add-channel-button" onClick={() => setShowCreateModal(true)} title="Создать канал"><PlusIcon size={18} /></button>}
            </div>
            {voiceChannels.map((channel) => (
              <div key={channel._id}>
                <div className={`channel-item ${selectedChannel?._id === channel._id ? 'active' : ''}`} onClick={() => onChannelSelect(channel)}>
                  <span className="channel-icon"><SpeakerIcon size={18} /></span>
                  <span className="channel-name">{channel.name}</span>
                </div>
                {voiceStates[channel._id] && voiceStates[channel._id].length > 0 && (
                  <div className="voice-channel-users">
                    {voiceStates[channel._id].map(u => (
                      <div key={u._id} className={`voice-user-item ${speakingUsers.has(u._id) ? 'speaking' : ''}`} onClick={(e) => { e.stopPropagation(); onUserClick(u._id); }} onContextMenu={(e) => handleContextMenu(e, u)}>
                        <div className={`voice-user-avatar ${speakingUsers.has(u._id) ? 'speaking' : ''}`}>
                          {getAvatarUrl(u.avatar) ? <img src={getAvatarUrl(u.avatar)!} alt="" /> : <span>{u.username.charAt(0).toUpperCase()}</span>}
                        </div>
                        <span className={`voice-user-name ${speakingUsers.has(u._id) ? 'speaking' : ''}`}>
                          {server.members.find(m => String((m.user as any)._id || m.user) === String(u._id))?.nickname || u.username}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && <CreateChannelModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} serverId={server._id} onChannelCreated={handleChannelCreated} />}
      {showInviteModal && <InviteModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} serverId={server._id} serverName={server.name} />}
      {contextMenu && <MemberContextMenu user={contextMenu.user} server={server} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onOpenProfile={onUserClick} />}
    </div>
  );
};

export default ServerSidebar;
