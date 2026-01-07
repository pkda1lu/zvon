import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useVoice } from '../contexts/VoiceContext';
import { getAvatarUrl } from '../utils/avatar';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { PhoneIcon, MicIcon, MicMutedIcon, VideoIcon, CameraIcon, CloseIcon, CheckIcon, ScreenShareIcon, StopScreenShareIcon } from './Icons';
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
  const { isNoiseSuppressionEnabled } = useVoice();
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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const ringTimeoutRef = useRef<any>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(initialOffer?.offer || null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const mixedStreamRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const retryTimeoutRef = useRef<any>(null);

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
        setIsRinging(false);
        setIsWaitingInRoom(true);
      }, 60000);
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
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    streamToUse.getTracks().forEach(track => {
      pc.addTrack(track, streamToUse);
    });

    pc.ontrack = (event) => {
      const incomingStream = event.streams[0];
      console.log('VoiceCall: Remote track received', incomingStream.id, event.track.kind);

      setRemoteStream(incomingStream);

      // Trigger re-render when tracks are removed or end
      const forceUpdate = () => {
        console.log("VoiceCall: Remote stream track changed, updating UI");
        setRemoteStream(prev => prev ? new MediaStream(prev.getTracks()) : null);
      };
      incomingStream.onremovetrack = forceUpdate;
      incomingStream.getTracks().forEach(t => t.onended = forceUpdate);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = incomingStream;
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

  const endCall = () => {
    cleanupStreams();
    if (socket) {
      socket.emit('call-end', { targetUserId: otherUser._id });
    }
    setIsCallActive(false);
    onEndCall();
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
      // 2. START SCREEN SHARING
      console.log('VoiceCall: Starting screen share');
      try {
        let screenStream: MediaStream | null = null;
        const { getElectronDisplayMedia, isElectron } = await import('../utils/electron');

        if (isElectron()) {
          screenStream = await getElectronDisplayMedia();
        } else {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
          });
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

        const newStream = new MediaStream([screenTrack]);
        let audioTrackToUse: MediaStreamTrack | null = null;

        // Setup Audio Mixing
        if (screenAudioTrack && localStream) {
          console.log("VoiceCall: Mixing screen audio with mic");
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const dest = ctx.createMediaStreamDestination();

            const micSource = ctx.createMediaStreamSource(new MediaStream([localStream.getAudioTracks()[0]]));
            const micGain = ctx.createGain();
            micGain.gain.value = isMuted ? 0 : 1;
            micSource.connect(micGain);
            micGain.connect(dest);

            const screenSource = ctx.createMediaStreamSource(new MediaStream([screenAudioTrack]));
            const screenGain = ctx.createGain();
            screenGain.gain.value = 1.0;
            screenSource.connect(screenGain);
            screenGain.connect(dest);

            audioContextRef.current = ctx;
            micGainNodeRef.current = micGain;
            mixedStreamRef.current = dest;

            if (ctx.state === 'suspended') await ctx.resume();
            audioTrackToUse = dest.stream.getAudioTracks()[0];
          } catch (mixErr) {
            console.error("Mixing failed, falling back to mic only", mixErr);
          }
        }

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
          } else {
            // If we are adding video (screen share) to a voice-only call,
            // we must ensure both tracks are on the SAME stream for the receiver.
            // We remove the old audio sender (bound to old stream) and add both to new stream.
            if (audioSender) {
              peerConnectionRef.current.removeTrack(audioSender);
            }
            peerConnectionRef.current.addTrack(screenTrack, newStream);
            if (audioTrackToUse) {
              peerConnectionRef.current.addTrack(audioTrackToUse, newStream);
            }
          }

          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          socket?.emit('call-offer', { targetUserId: otherUser._id, dmId, offer });
        }
      } catch (err) {
        console.error("Error starting screen share:", err);
        setIsScreenSharing(false);
      }
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
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="remote-video"
                />
              )}
              {localStream && localStream.getVideoTracks().length > 0 && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="local-video"
                />
              )}
              <audio
                ref={(el) => {
                  if (el && remoteStream) {
                    el.srcObject = remoteStream;
                    el.play().catch(e => console.error("Hidden audio play error", e));
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
    </div>
  );
};

export default VoiceCall;
