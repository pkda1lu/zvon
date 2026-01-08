import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useVoice } from '../contexts/VoiceContext';
import { Channel, User, Server } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { SpeakerIcon, PhoneIcon, MicMutedIcon, MicIcon, DeafenedIcon, ScreenShareIcon, StopScreenShareIcon, MaximizeIcon, MinimizeIcon } from './Icons';
import axios from 'axios';
import MemberContextMenu from './MemberContextMenu';
import StreamContextMenu from './StreamContextMenu';
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
    isScreenSharing,
    toggleScreenShare,
    connectedUsers: activeConnectedUsers,
    localStream,
    remoteStreams,
    userVolumes,
    setUserVolume,
    userStates,
    speakingUsers,
    watchedUserIds,
    toggleWatchUser
  } = useVoice();

  const [externalParticipants, setExternalParticipants] = useState<User[]>([]);
  const [focusedStreamId, setFocusedStreamId] = useState<string | null>(null);
  const [isStageFullWidth, setIsStageFullWidth] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; userId: string } | null>(null);
  const [streamContextMenu, setStreamContextMenu] = useState<{ x: number; y: number; participant: User; isMe: boolean } | null>(null);
  const handleToggleWatch = useCallback((userId: string, itemId: string) => {
    toggleWatchUser(userId);
    if (!watchedUserIds.has(userId)) {
      setFocusedStreamId(itemId);
    } else {
      if (focusedStreamId === itemId) {
        setFocusedStreamId(null);
      }
    }
  }, [toggleWatchUser, watchedUserIds, focusedStreamId]);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const transitionRef = useRef(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Listen for Electron window fullscreen events
    const win = window as any;
    let cleanup: (() => void) | undefined;
    if (win.electron && win.electron.ipc) {
      cleanup = win.electron.ipc.on('fullscreen-changed', (_: any, state: boolean) => {
        setIsFullscreen(state);
      });
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (cleanup) cleanup();
    };
  }, []);

  const setFullscreenStatus = useCallback(async (newState: boolean) => {
    if (transitionRef.current) return;
    const container = videoContainerRef.current;
    if (!container && !newState) {
      // If we are exiting but container is gone, we still need to exit window fullscreen
    } else if (!container && newState) {
      return;
    }

    const win = window as any;
    const isElectron = !!(win.electron && win.electron.ipc);

    transitionRef.current = true;
    try {
      if (isElectron) {
        const actualState = await win.electron.ipc.invoke('toggle-fullscreen', newState);
        setIsFullscreen(actualState);
      } else {
        browserFullscreenFallback(container!, newState);
      }
    } catch (err) {
      console.error('Fullscreen transition failed:', err);
    } finally {
      // Small delay to let OS/Electron finish transition
      setTimeout(() => {
        transitionRef.current = false;
      }, 500);
    }
  }, []);

  const browserFullscreenFallback = (container: HTMLElement, newState: boolean) => {
    const doc = document as any;
    if (newState) {
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        const requestFullscreen =
          container.requestFullscreen ||
          (container as any).webkitRequestFullscreen ||
          (container as any).msRequestFullscreen;

        if (requestFullscreen) {
          requestFullscreen.call(container).catch((err: any) => {
            console.error('Browser fullscreen failed:', err);
          });
        }
      }
    } else {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        const exitFullscreen = doc.exitFullscreen || doc.webkitExitFullscreen;
        if (exitFullscreen) exitFullscreen.call(doc);
      }
    }
  };

  const handleToggleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullscreenStatus(!isFullscreen);
  }, [isFullscreen, setFullscreenStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setFullscreenStatus(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, setFullscreenStatus]);

  // Exit fullscreen if focused stream is lost
  useEffect(() => {
    let timeoutId: any;

    if (!focusedStreamId && (isFullscreen || isStageFullWidth)) {
      // Use a small timeout to ensure this runs AFTER the re-render that cleared the stream
      timeoutId = setTimeout(() => {
        if (!focusedStreamId) { // Double check
          setFullscreenStatus(false);
          setIsStageFullWidth(false);
        }
      }, 100);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [focusedStreamId, isFullscreen, isStageFullWidth, setFullscreenStatus]);

  const handleCloseContextMenu = () => setContextMenu(null);

  const getDisplayName = (u: User) => {
    const member = server.members.find(m => {
      const mId = typeof m.user === 'string' ? m.user : m.user?._id;
      return String(mId) === String(u._id);
    });
    return member?.nickname || u.username;
  };

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
  }, [isConnectedToThisChannel, currentUser, activeConnectedUsers, isMuted, isDeafened, externalParticipants, localStream, remoteStreams, userStates]);

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
    <div className={`voice-channel-view ${isFullscreen ? 'app-fullscreen' : ''}`}>
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
        <MemberContextMenu
          user={displayItems.find(i => i.id === contextMenu.userId || i.data?._id === contextMenu.userId)?.data}
          server={server}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onOpenProfile={onUserClick}
        />
      )}

      <div className={`voice-channel-content ${isFullscreen ? 'is-fullscreen-mode' : ''}`}>
        {focusedStreamId ? (
          <div className={`stage-container ${isFullscreen ? 'fullscreen' : ''}`}>
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
                    <div className="maximized-video-container" ref={videoContainerRef}>
                      {focusedItem.data.isMe && focusedItem.type === 'screen' ? (
                        <div className="self-screen-placeholder">
                          <ScreenShareIcon size={64} />
                          <h3>Вы демонстрируете свой экран</h3>
                          <p>Чтобы избежать эффекта бесконечного зеркала, предпросмотр в полный экран отключен.</p>
                        </div>
                      ) : (
                        <video
                          autoPlay
                          playsInline
                          muted={true}
                          className={`maximized-video ${focusedItem.type === 'screen' ? 'is-screen' : 'is-camera'}`}
                          ref={el => {
                            if (el && focusedItem.stream && el.srcObject !== focusedItem.stream) {
                              el.srcObject = focusedItem.stream;
                            }
                          }}
                          onContextMenu={(e) => {
                            if (focusedItem.type === 'screen') {
                              e.preventDefault();
                              setStreamContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                participant: focusedItem.data,
                                isMe: focusedItem.data.isMe
                              });
                            }
                          }}
                        />
                      )}
                      <div className="stage-user-info">
                        <div className={`stage-user-avatar ${speakingUsers.has(focusedItem.data._id) ? 'speaking' : ''}`}>
                          {getAvatarUrl(focusedItem.data.avatar) ? (
                            <img src={getAvatarUrl(focusedItem.data.avatar)!} alt="" style={{ width: '100%', height: '100%' }} />
                          ) : (
                            <div style={{ background: '#5865f2', width: '100%', height: '100%' }}></div>
                          )}
                        </div>
                        <span className={`stage-user-name ${speakingUsers.has(focusedItem.data._id) ? 'speaking' : ''}`}>{getDisplayName(focusedItem.data)}</span>
                      </div>

                      <button
                        className="toggle-fullscreen-button"
                        onClick={handleToggleFullscreen}
                        title={isFullscreen ? "Свернуть" : "На весь экран"}
                      >
                        {isFullscreen ? <MinimizeIcon size={20} /> : <MaximizeIcon size={20} />}
                      </button>

                      <button
                        className="stop-watching-button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (isFullscreen) {
                            await setFullscreenStatus(false);
                          }
                          const focusedItem = displayItems.find(i => i.id === focusedStreamId);
                          if (focusedItem) {
                            toggleWatchUser(focusedItem.data._id);
                          }
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
                              e.preventDefault();
                              if (isScreen) {
                                setStreamContextMenu({ x: e.clientX, y: e.clientY, participant, isMe: participant.isMe });
                              } else {
                                if (participant.isMe) return;
                                setContextMenu({ x: e.clientX, y: e.clientY, userId: participant._id });
                              }
                            }}
                            style={{ cursor: isScreen ? 'pointer' : 'pointer' }}
                          >
                            {isScreen && participant.isMe ? (
                              <div className="participant-video-placeholder">
                                <ScreenShareIcon size={24} />
                                <span>Вы делитесь экраном</span>
                              </div>
                            ) : isScreen ? (
                              <video
                                autoPlay
                                playsInline
                                muted={true}
                                className="participant-video is-screen"
                                ref={el => {
                                  if (el && el.srcObject !== item.stream) {
                                    el.srcObject = item.stream!;
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setStreamContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    participant,
                                    isMe: participant.isMe
                                  });
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
                                  <div className={`participant-avatar ${speakingUsers.has(participant._id) ? 'speaking' : ''}`}>
                                    {getAvatarUrl(participant.avatar) ? (
                                      <img src={getAvatarUrl(participant.avatar)!} alt={participant.username} />
                                    ) : (
                                      <span>{getDisplayName(participant).charAt(0).toUpperCase()}</span>
                                    )}
                                  </div>
                                  <div className={`participant-name ${speakingUsers.has(participant._id) ? 'speaking' : ''}`}>
                                    {getDisplayName(participant)}{participant.isMe ? ' (Вы)' : ''}
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

                const isSpeaking = speakingUsers.has(participant._id);

                return (
                  <div
                    key={item.id}
                    className={`participant-card ${isScreen ? 'screen-share-card' : ''} ${isSpeaking ? 'speaking-card' : ''}`}
                    onClick={() => {
                      if (isScreen) setFocusedStreamId(item.id);
                      else onUserClick(participant._id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (isScreen) {
                        setStreamContextMenu({ x: e.clientX, y: e.clientY, participant, isMe: participant.isMe });
                      } else {
                        if (participant.isMe) return;
                        setContextMenu({ x: e.clientX, y: e.clientY, userId: participant._id });
                      }
                    }}
                    style={{ cursor: isScreen ? 'pointer' : 'pointer' }}
                  >
                    {isScreen && participant.isMe ? (
                      <div className="participant-video-placeholder grid-mode">
                        <ScreenShareIcon size={32} />
                        <span>Вы делитесь экраном</span>
                      </div>
                    ) : isScreen ? (
                      <>
                        <video
                          autoPlay
                          playsInline
                          muted={true}
                          className={`participant-video is-screen ${!watchedUserIds.has(participant._id) ? 'is-blurred' : ''}`}
                          ref={el => {
                            if (el && el.srcObject !== item.stream) {
                              el.srcObject = item.stream!;
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setStreamContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              participant,
                              isMe: participant.isMe
                            });
                          }}
                        />
                        {!watchedUserIds.has(participant._id) && (
                          <div className="watch-stream-overlay small">
                            <button
                              className="watch-stream-button small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleWatch(participant._id, item.id);
                              }}
                            >
                              Смотреть
                            </button>
                          </div>
                        )}
                        <div className="participant-screen-overlay">
                          <div className={`participant-avatar small ${isSpeaking ? 'speaking' : ''}`}>
                            {getAvatarUrl(participant.avatar) ? (
                              <img src={getAvatarUrl(participant.avatar)!} alt={participant.username} />
                            ) : (
                              <div className="avatar-placeholder-inner">{getDisplayName(participant).charAt(0).toUpperCase()}</div>
                            )}
                          </div>
                          <div className={`participant-name ${isSpeaking ? 'speaking' : ''}`}>
                            {getDisplayName(participant)} (Демонстрация)
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
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
      {streamContextMenu && (
        <StreamContextMenu
          x={streamContextMenu.x}
          y={streamContextMenu.y}
          user={streamContextMenu.participant}
          isMe={streamContextMenu.isMe}
          onClose={() => setStreamContextMenu(null)}
        />
      )}
    </div>
  );
};

export default VoiceChannelView;






