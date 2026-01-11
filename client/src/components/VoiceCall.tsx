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
import './VoiceCall.css';

interface VoiceCallProps {
  socket: Socket | null;
  otherUser: User;
  dmId: string;
  onEndCall: () => void;
  initialIncomingCall?: boolean;
  initialOffer?: { fromUserId: string; offer: RTCSessionDescriptionInit; dmId: string };
}

const VoiceCall: React.FC<VoiceCallProps> = ({ socket, otherUser, dmId, onEndCall, initialIncomingCall = false, initialOffer }) => {
  const { user } = useAuth();
  const { isNoiseSuppressionEnabled, userVolumes, isDeafened: isGlobalDeafened } = useVoice();
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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerStateRef = useRef({ makingOffer: false, ignoreOffer: false });
  const ringTimeoutRef = useRef<any>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(initialOffer?.offer || null);
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
    socket.on('call-offer', handleIncomingOffer);
    socket.on('call-answer', handleCallAnswer);
    socket.on('call-ice-candidate', handleIceCandidate);
    socket.on('call-end', handleCallEnd);
    socket.on('dm-call-user-joined', handleOtherUserJoined);
    socket.on('dm-call-existing-users', handleExistingUsers);
    return () => {
      const duration = Date.now() - mountedAtRef.current;
      if (!initialIncomingCall && !wasCallEstablishedRef.current && !notificationSentRef.current && dmId && duration > 3000) {
        notificationSentRef.current = true;
        axios.post(`/api/direct-messages/${dmId}/messages`, { content: 'Пропущенный звонок', type: 'missed-call' }).catch(() => { });
      }
      if (dmId) socket.emit('leave-dm-call', { dmId });
      socket.off('call-offer'); socket.off('call-answer'); socket.off('call-ice-candidate'); socket.off('call-end'); socket.off('dm-call-user-joined'); socket.off('dm-call-existing-users');
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      cleanupStreams();
    };
  }, [socket, dmId]);

  const handleOtherUserJoined = (data: { userId: string }) => {
    if (String(data.userId) === String(otherUser._id)) {
      console.log(`[DM Voice] Other user (${otherUser.username}) joined. My ID: ${user?._id}, Other ID: ${otherUser._id}`);
      setIsRinging(false);
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      const isInitiator = user && String(user._id) < String(otherUser._id);
      console.log(`[DM Voice] Am I initiator? ${isInitiator}`);
      if (isInitiator) {
        initiateWebRTC();
      }
    }
  };

  const handleExistingUsers = (users: string[]) => {
    console.log('[DM Voice] Existing users in room:', users);
    const otherIdStr = String(otherUser._id);
    if (users.map(u => String(u)).includes(otherIdStr)) {
      console.log(`[DM Voice] Other user (${otherUser.username}) is already in room. My ID: ${user?._id}, Other ID: ${otherUser._id}`);
      setIsRinging(false);
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      const isInitiator = user && String(user._id) < String(otherUser._id);
      console.log(`[DM Voice] Am I initiator? ${isInitiator}`);
      if (isInitiator) {
        initiateWebRTC();
      }
    }
  };

  const acceptCall = async () => {
    setIsIncomingCall(false); setIsRinging(false);
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    if (socket) socket.emit('join-dm-call', { dmId });
    if (pendingOfferRef.current) {
      const offer = pendingOfferRef.current; pendingOfferRef.current = null;
      await handleIncomingOffer({ offer });
    }
  };

  const cleanupStreams = () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (screenStream) screenStream.getTracks().forEach(track => track.stop());
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => { }); audioContextRef.current = null; }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null; peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close(); peerConnectionRef.current = null;
    }
    if ((window as any).electron && (window as any).electron.setContentProtection) {
      (window as any).electron.setContentProtection(false);
    }
    nativeAudioManager.stopCapture();
  };

  const setupPeerConnection = async () => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    console.log(`[DM Voice] Setting up peer connection with ${otherUser.username}`);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: isVideoEnabled
    });

    let usedStream = stream;
    if (isNoiseSuppressionEnabled) {
      try {
        const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        if (ctx.state === 'suspended') await ctx.resume();
        usedStream = await setupNoiseSuppression(ctx, stream);
      } catch (e) { }
    }
    setLocalStream(usedStream);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      console.log(`[DM Voice] Received track from ${otherUser.username}, stream ID: ${stream.id}`);
      if (stream.id.startsWith('screen-') || (remoteStream && stream.id !== remoteStream.id)) {
        setRemoteScreenStream(stream);
      } else {
        setRemoteStream(stream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('call-ice-candidate', { targetUserId: otherUser._id, candidate: event.candidate });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        peerStateRef.current.makingOffer = true;
        console.log('[DM Voice] Negotiation needed. Making offer...');
        await pc.setLocalDescription();
        socket?.emit('call-offer', { targetUserId: otherUser._id, dmId, offer: pc.localDescription });
      } catch (err) {
        console.error('[DM Voice] Negotiation error:', err);
      } finally {
        peerStateRef.current.makingOffer = false;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        console.warn('[DM Voice] ICE failed. Restarting...');
        pc.restartIce();
      }
    };

    usedStream.getTracks().forEach(track => pc.addTrack(track, usedStream));

    peerConnectionRef.current = pc;
    return pc;
  };


  const initiateWebRTC = async () => {
    if (isCallActive) return;
    try {
      await setupPeerConnection();
      setIsCallActive(true); wasCallEstablishedRef.current = true;
    } catch (err) {
      console.error('[DM Voice] initiateWebRTC failed:', err);
    }
  };

  const handleIncomingOffer = async (data: { offer: RTCSessionDescriptionInit | null }) => {
    if (!data.offer) {
      if (!isCallActive && initialIncomingCall) setIsIncomingCall(true);
      return;
    }

    if (isIncomingCall) {
      pendingOfferRef.current = data.offer;
      return;
    }

    try {
      const pc = await setupPeerConnection();
      const polite = String(user?._id) > String(otherUser._id);
      const offerCollision = peerStateRef.current.makingOffer || pc.signalingState !== 'stable';

      peerStateRef.current.ignoreOffer = !polite && offerCollision;
      if (peerStateRef.current.ignoreOffer) {
        console.log('[DM Voice] Ignoring offer due to collision (impolite)');
        return;
      }

      console.log('[DM Voice] Handling incoming offer');
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (socket) socket.emit('call-answer', { targetUserId: otherUser._id, answer });

      setIsCallActive(true); wasCallEstablishedRef.current = true; setIsRinging(false);

      while (iceCandidatesQueue.current.length > 0) {
        const c = iceCandidatesQueue.current.shift();
        if (c) try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { }
      }
    } catch (err) {
      console.error('[DM Voice] Error handling incoming offer:', err);
    }
  };

  const handleCallAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
    if (!peerConnectionRef.current) return;
    try {
      console.log('[DM Voice] Handling incoming answer');
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      setIsCallActive(true); wasCallEstablishedRef.current = true;
      while (iceCandidatesQueue.current.length > 0) {
        const c = iceCandidatesQueue.current.shift();
        if (c) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c));
          } catch (e) {
            console.warn('[DM Voice] Error adding queued ICE candidate after answer:', e);
          }
        }
      }
    } catch (e) {
      console.error('[DM Voice] Error handling incoming answer:', e);
    }
  };

  const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
    const pc = peerConnectionRef.current;
    try {
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        if (peerStateRef.current.ignoreOffer) return;
        iceCandidatesQueue.current.push(data.candidate);
      }
    } catch (e) {
      if (!peerStateRef.current.ignoreOffer) {
        console.warn('[DM Voice] Error adding ICE candidate:', e);
      }
    }
  };

  const handleCallEnd = () => endCall();

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

  const toggleMute = () => {
    const newMuted = !isMuted;
    if (localStream) { localStream.getAudioTracks().forEach(t => t.enabled = !newMuted); setIsMuted(newMuted); }
  };

  const toggleVideo = async () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    if (localStream) {
      if (newState) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const track = stream.getVideoTracks()[0];
          localStream.addTrack(track);
          if (peerConnectionRef.current) {
            const videoSender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) await videoSender.replaceTrack(track);
            else peerConnectionRef.current.addTrack(track, localStream);
          }
        } catch (e) { setIsVideoEnabled(false); }
      } else {
        const track = localStream.getVideoTracks()[0];
        if (track) {
          track.stop(); localStream.removeTrack(track);
          if (peerConnectionRef.current) {
            const videoSender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) {
              peerConnectionRef.current.removeTrack(videoSender);
            }
          }
        }
      }
    }
  };

  const toggleScreenShare = async (sourceId?: string) => {
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);
      nativeAudioManager.stopCapture();
      // Disable content protection
      if ((window as any).electron && (window as any).electron.setContentProtection) {
        (window as any).electron.setContentProtection(false);
      }
      // Renegotiate
      if (peerConnectionRef.current) {
        // Just removing tracks triggers negotiation
      }
    } else if (sourceId) {
      try {
        const hasElectron = !!(window as any).electron;
        let stream: MediaStream;

        if (hasElectron) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: 4096,
                maxHeight: 2160,
                maxFrameRate: 60
              }
            } as any
          });
          try {
            const audioStream = await nativeAudioManager.startcapture(sourceId);
            audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
          } catch (e) {
            console.error("Native audio capture failed", e);
          }
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, echoCancellation: true } } as any,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: 4096,
                maxHeight: 2160,
                maxFrameRate: 60
              }
            } as any
          });
        }

        // Enable content protection (WDA_EXCLUDEFROMCAPTURE)
        if ((window as any).electron && (window as any).electron.setContentProtection) {
          await (window as any).electron.setContentProtection(true);
        }

        Object.defineProperty(stream, 'id', { value: `screen-${user?._id}-${Date.now()}` });
        setScreenStream(stream);
        setIsScreenSharing(true);
        if (peerConnectionRef.current) {
          stream.getTracks().forEach(track => peerConnectionRef.current!.addTrack(track, stream));
        }
      } catch (e) { console.error(e); }
    }
  };

  useEffect(() => {
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (remoteStream && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [localStream, remoteStream]);

  return (
    <div className="voice-call-container">
      <div className="voice-call-header">
        <div className="call-user-info">
          <div className="call-avatar">{getAvatarUrl(otherUser.avatar) ? <img src={getAvatarUrl(otherUser.avatar)!} alt="" /> : <span>{otherUser.username.charAt(0).toUpperCase()}</span>}</div>
          <div className="call-user-details">
            <div className="call-username">{otherUser.username}</div>
            <div className="call-status">
              {isCallActive ? 'В разговоре' : isIncomingCall ? 'Входящий звонок' : isRinging ? 'Звонок...' : 'Подключение...'}
            </div>
          </div>
        </div>
        <button className="end-call-button" onClick={endCall}><CloseIcon size={18} /></button>
      </div>

      <div className="voice-call-content">
        {isIncomingCall ? (
          <div className="call-pending">
            <div className="call-avatar-large">{getAvatarUrl(otherUser.avatar) ? <img src={getAvatarUrl(otherUser.avatar)!} alt="" /> : <span>{otherUser.username.charAt(0).toUpperCase()}</span>}</div>
            <div className="incoming-call-actions">
              <button className="accept-call-button" onClick={acceptCall}><CheckIcon color="white" /> Принять</button>
              <button className="reject-call-button" onClick={endCall}><CloseIcon color="white" size={24} /> Отклонить</button>
            </div>
          </div>
        ) : !isCallActive ? (
          <div className="call-pending">
            <div className="call-avatar-large">{getAvatarUrl(otherUser.avatar) ? <img src={getAvatarUrl(otherUser.avatar)!} alt="" /> : <span>{otherUser.username.charAt(0).toUpperCase()}</span>}</div>
            <div className="waiting-indicator">{isRinging ? 'Вызываем...' : 'Подключение...'}</div>
          </div>
        ) : (
          <div className="call-active">
            <div className="video-container">
              {remoteStream && remoteStream.getVideoTracks().length > 0 && <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />}
              {remoteScreenStream && (
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={el => { if (el && el.srcObject !== remoteScreenStream) el.srcObject = remoteScreenStream; }}
                  className="remote-screen-video"
                  style={{ width: '100%', height: 'auto', borderRadius: '8px', marginTop: '10px', background: '#000' }}
                />
              )}
              {localStream && localStream.getVideoTracks().length > 0 && <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />}
              {screenStream && (
                <div className="local-screen-preview-container">
                  <MonitorIcon size={32} color="var(--bg-accent)" />
                  <span>Вы транслируете экран</span>
                </div>
              )}
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
          </div>
        )}
        {!isIncomingCall && (
          <div className="call-controls" style={{ marginTop: '20px' }}>
            <button className={`control-button ${isMuted ? 'muted' : ''}`} onClick={toggleMute} title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}>
              {isMuted ? <MicMutedIcon /> : <MicIcon />}
            </button>
            <button className={`control-button ${isScreenSharing ? 'active' : ''}`} onClick={() => isScreenSharing ? toggleScreenShare() : setShowScreenSelector(true)} title={isScreenSharing ? 'Прекратить трансляцию' : 'Трансляция экрана'}>
              <VideoIcon />
            </button>
            <button className={`control-button ${isVideoEnabled ? 'active' : ''}`} onClick={toggleVideo} title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}>
              <CameraIcon />
            </button>
            <button className="control-button end-call" onClick={endCall} title="Завершить звонок"><PhoneIcon /></button>
          </div>
        )}
      </div>

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
