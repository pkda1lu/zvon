import React, { useMemo, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useVoice } from '../contexts/VoiceContext';
import { Channel, User, Server } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { SpeakerIcon, PhoneIcon, MicMutedIcon, MicIcon, DeafenedIcon, VideoIcon, MonitorIcon, PlayIcon, MaximizeIcon, MinimizeIcon, VolumeHighIcon, VolumeLowIcon } from './Icons';
import ScreenSourceSelector from './ScreenSourceSelector';
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
    isScreenSharing,
    screenStream,
    startScreenShare,
    stopScreenShare,
    remoteScreenStreams,
    screenVolumes,
    setScreenVolume,
    watchedScreenIds,
    setWatchingScreen,
  } = useVoice();

  const [externalParticipants, setExternalParticipants] = useState<User[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; userId: string } | null>(null);
  const [showScreenSelector, setShowScreenSelector] = useState(false);
  const [expandedStreamId, setExpandedStreamId] = useState<string | null>(null);

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
    let items: any[] = [];
    if (isConnectedToThisChannel && currentUser) {
      // Local User
      items.push({ ...currentUser, isMe: true, isMuted, isDeafened, isScreenSharing, type: 'user' });

      // Local Stream
      if (isScreenSharing) {
        items.push({ _id: `local-stream`, type: 'stream', isMe: true });
      }

      // Remote Users
      activeConnectedUsers.forEach(u => {
        const state = userStates.get(u._id) || { isMuted: false, isDeafened: false, isScreenSharing: false };
        items.push({ ...u, isMe: false, isMuted: state.isMuted, isDeafened: state.isDeafened, isScreenSharing: state.isScreenSharing, type: 'user' });

        // Remote Stream for this user
        if (state.isScreenSharing && remoteScreenStreams.has(u._id)) {
          items.push({ _id: `stream-${u._id}`, userId: u._id, type: 'stream', isMe: false });
        }
      });
    } else {
      externalParticipants.forEach(u => {
        const state = userStates.get(u._id) || { isMuted: false, isDeafened: false, isScreenSharing: false };
        items.push({
          ...u,
          isMe: u._id === currentUser?._id,
          isMuted: state.isMuted,
          isDeafened: state.isDeafened,
          isScreenSharing: state.isScreenSharing,
          type: 'user'
        });

        if (state.isScreenSharing && remoteScreenStreams.has(u._id)) {
          items.push({ _id: `stream-${u._id}`, userId: u._id, type: 'stream', isMe: false });
        }
      });
    }
    return items;
  }, [isConnectedToThisChannel, currentUser, activeConnectedUsers, isMuted, isDeafened, isScreenSharing, externalParticipants, userStates, remoteScreenStreams]);

  // Cleanup expanded stream on disconnect or when stream is gone
  useEffect(() => {
    if (!isConnectedToThisChannel) {
      setExpandedStreamId(null);
    } else if (expandedStreamId) {
      const streamExists = displayParticipants.some(p => p._id === expandedStreamId);
      if (!streamExists) {
        setExpandedStreamId(null);
      }
    }
  }, [isConnectedToThisChannel, expandedStreamId, displayParticipants]);

  const handleConnect = () => joinChannel(channel._id);
  const handleDisconnect = () => {
    setExpandedStreamId(null);
    leaveChannel();
  };

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
            displayParticipants.map((item) => {
              if (item.type === 'stream') {
                if (item.isMe) {
                  return (
                    <div key="local-stream" className="participant-card stream-card local-stream">
                      <div className="stream-container">
                        <div className="local-streaming-placeholder">
                          <MonitorIcon size={48} color="var(--bg-accent)" />
                          <div className="local-streaming-text">Вы транслируете экран</div>
                        </div>
                        <div className="stream-overlay">
                          <div className="stream-user-info">Ваш стрим</div>
                          <button className="stop-stream-btn" onClick={stopScreenShare}>Прекратить</button>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  const stream = remoteScreenStreams.get(item.userId);
                  const participant = activeConnectedUsers.find(u => u._id === item.userId) || externalParticipants.find(u => u._id === item.userId);
                  const isWatching = watchedScreenIds.has(item.userId);
                  const volume = screenVolumes.get(item.userId) ?? 1;
                  const isExpanded = expandedStreamId === item._id;

                  const cardContent = (
                    <div
                      key={item._id}
                      className={`participant-card stream-card ${isExpanded ? 'expanded' : ''}`}
                    >
                      <div className="stream-container">
                        {!isWatching ? (
                          <div className="stream-join-placeholder">
                            <div className="stream-preview-overlay">
                              <MonitorIcon size={48} color="rgba(255,255,255,0.3)" />
                              <button className="join-stream-btn" onClick={() => setWatchingScreen(item.userId, true)}>
                                <PlayIcon size={16} /> Смотреть трансляцию
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <video
                              autoPlay
                              playsInline
                              muted
                              ref={el => {
                                if (el && stream && el.srcObject !== stream) {
                                  el.srcObject = stream;
                                }
                              }}
                              className="remote-stream-video"
                            />
                            <div className="stream-controls-overlay">
                              <div className="stream-controls-left">
                                <div className="volume-control-wrapper">
                                  {volume === 0 ? <VolumeLowIcon size={18} /> : <VolumeHighIcon size={18} />}
                                  <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={volume}
                                    onChange={(e) => setScreenVolume(item.userId, parseFloat(e.target.value))}
                                    className="stream-volume-slider"
                                  />
                                </div>
                              </div>
                              <div className="stream-controls-right">
                                <button
                                  className="stream-control-btn"
                                  onClick={() => setExpandedStreamId(isExpanded ? null : item._id)}
                                  title={isExpanded ? 'Свернуть' : 'Развернуть'}
                                >
                                  {isExpanded ? <MinimizeIcon size={18} /> : <MaximizeIcon size={18} />}
                                </button>
                                <button
                                  className="stream-control-btn stop-watch"
                                  onClick={() => {
                                    setWatchingScreen(item.userId, false);
                                    if (isExpanded) setExpandedStreamId(null);
                                  }}
                                  title="Прекратить просмотр"
                                >
                                  Прекратить просмотр
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                        <div className="stream-overlay">
                          <div className="stream-user-info">
                            {participant?.username || 'Стрим'} в эфире
                          </div>
                        </div>
                      </div>
                    </div>
                  );

                  if (isExpanded) {
                    return ReactDOM.createPortal(cardContent, document.body);
                  }
                  return cardContent;
                }
              }

              // Normal User Card
              const participant = item;
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
              className={`control-button ${isScreenSharing ? 'active' : ''}`}
              onClick={() => isScreenSharing ? stopScreenShare() : setShowScreenSelector(true)}
              title={isScreenSharing ? 'Прекратить трансляцию' : 'Трансляция экрана'}
            >
              <VideoIcon />
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

      {showScreenSelector && (
        <ScreenSourceSelector
          onClose={() => setShowScreenSelector(false)}
          onSelect={(id) => {
            startScreenShare(id);
            setShowScreenSelector(false);
          }}
        />
      )}
    </div>
  );
};

export default VoiceChannelView;
