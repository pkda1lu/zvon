import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';
import ScreenSourceSelector, { ScreenSource } from '../components/ScreenSourceSelector';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { SOUNDS, soundManager } from '../utils/sounds';


// Remote Audio Component to handle lifecycle properly
const RemoteAudio: React.FC<{
    userId: string;
    stream: MediaStream;
    voiceVolume: number;
    streamVolume: number;
    isDeafened: boolean;
    isLocalMuted: boolean;
    isWatched: boolean;
    sharedContext: AudioContext | null;
}> = ({ userId, stream, voiceVolume, streamVolume, isDeafened, isLocalMuted, isWatched, sharedContext }) => {
    const voiceAudioRef = useRef<HTMLAudioElement>(null);
    const streamAudioRef = useRef<HTMLAudioElement>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        if (!stream || !sharedContext) return;

        const voiceTracks = stream.getAudioTracks();
        if (voiceTracks.length === 0) return;

        // Ensure the stream is "played" via a hidden audio element
        // This is often required for the stream packets to actually be processed/flow in some environments
        if (voiceAudioRef.current) {
            voiceAudioRef.current.srcObject = stream;
            voiceAudioRef.current.muted = true; // Mute the direct output as we'll use GainNode
            voiceAudioRef.current.play().catch(() => { });
        }

        const ctx = sharedContext;

        // Disconnect old source if it exists
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
        }

        try {
            const source = ctx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;

            const gainNode = ctx.createGain();
            gainNodeRef.current = gainNode;

            // Base boost of 1.5x + apply user volume
            gainNode.gain.value = (isDeafened || isLocalMuted) ? 0 : voiceVolume * 1.5;

            source.connect(gainNode);
            gainNode.connect(ctx.destination);
        } catch (err) {
            console.error(`[RemoteAudio] Error setting up Web Audio for ${userId}:`, err);
        }

        return () => {
            if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
            if (gainNodeRef.current) gainNodeRef.current.disconnect();
        };
    }, [stream, userId, sharedContext]);

    useEffect(() => {
        if (gainNodeRef.current && sharedContext) {
            const targetGain = (isDeafened || isLocalMuted) ? 0 : voiceVolume * 1.5;
            gainNodeRef.current.gain.setTargetAtTime(
                targetGain,
                sharedContext.currentTime,
                0.1
            );
        }
    }, [voiceVolume, isDeafened, isLocalMuted, sharedContext]);

    useEffect(() => {
        if (streamAudioRef.current && stream) {
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 1) {
                const screenStream = new MediaStream([audioTracks[1]]);
                streamAudioRef.current.srcObject = screenStream;
                streamAudioRef.current.play().catch(() => { });
            } else {
                streamAudioRef.current.srcObject = null;
            }
        }
    }, [stream, userId]);

    useEffect(() => {
        if (streamAudioRef.current) {
            streamAudioRef.current.volume = Math.min(1, Math.max(0, streamVolume));
        }
    }, [streamVolume]);

    return (
        <>
            <audio ref={voiceAudioRef} autoPlay playsInline muted style={{ display: 'none' }} />
            <audio
                ref={streamAudioRef}
                autoPlay
                playsInline
                muted={isDeafened || !isWatched}
                style={{ display: 'none' }}
            />
        </>
    );
};

interface VoiceContextType {
    isConnected: boolean;
    activeChannelId: string | null;
    joinChannel: (channelId: string) => void;
    leaveChannel: () => void;
    isMuted: boolean;
    isDeafened: boolean;
    toggleMute: () => void;
    toggleDeafen: () => void;
    isScreenSharing: boolean;
    toggleScreenShare: () => void;
    connectedUsers: User[];
    localStream: MediaStream | null; // For visualization
    remoteStreams: Map<string, MediaStream>; // Export remote streams
    userVolumes: Map<string, number>;
    setUserVolume: (userId: string, volume: number) => void;
    userStates: Map<string, { isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean }>;
    localMutes: Set<string>;
    toggleLocalMute: (userId: string) => void;
    speakingUsers: Set<string>;
    isNoiseSuppressionEnabled: boolean;
    toggleNoiseSuppression: () => void;
    watchedUserIds: Set<string>;
    toggleWatchUser: (userId: string) => void;
    streamVolumes: Map<string, number>;
    setStreamVolume: (userId: string, volume: number) => void;
    isSharingScreenAudio: boolean;
    toggleScreenAudio: () => void;
    updateScreenQuality: (quality: { resolution: string, frameRate: number }) => void;
    changeScreenSource: () => void;
    audioContext: AudioContext | null;
}



const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export const useVoice = () => {
    const context = useContext(VoiceContext);
    if (!context) {
        throw new Error('useVoice must be used within VoiceProvider');
    }
    return context;
};

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket } = useSocket();
    const { user } = useAuth();

    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const isConnectedRef = useRef(false);

    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const isScreenSharingRef = useRef(false);

    useEffect(() => {
        isScreenSharingRef.current = isScreenSharing;
    }, [isScreenSharing]);

    const [showSourceSelector, setShowSourceSelector] = useState(false);

    // Audio Processing State
    const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState(() => {
        return localStorage.getItem('noiseSuppression') === 'true';
    });

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    // Store the raw microphone stream to re-apply processing without re-requesting access
    const rawMicStreamRef = useRef<MediaStream | null>(null);


    const [connectedUsers, setConnectedUsers] = useState<User[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [userVolumes, setUserVolumes] = useState<Map<string, number>>(new Map());
    const [userStates, setUserStates] = useState<Map<string, { isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean }>>(new Map());
    const [localMutes, setLocalMutes] = useState<Set<string>>(new Set());
    const [watchedUserIds, setWatchedUserIds] = useState<Set<string>>(new Set());
    const [streamVolumes, setStreamVolumes] = useState<Map<string, number>>(new Map());
    const [isSharingScreenAudio, setIsSharingScreenAudio] = useState(true);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

    const toggleWatchUser = useCallback((userId: string) => {
        setWatchedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    }, []);

    const setStreamVolume = useCallback((userId: string, volume: number) => {
        setStreamVolumes(prev => new Map(prev).set(userId, volume));
    }, []);

    const toggleScreenAudio = useCallback(() => {
        setIsSharingScreenAudio(prev => {
            const newState = !prev;
            if (localStreamRef.current) {
                const tracks = localStreamRef.current.getAudioTracks();
                if (tracks.length > 1) {
                    tracks[1].enabled = newState;
                }
            }
            return newState;
        });
    }, []);

    const changeScreenSource = useCallback(() => {
        setShowSourceSelector(true);
    }, []);

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
    const speakingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const audioContextRef = useRef<AudioContext | null>(null);
    const micGainNodeRef = useRef<GainNode | null>(null);
    const mixedStreamRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

    const getAudioContext = useCallback(() => {
        if (audioContextRef.current) {
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().catch(() => { });
            }
            return audioContextRef.current;
        }

        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        setAudioContext(ctx);

        if (ctx.state === 'suspended') {
            const resume = () => ctx.resume().catch(() => { });
            document.addEventListener('click', resume, { once: true });
            document.addEventListener('mousedown', resume, { once: true });
        }

        return ctx;
    }, []);

    // Keep ref synced
    useEffect(() => {
        isConnectedRef.current = isConnected;
    }, [isConnected]);

    // Handle incoming audio stream
    const handleTrack = useCallback((userId: string, stream: MediaStream) => {
        console.log(`VoiceContext: Remote track received from ${userId}`);
        setRemoteStreams(prev => new Map(prev).set(userId, stream));

        // Listen for track removal or ending to trigger UI updates (remove screen share card)
        const updateUI = () => {
            console.log(`VoiceContext: Stream updated for ${userId}, forcing re-render`);
            setRemoteStreams(prev => new Map(prev));
        };

        stream.onremovetrack = updateUI;
        stream.getTracks().forEach(track => {
            track.onended = updateUI;
        });
    }, []);

    const createPeer = useCallback((targetUserId: string, initiator: boolean) => {
        if (peersRef.current.has(targetUserId)) {
            return peersRef.current.get(targetUserId)!;
        }

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
            ],
            iceCandidatePoolSize: 10,
        });

        peersRef.current.set(targetUserId, pc);

        // Add local tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current!);
            });
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
            handleTrack(targetUserId, event.streams[0]);
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('voice-ice-candidate', {
                    targetUserId: targetUserId,
                    candidate: event.candidate
                });
            }
        };

        // If initiator, create offer
        if (initiator) {
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    if (socket) {
                        socket.emit('voice-offer', {
                            targetUserId: targetUserId,
                            offer: pc.localDescription
                        });
                    }
                })
                .catch(err => console.error('Error creating offer:', err));
        }

        return pc;
    }, [socket, handleTrack]);

    const leaveChannel = useCallback(() => {
        if (!activeChannelId) return;

        // 1. Stop local tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        setLocalStream(null);

        // 2. Close all peer connections
        peersRef.current.forEach(pc => pc.close());
        peersRef.current.clear();
        pendingCandidatesRef.current.clear();

        // 3. Clear remote streams
        setRemoteStreams(new Map());

        // 4. Clear users list
        setConnectedUsers([]);

        // 5. Notify server
        if (socket && isConnectedRef.current) {
            socket.emit('leave-voice-channel', { channelId: activeChannelId });
        }

        setIsConnected(false);
        setActiveChannelId(null);
        setIsScreenSharing(false);
        soundManager.play(SOUNDS.VOICE_LEAVE, 0.4);
    }, [socket, activeChannelId]);

    const joinChannel = useCallback(async (channelId: string) => {
        // If already in a channel, leave it first
        if (isConnectedRef.current) {
            leaveChannel();
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            // Store raw stream
            rawMicStreamRef.current = stream;

            // Apply processing if enabled
            let streamToUse = stream;
            if (isNoiseSuppressionEnabled) {
                try {
                    const ctx = getAudioContext();
                    streamToUse = await setupNoiseSuppression(ctx, stream);
                    console.log('[VoiceContext] Noise suppression applied to local stream');
                } catch (err) {
                    console.error('[VoiceContext] Failed to apply noise suppression:', err);
                }
            }

            setLocalStream(streamToUse);
            localStreamRef.current = streamToUse;


            // Apply initial mute state
            stream.getAudioTracks().forEach(t => t.enabled = !isMuted && !isDeafened);

            setActiveChannelId(channelId);
            setIsConnected(true);

            // Socket join logic happens in useEffect below
            console.log('[VoiceContext] Joined channel locally, waiting for socket events. Channel:', channelId);
            soundManager.play(SOUNDS.VOICE_JOIN, 0.4);
        } catch (error) {
            console.error('Error connecting to voice channel:', error);
            alert('Не удалось подключиться к голосовому каналу. Проверьте разрешения на доступ к микрофону.');
        }
    }, [isMuted, isDeafened, leaveChannel]);

    // Effect to handle socket events and connection logic
    useEffect(() => {
        if (!socket || !isConnected || !activeChannelId) return;
        if (!localStreamRef.current) return;

        const handleExistingUsers = (users: User[]) => {
            console.log('[VoiceContext] Received existing users:', users);
            const others = users.filter(u => u._id !== user?._id);
            setConnectedUsers(others);

            others.forEach(u => {
                console.log('[VoiceContext] Creating initiator peer for:', u._id);
                createPeer(u._id, true);
            });
        };

        const handleUserJoined = (data: { userId: string; user: any }) => {
            console.log('[VoiceContext] User joined:', data);
            if (data.userId === user?._id) return;

            setConnectedUsers(prev => {
                const exists = prev.find(u => u._id === data.user._id);
                if (exists) return prev;
                return [...prev, data.user];
            });

            // Sync user's initial state if provided
            if (data.user.isMuted !== undefined) {
                setUserStates(prev => new Map(prev).set(data.userId, {
                    isMuted: data.user.isMuted,
                    isDeafened: data.user.isDeafened,
                    isScreenSharing: data.user.isScreenSharing
                }));
            }
        };

        const handleUserLeft = (data: { userId: string }) => {
            setConnectedUsers(prev => prev.filter(u => u._id !== data.userId));

            const pc = peersRef.current.get(data.userId);
            if (pc) {
                pc.close();
                peersRef.current.delete(data.userId);
            }

            setRemoteStreams(prev => {
                const newMap = new Map(prev);
                newMap.delete(data.userId);
                return newMap;
            });
        };

        const handleOffer = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
            console.log('[VoiceContext] Received offer from:', data.fromUserId);
            try {
                const pc = createPeer(data.fromUserId, false);
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

                const pending = pendingCandidatesRef.current.get(data.fromUserId);
                if (pending) {
                    console.log('[VoiceContext] Processing pending candidates for:', data.fromUserId);
                    for (const candidate of pending) {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    pendingCandidatesRef.current.delete(data.fromUserId);
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                console.log('[VoiceContext] Sending answer to:', data.fromUserId);
                socket.emit('voice-answer', {
                    targetUserId: data.fromUserId,
                    answer
                });

                // If I am screen sharing, I need to push my video to this new peer 
                // because their initial offer was likely audio-only.
                if (isScreenSharingRef.current) {
                    console.log(`[VoiceContext] I am sharing (ref), triggering renegotiation for new joiner ${data.fromUserId}`);
                    setTimeout(async () => {
                        try {
                            const newOffer = await pc.createOffer();
                            await pc.setLocalDescription(newOffer);
                            socket.emit('voice-offer', {
                                targetUserId: data.fromUserId,
                                offer: pc.localDescription
                            });
                        } catch (e) {
                            console.error("Renegotiation error after initial handshake:", e);
                        }
                    }, 1000);
                }
            } catch (err) {
                console.error('Error handling offer:', err);
            }
        };

        const handleAnswer = async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
            try {
                const pc = peersRef.current.get(data.fromUserId);
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

                    const pending = pendingCandidatesRef.current.get(data.fromUserId);
                    if (pending) {
                        for (const candidate of pending) {
                            await pc.addIceCandidate(new RTCIceCandidate(candidate));
                        }
                        pendingCandidatesRef.current.delete(data.fromUserId);
                    }
                }
            } catch (err) {
                console.error('Error handling answer:', err);
            }
        };

        const handleCandidate = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
            try {
                const pc = peersRef.current.get(data.fromUserId);
                if (pc) {
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } else {
                        const pending = pendingCandidatesRef.current.get(data.fromUserId) || [];
                        pending.push(data.candidate);
                        pendingCandidatesRef.current.set(data.fromUserId, pending);
                    }
                }
            } catch (err) {
                console.error('Error handling candidate:', err);
            }
        };

        const handleUserStateUpdate = (data: { userId: string; isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean }) => {
            console.log('[VoiceContext] User state update:', data);
            setUserStates(prev => new Map(prev).set(data.userId, {
                isMuted: data.isMuted,
                isDeafened: data.isDeafened,
                isScreenSharing: data.isScreenSharing
            }));

            // Force update remote streams mapping if screen sharing changed
            // This helps UI detect the new video track
            setRemoteStreams(prev => new Map(prev));
        };

        const handleUserUpdate = (updatedUser: Partial<User> & { _id: string }) => {
            setConnectedUsers(prev => prev.map(u =>
                u._id === updatedUser._id ? { ...u, ...updatedUser } : u
            ));
        };

        const handleError = (error: { message: string }) => {
            console.error('[VoiceContext] Socket error:', error);
            alert(`Ошибка подключения к голосовому чату: ${error.message || 'Неизвестная ошибка'}`);
            leaveChannel();
        };

        socket.on('voice-existing-users', handleExistingUsers);
        socket.on('voice-user-joined', handleUserJoined);
        socket.on('voice-user-left', handleUserLeft);
        socket.on('voice-offer', handleOffer);
        socket.on('voice-answer', handleAnswer);
        socket.on('voice-ice-candidate', handleCandidate);
        socket.on('voice-user-state-update', handleUserStateUpdate);
        socket.on('user-updated', handleUserUpdate);
        socket.on('error', handleError);

        socket.emit('join-voice-channel', { channelId: activeChannelId });

        return () => {
            socket.off('voice-existing-users', handleExistingUsers);
            socket.off('voice-user-joined', handleUserJoined);
            socket.off('voice-user-left', handleUserLeft);
            socket.off('voice-offer', handleOffer);
            socket.off('voice-answer', handleAnswer);
            socket.off('voice-ice-candidate', handleCandidate);
            socket.off('voice-user-state-update', handleUserStateUpdate);
            socket.off('user-updated', handleUserUpdate);
            socket.off('error', handleError);
        };
    }, [socket, isConnected, activeChannelId, createPeer, user]);

    const toggleMute = () => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        // Notify server about state change
        if (socket && activeChannelId) {
            socket.emit('voice-state-update', {
                channelId: activeChannelId,
                isMuted: newMuted,
                isDeafened: isDeafened,
                isScreenSharing
            });
        }
    };

    const toggleDeafen = () => {
        const newDeafened = !isDeafened;
        setIsDeafened(newDeafened);
        // Notify server about state change
        if (socket && activeChannelId) {
            socket.emit('voice-state-update', {
                channelId: activeChannelId,
                isMuted: isMuted,
                isDeafened: newDeafened,
                isScreenSharing
            });
        }
    };

    const setUserVolume = useCallback((userId: string, volume: number) => {
        setUserVolumes(prev => new Map(prev).set(userId, volume));
    }, []);

    const toggleNoiseSuppression = useCallback(async () => {
        const newState = !isNoiseSuppressionEnabled;
        setIsNoiseSuppressionEnabled(newState);
        localStorage.setItem('noiseSuppression', String(newState));

        // Re-apply pipeline if connected
        if (isConnectedRef.current && rawMicStreamRef.current) {
            console.log('[VoiceContext] Toggling noise suppression:', newState);

            let newStream = rawMicStreamRef.current;

            // Clean up old context/processing if needed
            // NOTE: We don't close the context here as it might disrupt pending ops, 
            // but effectively we are creating a new path.

            if (newState) {
                try {
                    const ctx = getAudioContext();
                    newStream = await setupNoiseSuppression(ctx, rawMicStreamRef.current);
                } catch (e) {
                    console.error('Failed to enable NS:', e);
                }
            } else {
                // Determine if we need to close context? 
                // Mostly just switch back to raw stream
                if (audioContextRef.current && !isScreenSharing) {
                    // Keep context if screen sharing is mixing, otherwise maybe leave it open or close?
                    // For simplicity, we just switch source.
                }
            }

            setLocalStream(newStream);
            localStreamRef.current = newStream;

            // Update Audio Tracks for Mute State
            newStream.getAudioTracks().forEach(t => t.enabled = !isMuted && !isDeafened);

            // Replace tracks in peers
            const audioTrack = newStream.getAudioTracks()[0];
            if (audioTrack) {
                peersRef.current.forEach(async (pc) => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    if (sender) {
                        try {
                            await sender.replaceTrack(audioTrack);
                        } catch (err) {
                            console.error('Error replacing track for NS toggle:', err);
                        }
                    }
                });
            }
        }
    }, [isNoiseSuppressionEnabled, isMuted, isDeafened, isScreenSharing]);

    const toggleScreenShare = async () => {

        if (isScreenSharing) {
            // Stop sharing
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => {
                    if (t.kind === 'video') t.stop();
                });
            }
            setIsScreenSharing(false);

            // Switch back to audio only (restore mic)
            // Cleanup mixing if exists
            if (audioContextRef.current) {
                // DON'T close shared context, just clear state if needed
                micGainNodeRef.current = null;
                mixedStreamRef.current = null;
            }

            soundManager.play(SOUNDS.SCREENSHARE_TOGGLE, 0.5);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            setLocalStream(stream);
            localStreamRef.current = stream;

            // Apply current mute state to new stream
            stream.getAudioTracks().forEach(t => t.enabled = !isMuted && !isDeafened);

            // Notify server
            if (socket && activeChannelId) {
                socket.emit('voice-state-update', {
                    channelId: activeChannelId,
                    isMuted: isMuted,
                    isDeafened: isDeafened,
                    isScreenSharing: false
                });
            }

            // Remove video track from peers and renegotiate (Switch back to audio only)
            peersRef.current.forEach(async (pc, targetUserId) => {
                try {
                    const senders = pc.getSenders();
                    const videoSender = senders.find(s => s.track?.kind === 'video');
                    if (videoSender) {
                        pc.removeTrack(videoSender);
                    }

                    // Update audio track to point to new stream
                    const audioSender = senders.find(s => s.track?.kind === 'audio');
                    if (audioSender) {
                        const audioTrack = stream.getAudioTracks()[0];
                        await audioSender.replaceTrack(audioTrack).catch(e => console.error("Error replacing audio track:", e));
                    }

                    // Renegotiate to tell remote that video is gone
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);

                    if (socket) {
                        socket.emit('voice-offer', {
                            targetUserId,
                            offer: pc.localDescription
                        });
                    }
                } catch (e) {
                    console.error("Renegotiation error (stop share):", e);
                }
            });

        } else {
            // Show source selector dialog
            setShowSourceSelector(true);
        }
    };

    const startScreenShare = async (selectedSource: ScreenSource | null) => {
        setShowSourceSelector(false);

        try {
            let screenStream: MediaStream | null = null;

            // Try Electron desktopCapturer API first (for packaged Electron apps)
            const { getElectronDisplayMedia, isElectron } = await import('../utils/electron');
            const isElectronEnv = isElectron();
            console.log('Is Electron environment:', isElectronEnv);

            if (isElectronEnv && selectedSource) {
                console.log('Detected Electron environment, using selected source:', selectedSource.id);
                screenStream = await getElectronDisplayMedia(selectedSource.id, selectedSource.quality);
            } else if (isElectronEnv) {
                // User chose to use native picker
                console.log('Using native picker in Electron');
                screenStream = await getElectronDisplayMedia(undefined, undefined);
            }

            // Fallback to standard getDisplayMedia if Electron API didn't work or user chose native picker
            if (!screenStream && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                console.log('Trying standard getDisplayMedia API');
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

                try {
                    // Try with audio first
                    screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
                } catch (err) {
                    console.warn('getDisplayMedia with constraints failed, trying video only:', err);
                    try {
                        screenStream = await navigator.mediaDevices.getDisplayMedia({
                            video: constraints.video,
                            audio: false
                        });
                    } catch (secErr) {
                        console.error('getDisplayMedia failed completely:', secErr);
                    }
                }
            }

            if (!screenStream) {
                console.error("Failed to get screen stream");
                alert('Не удалось начать демонстрацию экрана. Проверьте разрешения браузера.');
                return;
            }

            const screenTrack = screenStream.getVideoTracks()[0];

            if (!screenTrack) {
                console.error("No video track in screen stream");
                alert('Не удалось получить видео поток экрана.');
                return;
            }

            const screenAudioTrack = screenStream.getAudioTracks()[0];

            screenTrack.onended = () => {
                if (isScreenSharing) {
                    toggleScreenShare();
                }
            };

            soundManager.play(SOUNDS.SCREENSHARE_TOGGLE, 0.5);
            setIsScreenSharing(true);

            let audioTrackToUse: MediaStreamTrack;

            // Identify/Get mic track
            let micTrack: MediaStreamTrack | null = null;
            if (localStreamRef.current) {
                micTrack = localStreamRef.current.getAudioTracks()[0];
            }
            if (!micTrack) {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    micTrack = micStream.getAudioTracks()[0];
                } catch (e) {
                    console.warn("Could not get mic track for screen share", e);
                }
            }

            audioTrackToUse = micTrack!;

            // SEND BOTH TRACKS IF POSSIBLE
            const tracks: MediaStreamTrack[] = [screenTrack];
            if (micTrack) tracks.push(micTrack);
            if (screenAudioTrack) {
                screenAudioTrack.enabled = isSharingScreenAudio;
                tracks.push(screenAudioTrack);
            }

            const newStream = new MediaStream(tracks);
            localStreamRef.current = newStream;
            setLocalStream(newStream);

            // Notify server
            if (socket && activeChannelId) {
                socket.emit('voice-state-update', {
                    channelId: activeChannelId,
                    isMuted: isMuted,
                    isDeafened: isDeafened,
                    isScreenSharing: true
                });
            }

            // 3. Update peers and renegotiate
            const sendersToUpdate = Array.from(peersRef.current.entries());
            for (const [targetUserId, pc] of sendersToUpdate) {
                try {
                    const senders = pc.getSenders();
                    const audioSender = senders.find(s => s.track?.kind === 'audio');
                    const videoSender = senders.find(s => s.track?.kind === 'video');

                    if (videoSender) {
                        await videoSender.replaceTrack(screenTrack);
                        if (audioSender && audioTrackToUse) {
                            await audioSender.replaceTrack(audioTrackToUse);
                        }

                        // Set bitrate for existing sender
                        setTimeout(async () => {
                            try {
                                const params = videoSender.getParameters();
                                if (!params.encodings) params.encodings = [{}];
                                const bitrateMap: any = {
                                    '480p': 1000, '720p': 2500, '1080p': 5000,
                                    '1440p': 8000, '4k': 15000, 'original': 6000
                                };
                                const resolutionKey = selectedSource?.quality?.resolution || '720p';
                                params.encodings[0].maxBitrate = (bitrateMap[resolutionKey] || 2500) * 1000;
                                await videoSender.setParameters(params);
                            } catch (e) { console.warn("Bitrate update failed:", e); }
                        }, 500);
                    } else {
                        if (audioSender) {
                            pc.removeTrack(audioSender);
                        }
                        const vSender = pc.addTrack(screenTrack, newStream);
                        if (audioTrackToUse) {
                            pc.addTrack(audioTrackToUse, newStream);
                        }
                        if (screenAudioTrack) {
                            pc.addTrack(screenAudioTrack, newStream);
                        }

                        // Set initial bitrate for new video sender
                        setTimeout(async () => {
                            try {
                                const params = vSender.getParameters();
                                if (!params.encodings) params.encodings = [{}];
                                const bitrateMap: any = {
                                    '480p': 1000, '720p': 2500, '1080p': 5000,
                                    '1440p': 8000, '4k': 15000, 'original': 6000
                                };
                                const resolutionKey = selectedSource?.quality?.resolution || '720p';
                                params.encodings[0].maxBitrate = (bitrateMap[resolutionKey] || 2500) * 1000;
                                await vSender.setParameters(params);
                            } catch (e) { console.warn("Initial bitrate set failed:", e); }
                        }, 500);
                    }

                    // Renegotiate
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket?.emit('voice-offer', { targetUserId, offer: pc.localDescription });
                } catch (e) {
                    console.error("Renegotiation error (start share):", e);
                }
            }

        } catch (err) {
            console.error("Error sharing screen:", err);
            setIsScreenSharing(false);
            if (err instanceof Error && err.name === 'NotAllowedError') {
                console.log("Screen sharing permission denied");
            } else if (err instanceof Error && err.name === 'AbortError') {
                console.log("Screen sharing cancelled by user");
            } else {
                alert('Не удалось начать демонстрацию экрана. Проверьте разрешения браузера.');
            }
        }
    };

    const updateScreenQuality = useCallback(async (quality: { resolution: string, frameRate: number }) => {
        if (!isScreenSharing || !localStreamRef.current) return;

        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (!videoTrack) return;

        const resMap: any = {
            '480p': { width: 854, height: 480 },
            '720p': { width: 1280, height: 720 },
            '1080p': { width: 1920, height: 1080 },
            '1440p': { width: 2560, height: 1440 },
            '4k': { width: 3840, height: 2160 }
        };
        const res = resMap[quality.resolution];

        try {
            await videoTrack.applyConstraints({
                frameRate: { ideal: quality.frameRate, max: quality.frameRate },
                ...(res ? { width: { ideal: res.width }, height: { ideal: res.height } } : {})
            });

            const bitrateMap: any = {
                '480p': 1000, '720p': 2500, '1080p': 5000,
                '1440p': 8000, '4k': 15000, 'original': 6000
            };
            const maxBitrate = (bitrateMap[quality.resolution] || 2500) * 1000;

            peersRef.current.forEach(async (pc) => {
                const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (videoSender) {
                    try {
                        const params = videoSender.getParameters();
                        if (!params.encodings) params.encodings = [{}];
                        params.encodings[0].maxBitrate = maxBitrate;
                        await videoSender.setParameters(params);
                    } catch (e) { console.warn("Quality update failed for peer:", e); }
                }
            });
        } catch (e) {
            console.error("applyConstraints failed:", e);
        }
    }, [isScreenSharing]);

    useEffect(() => {
        // Handle Mute Logic
        const audioTrackEnabled = !isMuted && !isDeafened;

        // If we are mixing (screen share with audio), control the Mic Gain Node
        if (micGainNodeRef.current) {
            micGainNodeRef.current.gain.value = audioTrackEnabled ? 1 : 0;
            // Ensure the mixed track itself is always enabled so system audio can pass
            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach(t => t.enabled = true); // Output track always on
            }
        } else {
            // Standard behavior: separate tracks or single mic track
            if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach(track => {
                    track.enabled = audioTrackEnabled;
                });
            }
        }
    }, [isMuted, isDeafened]);

    // Audio Analysis for Speaking Indicator
    useEffect(() => {
        if (!isConnected) {
            analysersRef.current.clear();
            setSpeakingUsers(new Set());
            return;
        }

        const audioCtx = getAudioContext();

        const checkSpeaking = () => {
            const nowSpeaking = new Set<string>();
            const threshold = 0.015; // Increased threshold to trigger only on clearer speech/louder sounds

            analysersRef.current.forEach((analyser, userId) => {
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteTimeDomainData(dataArray);

                // Calculate RMS (Volume)
                let sumOfSquares = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128; // -1.0 to 1.0
                    sumOfSquares += normalized * normalized;
                }
                const rms = Math.sqrt(sumOfSquares / dataArray.length);

                if (rms > threshold) {
                    nowSpeaking.add(userId);

                    if (speakingTimeoutsRef.current.has(userId)) {
                        clearTimeout(speakingTimeoutsRef.current.get(userId)!);
                        speakingTimeoutsRef.current.delete(userId);
                    }
                }
            });

            setSpeakingUsers(prev => {
                const newSet = new Set(prev);
                let changed = false;

                nowSpeaking.forEach(id => {
                    if (!newSet.has(id)) {
                        newSet.add(id);
                        changed = true;
                    }
                });

                prev.forEach(id => {
                    if (!nowSpeaking.has(id) && !speakingTimeoutsRef.current.has(id)) {
                        const timeout = setTimeout(() => {
                            setSpeakingUsers(current => {
                                if (!current.has(id)) return current;
                                const updated = new Set(current);
                                updated.delete(id);
                                return updated;
                            });
                            speakingTimeoutsRef.current.delete(id);
                        }, 250);
                        speakingTimeoutsRef.current.set(id, timeout);
                    }
                });

                return changed ? newSet : prev;
            });
        };

        const interval = setInterval(checkSpeaking, 100); // 100ms is enough and lighter

        const updateAnalysers = () => {
            // ALWAYS clear and rebuild when this is called to ensure 
            // we are attached to the CURRENT streams and CURRENT audio context
            analysersRef.current.clear();

            // Local
            if (localStream && user?._id && !isMuted) {
                const audioTracks = localStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    try {
                        const source = audioCtx.createMediaStreamSource(localStream);
                        const analyser = audioCtx.createAnalyser();
                        analyser.fftSize = 256;
                        source.connect(analyser);
                        analysersRef.current.set(user._id, analyser);
                        console.log("Speaking indicator: Attached local analyser for", user._id);
                    } catch (err) {
                        console.error("Failed to create local analyser:", err);
                    }
                }
            }

            // Remote
            remoteStreams.forEach((stream, userId) => {
                if (stream.getAudioTracks().length > 0) {
                    try {
                        const source = audioCtx.createMediaStreamSource(stream);
                        const analyser = audioCtx.createAnalyser();
                        analyser.fftSize = 256;
                        source.connect(analyser);
                        analysersRef.current.set(userId, analyser);
                        console.log("Speaking indicator: Attached remote analyser for", userId);
                    } catch (err) {
                        console.error("Failed to create remote analyser for", userId, err);
                    }
                }
            });
        };

        updateAnalysers();

        return () => {
            clearInterval(interval);
            // DON'T close shared context on every re-run of effect
            speakingTimeoutsRef.current.forEach(t => clearTimeout(t));
            speakingTimeoutsRef.current.clear();
        };
    }, [isConnected, localStream, remoteStreams, user?._id, isMuted, connectedUsers]);

    const toggleLocalMute = useCallback((userId: string) => {
        setLocalMutes(prev => {
            const newMutes = new Set(prev);
            if (newMutes.has(userId)) {
                newMutes.delete(userId);
            } else {
                newMutes.add(userId);
            }
            return newMutes;
        });
    }, []);

    return (
        <VoiceContext.Provider value={{
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
            connectedUsers,
            localStream,
            remoteStreams,
            userVolumes,
            setUserVolume,
            userStates,
            localMutes,
            toggleLocalMute,
            speakingUsers,
            isNoiseSuppressionEnabled,
            toggleNoiseSuppression,
            watchedUserIds,
            toggleWatchUser,
            streamVolumes,
            setStreamVolume,
            isSharingScreenAudio,
            toggleScreenAudio,
            updateScreenQuality,
            changeScreenSource,
            audioContext
        }}>

            {children}
            {/* Screen Source Selector Modal */}
            {showSourceSelector && (
                <ScreenSourceSelector
                    onSelect={startScreenShare}
                    onCancel={() => setShowSourceSelector(false)}
                />
            )}
            {/* Hidden Audio Elements for Remote Streams */}
            <div style={{ display: 'none' }}>
                {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
                    <RemoteAudio
                        key={userId}
                        userId={userId}
                        stream={stream}
                        voiceVolume={userVolumes.has(userId) ? userVolumes.get(userId)! : 1}
                        streamVolume={streamVolumes.has(userId) ? streamVolumes.get(userId)! : 1}
                        isDeafened={isDeafened}
                        isLocalMuted={localMutes.has(userId)}
                        isWatched={watchedUserIds.has(userId)}
                        sharedContext={audioContext}
                    />
                ))}
            </div>
        </VoiceContext.Provider>
    );
};
