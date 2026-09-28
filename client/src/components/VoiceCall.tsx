import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Socket } from 'socket.io-client';
import axios from 'axios';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useVoice } from '../contexts/VoiceContext';
import { getAvatarUrl } from '../utils/avatar';
import { createNoiseProcessor } from '../utils/audioProcessing';
import { SOUNDS, soundManager } from '../utils/sounds';
import { useDialog } from '../contexts/DialogContext';
import { PhoneIcon, MicIcon, MicMutedIcon, VideoIcon, CameraIcon, CloseIcon, CheckIcon, ScreenShareIcon, StopScreenShareIcon, MonitorIcon } from './Icons';
// Выбор источника экрана нужен только при старте демонстрации — ленивый чанк.
const ScreenSourceSelector = React.lazy(() => import('./ScreenSourceSelector'));
import UserAvatar from './UserAvatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import { nativeAudioManager } from '../utils/nativeAudio';
import { getBrand } from '../utils/branding';
import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Track,
  VideoPresets,
  LocalAudioTrack,
  DisconnectReason
} from 'livekit-client';
import { openDesktopSource } from '../utils/desktopCapture';
import './VoiceCall.css';
import './MemberContextMenu.css';

interface VoiceCallProps {
  socket: Socket | null;
  otherUser: User;
  dmId: string;
  isGroup?: boolean;
  dmName?: string;
  onEndCall: () => void;
  initialIncomingCall?: boolean;
  /** Войти в уже идущий звонок группы: без вызова остальных и ожидания ответа. */
  joinExisting?: boolean;
  initialOffer?: any;
  onOpenProfile?: (userId: string, event?: React.MouseEvent) => void;
  // Вызывается перед подключением к ЛС-звонку — чтобы выйти из голосового канала
  // сервера (нельзя быть в двух голосовых сразу: конфликт микрофона/LiveKit).
  onCallConnecting?: () => Promise<void> | void;
}

const RemoteAudioPlayer: React.FC<{
  stream: MediaStream;
  volume: number;
  muted: boolean;
}> = ({ stream, volume, muted }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!stream) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    audio.muted = false;
    const tryPlay = () => audio.play().catch((e) => {
      if (e?.name !== 'AbortError') setTimeout(() => audio.play().catch(() => { }), 300);
      // Автоплей заблокирован — повторим при следующем клике пользователя.
      const retry = () => { audio.play().catch(() => { }); document.removeEventListener('click', retry); };
      document.addEventListener('click', retry, { once: true });
    });
    tryPlay();
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(Math.max(muted ? 0 : volume, 0), 1);
    }
  }, [volume, muted]);

  return <audio ref={audioRef} autoPlay playsInline />;
};

// Контекстное меню участника личного звонка (ПКМ) — повторяет поведение меню
// в голосовых каналах сервера: профиль, громкость для себя, локальный мут.
const DmCallContextMenu: React.FC<{
  x: number; y: number; username: string; isSelf: boolean;
  volume: number; isLocalMuted: boolean;
  onVolume: (v: number) => void; onToggleMute: () => void;
  onProfile: () => void; onClose: () => void;
}> = ({ x, y, username, isSelf, volume, isLocalMuted, onVolume, onToggleMute, onProfile, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let fx = x, fy = y;
    if (fx + r.width > window.innerWidth) fx = window.innerWidth - r.width - 12;
    if (fy + r.height > window.innerHeight) fy = window.innerHeight - r.height - 12;
    setPos({ top: Math.max(10, fy), left: Math.max(10, fx) });
    setVisible(true);
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className="member-context-menu"
      style={{ top: pos.top, left: pos.left, visibility: visible ? 'visible' : 'hidden' }}
    >
      <div className="menu-group">
        <div className="menu-item" onClick={() => { onProfile(); onClose(); }}>Профиль</div>
      </div>
      {!isSelf && (
        <>
          <div className="menu-separator" />
          <div className="menu-group">
            <div className="menu-label">
              <span>Громкость пользователя</span>
              <span className="volume-percent">{Math.round(volume * 100)}%</span>
            </div>
            <div className="volume-slider-container">
              <input type="range" min="0" max="2" step="0.01" value={volume} onChange={(e) => onVolume(parseFloat(e.target.value))} className="menu-volume-slider" onClick={(e) => e.stopPropagation()} />
            </div>
            <div className="menu-item check-item" onClick={(e) => { e.stopPropagation(); onToggleMute(); }}>
              <span>Заглушить (для себя)</span>
              <div className={`checkbox ${isLocalMuted ? 'checked' : ''}`}>{isLocalMuted && '✓'}</div>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body
  );
};

const VoiceCall: React.FC<VoiceCallProps> = ({
  socket, otherUser, dmId, isGroup = false, dmName, onEndCall, initialIncomingCall = false, joinExisting = false, onOpenProfile, onCallConnecting
}) => {
  const { user } = useAuth();
  const { alert } = useDialog();
  const brand = getBrand();
  const { noiseSuppressionMode, setNoiseSuppressionMode, userVolumes, setUserVolume, localMutes, toggleLocalMute, isDeafened: isGlobalDeafened } = useVoice();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isIncomingCall, setIsIncomingCall] = useState(initialIncomingCall);
  const [isRinging, setIsRinging] = useState(!initialIncomingCall && !joinExisting);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [showScreenSelector, setShowScreenSelector] = useState(false);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteSharingScreen, setRemoteSharingScreen] = useState<Set<string>>(new Set());
  const [watchingParticipants, setWatchingParticipants] = useState<Set<string>>(new Set());
  const [participantsMetadata, setParticipantsMetadata] = useState<Map<string, User>>(new Map());
  // id видеотреков, которые на паузе/завершены (нативный mute/ended) — чтобы не показывать застывший кадр
  const [mutedVideoIds, setMutedVideoIds] = useState<Set<string>>(new Set());

  // Кто говорит и у кого выключен микрофон — по событиям комнаты звонка.
  // Раньше обводка бралась из useVoiceLevels(), а это состояние голосового
  // канала сервера: в личном звонке оно пустое, и обводка не работала.
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [micMutedIds, setMicMutedIds] = useState<Set<string>>(new Set());

  // Свёрнутый режим: звонок остаётся подключённым, показываем компактный
  // перетаскиваемый виджет поверх интерфейса вместо полноэкранного вида.
  const [isMinimized, setIsMinimized] = useState(false);
  const [widgetPos, setWidgetPos] = useState({ x: window.innerWidth - 320, y: window.innerHeight - 180 });
  const [isDraggingWidget, setIsDraggingWidget] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Контекстное меню участника (ПКМ): профиль, громкость, локальный мут.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; userId: string } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const ringTimeoutRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const wasCallEstablishedRef = useRef(false);
  const notificationSentRef = useRef(false);
  const mountedAtRef = useRef<number>(Date.now());
  const hasJoinedRoomRef = useRef(false);

  // Пока окно звонка открыто (включая вызов), главный процесс держит режим
  // голоса: повышенный приоритет и без троттлинга Windows (power.rs).
  useEffect(() => {
    const ipc = (window as any).electron?.ipc;
    ipc?.send('call-active', true);
    return () => ipc?.send('call-active', false);
  }, []);

  const fetchMetadata = useCallback(async (userId: string) => {
    if (participantsMetadata.has(userId)) return;
    try {
      const { data } = await axios.get(`/api/users/${userId}`);
      setParticipantsMetadata(prev => new Map(prev).set(userId, data));
    } catch (e) { }
  }, [participantsMetadata]);

  useEffect(() => {
    if (!socket || !dmId) return;
    if (joinExisting) {
      // Звонок уже идёт: входим в комнату и сразу подключаемся к LiveKit.
      hasJoinedRoomRef.current = true;
      socket.emit('join-dm-call', { dmId });
      joinLiveKitRoomRef.current();
    } else if (!initialIncomingCall) {
      hasJoinedRoomRef.current = true;
      socket.emit('join-dm-call', { dmId });
      // If it's a group, we don't need targetUserId
      socket.emit('call-offer', {
        targetUserId: isGroup ? null : String(otherUser._id),
        dmId: String(dmId),
        offer: null
      });
      ringTimeoutRef.current = setTimeout(() => endCall(), 45000);
    }

    const handleOtherUserJoined = (data: { userId: string }) => {
      if (isGroup || String(data.userId) === String(otherUser._id)) {
        setIsRinging(false);
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        joinLiveKitRoom();
        if (isGroup) fetchMetadata(data.userId);
      }
    };

    const handleIncomingOffer = () => {
      if (!isCallActive) setIsIncomingCall(true);
    };

    const handleExistingUsers = (users: string[]) => {
      if (users.length > 0) {
        setIsRinging(false);
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        joinLiveKitRoom();
        if (isGroup) users.forEach(uid => fetchMetadata(uid));
      }
    };

    const handleUserLeft = (data: { userId: string }) => {
      if (isGroup) {
        // Состав сетки ведёт LiveKit. Сокет мог оборваться, а голос — нет:
        // тогда человек в комнате, и убирать его плитку нельзя.
        if (roomRef.current?.remoteParticipants.has(String(data.userId))) return;
        setRemoteParticipants(prev => prev.filter(p => p.identity !== data.userId));
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
      } else if (String(data.userId) === String(otherUser._id)) {
        // Only end if call is already established or we are the caller and they joined then left
        if (isCallActive || !isIncomingCall) {
           // Small delay to avoid race conditions with re-renders
           setTimeout(() => {
             if (roomRef.current || isCallActive) endCall();
           }, 1000);
        }
      }
    };

    // call-end: для 1:1 завершаем; для группы выход одного НЕ завершает звонок у
    // остальных — это обрабатывается через dm-call-user-left.
    const handleCallEnd = () => {
      if (!isGroup) endCall();
    };

    // Сокет переподключился (обрыв сети, сон ПК) — возвращаемся в комнату
    // звонка на сервере. Без этого групповой звонок переставал получать
    // события о входе и выходе участников и о его завершении.
    const handleReconnect = () => {
      if (hasJoinedRoomRef.current && !endedRef.current) socket.emit('join-dm-call', { dmId });
    };
    socket.io.on('reconnect', handleReconnect);

    socket.on('call-offer', handleIncomingOffer);
    socket.on('call-end', handleCallEnd);
    socket.on('dm-call-user-joined', handleOtherUserJoined);
    socket.on('dm-call-existing-users', handleExistingUsers);
    socket.on('dm-call-user-left', handleUserLeft);

    return () => {
      const duration = Date.now() - mountedAtRef.current;
      if (!initialIncomingCall && !wasCallEstablishedRef.current && !notificationSentRef.current && dmId && duration > 3000 && !isGroup) {
        notificationSentRef.current = true;
        axios.post(`/api/direct-messages/${dmId}/messages`, { content: 'Пропущенный звонок', type: 'missed-call' }).catch(() => { });
      }
      if (dmId && hasJoinedRoomRef.current) socket.emit('leave-dm-call', { dmId });
      // ВАЖНО: снимаем ТОЛЬКО свои обработчики (по ссылке). Безымянный socket.off('call-offer')
      // удалял глобальный слушатель входящих звонков в Main.tsx — из-за чего после первого
      // звонка входящие (в т.ч. групповые) переставали приходить.
      socket.off('call-offer', handleIncomingOffer);
      socket.off('call-end', handleCallEnd);
      socket.off('dm-call-user-joined', handleOtherUserJoined);
      socket.off('dm-call-existing-users', handleExistingUsers);
      socket.off('dm-call-user-left', handleUserLeft);
      socket.io.off('reconnect', handleReconnect);
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      cleanupStreams();
    };
  }, [socket, dmId, isGroup]);

  const joiningRoomRef = useRef(false);

  // Пересобирает локальный стрим (микрофон + камера) из публикаций — новый объект
  // на каждое изменение, чтобы локальная плитка обновлялась и не зависала при выкл. камеры.
  const syncLocalStream = () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const tracks: MediaStreamTrack[] = [];
    const mic = lp.getTrackPublication(Track.Source.Microphone);
    const cam = lp.getTrackPublication(Track.Source.Camera);
    if (mic?.track) tracks.push(mic.track.mediaStreamTrack!);
    if (cam?.track && !cam.isMuted) tracks.push(cam.track.mediaStreamTrack!);
    setLocalStream(tracks.length ? new MediaStream(tracks) : null);
  };

  // Подключает выбранный режим шумоподавления к локальному микрофону:
  // 'rnnoise'/'deepfilter' — свой процессор поверх трека, 'standard' — нативное
  // подавление браузера (из audioCaptureDefaults), 'none' — снимаем процессор.
  const applyMicNoiseProcessor = async () => {
    const track = roomRef.current?.localParticipant
      .getTrackPublication(Track.Source.Microphone)?.track;
    if (!(track instanceof LocalAudioTrack)) return;
    try {
      const processor = createNoiseProcessor(noiseSuppressionMode);
      if (processor) await track.setProcessor(processor);
      else if (track.getProcessor()) await track.stopProcessor();
      syncLocalStream();
    } catch (e) {
      console.warn('[DM Voice] не удалось применить шумоподавление:', e);
    }
  };

  // Смена режима шумоподавления во время звонка — переустанавливаем процессор.
  useEffect(() => {
    if (isCallActive) applyMicNoiseProcessor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseSuppressionMode]);

  const setMicMuted = (identity: string, muted: boolean) => {
    const id = String(identity);
    setMicMutedIds(prev => {
      if (prev.has(id) === muted) return prev;
      const next = new Set(prev);
      if (muted) next.add(id); else next.delete(id);
      return next;
    });
  };

  const joinLiveKitRoom = async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (roomRef.current || joiningRoomRef.current) return !!roomRef.current;
    joiningRoomRef.current = true;
    // Выходим из голосового канала сервера ДО захвата микрофона ЛС-звонком —
    // иначе две LiveKit-комнаты конфликтуют за устройство (и пользователь остаётся
    // «висеть» в серверном войсе). Ошибку выхода не даём заблокировать звонок.
    try { await onCallConnecting?.(); } catch (e) { console.warn('[DM Voice] leave server voice before call failed:', e); }
    console.log('[DM Voice] media handlers v3 — deafened:', isGlobalDeafened);
    try {
      const { data } = await axios.get('/api/livekit/token', {
        params: {
          roomName: `call-${dmId}`,
          identity: user?._id?.toString()
        }
      });

      const { token, serverUrl } = data;
      // Без adaptiveStream и dynacast, как в голосовых каналах сервера.
      // adaptiveStream приостанавливал видео, как только <video> пропадал из
      // вида (свернули окно, переключились на другой экран), а dynacast у
      // показывающего выключал кодирование единственного слоя демонстрации —
      // после возврата картинка оставалась застывшей.
      const room = new Room({
        // Нативное подавление — только для 'standard'; для AI-режимов выключаем,
        // чтобы не было двойной обработки (её сделает наш процессор поверх трека).
        audioCaptureDefaults: {
          noiseSuppression: noiseSuppressionMode === 'standard',
        },
        publishDefaults: {
          dtx: true, simulcast: true, red: true,
          screenShareEncoding: { maxBitrate: 10_000_000, maxFramerate: 30 },
          screenShareSimulcastLayers: [],
        }
      });

      roomRef.current = room;

      room
        .on(RoomEvent.ParticipantConnected, (participant) => {
          // Переподключившийся участник (потеря пакетов, смена сети) приходит
          // заново — заменяем, а не добавляем: иначе в сетке было две плитки.
          setRemoteParticipants(prev => [...prev.filter(p => p.identity !== participant.identity), participant]);
          if (isGroup) fetchMetadata(participant.identity);
        })
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          setRemoteParticipants(prev => prev.filter(p => p.identity !== participant.identity));
          setMicMuted(participant.identity, false);
          setRemoteStreams(prev => {
            const next = new Map(prev);
            next.delete(participant.identity);
            return next;
          });
          setRemoteScreenStreams(prev => {
            const next = new Map(prev);
            next.delete(participant.identity);
            return next;
          });
          setRemoteSharingScreen(prev => {
            const next = new Set(prev);
            next.delete(participant.identity);
            return next;
          });
          setWatchingParticipants(prev => {
            const next = new Set(prev);
            next.delete(participant.identity);
            return next;
          });
        })
        .on(RoomEvent.TrackPublished, (publication, participant) => {
          if (publication.source === Track.Source.Microphone) setMicMuted(participant.identity, publication.isMuted);
          if (publication.source === Track.Source.ScreenShare) {
            setRemoteSharingScreen(prev => new Set(prev).add(participant.identity));
            publication.setSubscribed(false);
          }
        })
        .on(RoomEvent.TrackUnpublished, (publication, participant) => {
          if (publication.source === Track.Source.ScreenShare) {
            setRemoteSharingScreen(prev => {
              const next = new Set(prev);
              next.delete(participant.identity);
              return next;
            });
            setWatchingParticipants(prev => {
              const next = new Set(prev);
              next.delete(participant.identity);
              return next;
            });
          }
        })
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          // Нативные mute/ended на самом MediaStreamTrack — срабатывают, когда кадры
          // реально прекращаются (камера/экран выключены), даже если LiveKit не шлёт unsubscribe.
          if (track.kind === Track.Kind.Video) {
            const mst = track.mediaStreamTrack;
            const markMuted = () => setMutedVideoIds(prev => new Set(prev).add(mst.id));
            const markLive = () => setMutedVideoIds(prev => { const n = new Set(prev); n.delete(mst.id); return n; });
            mst.addEventListener('mute', markMuted);
            mst.addEventListener('unmute', markLive);
            mst.addEventListener('ended', markMuted);
            if (mst.muted) markMuted(); else markLive();
          }
          if (track.kind === Track.Kind.Audio) {
            console.log('[DM Voice] audio subscribed from', participant.identity);
          }
          if (publication.source === Track.Source.ScreenShare) {
            // Качество/размер подписки выбирает adaptiveStream по реальному <video>.
            // Раньше тут принудительно запрашивали 4K (setVideoDimensions 3840×2160 +
            // VideoQuality.HIGH) — это конфликтовало с adaptiveStream и порождало шторм
            // UpdateSubscription, из-за чего у зрителей переговоры подписчика отваливались
            // в бесконечный reconnect при старте демонстрации.
            soundManager.play(SOUNDS.SCREENSHARE_ON, 0.4);
            setRemoteScreenStreams(prev => {
              const next = new Map(prev);
              const existing = next.get(participant.identity);
              // Один живой трек каждого вида: при перепубликации (камера
              // выключилась и включилась, демонстрация перезапустилась) старый
              // завершённый трек оставался в потоке первым, а <video> играет
              // именно первый — картинка застывала последним кадром.
              const tracks = existing
                ? existing.getTracks().filter(t => t.id !== track.mediaStreamTrack!.id
                    && t.kind !== track.mediaStreamTrack!.kind
                    && t.readyState !== 'ended')
                : [];
              tracks.push(track.mediaStreamTrack!);
              next.set(participant.identity, new MediaStream(tracks));
              return next;
            });
          } else {
            // ВАЖНО: создаём НОВЫЙ MediaStream (новая ссылка) на каждое добавление трека,
            // иначе <audio>/<video> не переподхватывают srcObject и поздно пришедший
            // аудиотрек собеседника не воспроизводится.
            setRemoteStreams(prev => {
              const next = new Map(prev);
              const existing = next.get(participant.identity);
              // Один живой трек каждого вида: при перепубликации (камера
              // выключилась и включилась, демонстрация перезапустилась) старый
              // завершённый трек оставался в потоке первым, а <video> играет
              // именно первый — картинка застывала последним кадром.
              const tracks = existing
                ? existing.getTracks().filter(t => t.id !== track.mediaStreamTrack!.id
                    && t.kind !== track.mediaStreamTrack!.kind
                    && t.readyState !== 'ended')
                : [];
              tracks.push(track.mediaStreamTrack!);
              next.set(participant.identity, new MediaStream(tracks));
              return next;
            });
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          if (publication.source === Track.Source.ScreenShare) {
            soundManager.play(SOUNDS.SCREENSHARE_OFF, 0.4);
            setRemoteScreenStreams(prev => {
              const next = new Map(prev);
              const stream = next.get(participant.identity);
              if (stream) {
                const remaining = stream.getTracks().filter(t => t.id !== track.mediaStreamTrack?.id && t.readyState !== 'ended');
                if (remaining.length === 0) next.delete(participant.identity);
                else next.set(participant.identity, new MediaStream(remaining));
              }
              return next;
            });
          } else {
            setRemoteStreams(prev => {
              const next = new Map(prev);
              const stream = next.get(participant.identity);
              if (stream) {
                const remaining = stream.getTracks().filter(t => t.id !== track.mediaStreamTrack?.id && t.readyState !== 'ended');
                if (remaining.length === 0) next.delete(participant.identity);
                else next.set(participant.identity, new MediaStream(remaining));
              }
              return next;
            });
          }
        })
        // Дублируем сигнал mute через события LiveKit (camera И screen) — на случай,
        // если нативный track-event не пришёл. Кадр не показываем, пока трек на паузе.
        .on(RoomEvent.TrackMuted, (publication, participant) => {
          const id = publication.track?.mediaStreamTrack?.id;
          if (id && publication.kind === Track.Kind.Video) setMutedVideoIds(prev => new Set(prev).add(id));
          if (publication.source === Track.Source.Microphone) setMicMuted(participant.identity, true);
        })
        .on(RoomEvent.TrackUnmuted, (publication, participant) => {
          const id = publication.track?.mediaStreamTrack?.id;
          if (id && publication.kind === Track.Kind.Video) setMutedVideoIds(prev => { const n = new Set(prev); n.delete(id); return n; });
          if (publication.source === Track.Source.Microphone) setMicMuted(participant.identity, false);
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          setSpeakingIds(new Set(speakers.map(s => String(s.identity))));
        })
        // Потеря связи с LiveKit. Раньше не обрабатывалась: при обрыве звонок
        // молча оставался «В эфире», хотя собеседники уже не слышали друг друга.
        .on(RoomEvent.Reconnecting, () => {
          console.warn('[DM Voice] связь потеряна, переподключение');
          setIsReconnecting(true);
        })
        .on(RoomEvent.Reconnected, () => {
          console.log('[DM Voice] переподключено');
          setIsReconnecting(false);
        })
        .on(RoomEvent.Disconnected, (reason) => {
          // Своё завершение (endCall → cleanupStreams) уже обнулило roomRef.
          if (roomRef.current !== room) return;
          console.warn('[DM Voice] комната закрыта, причина:', reason);
          roomRef.current = null;
          // Кикнули или вошли в этот звонок с другого устройства — завершаем.
          if (reason === DisconnectReason.PARTICIPANT_REMOVED || reason === DisconnectReason.DUPLICATE_IDENTITY || reason === DisconnectReason.ROOM_DELETED) {
            setIsReconnecting(false);
            endCallRef.current();
            return;
          }
          // Иначе (сеть, сон ПК, перезапуск медиасервера) — две попытки вернуться,
          // и только потом завершаем звонок.
          setIsReconnecting(true);
          (async () => {
            for (const delay of [1500, 5000]) {
              await new Promise(r => setTimeout(r, delay));
              if (endedRef.current) return;
              if (!navigator.onLine) continue;
              if (await joinLiveKitRoomRef.current({ silent: true })) { setIsReconnecting(false); return; }
            }
            setIsReconnecting(false);
            endCallRef.current();
          })();
        })
        .on(RoomEvent.LocalTrackPublished, () => syncLocalStream())
        .on(RoomEvent.LocalTrackUnpublished, () => syncLocalStream());

      await room.connect(serverUrl, token);
      const existingParticipants = Array.from(room.remoteParticipants.values());
      setRemoteParticipants(existingParticipants);
      existingParticipants.forEach(p => {
        const mic = p.getTrackPublication(Track.Source.Microphone);
        if (mic) setMicMuted(p.identity, mic.isMuted);
      });
      if (isGroup) existingParticipants.forEach(p => fetchMetadata(p.identity));
      const alreadySharing = new Set<string>();
      existingParticipants.forEach(p => {
        p.trackPublications.forEach(pub => {
          if (pub.source === Track.Source.ScreenShare) {
            alreadySharing.add(p.identity);
            try { (pub as RemoteTrackPublication).setSubscribed(false); } catch { }
          }
        });
      });
      if (alreadySharing.size) setRemoteSharingScreen(prev => new Set([...prev, ...alreadySharing]));

      await room.localParticipant.setMicrophoneEnabled(true);
      await applyMicNoiseProcessor();
      if (isVideoEnabled) await room.localParticipant.setCameraEnabled(true);

      syncLocalStream();

      setIsCallActive(true);
      wasCallEstablishedRef.current = true;
      return true;
    } catch (e) {
      console.error('[DM Voice] LiveKit join error:', e);
      // Неудачная комната не должна мешать следующей попытке.
      try { roomRef.current?.disconnect(); } catch { /* */ }
      roomRef.current = null;
      if (opts?.silent) return false;
      const msg = String((e as Error)?.message || '');
      if (/support|webRTC|supported on this browser/i.test(msg)) {
        alert(`Не удалось установить соединение: WebRTC недоступен в этом браузере. Скорее всего его блокирует расширение (например, MetaMask или «WebRTC Leak Prevent»). Откройте звонок в десктоп-приложении ${brand.name} или отключите расширения, блокирующие WebRTC.`);
      } else {
        alert('Не удалось подключиться к звонку: ' + (msg || 'неизвестная ошибка') + '. Попробуйте ещё раз.');
      }
      return false;
    } finally {
      joiningRoomRef.current = false;
    }
  };

  const joinLiveKitRoomRef = useRef(joinLiveKitRoom);
  joinLiveKitRoomRef.current = joinLiveKitRoom;

  const acceptCall = async () => {
    setIsIncomingCall(false);
    setIsRinging(false);
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    if (socket) {
      hasJoinedRoomRef.current = true;
      socket.emit('join-dm-call', { dmId });
    }
    await joinLiveKitRoom();
  };

  // Завершение приходит сразу из нескольких мест: своя кнопка, call-end и
  // dm-call-user-left от сервера, таймер ожидания ответа, закрытие комнаты
  // LiveKit. Без защиты каждое из них заново проигрывало звук выхода — 3-5 раз
  // подряд. Звонок завершается один раз.
  const endedRef = useRef(false);
  const endCall = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    cleanupStreams();
    soundManager.play(SOUNDS.CALL_LEAVE, 0.4);
    if (socket) {
      if (isGroup) {
        socket.emit('leave-dm-call', { dmId });
      } else {
        socket.emit('call-end', { targetUserId: otherUser._id, dmId });
      }
    }
    setIsCallActive(false); onEndCall();
  };
  // Обработчики комнаты вешаются один раз при входе — берут свежий endCall отсюда.
  const endCallRef = useRef(endCall);
  endCallRef.current = endCall;

  const cleanupStreams = () => {
    if (roomRef.current) { roomRef.current.disconnect(); roomRef.current = null; }
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (screenStream) screenStream.getTracks().forEach(track => track.stop());
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    roomRef.current?.localParticipant.setMicrophoneEnabled(!next).catch(() => { });
  };
  const toggleVideo = async () => {
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);
    try { await roomRef.current?.localParticipant.setCameraEnabled(next); } catch (e) { console.warn('[DM Voice] camera toggle failed', e); }
    syncLocalStream();
  };

  const toggleScreenShare = async (sourceId?: string, options?: { resolution: string, frameRate: string, videoCodec: 'av1' | 'vp9' | 'h264' }) => {
    const isElectron = !!(window as any).electron;
    if (!isElectron && (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia)) {
      await alert('Демонстрация экрана не поддерживается в вашем браузере.');
      return;
    }
    if (isScreenSharing) {
      setIsScreenSharing(false);
      soundManager.play(SOUNDS.SCREENSHARE_OFF, 0.4);
      if (roomRef.current) await roomRef.current.localParticipant.setScreenShareEnabled(false);
      // Трек публиковался из своего потока (publishTrack), и снятие публикации
      // его не останавливает — захват экрана продолжал работать вхолостую.
      screenStream?.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    } else if (roomRef.current && (sourceId || !isElectron)) {
      try {
        const frameRate = parseInt(options?.frameRate || '30', 10);
        const resolution = options?.resolution || '1080';

        // Битрейты демонстрации в групповом звонке. Прежние значения (до 60 Мбит/с,
        // simulcast выключен) насыщали нисходящий канал зрителей: поток один на всех,
        // медленный зритель его не вытягивал — оценка пропускной способности рушилась,
        // и подписчик уходил в вечный reconnect. Ставим разумные потолки.
        let bitrate = 8_000_000;
        if (resolution === '2160') bitrate = frameRate >= 60 ? 24_000_000 : 16_000_000;
        else if (resolution === '1440') bitrate = frameRate >= 60 ? 14_000_000 : 10_000_000;
        else if (resolution === '1080') bitrate = frameRate >= 60 ? 8_000_000 : 6_000_000;
        else if (resolution === '720') bitrate = frameRate >= 60 ? 4_000_000 : 3_000_000;

        // Electron: конкретный источник по sourceId; веб: нативный пикер браузера.
        const stream = (isElectron && sourceId)
          ? await openDesktopSource(sourceId, frameRate)
          : await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: frameRate } }, audio: true });
        if (roomRef.current) {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            // Optimization for smoothness or sharpness
            (videoTrack as any).contentHint = frameRate >= 60 ? 'motion' : 'detail';
            
            await roomRef.current.localParticipant.publishTrack(videoTrack, { 
              source: Track.Source.ScreenShare,
              videoCodec: options?.videoCodec || 'vp9',
              simulcast: false,
              degradationPreference: 'maintain-resolution',
              videoEncoding: {
                maxBitrate: bitrate,
                maxFramerate: frameRate
              }
            });
          }
        }
        setScreenStream(stream);
        setIsScreenSharing(true);
        soundManager.play(SOUNDS.SCREENSHARE_ON, 0.4);
      } catch (e) { alert('Ошибка: ' + (e as Error).message); }
    }
  };

  useEffect(() => {
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  const handleWidgetMouseDown = (e: React.MouseEvent) => {
    setIsDraggingWidget(true);
    dragStartRef.current = { x: e.clientX - widgetPos.x, y: e.clientY - widgetPos.y };
  };

  useEffect(() => {
    if (!isDraggingWidget) return;
    const onMove = (e: MouseEvent) => {
      setWidgetPos({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
    };
    const onUp = () => setIsDraggingWidget(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingWidget]);

  const allParticipants = [
    { identity: user?._id || 'me', isMe: true, isLocal: true, participant: roomRef.current?.localParticipant },
    ...remoteParticipants.map(p => ({ identity: p.identity, isMe: false, isLocal: false, participant: p }))
  ];

  if (isIncomingCall) {
    return (
      <motion.div
        className="voice-call-notification"
        initial={{ opacity: 0, y: -32, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.9 }}
      >
        <div className="notification-content">
          <div className="notification-avatar">
            <UserAvatar user={isGroup ? null : otherUser} size={48} />
          </div>
          <div className="notification-info">
            <div className="notification-name">
              {isGroup ? (dmName || 'Групповой звонок') : otherUser.username}
              {!isGroup && <UserBadges badges={otherUser.badges} serverTag={resolveServerTag(otherUser)} size={14} />}
            </div>
            <div className="notification-status">Входящий звонок...</div>
          </div>
          <div className="notification-actions">
            <motion.button className="accept-btn" onClick={acceptCall} whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }} transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }}><CheckIcon color="black" /></motion.button>
            <motion.button className="reject-btn" onClick={endCall} whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }} transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }}><CloseIcon color="white" size={20} /></motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  const anyRemoteScreenSharing = remoteScreenStreams.size > 0 || isScreenSharing;

  // Видео показываем только если есть живой (не на паузе/не завершённый) видеотрек —
  // иначе при выключении камеры/экрана остаётся застывший последний кадр.
  const hasLiveVideo = (s: MediaStream | null | undefined): boolean =>
    !!s && s.getVideoTracks().some(t => t.readyState === 'live' && !mutedVideoIds.has(t.id));

  // ВАЖНО: аудиоплееры должны быть смонтированы и в полном, и в свёрнутом виде,
  // иначе при сворачивании звонка пропадает звук собеседников.
  const audioPlayers = Array.from(remoteStreams.entries()).map(([uid, stream]) => (
    <RemoteAudioPlayer
      key={uid} stream={stream}
      volume={userVolumes.get(uid) ?? 1}
      muted={isGlobalDeafened || localMutes.has(uid)}
    />
  ));

  const openCtxMenu = (e: React.MouseEvent, userId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, userId });
  };

  const renderCtxMenu = () => {
    if (!ctxMenu) return null;
    const isSelf = String(ctxMenu.userId) === String(user?._id);
    const meta = isSelf ? user : (isGroup ? participantsMetadata.get(ctxMenu.userId) : otherUser);
    return (
      <DmCallContextMenu
        x={ctxMenu.x} y={ctxMenu.y}
        username={meta?.username || ''}
        isSelf={isSelf}
        volume={userVolumes.get(ctxMenu.userId) ?? 1}
        isLocalMuted={localMutes.has(ctxMenu.userId)}
        onVolume={(v) => setUserVolume(ctxMenu.userId, v)}
        onToggleMute={() => toggleLocalMute(ctxMenu.userId)}
        onProfile={() => onOpenProfile?.(ctxMenu.userId)}
        onClose={() => setCtxMenu(null)}
      />
    );
  };

  // Свёрнутый вид: компактный перетаскиваемый виджет. Звонок остаётся подключённым.
  if (isCallActive && isMinimized) {
    const speakingNow = speakingIds.size > 0;
    const otherMicOff = !isGroup && micMutedIds.has(String(otherUser._id));
    const title = isGroup ? (dmName || 'Групповой звонок') : otherUser.username;
    return (
      <>
        <motion.div
          className={`voice-call-container dm-call-widget ${speakingNow ? 'speaking' : ''}`}
          style={{ position: 'fixed', left: widgetPos.x, top: widgetPos.y, zIndex: 9999, cursor: isDraggingWidget ? 'grabbing' : 'default' }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        >
          <div className="voice-call-header" onMouseDown={handleWidgetMouseDown} style={{ cursor: 'grab' }}>
            <div className="dm-call-widget-info">
              <UserAvatar user={isGroup ? null : otherUser} size={28} />
              <span className="dm-call-widget-title">{title}</span>
              {otherMicOff && <span className="dm-call-mic-off" title="Микрофон собеседника выключен"><MicMutedIcon size={14} color="#f23f42" /></span>}
            </div>
            <button className="dm-call-widget-expand" onClick={() => setIsMinimized(false)} title="Развернуть">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
          <div className="call-controls dm-call-widget-controls">
            <button className={`control-button ${isMuted ? 'muted' : ''}`} onClick={toggleMute} title="Микрофон">
              {isMuted ? <MicMutedIcon size={18} /> : <MicIcon size={18} />}
            </button>
            <button className="control-button end-call" onClick={endCall} title="Завершить">
              <span style={{ display: 'flex', transform: 'rotate(135deg)' }}><PhoneIcon size={18} /></span>
            </button>
          </div>
        </motion.div>
        {audioPlayers}
        {renderCtxMenu()}
      </>
    );
  }

  return (
    <motion.div
      className={`voice-call-full-view ${isGroup ? 'group-mode' : ''}`}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <header className="call-topbar">
        <button className="back-to-app-btn" onClick={() => setIsMinimized(true)} title="Свернуть звонок">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
        <div className="call-topbar-center">
          <div className="call-title">
            {isGroup ? (dmName || 'Групповой звонок') : `Звонок: ${otherUser.username}`}
            {!isGroup && <UserBadges badges={otherUser.badges} serverTag={resolveServerTag(otherUser)} size={16} />}
          </div>
          <div className="call-duration">{isCallActive ? (isReconnecting ? 'Переподключение...' : 'В эфире') : 'Подключение...'}</div>
        </div>
        <div aria-hidden="true" />
      </header>

      <main className="call-main">
        <div className={`video-grid count-${allParticipants.length} ${anyRemoteScreenSharing ? 'has-screenshare' : ''}`}>
          <AnimatePresence initial={false}>
          {allParticipants.map((p) => {
            const stream = p.isLocal ? (isVideoEnabled ? localStream : null) : remoteStreams.get(p.identity);
            const userMeta = p.isMe ? user : (isGroup ? participantsMetadata.get(p.identity) : otherUser);
            const isSpeaking = speakingIds.has(String(p.identity));
            const micOff = p.isMe ? isMuted : micMutedIds.has(String(p.identity));
            const screenShare = p.isLocal ? (isScreenSharing ? screenStream : null) : remoteScreenStreams.get(p.identity);
            const hasRemoteScreenShare = !p.isLocal && remoteSharingScreen.has(p.identity);

            return (
              <motion.div
                key={p.identity}
                layout
                onContextMenu={(e) => openCtxMenu(e, String(p.identity))}
                className={`participant-slot ${isSpeaking ? 'speaking' : ''} ${screenShare ? 'sharing-screen' : ''}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }}
              >
                {hasLiveVideo(stream) ? (
                  <video
                    autoPlay playsInline muted={p.isMe}
                    ref={el => { if (el && el.srcObject !== stream) el.srcObject = stream || null; }}
                    className="participant-video"
                  />
                ) : (
                  <div className="participant-placeholder">
                    {/* Имя и значок — только в подписи плитки (.participant-label):
                        второй экземпляр под аватаркой в маленьком окне наезжал на неё. */}
                    <UserAvatar user={userMeta || (p.isMe ? user : null)} size={allParticipants.length > 2 ? 80 : 120} animate={isSpeaking} />
                  </div>
                )}
                {screenShare && hasLiveVideo(screenShare) && (
                  <div className="participant-screenshare">
                    <video
                      autoPlay playsInline muted={p.isMe}
                      ref={el => { if (el && el.srcObject !== screenShare) el.srcObject = screenShare; }}
                    />
                    {!p.isMe && (
                      <button
                        className="stop-watching-btn"
                        onClick={() => {
                          const pub = p.participant?.getTrackPublication(Track.Source.ScreenShare);
                          if (pub && 'setSubscribed' in pub) (pub as any).setSubscribed(false);
                          setWatchingParticipants(prev => {
                            const next = new Set(prev);
                            next.delete(p.identity);
                            return next;
                          });
                        }}
                        title="Прекратить просмотр"
                      >
                        <CloseIcon size={20} />
                      </button>
                    )}
                  </div>
                )}
                {hasRemoteScreenShare && !watchingParticipants.has(p.identity) && !screenShare && (
                  <button
                    className="screenshare-available-btn"
                    onClick={() => {
                      const pub = p.participant?.getTrackPublication(Track.Source.ScreenShare);
                      if (pub && 'setSubscribed' in pub) (pub as any).setSubscribed(true);
                      setWatchingParticipants(prev => new Set(prev).add(p.identity));
                    }}
                  >
                    <MonitorIcon size={16} />
                    <span>Смотреть демонстрацию</span>
                  </button>
                )}
                {micOff && (
                  <div className="participant-mic-off" title={p.isMe ? 'Ваш микрофон выключен' : 'Микрофон выключен'}>
                    <MicMutedIcon size={16} color="#f23f42" />
                  </div>
                )}
                <div className="participant-label">
                  {micOff && <span className="participant-label-mic"><MicMutedIcon size={12} color="#f23f42" /></span>}
                  <span className="participant-label-name">{userMeta?.username || p.identity}{p.isMe && ' (Вы)'}</span>
                  {userMeta && <UserBadges badges={userMeta.badges} serverTag={resolveServerTag(userMeta)} size={12} />}
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      </main>

      <div className="call-controls-bar">
        <motion.button className={`control-circle ${isMuted ? 'muted' : ''}`} onClick={toggleMute} title="Микрофон" whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }} transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }}>
          {isMuted ? <MicMutedIcon /> : <MicIcon />}
        </motion.button>
        <motion.button className={`control-circle ${isVideoEnabled ? 'active' : ''}`} onClick={toggleVideo} title="Камера" whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }} transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }}>
          <CameraIcon />
        </motion.button>
        <motion.button className={`control-circle ${isScreenSharing ? 'active' : ''}`} onClick={() => { if (isScreenSharing) { toggleScreenShare(); } else if ((window as any).electron) { setShowScreenSelector(true); } else { toggleScreenShare(undefined, { resolution: '1080', frameRate: '30', videoCodec: 'vp9' }); } }} title="Экран" whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }} transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }}>
          {isScreenSharing ? <StopScreenShareIcon size={24} /> : <ScreenShareIcon size={24} />}
        </motion.button>
        <motion.button className="control-circle end-call-circle" onClick={endCall} title="Завершить" whileTap={{ scale: 0.88, rotate: -8 }} whileHover={{ scale: 1.06 }} transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }}>
          <span style={{ display: 'flex', transform: 'rotate(135deg)' }}><PhoneIcon size={28} /></span>
        </motion.button>
      </div>

      {audioPlayers}
      {renderCtxMenu()}

      {showScreenSelector && (
        <React.Suspense fallback={null}>
          <ScreenSourceSelector
            onClose={() => setShowScreenSelector(false)}
            onSelect={(id, opts) => { toggleScreenShare(id, opts); setShowScreenSelector(false); }}
          />
        </React.Suspense>
      )}
    </motion.div>
  );
};

export default VoiceCall;
