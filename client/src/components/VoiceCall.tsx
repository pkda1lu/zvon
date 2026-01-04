import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import './VoiceCall.css';

interface VoiceCallProps {
  socket: Socket | null;
  otherUser: User;
  onEndCall: () => void;
  initialIncomingCall?: boolean;
  initialOffer?: { fromUserId: string; offer: RTCSessionDescriptionInit };
}

const VoiceCall: React.FC<VoiceCallProps> = ({ socket, otherUser, onEndCall, initialIncomingCall = false, initialOffer }) => {
  const { user } = useAuth();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isIncomingCall, setIsIncomingCall] = useState(initialIncomingCall);
  const [callerId, setCallerId] = useState<string | null>(initialOffer?.fromUserId || null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (initialOffer) {
      (window as any).pendingOffer = { fromUserId: initialOffer.fromUserId, offer: initialOffer.offer };
    }

    if (socket) {
      socket.on('call-offer', handleIncomingCall);
      socket.on('call-answer', handleCallAnswer);
      socket.on('call-ice-candidate', handleIceCandidate);
      socket.on('call-end', handleCallEnd);

      return () => {
        socket.off('call-offer');
        socket.off('call-answer');
        socket.off('call-ice-candidate');
        socket.off('call-end');
      };
    }
  }, [socket, initialOffer]);

  const handleIncomingCall = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
    setIsIncomingCall(true);
    setCallerId(data.fromUserId);
    // Store offer for later use
    (window as any).pendingOffer = { fromUserId: data.fromUserId, offer: data.offer };
  };

  const answerCall = async () => {
    if (!callerId || !(window as any).pendingOffer) return;

    const { fromUserId, offer } = (window as any).pendingOffer;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoEnabled
      });
      setLocalStream(stream);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('call-ice-candidate', {
            targetUserId: fromUserId,
            candidate: event.candidate
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socket) {
        socket.emit('call-answer', {
          targetUserId: fromUserId,
          answer: answer
        });
      }

      peerConnectionRef.current = pc;
      setIsCallActive(true);
      setIsIncomingCall(false);
    } catch (error) {
      console.error('Error answering call:', error);
      setIsIncomingCall(false);
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

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoEnabled
      });
      setLocalStream(stream);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
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

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socket) {
        socket.emit('call-offer', {
          targetUserId: otherUser._id,
          offer: offer
        });
      }

      setIsCallActive(true);
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Не удалось начать звонок. Проверьте разрешения на доступ к микрофону и камере.');
    }
  };

  const handleCallAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  };

  const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
    if (peerConnectionRef.current && data.candidate) {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  const handleCallEnd = () => {
    endCall();
  };

  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (socket) {
      socket.emit('call-end', { targetUserId: otherUser._id });
    }
    setIsCallActive(false);
    onEndCall();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = async () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

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
              {isCallActive ? 'Идет звонок...' : 'Ожидание...'}
            </div>
          </div>
        </div>
        <button className="end-call-button" onClick={endCall} title="Завершить звонок">
          ✕
        </button>
      </div>

      <div className="voice-call-content">
        {!isCallActive && !isIncomingCall ? (
          <div className="call-pending">
            <div className="call-avatar-large">
              {getAvatarUrl(otherUser.avatar) ? (
                <img src={getAvatarUrl(otherUser.avatar)!} alt={otherUser.username} />
              ) : (
                <span>{otherUser.username.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <button className="start-call-button" onClick={startCall}>
              <span className="call-icon">📞</span>
              Начать звонок
            </button>
          </div>
        ) : isIncomingCall ? (
          <div className="call-pending">
            <div className="call-avatar-large">
              {getAvatarUrl(otherUser.avatar) ? (
                <img src={getAvatarUrl(otherUser.avatar)!} alt={otherUser.username} />
              ) : (
                <span>{otherUser.username.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="incoming-call-actions">
              <button className="accept-call-button" onClick={answerCall}>
                <span className="call-icon">✓</span>
                Принять
              </button>
              <button className="reject-call-button" onClick={endCall}>
                <span className="call-icon">✕</span>
                Отклонить
              </button>
            </div>
          </div>
        ) : (
          <div className="call-active">
            <div className="video-container">
              {remoteStream && (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="remote-video"
                />
              )}
              {localStream && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="local-video"
                />
              )}
            </div>
            <div className="call-controls">
              <button
                className={`control-button ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
              >
                {isMuted ? '🔇' : '🎤'}
              </button>
              <button
                className={`control-button ${!isVideoEnabled ? 'disabled' : ''}`}
                onClick={toggleVideo}
                title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              >
                {isVideoEnabled ? '📹' : '📷'}
              </button>
              <button
                className="control-button end-call"
                onClick={endCall}
                title="Завершить звонок"
              >
                📞
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceCall;

