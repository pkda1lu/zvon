import React, { useMemo, useState, useEffect } from 'react';
import { useVoice } from '../contexts/VoiceContext';
import { Channel, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { SpeakerIcon, PhoneIcon, MicMutedIcon, MicIcon, DeafenedIcon, ScreenShareIcon, StopScreenShareIcon, MaximizeIcon, MinimizeIcon } from './Icons';
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
    localStream,
    remoteStreams,
    userVolumes,
    setUserVolume
  } = useVoice();

  const [externalParticipants, setExternalParticipants] = useState<User[]>([]);
  const [focusedStreamId, setFocusedStreamId] = useState<string | null>(null);
  const [isStageFullWidth, setIsStageFullWidth] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; userId: string } | null>(null);

  const handleCloseContextMenu = () => setContextMenu(null);

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

  // Combine current user and other participants for the grid
  // AND generate screen share items
  const displayItems = useMemo(() => {
    let participants: any[] = [];
    if (isConnectedToThisChannel && currentUser) {
      participants = [
        { ...currentUser, isMe: true, isMuted, isDeafened },
        ...activeConnectedUsers.map(u => ({ ...u, isMe: false }))
      ];
    } else {
      participants = externalParticipants.map(u => ({
        ...u,
        isMe: u._id === currentUser?._id,
      }));
    }

    const items: any[] = [];
    participants.forEach(p => {
      // 1. User Card
      items.push({
        id: p._id,
        type: 'user',
        data: p
      });

      // 2. Screen Share Card
      let stream: MediaStream | undefined | null = null;
      if (p.isMe) {
        stream = localStream;
      } else {
        stream = remoteStreams.get(p._id);
      }

      if (stream && stream.getVideoTracks().length > 0) {
        items.push({
          id: `${p._id}-screen`,
          type: 'screen',
          data: p,
          stream
        });
      }
    });

    return items;
  }, [isConnectedToThisChannel, currentUser, activeConnectedUsers, isMuted, isDeafened, externalParticipants, localStream, remoteStreams]);

  // Handle auto-closing of stage view if stream removes
  useEffect(() => {
    if (focusedStreamId) {
      const itemExists = displayItems.find(i => i.id === focusedStreamId);
      if (!itemExists) {
        setFocusedStreamId(null);
      }
    }
  }, [displayItems, focusedStreamId]);

  const handleConnect = () => {
    joinChannel(channel._id);
    setFocusedStreamId(null);
  };

  const handleDisconnect = () => {
    leaveChannel();
    setFocusedStreamId(null);
  };

  const gridClass = `participants-grid count-${displayItems.length > 4 ? 'more' : displayItems.length}`;

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

      {contextMenu && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={handleCloseContextMenu} />
          <div
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              background: '#18191c',
              padding: '12px',
              borderRadius: '4px',
              zIndex: 1000,
              boxShadow: '0 8px 16px rgba(0,0,0,0.24)',
              color: '#b9bbbe',
              minWidth: '200px'
            }}
          >
            <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>Громкость пользователя</div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              style={{ width: '100%', cursor: 'pointer' }}
              value={userVolumes.get(contextMenu.userId) !== undefined ? userVolumes.get(contextMenu.userId) : 1}
              onChange={(e) => setUserVolume(contextMenu.userId, parseFloat(e.target.value))}
            />
          </div>
        </>
      )}

      <div className="voice-channel-content">
        {focusedStreamId ? (
          <div className="stage-container">
            {(() => {
              const focusedItem = displayItems.find(i => i.id === focusedStreamId);
              const otherItems = displayItems.filter(i => i.id !== focusedStreamId);

              if (!focusedItem) {
                // Fallback if item gone
                setFocusedStreamId(null);
                return null;
              }

              return (
                <>
                  <div className="stage-main" style={{ flex: 1 }}>
                    <div className="maximized-video-container">
                      <video
                        autoPlay
                        playsInline
                        muted={true}
                        className="maximized-video"
                        ref={el => {
                          if (el && focusedItem.stream && el.srcObject !== focusedItem.stream) {
                            el.srcObject = focusedItem.stream;
                          }
                        }}
                      />
                      <div className="stage-user-info">
                        <div className="stage-user-avatar">
                          {getAvatarUrl(focusedItem.data.avatar) ? (
                            <img src={getAvatarUrl(focusedItem.data.avatar)!} alt="" style={{ width: '100%', height: '100%' }} />
                          ) : (
                            <div style={{ background: '#5865f2', width: '100%', height: '100%' }}></div>
                          )}
                        </div>
                        <span className="stage-user-name">{focusedItem.data.username}</span>
                      </div>

                      <button
                        className="toggle-fullscreen-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsStageFullWidth(!isStageFullWidth);
                        }}
                        title={isStageFullWidth ? "Свернуть" : "На весь экран"}
                      >
                        {isStageFullWidth ? <MinimizeIcon size={20} /> : <MaximizeIcon size={20} />}
                      </button>

                      <button
                        className="stop-watching-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedStreamId(null);
                          setIsStageFullWidth(false);
                        }}
                      >
                        Прекратить просмотр
                      </button>
                    </div>
                  </div>
                  {!isStageFullWidth && (
                    <div className="stage-sidebar">
                      {otherItems.map(item => {
                        const participant = item.data;
                        const isScreen = item.type === 'screen';
                        return (
                          <div
                            key={item.id}
                            className={`participant-card ${isScreen ? 'screen-share-card' : ''}`}
                            onClick={() => {
                              if (isScreen) setFocusedStreamId(item.id);
                              else onUserClick(participant._id);
                            }}
                            onContextMenu={(e) => {
                              if (isScreen || participant.isMe) return; // No volume control for self or screen video (screen often has no audio or same as user?)
                              // Allow screen share volume control?
                              // Usually volume is per user. The screen share audio is mixed into user audio often or separate track.
                              // In our context, screen share audio is mixed into `localStream` of the sharer, so effective 'remoteStream' of that user has both.
                              // So controlling user volume controls both voice and their screen share audio.
                              // So we attach to USER card, or Screen card?
                              // Since screen share card doesn't have easy user ID access without parsing, let's keep it simple: Right click USER card to set volume.
                              // But in stage view, user card might be in sidebar.

                              if (participant.isMe) return;

                              e.preventDefault();
                              setContextMenu({ x: e.clientX, y: e.clientY, userId: participant._id });
                            }}
                            style={{ cursor: isScreen ? 'pointer' : 'pointer' }}
                          >
                            {isScreen ? (
                              <video
                                autoPlay
                                playsInline
                                muted={true}
                                className="participant-video"
                                ref={el => {
                                  if (el && el.srcObject !== item.stream) {
                                    el.srcObject = item.stream!;
                                  }
                                }}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
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
                              {!isScreen && (participant.isMuted || participant.isDeafened) && (
                                <div className="status-icon">
                                  {participant.isDeafened ? <DeafenedIcon size={12} /> : <MicMutedIcon size={12} />}
                                </div>
                              )}
                              {isScreen && (
                                <div className="status-icon">
                                  <ScreenShareIcon size={12} />
                                </div>
                              )}
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
        ) : (
          <div className={gridClass}>
            {displayItems.length > 0 ? (
              displayItems.map((item) => {
                const participant = item.data;
                const isScreen = item.type === 'screen';

                return (
                  <div
                    key={item.id}
                    className={`participant-card ${isScreen ? 'screen-share-card' : ''}`}
                    onClick={() => {
                      if (isScreen) setFocusedStreamId(item.id);
                      else onUserClick(participant._id);
                    }}
                    onContextMenu={(e) => {
                      if (participant.isMe) return;
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, userId: participant._id });
                    }}
                    style={{ cursor: isScreen ? 'pointer' : 'pointer' }}
                  >
                    {isScreen ? (
                      <video
                        autoPlay
                        playsInline
                        muted={true}
                        className="participant-video"
                        ref={el => {
                          if (el && el.srcObject !== item.stream) {
                            el.srcObject = item.stream!;
                          }
                        }}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
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
                      {!isScreen && (participant.isMuted || participant.isDeafened) && (
                        <div className="status-icon">
                          {participant.isDeafened ? <DeafenedIcon size={12} /> : <MicMutedIcon size={12} />}
                        </div>
                      )}
                      {isScreen && (
                        <div className="status-icon">
                          <ScreenShareIcon size={12} />
                        </div>
                      )}
                    </div>

                    {isScreen && (
                      <div className="participant-name" style={{ position: 'absolute', bottom: '8px', left: '8px', zIndex: 10, background: 'rgba(0,0,0,0.7)' }}>
                        {participant.username} (Демонстрация)
                      </div>
                    )}
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
        )}

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
              className={`control-button ${isScreenSharing ? 'active screen-sharing' : ''}`}
              onClick={toggleScreenShare}
              title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
            >
              {isScreenSharing ? <StopScreenShareIcon size={20} /> : <ScreenShareIcon size={20} />}
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



