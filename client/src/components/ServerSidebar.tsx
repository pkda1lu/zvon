import React, { useState } from 'react';
import { Server, Channel, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { useSocket } from '../contexts/SocketContext';
import CreateChannelModal from './CreateChannelModal';
import './ServerSidebar.css';

import InviteModal from './InviteModal';

interface ServerSidebarProps {
  server: Server;
  selectedChannel: Channel | null;
  onChannelSelect: (channel: Channel) => void;
  onChannelCreated?: () => void;
}

const ServerSidebar: React.FC<ServerSidebarProps> = ({
  server,
  selectedChannel,
  onChannelSelect,
  onChannelCreated
}) => {
  const { socket } = useSocket();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [voiceStates, setVoiceStates] = useState<Record<string, User[]>>({});

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
    <div className="server-sidebar">
      <div className="server-header">
        <h2>{server.name}</h2>
        <button
          className="invite-button"
          onClick={() => setShowInviteModal(true)}
          title="Пригласить друзей"
        >
          👤+
        </button>
      </div>

      <div className="channels-list">
        {textChannels.length > 0 && (
          <div className="channel-category">
            <div className="category-header">
              <span>ТЕКСТОВЫЕ КАНАЛЫ</span>
              <button
                className="add-channel-button"
                onClick={() => setShowCreateModal(true)}
                title="Создать канал"
              >
                +
              </button>
            </div>
            {textChannels.map((channel) => (
              <div
                key={channel._id}
                className={`channel-item ${selectedChannel?._id === channel._id ? 'active' : ''}`}
                onClick={() => onChannelSelect(channel)}
              >
                <span className="channel-icon">#</span>
                <span className="channel-name">{channel.name}</span>
              </div>
            ))}
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div className="channel-category">
            <div className="category-header">
              <span>ГОЛОСОВЫЕ КАНАЛЫ</span>
              <button
                className="add-channel-button"
                onClick={() => setShowCreateModal(true)}
                title="Создать канал"
              >
                +
              </button>
            </div>
            {voiceChannels.map((channel) => (
              <div key={channel._id}>
                <div
                  className={`channel-item ${selectedChannel?._id === channel._id ? 'active' : ''}`}
                  onClick={() => onChannelSelect(channel)}
                >
                  <span className="channel-icon">🔊</span>
                  <span className="channel-name">{channel.name}</span>
                </div>
                {/* Voice Users List */}
                {voiceStates[channel._id] && voiceStates[channel._id].length > 0 && (
                  <div className="voice-channel-users">
                    {voiceStates[channel._id].map(user => (
                      <div key={user._id} className="voice-user-item">
                        <div className="voice-user-avatar">
                          {getAvatarUrl(user.avatar) ? (
                            <img src={getAvatarUrl(user.avatar)!} alt={user.username} />
                          ) : (
                            <span>{user.username.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <span className="voice-user-name">{user.username}</span>
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
        />
      )}

      <div className="server-members">
        <div className="members-header">
          <span>УЧАСТНИКИ — {server.members.length}</span>
        </div>
        <div className="members-list">
          {server.members.map((member) => (
            <div key={member.user._id} className="member-item">
              <div className="member-avatar">
                {getAvatarUrl(member.user.avatar) ? (
                  <img src={getAvatarUrl(member.user.avatar)!} alt={member.user.username} />
                ) : (
                  <span>{member.user.username.charAt(0).toUpperCase()}</span>
                )}
                <div className={`status-indicator ${member.user.status}`}></div>
              </div>
              <span className="member-name">{member.user.username}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ServerSidebar;

