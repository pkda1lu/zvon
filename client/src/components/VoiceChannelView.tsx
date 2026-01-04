import React, { useMemo, useState, useEffect } from 'react';
import { useVoice } from '../contexts/VoiceContext';
import { Channel, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { SpeakerIcon, PhoneIcon, MicMutedIcon, MicIcon, DeafenedIcon, ScreenShareIcon } from './Icons';
import axios from 'axios';
import './VoiceChannelView.css';

interface VoiceChannelViewProps {
  channel: Channel;
  onUserClick: (userId: string) => void;
}

const VoiceChannelView: React.FC<VoiceChannelViewProps> = ({ channel, onUserClick }) => {
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
    isScreenSharing,
    toggleScreenShare,
    connectedUsers: activeConnectedUsers,
    remoteStreams
  } = useVoice();

  const [externalParticipants, setExternalParticipants] = useState<User[]>([]);

  const isConnectedToThisChannel = isConnected && activeChannelId === channel._id;

  // Fetch participants if not connected or to keep it updated
  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const response = await axios.get(`/api/channels/${channel._id}/voice-participants`);
        setExternalParticipants(response.data);
      } catch (err) {
        console.error('Error fetching voice participants:', err);
      }
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

  const handleConnect = () => {
    joinChannel(channel._id);
  };

  const handleDisconnect = () => {
    leaveChannel();
  };

  // Combine current user and other participants for the grid
  const allParticipants = useMemo(() => {
    // If we are connected to THIS channel, use VoiceContext's data for real-time states
    if (isConnectedToThisChannel && currentUser) {
      const me = {
        ...currentUser,
        isMe: true,
        isMuted,
        isDeafened
      };
      return [me, ...activeConnectedUsers.map(u => ({ ...u, isMe: false }))];
    } else {
      // If not connected, use the fetched participants list
      return externalParticipants.map(u => ({
        ...u,
        isMe: u._id === currentUser?._id,
        // We don't have real-time states for others easily yet without additional signaling
      }));
    }
  }, [isConnectedToThisChannel, currentUser, activeConnectedUsers, isMuted, isDeafened, externalParticipants]);

  const gridClass = `participants-grid count-${allParticipants.length > 4 ? 'more' : allParticipants.length}`;

  return (
    <div className="voice-channel-view">
      <div className="voice-channel-header">
        <div className="voice-channel-info">
          <span className="voice-channel-icon"><SpeakerIcon /></span>
          <h3>{channel.name}</h3>
        </div>
        {channel.topic && (
          <div className="voice-channel-topic">{channel.topic}</div>
        )}
      </div>

      <div className="voice-channel-content">
        <div className={gridClass}>
          {allParticipants.length > 0 ? (
            allParticipants.map((participant: any) => {
              // Check implementation for video track
              const remoteStream = !participant.isMe ? remoteStreams.get(participant._id) : null;
              const hasVideo = remoteStream && remoteStream.getVideoTracks().length > 0;

              return (
                <div
                  key={participant._id}
                  className="participant-card"
                  onClick={() => onUserClick(participant._id)}
                >
                  {hasVideo ? (
                    <video
                      autoPlay
                      playsInline
                      muted={participant.isMe} // Should not happen for remote, but safety
                      className="participant-video"
                      ref={el => {
                        if (el && el.srcObject !== remoteStream) {
                          el.srcObject = remoteStream!;
                        }
                      }}
                    />
                  ) : (
                    <>
                      {participant.banner && (
                        <div
                          className="participant-banner"
                          style={{ backgroundImage: `url(${getFullUrl(participant.banner)})` }}
                        />
                      )}

                      <div className="participant-info">
                        <div className="participant-avatar">
                          {getAvatarUrl(participant.avatar) ? (
                            <img src={getAvatarUrl(participant.avatar)!} alt={participant.username} />
                          ) : (
                            <span>{participant.username.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="participant-name">
                          {participant.username}{participant.isMe ? ' (Вы)' : ''}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="participant-status-icons">
                    {(participant.isMuted || participant.isDeafened) && (
                      <div className="status-icon">
                        {participant.isDeafened ? <DeafenedIcon size={12} /> : <MicMutedIcon size={12} />}
                      </div>
                    )}
                    {hasVideo && (
                      <div className="status-icon">
                        <ScreenShareIcon size={12} />
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
              className={`control-button ${isScreenSharing ? 'active' : ''}`}
              onClick={toggleScreenShare}
              title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
            >
              <ScreenShareIcon size={20} />
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
            {isConnected
              ? 'Вы находитесь в другом канале'
              : 'Вы не подключены к голосовому чату'
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceChannelView;
