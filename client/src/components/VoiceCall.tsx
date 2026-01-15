import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useVoice } from '../contexts/VoiceContext';
import { getAvatarUrl } from '../utils/avatar';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { SOUNDS, soundManager } from '../utils/sounds';
import { PhoneIcon, MicIcon, MicMutedIcon, VideoIcon, CameraIcon, CloseIcon, CheckIcon, MonitorIcon } from './Icons';
import ScreenSourceSelector from './ScreenSourceSelector';
import { nativeAudioManager } from '../utils/nativeAudio';
import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Track,
  VideoPresets
} from 'livekit-client';
import './VoiceCall.css';

interface VoiceCallProps {
  socket: Socket | null;
  otherUser: User;
  dmId: string;
  onEndCall: () => void;
  initialIncomingCall?: boolean;
}

const VoiceCall: React.FC<VoiceCallProps> = ({ socket, otherUser, dmId, onEndCall, initialIncomingCall = false }) => {
  const { user } = useAuth();
  const { isNoiseSuppressionEnabled, userVolumes, isDeafened: isGlobalDeafened, speakingUsers } = useVoice();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isIncomingCall, setIsIncomingCall] = useState(initialIncomingCall);
  const [isRinging, setIsRinging] = useState(!initialIncomingCall);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [showScreenSelector, setShowScreenSelector] = useState(false);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const ringTimeoutRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const wasCallEstablishedRef = useRef(false);
  const notificationSentRef = useRef(false);
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    const shouldRing = (initialIncomingCall && isIncomingCall) || (!initialIncomingCall && isRinging && !isCallActive);
    if (shouldRing) {
      if (!ringtoneRef.current) {
        ringtoneRef.current = soundManager.playLoop(SOUNDS.CALL_RINGING, 0.5);
      }
    } else if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current = null;
    }
    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
    };
  }, [isIncomingCall, isRinging, initialIncomingCall, isCallActive]);

  useEffect(() => {
    if (isCallActive) {
      soundManager.play(SOUNDS.CALL_JOIN, 0.4);
    }
  }, [isCallActive]);

  useEffect(() => {
    if (!socket || !dmId) return;
    if (!initialIncomingCall) {
      socket.emit('join-dm-call', { dmId });
      socket.emit('call-offer', { targetUserId: String(otherUser._id), dmId: String(dmId), offer: null });
      ringTimeoutRef.current = setTimeout(() => endCall(), 45000);
    }

    const handleOtherUserJoined = (data: { userId: string }) => {
      if (String(data.userId) === String(otherUser._id)) {
        setIsRinging(false);
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        joinLiveKitRoom();
      }
    };

    const handleExistingUsers = (users: string[]) => {
      if (users.map(u => String(u)).includes(String(otherUser._id))) {
        setIsRinging(false);
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        joinLiveKitRoom();
      }
    };

    const handleIncomingOffer = () => {
      if (!isCallActive) setIsIncomingCall(true);
    };

    socket.on('call-offer', handleIncomingOffer);
    socket.on('call-end', () => endCall());
    socket.on('dm-call-user-joined', handleOtherUserJoined);
    socket.on('dm-call-existing-users', handleExistingUsers);

    return () => {
      const duration = Date.now() - mountedAtRef.current;
      if (!initialIncomingCall && !wasCallEstablishedRef.current && !notificationSentRef.current && dmId && duration > 3000) {
        notificationSentRef.current = true;
        axios.post(`/api/direct-messages/${dmId}/messages`, { content: 'Пропущенный звонок', type: 'missed-call' }).catch(() => { });
      }
      if (dmId) socket.emit('leave-dm-call', { dmId });
      socket.off('call-offer'); socket.off('call-end'); socket.off('dm-call-user-joined'); socket.off('dm-call-existing-users');
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      cleanupStreams();
    };
  }, [socket, dmId]);

  const joinLiveKitRoom = async () => {
    if (roomRef.current) return;
    try {
      const { data } = await axios.get('/api/livekit/token', {
        params: {
          roomName: `call-${dmId}`,
          identity: user?._id
        }
      });

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      roomRef.current = room;

      room
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          const stream = new MediaStream([track.mediaStreamTrack!]);
          if (publication.source === Track.Source.ScreenShare) {
            setRemoteScreenStream(stream);
          } else if (track.kind === Track.Kind.Video) {
            setRemoteStream(stream);
          } else if (track.kind === Track.Kind.Audio) {
            setRemoteStream(prev => {
              if (prev) {
                const newStream = new MediaStream(prev.getTracks());
                newStream.addTrack(track.mediaStreamTrack!);
                return newStream;
              }
              return new MediaStream([track.mediaStreamTrack!]);
            });
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track, publication) => {
          if (publication.source === Track.Source.ScreenShare) {
            setRemoteScreenStream(null);
          }
        })
        .on(RoomEvent.LocalTrackPublished, (publication) => {
          if (publication.source === Track.Source.ScreenShare) {
            setIsScreenSharing(true);
          }
        })
        .on(RoomEvent.LocalTrackUnpublished, (publication) => {
          if (publication.source === Track.Source.ScreenShare) {
            setIsScreenSharing(false);
          }
        });

      await room.connect(data.serverUrl, data.token);

      // Publish local tracks
      await room.localParticipant.setMicrophoneEnabled(true);
      if (isVideoEnabled) await room.localParticipant.setCameraEnabled(true);

      const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micTrack?.track) {
        setLocalStream(new MediaStream([micTrack.track.mediaStreamTrack!]));
      }

      setIsCallActive(true);
      wasCallEstablishedRef.current = true;
    } catch (e) {
      console.error('[DM Voice] LiveKit join error:', e);
    }
  };

  const acceptCall = async () => {
    setIsIncomingCall(false);
    setIsRinging(false);
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    if (socket) socket.emit('join-dm-call', { dmId });
    await joinLiveKitRoom();
  };

  const endCall = async () => {
    cleanupStreams();
    soundManager.play(SOUNDS.CALL_LEAVE, 0.4);
    if (socket) socket.emit('call-end', { targetUserId: otherUser._id });
    const duration = Date.now() - mountedAtRef.current;
    const needsNotification = !initialIncomingCall && !wasCallEstablishedRef.current && !notificationSentRef.current && dmId && duration > 2000;
    setIsCallActive(false); onEndCall();
    if (needsNotification) {
      notificationSentRef.current = true;
      try { await axios.post(`/api/direct-messages/${dmId}/messages`, { content: 'Пропущенный звонок', type: 'missed-call' }); } catch (err) { }
    }
  };

  const cleanupStreams = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (screenStream) screenStream.getTracks().forEach(track => track.stop());
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => { }); audioContextRef.current = null; }

    if ((window as any).electron && (window as any).electron.setContentProtection) {
      (window as any).electron.setContentProtection(false);
    }
    try {
      if (nativeAudioManager && nativeAudioManager.stopCapture) {
        nativeAudioManager.stopCapture();
      }
    } catch (e) {
      console.warn('Failed to stop native audio capture:', e);
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (roomRef.current) {
      roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
    }
  };

  const toggleVideo = async () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    if (roomRef.current) {
      await roomRef.current.localParticipant.setCameraEnabled(newState);
    }
  };

  const toggleScreenShare = async (sourceId?: string) => {
    if (isScreenSharing) {
      if (roomRef.current) {
        await roomRef.current.localParticipant.setScreenShareEnabled(false);
      }
      setIsScreenSharing(false);
    } else if (sourceId && roomRef.current) {
      try {
        await roomRef.current.localParticipant.setScreenShareEnabled(true, {
          audio: true
        });
        setIsScreenSharing(true);
      } catch (e) { console.error(e); }
    }
  };

  useEffect(() => {
    if (!isCallActive) return;

    let interval: any;
    let localAnalyser: AnalyserNode | null = null;
    let remoteAnalyser: AnalyserNode | null = null;
    let audioCtx: AudioContext | null = null;

    const setupAnalysers = async () => {
      audioCtx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      if (localStream && localStream.getAudioTracks().length > 0) {
        localAnalyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(localStream);
        source.connect(localAnalyser);
      }

      if (remoteStream && remoteStream.getAudioTracks().length > 0) {
        remoteAnalyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(remoteStream);
        source.connect(remoteAnalyser);
      }

      const localDataArray = localAnalyser ? new Uint8Array(localAnalyser.fftSize) : null;
      const remoteDataArray = remoteAnalyser ? new Uint8Array(remoteAnalyser.fftSize) : null;

      let localSpeakingHold = 0;
      let remoteSpeakingHold = 0;

      interval = setInterval(() => {
        if (localAnalyser && localDataArray) {
          localAnalyser.getByteTimeDomainData(localDataArray);
          let sumOfSquares = 0;
          for (let i = 0; i < localDataArray.length; i++) {
            const normalized = (localDataArray[i] - 128) / 128;
            sumOfSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumOfSquares / localDataArray.length);
          if (rms > 0.01) localSpeakingHold = 5;
          else if (localSpeakingHold > 0) localSpeakingHold--;

          setLocalSpeaking(localSpeakingHold > 0);
        }

        if (remoteAnalyser && remoteDataArray) {
          remoteAnalyser.getByteTimeDomainData(remoteDataArray);
          let sumOfSquares = 0;
          for (let i = 0; i < remoteDataArray.length; i++) {
            const normalized = (remoteDataArray[i] - 128) / 128;
            sumOfSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumOfSquares / remoteDataArray.length);
          if (rms > 0.01) remoteSpeakingHold = 5;
          else if (remoteSpeakingHold > 0) remoteSpeakingHold--;

          setRemoteSpeaking(remoteSpeakingHold > 0);
        }
      }, 50);
    };

    setupAnalysers();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCallActive, localStream, remoteStream]);

  useEffect(() => {
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (remoteStream && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [localStream, remoteStream]);

  if (isIncomingCall) {
    return (
      <div className="voice-call-notification">
        <div className="notification-content">
          <div className="notification-avatar">
            {getAvatarUrl(otherUser.avatar) ? (
              <img src={getAvatarUrl(otherUser.avatar)!} alt="" />
            ) : (
              <span>{otherUser.username.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="notification-info">
            <div className="notification-name">{otherUser.username}</div>
            <div className="notification-status">Входящий звонок...</div>
          </div>
          <div className="notification-actions">
            <button className="accept-btn" onClick={acceptCall}>
              <CheckIcon color="black" />
            </button>
            <button className="reject-btn" onClick={endCall}>
              <CloseIcon color="white" size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-call-full-view">
      <header className="call-topbar">
        <div className="call-topbar-left">
          <button className="back-to-app-btn" onClick={onEndCall} title="Свернуть (звонок продолжится)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <div className="call-title">Прямой звонок: {otherUser.username}</div>
        </div>
        <div className="call-duration">
          {isCallActive ? 'В эфире' : 'Подключение...'}
        </div>
      </header>

      <main className="call-main">
        <div className="video-grid">
          <div className="main-video-slot">
            {(remoteStream && remoteStream.getVideoTracks().length > 0) ? (
              <video ref={remoteVideoRef} autoPlay playsInline className={`remote-video-full ${remoteSpeaking ? 'speaking' : ''}`} />
            ) : (
              <div className="remote-audio-placeholder">
                <div className={`placeholder-avatar-ring ${remoteSpeaking ? 'speaking' : ''}`}>
                  <div className="call-avatar-large">
                    {getAvatarUrl(otherUser.avatar) ? (
                      <img src={getAvatarUrl(otherUser.avatar)!} alt="" />
                    ) : (
                      <span>{otherUser.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <div className="placeholder-info">
                  <h3>{otherUser.username}</h3>
                  <div className="speaking-indicator">
                    {isCallActive ? 'СОБЕСЕДНИК В СЕТИ' : 'ПОДКЛЮЧЕНИЕ...'}
                  </div>
                </div>
              </div>
            )}

            {remoteScreenStream && (
              <div className="remote-screen-slot">
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={el => { if (el && el.srcObject !== remoteScreenStream) el.srcObject = remoteScreenStream; }}
                  className="remote-screen-video-full"
                />
              </div>
            )}
          </div>

          <div className={`pip-video-slot ${localSpeaking ? 'speaking' : ''}`}>
            {(localStream && localStream.getVideoTracks().length > 0) ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="local-video-pip" />
            ) : (
              <div className="local-audio-pip">
                <div className={`pip-avatar ${localSpeaking ? 'speaking' : ''}`}>
                  {getAvatarUrl(user?.avatar) ? (
                    <img src={getAvatarUrl(user?.avatar)!} alt="" />
                  ) : (
                    <span>{user?.username.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>
            )}
            <div className="pip-label">Вы</div>

            {isScreenSharing && (
              <div className="screen-share-overlay">
                <MonitorIcon size={24} />
                <span>Трансляция экрана</span>
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="call-controls-bar">
        <button className={`control-circle ${isMuted ? 'muted' : ''}`} onClick={toggleMute} title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}>
          {isMuted ? <MicMutedIcon /> : <MicIcon />}
        </button>
        <button className={`control-circle ${isVideoEnabled ? 'active' : ''}`} onClick={toggleVideo} title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}>
          <CameraIcon />
        </button>
        <button className={`control-circle ${isScreenSharing ? 'active' : ''}`} onClick={() => isScreenSharing ? toggleScreenShare() : setShowScreenSelector(true)} title={isScreenSharing ? 'Прекратить трансляцию' : 'Трансляция экрана'}>
          <MonitorIcon size={24} />
        </button>
        <div className="control-divider"></div>
        <button className="control-circle end-call-circle" onClick={endCall} title="Завершить звонок">
          <span style={{ display: 'flex', transform: 'rotate(135deg)' }}>
            <PhoneIcon size={28} />
          </span>
        </button>
      </div>

      {remoteStream && (
        <audio
          ref={(el) => { if (el) { el.srcObject = remoteStream; el.volume = userVolumes.get(otherUser._id) ?? 1; el.muted = isGlobalDeafened; el.play().catch(() => { }); } }}
          autoPlay
        />
      )}
      {remoteScreenStream && remoteScreenStream.getAudioTracks().length > 0 && (
        <audio
          autoPlay
          ref={el => { if (el) { el.srcObject = remoteScreenStream; el.play().catch(() => { }); } }}
        />
      )}

      {showScreenSelector && (
        <ScreenSourceSelector
          onClose={() => setShowScreenSelector(false)}
          onSelect={(id) => {
            toggleScreenShare(id);
            setShowScreenSelector(false);
          }}
        />
      )}
    </div>
  );
};

export default VoiceCall;
