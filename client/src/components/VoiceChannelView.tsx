import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useIsPresent } from 'framer-motion';
import { useVoice, useVoiceLevels } from '../contexts/VoiceContext';
import { useCallSettings } from '../contexts/CallSettingsContext';
import { Channel, User, Server, Message } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { SpeakerIcon, PhoneIcon, MicMutedIcon, MicIcon, DeafenedIcon, MonitorIcon, PlayIcon, ChatIcon, CloseIcon, FullscreenIcon, MinimizeIcon, VolumeHighIcon, VolumeLowIcon } from './Icons';
// См. VoiceCall — модалка выбора экрана грузится по требованию.
const ScreenSourceSelector = React.lazy(() => import('./ScreenSourceSelector'));
import axios from 'axios';
import MemberContextMenu from './MemberContextMenu';
import UserAvatar from './UserAvatar';
import PresenceTile from './PresenceTile';
import ChannelView from './ChannelView';
import './panel-hero.css';
import './VoiceChannelView.css';



interface VoiceChannelViewProps {
  channel: Channel;
  server: Server;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  onMessageClick: (userId: string) => void;
  onCallClick: (userId: string) => void;
  onBack: () => void;
  isMobile: boolean;
  onToggleChat: () => void;
}

const VoiceParticipantCard: React.FC<{
  participant: any;
  isSpeaking: boolean;
  onContextMenu: any;
  getDisplayName: any;
  onClick: () => void;
  isPrimary?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}> = ({ participant, isSpeaking, onContextMenu, getDisplayName, onClick, isPrimary = false, isExpanded = false, onToggleExpand }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (participant.cameraStream && videoRef.current && videoRef.current.srcObject !== participant.cameraStream) {
      videoRef.current.srcObject = participant.cameraStream;
    }
  }, [participant.cameraStream, isExpanded]);

  useEffect(() => {
    if (isExpanded && cardRef.current) {
      const target: any = cardRef.current;
      const method = ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen', 'msRequestFullscreen']
        .find(m => typeof target[m] === 'function');
      if (method) { try { target[method]()?.catch?.(() => {}); } catch {} }
    } else if (!isExpanded) {
      const doc: any = document;
      const exitMethod = ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen', 'mozCancelFullScreen', 'msExitFullscreen']
        .find(m => typeof doc[m] === 'function');
      if (exitMethod && (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)) {
        try { doc[exitMethod](); } catch {}
      }
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const onFsChange = () => {
      const doc: any = document;
      const active = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;
      if (!active && onToggleExpand) onToggleExpand();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange as any);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange as any);
    };
  }, [isExpanded, onToggleExpand]);

  const hasVideo = !!participant.cameraStream;
  const showFullscreenBtn = isPrimary && hasVideo && onToggleExpand;

  const cardContent = (
    <div
      ref={cardRef}
      className={`p-card ${isSpeaking ? 'is-speaking' : ''} ${hasVideo ? 'has-video' : ''} ${isExpanded ? 'is-expanded' : ''}`}
      onContextMenu={onContextMenu}
      onClick={onClick}
    >
      {hasVideo && <video ref={videoRef} autoPlay playsInline muted className="p-camera-video" />}
      {!hasVideo && participant.banner && <div className="p-bg" style={{ backgroundImage: `url(${getFullUrl(participant.banner)})` }} />}
      {!hasVideo && <div className="p-avatar-wrap"><UserAvatar user={participant} avatarOverride={participant.avatar} size={64} animate={true} className="p-avatar" /></div>}
      
      {showFullscreenBtn && (
        <div className="stream-controls-overlay top" onClick={e => e.stopPropagation()}>
          <div className="stream-controls-left" />
          <div className="stream-controls-right">
            <button
              className="stream-control-btn"
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              title={isExpanded ? 'Свернуть' : 'Развернуть'}
            >
              {isExpanded ? <MinimizeIcon size={18} /> : <FullscreenIcon size={18} />}
            </button>
          </div>
        </div>
      )}

      <div className="p-info"><div className="p-name-row"><span className="p-name">{getDisplayName(participant)}</span></div></div>
      <div className="p-indicators">
        {(participant.isMuted || participant.isDeafened) && <div className="ind-icon is-muted">{participant.isDeafened ? <DeafenedIcon size={18} /> : <MicMutedIcon size={18} />}</div>}
        {isSpeaking && <div className="ind-icon"><MicIcon size={18} color="#ffffff" /></div>}
      </div>
    </div>
  );

  return isExpanded ? createPortal(cardContent, document.body) : cardContent;
};

const VoiceStreamCard: React.FC<{
  item: any;
  getDisplayName: (u: User) => string;
  remoteScreenStreams: Map<string, MediaStream>;
  watchedScreenIds: Set<string>;
  setWatchingScreen: (uId: string, w: boolean) => void;
  onClick: () => void;
  screenStream: MediaStream | null;
  isPrimary?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  screenVolumes: Map<string, number>;
  setScreenVolume: (userId: string, volume: number) => void;
}> = ({ item, getDisplayName, remoteScreenStreams, watchedScreenIds, setWatchingScreen, onClick, screenStream, isPrimary = false, isExpanded, onToggleExpand, screenVolumes, setScreenVolume }) => {
  const isMe = item.isMe;
  const stream = isMe ? screenStream : remoteScreenStreams.get(item.userId);
  const isWatching = isMe || watchedScreenIds.has(item.userId);
  const volume = screenVolumes.get(item.userId) ?? 1;
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoRef.current && stream && isWatching && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = isMe;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, isMe, isWatching, isExpanded]);

  useEffect(() => {
    if (videoRef.current) {
        videoRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (isExpanded && viewportRef.current) {
      const target: any = viewportRef.current;
      const method = ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen', 'msRequestFullscreen']
        .find(m => typeof target[m] === 'function');
      if (method) { try { target[method]()?.catch?.(() => {}); } catch {} }
    } else if (!isExpanded) {
      const doc: any = document;
      const exitMethod = ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen', 'mozCancelFullScreen', 'msExitFullscreen']
        .find(m => typeof doc[m] === 'function');
      if (exitMethod && (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)) {
        try { doc[exitMethod](); } catch {}
      }
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const onFsChange = () => {
      const doc: any = document;
      const active = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;
      if (!active) onToggleExpand();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange as any);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange as any);
    };
  }, [isExpanded, onToggleExpand]);

  const card = (
    <div className={`p-card ${isExpanded ? 'is-expanded' : ''}`} onClick={onClick}>
      <div className="stream-viewport" ref={viewportRef}>
        {(stream && isWatching) ? (
          <>
            <video autoPlay playsInline ref={videoRef} className="stream-video" muted={isMe} />
            {isPrimary && (
              <div className="stream-controls-overlay top" onClick={e => e.stopPropagation()}>
                <div className="stream-controls-left">
                  {!isMe && (
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
                  )}
                </div>
                <div className="stream-controls-right">
                  <button
                    className="stream-control-btn"
                    onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                    title={isExpanded ? 'Свернуть' : 'Развернуть'}
                  >
                    {isExpanded ? <MinimizeIcon size={18} /> : <FullscreenIcon size={18} />}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="stream-overlay">
            <div className="stream-icon-glow"><MonitorIcon size={64} /></div>
            {!isMe && <button className="btn-watch" onClick={(e) => { e.stopPropagation(); setWatchingScreen(item.userId, true); onClick(); }}><PlayIcon size={18} /><span>Смотреть</span></button>}
            {isMe && <div className="p-name">Загрузка вашей трансляции...</div>}
          </div>
        )}
        <div className="p-info"><span className="p-name">{isMe ? 'Ваш стрим' : (item.participantName || 'Стрим')}</span>{(isMe || isWatching) && <span className="p-badge badge-live">LIVE</span>}</div>
      </div>
    </div>
  );

  return isExpanded ? createPortal(card, document.body) : card;
};

const getGridDimensions = (count: number) => {
  if (count <= 1) return { rows: 1, cols: 1 };
  if (count <= 2) return { rows: 1, cols: 2 };
  if (count <= 4) return { rows: 2, cols: 2 };
  if (count <= 6) return { rows: 2, cols: 3 };
  if (count <= 9) return { rows: 3, cols: 3 };
  if (count <= 12) return { rows: 3, cols: 4 };
  if (count <= 16) return { rows: 4, cols: 4 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { rows, cols };
};

const VoiceChannelView: React.FC<VoiceChannelViewProps> = ({ channel, server, onUserClick, onToggleChat }) => {
  const isPresent = useIsPresent();
  const { user: currentUser } = useAuth();
  const { socket, connected } = useSocket();
  const { settings: callSettings } = useCallSettings();
  const {
    isConnected, activeChannelId, joinChannel, leaveChannel, isMuted, isDeafened, toggleMute, toggleDeafen,
    connectedUsers: activeConnectedUsers, userStates, isScreenSharing, startScreenShare, stopScreenShare,
    screenStream, remoteScreenStreams, watchedScreenIds, setWatchingScreen, remoteStreams, isVideoOn, toggleVideo,
    localCameraStream, voicePresences, presenceAudioStreams, presenceVideoStreams, sendPresenceControl,
    presenceVolumes, setPresenceVolume, screenVolumes, setScreenVolume,
  } = useVoice();
  const { speakingUsers = new Set<string>() } = useVoiceLevels() || {};

  const [externalParticipants, setExternalParticipants] = useState<User[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, userId: string } | null>(null);
  const [showScreenSelector, setShowScreenSelector] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  // Развёрнутая («на весь экран») трансляция — независимо от фокуса в сетке.
  const [expandedStreamId, setExpandedStreamId] = useState<string | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [ctrlsRect, setCtrlsRect] = useState<{ bottom: number, left: number, width: number } | null>(null);

  // Участник может отсутствовать (гонка при перезаходе в канал) или прийти
  // с непопулированным m.user — обе ситуации раньше роняли рендер на чтении _id.
  const getDisplayName = (u?: User | null) => {
    if (!u) return 'Участник';
    return server.members.find(m => String((m.user as any)?._id || m.user) === String(u._id))?.nickname
      || u.displayName || u.username;
  };
  const isConnectedToThisChannel = isConnected && activeChannelId === channel._id;
  
  useEffect(() => {
    axios.get(`/api/channels/${channel._id}/voice-participants`).then(res => setExternalParticipants(res.data)).catch(() => {});
    if (!socket) return;
    const handleUpdate = (data: { channelId: string; users: User[] }) => { if (data.channelId === channel._id) setExternalParticipants(data.users); };
    socket.on('voice-channel-users-update', handleUpdate);
    return () => { socket.off('voice-channel-users-update', handleUpdate); };
  }, [channel._id, socket]);

  useEffect(() => {
    if (!viewRef.current) return;
    const observer = new ResizeObserver(() => { if (viewRef.current) setCtrlsRect(viewRef.current.getBoundingClientRect()); });
    observer.observe(viewRef.current);
    return () => observer.disconnect();
  }, []);

  const displayParticipants = useMemo(() => {
    let items: any[] = [];
    if (isConnectedToThisChannel && currentUser) {
      const seenIds = new Set<string>();
      items.push({ ...currentUser, isMe: true, isMuted, isDeafened, type: 'user', cameraStream: isVideoOn ? localCameraStream : null });
      seenIds.add(currentUser._id);
      if (isScreenSharing) items.push({ _id: `stream-${currentUser._id}`, userId: currentUser._id, type: 'stream', isMe: true });

      activeConnectedUsers.forEach(u => {
        if (seenIds.has(u._id)) return;
        const state = userStates.get(u._id) || { isMuted: false, isDeafened: false, isVideoOn: false, isScreenSharing: false };
        items.push({ ...u, isMe: false, isMuted: state.isMuted, isDeafened: state.isDeafened, type: 'user', cameraStream: state.isVideoOn ? remoteStreams.get(u._id) : null });
        seenIds.add(u._id);
        if (state.isScreenSharing || remoteScreenStreams.has(u._id)) items.push({ _id: `stream-${u._id}`, userId: u._id, type: 'stream', isMe: false });
      });
    } else {
      items = externalParticipants.map(u => ({ ...u, type: 'user' }));
    }

    voicePresences.forEach(p => { if (p.channelId === `channel-${channel._id}`) items.push({ _id: `presence-${p.sessionId}`, type: 'presence', presence: p }); });

    return items.sort((a, b) => (a.type === 'stream' && b.type !== 'stream') ? -1 : (a.type !== 'stream' && b.type === 'stream') ? 1 : 0);
  }, [isConnectedToThisChannel, currentUser, activeConnectedUsers, isMuted, isDeafened, isScreenSharing, isVideoOn, localCameraStream, externalParticipants, userStates, remoteScreenStreams, remoteStreams, voicePresences, channel._id]);

  // Трансляция пропала (стример выключил демку / мы вышли из канала) — снимаем
  // разворот, иначе следующий стрим того же участника сразу открылся бы на весь экран.
  useEffect(() => {
    if (expandedStreamId && !displayParticipants.some(p => p._id === expandedStreamId)) {
      setExpandedStreamId(null);
    }
  }, [displayParticipants, expandedStreamId]);

  const handleParticipantClick = (item: any) => {
    if (item._id === focusedItemId) {
      setFocusedItemId(null);
    } else {
      setFocusedItemId(item._id);
      if (item.type === 'stream' && !item.isMe && !watchedScreenIds.has(item.userId)) {
        setWatchingScreen(item.userId, true);
      }
    }
  };

  const renderItem = (item: any, isFocused: boolean = false) => {
    const clickHandler = () => handleParticipantClick(item);

    switch (item.type) {
      case 'stream': {
        // Автор трансляции может на миг отсутствовать в обоих списках: при быстром
        // перезаходе в канал старый список участников уже без нас, а обновлённый
        // ещё не пришёл. Для своей же демонстрации берём currentUser, иначе —
        // безопасный фолбэк. Раньше здесь стоял getDisplayName(user!) и рендер
        // падал с TypeError (белый экран вместо звонка).
        const user = activeConnectedUsers.find(u => u._id === item.userId)
          || externalParticipants.find(u => u._id === item.userId)
          || (item.isMe ? currentUser : null);
        return <VoiceStreamCard key={item._id} item={{ ...item, participantName: getDisplayName(user) }} getDisplayName={getDisplayName} remoteScreenStreams={remoteScreenStreams} watchedScreenIds={watchedScreenIds} setWatchingScreen={setWatchingScreen} onClick={clickHandler} screenStream={screenStream} isPrimary={isFocused} isExpanded={expandedStreamId === item._id} onToggleExpand={() => setExpandedStreamId(prev => prev === item._id ? null : item._id)} screenVolumes={screenVolumes} setScreenVolume={setScreenVolume} />;
      }
      case 'presence':
        return <PresenceTile key={item._id} presence={item.presence} videoStream={presenceVideoStreams.get(item.presence.sessionId)} volume={presenceVolumes.get(item.presence.sessionId) ?? 1} onVolumeChange={(v) => setPresenceVolume(item.presence.sessionId, v)} onControl={(cid, val) => sendPresenceControl(item.presence.channelId, item.presence.sessionId, cid, val)} />;
      default: {
        const member = server.members.find(m => String((m.user as any)._id || m.user) === String(item._id));
        return <VoiceParticipantCard key={item._id} participant={{...item, avatar: member?.avatar || undefined}} isSpeaking={speakingUsers.has(item._id) && !item.isMuted} getDisplayName={getDisplayName} onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); if (!item.isMe) setContextMenu({ x: e.clientX, y: e.clientY, userId: item._id }); }} onClick={clickHandler} isPrimary={isFocused} isExpanded={expandedStreamId === item._id} onToggleExpand={() => setExpandedStreamId(prev => prev === item._id ? null : item._id)} />;
      }
    }
  };
  
  const focusedItem = focusedItemId ? displayParticipants.find(p => p._id === focusedItemId) : null;
  const gridDimensions = getGridDimensions(displayParticipants.length);

  const renderLayout = () => {
    const selectedLayout = (callSettings.layout === 'strip') ? 'strip' : 'sidebar';
    const effectiveLayout = !focusedItem ? 'grid' : selectedLayout;
    
    if (effectiveLayout === 'grid') {
      return <div className="grid-wrap"><div className={`v-grid count-${displayParticipants.length}`} style={{ gridTemplateColumns: `repeat(${gridDimensions.cols}, 1fr)`, gridTemplateRows: `repeat(${gridDimensions.rows}, 1fr)` }}>{displayParticipants.map(item => renderItem(item))}</div></div>;
    }
    
    const mainItem = focusedItem;
    const otherItems = displayParticipants.filter(p => p._id !== mainItem?._id);

    if (effectiveLayout === 'sidebar') {
      return <div className="stage-wrap"><div className="stage-primary">{mainItem && renderItem(mainItem, true)}</div><div className="stage-aux">{otherItems.map(item => renderItem(item))}</div></div>;
    }
    
    if (effectiveLayout === 'strip') {
      return <div className="strip-wrap"><div className="strip-primary">{mainItem && renderItem(mainItem, true)}</div><div className="strip-aux">{otherItems.map(item => renderItem(item))}</div></div>;
    }
    
    return null;
  };

  return (
    <div className="voice-channel-view panel-hero" ref={viewRef}>
      <div className="panel-hero-bg" aria-hidden="true"><div className="blob cyan" /><div className="blob purple" /><div className="blob pink" /></div>
      <header className="voice-hdr">
        <div className="hdr-left"><h1><div className="voice-status-indicator inline"><div className="pulse-ring"></div><div className="status-dot"></div></div>{channel.name}</h1></div>
        <div className="hdr-right">{channel.topic && <div className="channel-topic-tag">{channel.topic}</div>}<button className={`voice-chat-toggle-btn`} onClick={onToggleChat} title={'Открыть чат'}><ChatIcon size={18} /></button></div>
      </header>
      {contextMenu && <MemberContextMenu user={displayParticipants.find(p => p._id === contextMenu.userId)} server={server} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onOpenProfile={onUserClick} />}
      <div className="voice-body">
        <main className="voice-canvas">{displayParticipants.length > 0 ? renderLayout() : <div className="v-empty"><div className="v-empty-icon"><SpeakerIcon size={64} /></div>{!isConnectedToThisChannel && <div className="v-empty-sub">Нажмите кнопку соединения внизу, чтобы начать</div>}</div>}</main>
      </div>
      
      {isPresent && createPortal(<div className="voice-ctrls-anchor" style={ctrlsRect ? { position: 'fixed', bottom: window.innerHeight - ctrlsRect.bottom, left: ctrlsRect.left, width: ctrlsRect.width, right: 'auto' } : undefined}>
        {isConnectedToThisChannel ? (
          <div className="voice-ctrls">
            <button className={`ctrl-btn ${isMuted ? 'active' : ''}`} onClick={toggleMute} title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}>{isMuted ? <MicMutedIcon size={20} /> : <MicIcon size={20} />}</button>
            <button className={`ctrl-btn ${isDeafened ? 'active' : ''}`} onClick={toggleDeafen} title={isDeafened ? 'Включить звук' : 'Выключить звук'}>{isDeafened ? <DeafenedIcon size={20} /> : <SpeakerIcon size={20} />}</button>
            <button className={`ctrl-btn ${isVideoOn ? 'streaming' : ''}`} onClick={toggleVideo} title={isVideoOn ? 'Выключить камеру' : 'Включить камеру'}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></button>
            <button className={`ctrl-btn ${isScreenSharing ? 'streaming' : ''}`} onClick={() => { if (isScreenSharing) stopScreenShare(); else { if ((window as any).electron) setShowScreenSelector(true); else startScreenShare('', { resolution: '1080', frameRate: '30', videoCodec: 'vp9', withAudio: true }); }}} title={isScreenSharing ? 'Прекратить трансляцию' : 'Трансляция экрана'}><MonitorIcon size={20} /></button>
            <div className="ctrl-sep"></div>
            <button className="ctrl-btn hangup" onClick={() => { setFocusedItemId(null); leaveChannel(); }} title="Отключиться"><PhoneIcon size={20} /></button>
          </div>
        ) : connected && <button className="btn-join" onClick={() => joinChannel(channel._id)}>Подключиться</button>}
      </div>, document.getElementById('voice-controls-portal') || document.body)}
      {showScreenSelector && <React.Suspense fallback={null}><ScreenSourceSelector onClose={() => setShowScreenSelector(false)} onSelect={(id, opts) => { startScreenShare(id, { resolution: opts.resolution, frameRate: opts.frameRate, videoCodec: opts.videoCodec, withAudio: opts.withAudio }); setShowScreenSelector(false); }} /></React.Suspense>}
    </div>
  );
};

export default VoiceChannelView;
