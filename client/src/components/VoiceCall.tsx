import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import axios from 'axios';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useVoice } from '../contexts/VoiceContext';
import { getAvatarUrl } from '../utils/avatar';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { SOUNDS, soundManager } from '../utils/sounds';
import { PhoneIcon, MicIcon, MicMutedIcon, VideoIcon, CameraIcon, CloseIcon, CheckIcon, ScreenShareIcon, StopScreenShareIcon } from './Icons';
import ScreenSourceSelector, { ScreenSource } from './ScreenSourceSelector';
import StreamContextMenu from './StreamContextMenu';
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
  const { isNoiseSuppressionEnabled, userVolumes, streamVolumes, isDeafened: isGlobalDeafened } = useVoice();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isIncomingCall, setIsIncomingCall] = useState(initialIncomingCall);
  const [isRinging, setIsRinging] = useState(!initialIncomingCall);
  const [isWaitingInRoom, setIsWaitingInRoom] = useState(false);
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [isWatchingRemote, setIsWatchingRemote] = useState(false);
  const [streamContextMenu, setStreamContextMenu] = useState<{ x: number; y: number; participant: User; isMe: boolean } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const voiceAudioRef = useRef<HTMLAudioElement>(null);
  const streamAudioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const ringTimeoutRef = useRef<any>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(initialOffer?.offer || null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const mixedStreamRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const retryTimeoutRef = useRef<any>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const wasCallEstablishedRef = useRef(false);
  const notificationSentRef = useRef(false);
  const mountedAtRef = useRef<number>(Date.now());

  // Play ringtone for incoming calls
  useEffect(() => {
    if (initialIncomingCall && isIncomingCall) {
      ringtoneRef.current = soundManager.playLoop(SOUNDS.CALL_INCOMING, 0.5);
    } else {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
    }
    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
    };
  }, [isIncomingCall, initialIncomingCall]);

  // Effect to handle join room for CALLER immediately
  useEffect(() => {
    if (!socket || !dmId) return;

    if (!initialIncomingCall) {
      console.log('VoiceCall: Caller joining room immediately');
      joinCallRoom();

      // Pre-warm media if we are the initiator to speed up connection
      if (user && user._id < otherUser._id) {
        console.log('VoiceCall: Pre-warming media');
        setupPeerConnection().catch(e => console.error("Media pre-warm failed", e));
      }

      // Notify them
      socket.emit('call-offer', {
        targetUserId: String(otherUser._id),
        dmId: String(dmId),
        offer: null
      });

      ringTimeoutRef.current = setTimeout(() => {
        console.log('VoiceCall: Ringing timeout reached');
        endCall();
      }, 45000); // 45 seconds timeout
    }

    // Signaling listeners
    socket.on('call-offer', handleIncomingOffer);
    socket.on('call-answer', handleCallAnswer);
    socket.on('call-ice-candidate', handleIceCandidate);
    socket.on('call-end', handleCallEnd);
    socket.on('dm-call-user-joined', handleOtherUserJoined);
    socket.on('dm-call-existing-users', handleExistingUsers);

    return () => {
      console.log('VoiceCall: Cleaning up');

      // Send missed call notification if unmounting before established
      // Only the caller sends this, and only if it's been ringing for a bit (avoid Strict Mode/accidental unmounts)
      const duration = Date.now() - mountedAtRef.current;
      if (!initialIncomingCall && !wasCallEstablishedRef.current && !notificationSentRef.current && dmId && duration > 3000) {
        notificationSentRef.current = true;
        axios.post(`/api/direct-messages/${dmId}/messages`, {
          content: 'Пропущенный звонок',
          type: 'missed-call'
        }).catch(err => console.error('Failed to send missed call notification on unmount:', err));
      }

      if (dmId) socket.emit('leave-dm-call', { dmId });
      socket.off('call-offer');
      socket.off('call-answer');
      socket.off('call-ice-candidate');
      socket.off('call-end');
      socket.off('dm-call-user-joined');
      socket.off('dm-call-existing-users');
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      cleanupStreams();
    };
  }, [socket, dmId]);

  const joinCallRoom = () => {
    if (socket && dmId) {
      socket.emit('join-dm-call', { dmId });
      setHasJoinedRoom(true);
    }
  };

  const handleOtherUserJoined = (data: { userId: string }) => {
    if (data.userId === otherUser._id) {
      console.log('Other user joined room. Checking if I should initiate WebRTC...');
      setIsRinging(false);
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      setIsWaitingInRoom(false);
      // Logic: smaller ID initiates to avoid collision
      if (user && user._id < otherUser._id) {
        initiateWebRTC();
      }
    }
  };

  const handleExistingUsers = (users: string[]) => {
    if (users.includes(otherUser._id)) {
      console.log('Other user is already in room. Checking if I should initiate WebRTC...');
      setIsRinging(false);
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      setIsWaitingInRoom(false);

      // If we are the one who should initiate, do it
      if (user && user._id < otherUser._id) {
        initiateWebRTC();
      } else {
        // Fallback: if we are NOT the initiator but nothing happens for 5s, we try anyway
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          if (!isCallActive) {
            console.log('VoiceCall: Proactive initiation (timeout)');
            initiateWebRTC();
          }
        }, 2000);
      }
    }
  };

  const acceptCall = async () => {
    console.log('VoiceCall: Accept clicked. Pending offer exists:', !!pendingOfferRef.current);
    setIsIncomingCall(false);
    setIsRinging(false);
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);

    // If we're the initiator, pre-warm media immediately
    if (user && otherUser && user._id < otherUser._id && !pendingOfferRef.current) {
      console.log('VoiceCall: Recipient is initiator, pre-warming media');
      setupPeerConnection().catch(e => console.error("Media pre-warm failed", e));
    }

    // Process pending offer if it exists
    if (pendingOfferRef.current) {
      const offer = pendingOfferRef.current;
      pendingOfferRef.current = null; // Clear it
      await handleIncomingOffer({ offer });
    } else {
      // No offer yet, just join and wait for one or initiate if it's our turn
      joinCallRoom();
    }
  };

  const cleanupStreams = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(e => console.error("Error closing audio context", e));
      audioContextRef.current = null;
    }
    if (peerConnectionRef.current) {
      // Remove listeners before closing
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
  };

  const processIceQueue = async (pc: RTCPeerConnection) => {
    while (iceCandidatesQueue.current.length > 0) {
      const candidate = iceCandidatesQueue.current.shift();
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding queued ICE candidate', e);
        }
      }
    }
  };

  const setupPeerConnection = async () => {
    console.log('VoiceCall: Setting up local media and PC');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: isVideoEnabled
    });

    let streamToUse = stream;
    if (isNoiseSuppressionEnabled) {
      try {
        const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        if (ctx.state === 'suspended') await ctx.resume();

        streamToUse = await setupNoiseSuppression(ctx, stream);
        console.log('[VoiceCall] Noise suppression applied');
      } catch (e) {
        console.error('[VoiceCall] Failed to apply NS:', e);
      }
    }

    setLocalStream(streamToUse);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    streamToUse.getTracks().forEach(track => {
      pc.addTrack(track, streamToUse);
    });

    pc.ontrack = (event) => {
      const incomingStream = event.streams[0];
      console.log('VoiceCall: Remote track received', incomingStream.id, event.track.kind);

      setRemoteStream(incomingStream);

      // If it's a NEW stream (different ID), we reset watching state if it's a screen share?
      // Or just keep it. For now, let's just make sure UI updates.

      // Auto-watch if it's only a camera (usually 1 video track and small res, but hard to tell)
      // For now, let's just let the user click "Watch" for any video in DM too for consistency.

      // Trigger re-render when tracks are removed or end
      const forceUpdate = () => {
        console.log("VoiceCall: Remote stream track changed, updating UI");
        setRemoteStream(prev => prev ? new MediaStream(prev.getTracks()) : null);
      };
      incomingStream.onremovetrack = forceUpdate;
      incomingStream.getTracks().forEach(t => t.onended = forceUpdate);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = incomingStream;
        // Video element should be MUTED because we use separate audio elements for volume control
        remoteVideoRef.current.muted = true;
        remoteVideoRef.current.play().catch(e => {
          console.warn("Auto-play error", e);
        });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('call-ice-candidate', {
          targetUserId: otherUser._id,
          candidate: event.candidate
        });
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const initiateWebRTC = async () => {
    if (isCallActive) return;
    try {
      // pc or setup new one. setupPeerConnection sets peerConnectionRef.current
      const pc = peerConnectionRef.current || await setupPeerConnection();

      // If setupPeerConnection didn't finish or failed
      if (!pc) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socket) {
        socket.emit('call-offer', {
          targetUserId: otherUser._id,
          dmId,
          offer: offer
        });
      }
      setIsCallActive(true);
      wasCallEstablishedRef.current = true;
    } catch (err) {
      console.error('Failed to initiate WebRTC:', err);
    }
  };

  const handleIncomingOffer = async (data: { offer: RTCSessionDescriptionInit | null }) => {
    if (!data.offer) {
      console.log('VoiceCall: Received ping/notification');
      // If we are the recipient and haven't seen the incoming call screen yet, ensure it shows
      if (!isCallActive && initialIncomingCall) {
        setIsIncomingCall(true);
      }
      return;
    }

    // IMPORTANT: don't automatically answer if we haven't accepted yet
    if (isIncomingCall) {
      console.log('VoiceCall: Offer received, storing in pendingOfferRef');
      pendingOfferRef.current = data.offer;
      return;
    }

    // If we are the caller and received an offer (collision), handle it if we are the polite one
    if (!initialIncomingCall && !isCallActive && data.offer) {
      console.log('VoiceCall: Received offer while being a caller (collision check)');
    }

    try {
      console.log('VoiceCall: Handling incoming offer');
      const pc = peerConnectionRef.current || await setupPeerConnection();

      // Set remote description (handles both initial offer and renegotiation)
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

      // Create and set local answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socket) {
        socket.emit('call-answer', {
          targetUserId: otherUser._id,
          answer: answer
        });
      }
      setIsCallActive(true);
      wasCallEstablishedRef.current = true;
      setIsWaitingInRoom(false);
      setIsRinging(false);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      await processIceQueue(pc);
    } catch (err) {
      console.error('Failed to handle incoming offer:', err);
      // If it's a renegotiation error, try to recover
      if (err instanceof Error && err.message.includes('InvalidStateError')) {
        console.log('VoiceCall: Attempting to recover from renegotiation error');
        // The peer connection might be in an invalid state, but WebRTC should handle it
      }
    }
  };

  const handleCallAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
    if (peerConnectionRef.current && peerConnectionRef.current.signalingState === 'have-local-offer') {
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        setIsCallActive(true);
        wasCallEstablishedRef.current = true;
        await processIceQueue(peerConnectionRef.current);
      } catch (e) {
        console.error('Error setting remote answer:', e);
      }
    }
  };

  const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
    if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    } else {
      iceCandidatesQueue.current.push(data.candidate);
    }
  };

  const handleCallEnd = () => {
    endCall();
  };

  const endCall = async () => {
    console.log('VoiceCall: Ending call');
    cleanupStreams();

    if (socket) {
      socket.emit('call-end', { targetUserId: otherUser._id });
    }

    // Capture state before closing UI
    const duration = Date.now() - mountedAtRef.current;
    const needsNotification = !initialIncomingCall && !wasCallEstablishedRef.current && !notificationSentRef.current && dmId && duration > 2000;

    setIsCallActive(false);
    onEndCall(); // Close UI immediately

    // Send missed call notification AFTER closing the call UI
    if (needsNotification) {
      notificationSentRef.current = true;
      try {
        await axios.post(`/api/direct-messages/${dmId}/messages`, {
          content: 'Пропущенный звонок',
          type: 'missed-call'
        });
      } catch (err) {
        console.error('Failed to send missed call notification:', err);
      }
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !newMuted;
      });

      // If mixing is active, also update the gain node
      if (micGainNodeRef.current) {
        micGainNodeRef.current.gain.value = newMuted ? 0 : 1;
      }

      setIsMuted(newMuted);
    }
  };

  const toggleVideo = async () => {
    setIsVideoEnabled(!isVideoEnabled);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // 1. STOP SCREEN SHARING
      console.log('VoiceCall: Stopping screen share');
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(e => console.error("Error closing audio context", e));
        audioContextRef.current = null;
        micGainNodeRef.current = null;
        mixedStreamRef.current = null;
      }

      setIsScreenSharing(false);

      // Re-acquire camera/mic stream
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: isVideoEnabled
        });
        setLocalStream(stream);

        // Update peer connection
        if (peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          const audioSender = senders.find(s => s.track?.kind === 'audio');

          const newVideoTrack = stream.getVideoTracks()[0];
          const newAudioTrack = stream.getAudioTracks()[0];

          if (videoSender) {
            if (newVideoTrack) {
              await videoSender.replaceTrack(newVideoTrack).catch(e => console.error("Error replacing video track:", e));
            } else {
              peerConnectionRef.current.removeTrack(videoSender);
            }
          } else if (newVideoTrack) {
            peerConnectionRef.current.addTrack(newVideoTrack, stream);
          }

          if (audioSender && newAudioTrack) {
            await audioSender.replaceTrack(newAudioTrack).catch(e => console.error("Error replacing audio track:", e));
          }

          // Renegotiate
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          socket?.emit('call-offer', { targetUserId: otherUser._id, dmId, offer });
        }
      } catch (err) {
        console.error("Error restoring stream after stop share:", err);
      }
    } else {
      setShowSourceSelector(true);
    }
  };

  const startScreenShare = async (selectedSource: ScreenSource | null) => {
    setShowSourceSelector(false);
    // 2. START SCREEN SHARING
    console.log('VoiceCall: Starting screen share with source:', selectedSource?.name);
    try {
      let screenStream: MediaStream | null = null;
      const { getElectronDisplayMedia, isElectron } = await import('../utils/electron');

      if (isElectron()) {
        screenStream = await getElectronDisplayMedia(selectedSource?.id, selectedSource?.quality);
      } else {
        const constraints: any = {
          video: true,
          audio: true
        };

        if (selectedSource?.quality) {
          const { resolution, frameRate } = selectedSource.quality;
          const resMap: any = {
            '480p': { width: 854, height: 480 },
            '720p': { width: 1280, height: 720 },
            '1080p': { width: 1920, height: 1080 },
            '1440p': { width: 2560, height: 1440 },
            '4k': { width: 3840, height: 2160 }
          };
          const res = resMap[resolution];
          constraints.video = {
            frameRate: { ideal: frameRate, max: frameRate },
            ...(res ? { width: { ideal: res.width }, height: { ideal: res.height } } : {})
          };
        }

        screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      }

      if (!screenStream) return;

      const screenTrack = screenStream.getVideoTracks()[0];
      const screenAudioTrack = screenStream.getAudioTracks()[0];

      screenTrack.onended = () => {
        setIsScreenSharing(prev => {
          if (prev) toggleScreenShare();
          return false;
        });
      };

      const tracks: MediaStreamTrack[] = [screenTrack];
      let audioTrackToUse: MediaStreamTrack | null = null;

      // Handle mic track
      if (localStream) {
        audioTrackToUse = localStream.getAudioTracks()[0];
      }

      if (audioTrackToUse) tracks.push(audioTrackToUse);
      if (screenAudioTrack) tracks.push(screenAudioTrack);

      const newStream = new MediaStream(tracks);

      if (!audioTrackToUse && localStream) {
        audioTrackToUse = localStream.getAudioTracks()[0];
      }

      if (audioTrackToUse) newStream.addTrack(audioTrackToUse);
      setLocalStream(newStream);
      setIsScreenSharing(true);

      if (peerConnectionRef.current) {
        const senders = peerConnectionRef.current.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        const audioSender = senders.find(s => s.track?.kind === 'audio');

        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
          if (audioSender && audioTrackToUse) {
            await audioSender.replaceTrack(audioTrackToUse);
          }
          // If we had a 2nd audio sender, update it, otherwise add it
          if (screenAudioTrack) {
            peerConnectionRef.current.addTrack(screenAudioTrack, newStream);
          }
        } else {
          // If we are adding video (screen share) to a voice-only call,
          // we must ensure both tracks are on the SAME stream for the receiver.
          if (audioSender) {
            peerConnectionRef.current.removeTrack(audioSender);
          }
          peerConnectionRef.current.addTrack(screenTrack, newStream);
          if (audioTrackToUse) {
            peerConnectionRef.current.addTrack(audioTrackToUse, newStream);
          }
          if (screenAudioTrack) {
            peerConnectionRef.current.addTrack(screenAudioTrack, newStream);
          }
        }

        // Set bitrate control for stability
        setTimeout(async () => {
          try {
            const sender = peerConnectionRef.current?.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              const bitrateMap: any = {
                '480p': 1000, '720p': 2500, '1080p': 5000,
                '1440p': 8000, '4k': 15000, 'original': 6000
              };
              const resolutionKey = selectedSource?.quality?.resolution || '720p';
              params.encodings[0].maxBitrate = (bitrateMap[resolutionKey] || 2500) * 1000;
              await sender.setParameters(params);
              console.log(`[VoiceCall] Set max bitrate to ${params.encodings[0].maxBitrate / 1000}kbps`);
            }
          } catch (err) {
            console.warn("Failed to set bitrate parameters:", err);
          }
        }, 500);

        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket?.emit('call-offer', { targetUserId: otherUser._id, dmId, offer });
      }
    } catch (err) {
      console.error("Error starting screen share:", err);
      setIsScreenSharing(false);
    }
  };

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream]);

  return (
    <div className="voice-call-container">
      <div className="voice-call-header">
        <div className="call-user-info">
          <div className="call-avatar">
            {getAvatarUrl(otherUser.avatar) ? (
              <img src={getAvatarUrl(otherUser.avatar)!} alt={otherUser.username} />
            ) : (
              <span>{otherUser.username.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="call-user-details">
            <div className="call-username">{otherUser.username}</div>
            <div className="call-status">
              {isCallActive ? 'В разговоре' :
                isIncomingCall ? 'Входящий звонок' :
                  isRinging ? 'Звонок...' :
                    isWaitingInRoom ? 'Ожидание собеседника...' :
                      'Подключение...'}
            </div>
          </div>
        </div>
        <button className="end-call-button" onClick={endCall} title="Завершить звонок">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="voice-call-content">
        {isIncomingCall ? (
          <div className="call-pending">
            <div className="call-avatar-large">
              {getAvatarUrl(otherUser.avatar) ? (
                <img src={getAvatarUrl(otherUser.avatar)!} alt={otherUser.username} />
              ) : (
                <span>{otherUser.username.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="incoming-call-actions">
              <button className="accept-call-button" onClick={acceptCall}>
                <span className="call-icon"><CheckIcon color="white" /></span>
                Принять
              </button>
              <button className="reject-call-button" onClick={endCall}>
                <span className="call-icon"><CloseIcon color="white" size={24} /></span>
                Отклонить
              </button>
            </div>
          </div>
        ) : !isCallActive ? (
          <div className="call-pending">
            <div className="call-avatar-large">
              {getAvatarUrl(otherUser.avatar) ? (
                <img src={getAvatarUrl(otherUser.avatar)!} alt={otherUser.username} />
              ) : (
                <span>{otherUser.username.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="waiting-indicator">
              {initialIncomingCall ? (
                isCallActive ? 'В разговоре' : 'Подключение к звонку...'
              ) : (
                isRinging ? 'Вызываем...' :
                  (isCallActive ? 'В разговоре' : 'Собеседник не ответил, вы в комнате ожидания')
              )}
            </div>
          </div>
        ) : (
          <div className="call-active">
            <div className="video-container">
              {remoteStream && remoteStream.getVideoTracks().length > 0 && (
                <div className="remote-video-container">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`remote-video ${!isWatchingRemote ? 'is-blurred' : ''}`}
                    onLoadedMetadata={() => {
                      // Ensure audio tracks are correctly enabled based on watching state
                      const audioTracks = remoteStream.getAudioTracks();
                      if (audioTracks.length > 1) {
                        audioTracks[1].enabled = isWatchingRemote;
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setStreamContextMenu({ x: e.clientX, y: e.clientY, participant: otherUser, isMe: false });
                    }}
                  />
                  {!isWatchingRemote && (
                    <div className="watch-stream-overlay">
                      <button className="watch-stream-button" onClick={() => setIsWatchingRemote(true)}>
                        Смотреть эфир
                      </button>
                    </div>
                  )}
                  {isWatchingRemote && (
                    <button className="stop-watching-button" onClick={() => setIsWatchingRemote(false)}>
                      Прекратить просмотр
                    </button>
                  )}
                </div>
              )}
              {localStream && localStream.getVideoTracks().length > 0 && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="local-video"
                  onContextMenu={(e) => {
                    if (isScreenSharing) {
                      e.preventDefault();
                      setStreamContextMenu({ x: e.clientX, y: e.clientY, participant: user!, isMe: true });
                    }
                  }}
                />
              )}
              {/* Separate voice and stream audio for volume control */}
              <audio
                ref={(el) => {
                  if (el && remoteStream) {
                    const voiceTrack = remoteStream.getAudioTracks()[0];
                    if (voiceTrack) {
                      el.srcObject = new MediaStream([voiceTrack]);
                      el.volume = userVolumes.get(otherUser._id) ?? 1;
                      el.muted = isGlobalDeafened;
                      el.play().catch(() => { });
                    }
                  }
                }}
                autoPlay
                style={{ display: 'none' }}
              />
              <audio
                ref={(el) => {
                  if (el && remoteStream) {
                    const audioTracks = remoteStream.getAudioTracks();
                    if (audioTracks.length > 1) {
                      el.srcObject = new MediaStream([audioTracks[1]]);
                      el.volume = streamVolumes.get(otherUser._id) ?? 1;
                      el.muted = isGlobalDeafened || !isWatchingRemote;
                      el.play().catch(() => { });
                    } else {
                      el.srcObject = null;
                    }
                  }
                }}
                autoPlay
                style={{ display: 'none' }}
              />
            </div>
            <div className="call-controls">
              <button
                className={`control-button ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
              >
                {isMuted ? <MicMutedIcon /> : <MicIcon />}
              </button>
              <button
                className={`control-button ${!isVideoEnabled ? 'disabled' : ''}`}
                onClick={toggleVideo}
                title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              >
                {isVideoEnabled ? <VideoIcon /> : <CameraIcon />}
              </button>
              <button
                className={`control-button ${isScreenSharing ? 'active screen-sharing' : ''}`}
                onClick={toggleScreenShare}
                title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
              >
                {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
              </button>
              <button
                className="control-button end-call"
                onClick={endCall}
                title="Завершить звонок"
              >
                <PhoneIcon color="white" />
              </button>
            </div>
          </div>
        )}
      </div>
      {showSourceSelector && (
        <ScreenSourceSelector
          onSelect={startScreenShare}
          onCancel={() => setShowSourceSelector(false)}
        />
      )}
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

export default VoiceCall;
