import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useVoice } from '../contexts/VoiceContext';
import { Channel, User, Server } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { SpeakerIcon, PhoneIcon, MicMutedIcon, MicIcon, DeafenedIcon } from './Icons';
import axios from 'axios';
import MemberContextMenu from './MemberContextMenu';
import './VoiceChannelView.css';

interface VoiceChannelViewProps {
  channel: Channel;
  server: Server;
  onUserClick: (userId: string) => void;
  onMessageClick: (userId: string) => void;
  onCallClick: (userId: string) => void;
}

const VoiceChannelView: React.FC<VoiceChannelViewProps> = ({ channel, server, onUserClick, onMessageClick, onCallClick }) => {
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const {
    isConnected,
    activeChannelId,
    joinChannel,
    leaveChannel,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    connectedUsers: activeConnectedUsers,
    userStates,
    speakingUsers,
  } = useVoice();

  const [externalParticipants, setExternalParticipants] = useState<User[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; userId: string } | null>(null);

  const handleCloseContextMenu = () => setContextMenu(null);

  const getDisplayName = (u: User) => {
    const member = server.members.find(m => {
      const mId = typeof m.user === 'string' ? m.user : m.user?._id;
      return String(mId) === String(u._id);
    });
    return member?.nickname || u.username;
  };

  const isConnectedToThisChannel = isConnected && activeChannelId === channel._id;

  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const response = await axios.get(`/api/channels/${channel._id}/voice-participants`);
        setExternalParticipants(response.data);
      } catch (err) { }
    };

    fetchParticipants();

    if (socket) {
      const handleUpdate = (data: { channelId: string; users: User[] }) => {
        if (data.channelId === channel._id) {
          setExternalParticipants(data.users);
        }
      };

      socket.on('voice-channel-users-update', handleUpdate);
      return () => {
        socket.off('voice-channel-users-update', handleUpdate);
      };
    }
  }, [channel._id, socket]);

  const displayParticipants = useMemo(() => {
    let participants: any[] = [];
    if (isConnectedToThisChannel && currentUser) {
      participants = [
        { ...currentUser, isMe: true, isMuted, isDeafened },
        ...activeConnectedUsers.map(u => {
          const state = userStates.get(u._id) || { isMuted: false, isDeafened: false };
          return { ...u, isMe: false, isMuted: state.isMuted, isDeafened: state.isDeafened };
        })
      ];
    } else {
      participants = externalParticipants.map(u => {
        const state = userStates.get(u._id) || { isMuted: false, isDeafened: false };
        return {
          ...u,
          isMe: u._id === currentUser?._id,
          isMuted: state.isMuted,
          isDeafened: state.isDeafened
        };
      });
    }
    return participants;
  }, [isConnectedToThisChannel, currentUser, activeConnectedUsers, isMuted, isDeafened, externalParticipants, userStates]);

  const handleConnect = () => joinChannel(channel._id);
  const handleDisconnect = () => leaveChannel();

  const gridClass = `participants-grid count-${displayParticipants.length > 4 ? 'more' : displayParticipants.length}`;

  return (
    <div className="voice-channel-view">
      <div className="voice-channel-header">
        <div className="voice-channel-info">
          <span className="voice-channel-icon"><SpeakerIcon /></span>
          <h3>{channel.name}</h3>
        </div>
        {channel.topic && <div className="voice-channel-topic">{channel.topic}</div>}
      </div>

      {contextMenu && (
        <MemberContextMenu
          user={displayParticipants.find(p => p._id === contextMenu.userId)}
          server={server}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onOpenProfile={onUserClick}
        />
      )}

      <div className="voice-channel-content">
        <div className={gridClass}>
          {displayParticipants.length > 0 ? (
            displayParticipants.map((participant) => {
              const isSpeaking = speakingUsers.has(participant._id);

              return (
                <div
                  key={participant._id}
                  className={`participant-card ${isSpeaking ? 'speaking-card' : ''}`}
                  onClick={() => onUserClick(participant._id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (participant.isMe) return;
                    setContextMenu({ x: e.clientX, y: e.clientY, userId: participant._id });
                  }}
                >
                  {participant.banner && (
                    <div
                      className="participant-banner"
                      style={{ backgroundImage: `url(${getFullUrl(participant.banner)})` }}
                    />
                  )}

                  <div className="participant-info">
                    <div className={`participant-avatar ${isSpeaking ? 'speaking' : ''}`}>
                      {getAvatarUrl(participant.avatar) ? (
                        <img src={getAvatarUrl(participant.avatar)!} alt={participant.username} />
                      ) : (
                        <div className="avatar-placeholder-inner">{getDisplayName(participant).charAt(0).toUpperCase()}</div>
                      )}
                    </div>
                    <div className={`participant-name ${isSpeaking ? 'speaking' : ''}`}>
                      {getDisplayName(participant)}{participant.isMe ? ' (Вы)' : ''}
                    </div>
                  </div>

                  <div className="participant-status-icons">
                    {(participant.isMuted || participant.isDeafened) && (
                      <div className="status-icon">
                        {participant.isDeafened ? <DeafenedIcon size={12} /> : <MicMutedIcon size={12} />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="voice-channel-disconnected" style={{ gridColumn: '1 / -1' }}>
              <div className="voice-channel-icon-large"><SpeakerIcon size={80} /></div>
              <h2>Здесь пока никого нет</h2>
              <p>Будьте первым, кто подключится к этому каналу!</p>
            </div>
          )}
        </div>

        {!isConnectedToThisChannel && (
          <div className="voice-channel-actions">
            <button className="connect-voice-button" onClick={handleConnect}>
              <span className="button-icon"><PhoneIcon /></span>
              Подключиться
            </button>
          </div>
        )}
      </div>

      <div className="voice-channel-controls">
        {isConnectedToThisChannel ? (
          <>
            <button
              className={`control-button ${isMuted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {isMuted ? <MicMutedIcon /> : <MicIcon />}
            </button>
            <button
              className={`control-button ${isDeafened ? 'deafened' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'Включить звук' : 'Выключить звук'}
            >
              {isDeafened ? <DeafenedIcon size={20} /> : <SpeakerIcon size={20} />}
            </button>
            <button
              className="control-button disconnect"
              onClick={handleDisconnect}
              title="Отключиться"
            >
              <PhoneIcon color="white" />
            </button>
          </>
        ) : (
          <div className="disconnected-message">
            {isConnected ? 'Вы находитесь в другом канале' : 'Вы не подключены к голосовому чату'}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceChannelView;
