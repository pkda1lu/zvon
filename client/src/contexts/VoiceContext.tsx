import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';
import ScreenSourceSelector, { ScreenSource } from '../components/ScreenSourceSelector';
import { setupNoiseSuppression } from '../utils/audioProcessing';


// Remote Audio Component to handle lifecycle properly
const RemoteAudio: React.FC<{
    userId: string;
    stream: MediaStream;
    volume: number;
    isDeafened: boolean;
    isLocalMuted: boolean;
}> = ({ userId, stream, volume, isDeafened, isLocalMuted }) => {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.srcObject = stream;

            const attemptPlay = async () => {
                try {
                    await audioRef.current?.play();
                } catch (error) {
                    if (error instanceof Error && error.name !== 'AbortError') {
                        console.warn(`Audio play failed for user ${userId}, will retry on interaction:`, error);
                    }
                }
            };
            attemptPlay();
        }
    }, [stream, userId]);

    // Handle interaction play separately if browser blocks autoplay
    useEffect(() => {
        const handleInteraction = () => {
            audioRef.current?.play().catch(() => { });
            document.removeEventListener('click', handleInteraction);
        };
        document.addEventListener('click', handleInteraction, { once: true });
        return () => document.removeEventListener('click', handleInteraction);
    }, []);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = Math.min(1, Math.max(0, volume));
        }
    }, [volume]);

    return (
        <audio
            ref={audioRef}
            autoPlay
            playsInline
            muted={isDeafened || isLocalMuted}
            onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                el.volume = Math.min(1, Math.max(0, volume));
                el.play().catch(() => { });
            }}
            style={{ display: 'none' }}
        />
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
    userStates: Map<string, { isMuted: boolean; isDeafened: boolean }>;
    localMutes: Set<string>;
    toggleLocalMute: (userId: string) => void;
    speakingUsers: Set<string>;
    isNoiseSuppressionEnabled: boolean;
    toggleNoiseSuppression: () => void;
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
    const [userStates, setUserStates] = useState<Map<string, { isMuted: boolean; isDeafened: boolean }>>(new Map());
    const [localMutes, setLocalMutes] = useState<Set<string>>(new Set());

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
    const speakingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const audioContextRef = useRef<AudioContext | null>(null);
    const micGainNodeRef = useRef<GainNode | null>(null);
    const mixedStreamRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

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
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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
                    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    audioContextRef.current = ctx;
                    if (ctx.state === 'suspended') await ctx.resume();

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

        const handleUserJoined = (data: { userId: string; user: User }) => {
            console.log('[VoiceContext] User joined:', data);
            if (data.userId === user?._id) return;

            setConnectedUsers(prev => {
                if (prev.find(u => u._id === data.user._id)) return prev;
                return [...prev, data.user];
            });
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

        const handleUserStateUpdate = (data: { userId: string; isMuted: boolean; isDeafened: boolean }) => {
            setUserStates(prev => new Map(prev).set(data.userId, {
                isMuted: data.isMuted,
                isDeafened: data.isDeafened
            }));
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
                isDeafened: isDeafened
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
                isDeafened: newDeafened
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
                    const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
                    audioContextRef.current = ctx;
                    if (ctx.state === 'suspended') await ctx.resume();
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
                audioContextRef.current.close();
                audioContextRef.current = null;
                micGainNodeRef.current = null;
                mixedStreamRef.current = null;
            }

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
            const { getElectronDisplayMedia, isElectron, getElectronAPI } = await import('../utils/electron');
            const isElectronEnv = isElectron();
            console.log('Is Electron environment:', isElectronEnv);

            if (isElectronEnv && selectedSource) {
                console.log('Detected Electron environment, using selected source:', selectedSource.id);
                const electronAPI = getElectronAPI();
                console.log('Electron API check:', {
                    hasAPI: !!electronAPI,
                    hasDesktopCapturer: !!(electronAPI?.desktopCapturer),
                    apiKeys: electronAPI ? Object.keys(electronAPI) : []
                });
                screenStream = await getElectronDisplayMedia(selectedSource.id);
            } else if (isElectronEnv && !selectedSource) {
                // User chose to use native picker
                console.log('Using native picker in Electron');
                screenStream = await getElectronDisplayMedia();
            }

            // Fallback to standard getDisplayMedia if Electron API didn't work or user chose native picker
            if (!screenStream && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                console.log('Trying standard getDisplayMedia API');
                try {
                    // Try with audio first
                    screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: true,
                        audio: true
                    });
                } catch (err) {
                    console.warn('getDisplayMedia with audio failed, trying video only:', err);
                    try {
                        screenStream = await navigator.mediaDevices.getDisplayMedia({
                            video: true,
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

            setIsScreenSharing(true);

            let audioTrackToUse: MediaStreamTrack;

            // 2. Mix Audio if system audio is present
            if (screenAudioTrack) {
                console.log("System audio detected, setting up mixing...");

                // Reuse existing mic track if available
                let micTrack: MediaStreamTrack | null = null;
                if (localStreamRef.current) {
                    micTrack = localStreamRef.current.getAudioTracks()[0];
                }

                if (!micTrack) {
                    console.log("No existing mic track, requesting fresh one for mixing");
                    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    micTrack = micStream.getAudioTracks()[0];
                }

                // Setup Web Audio
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const dest = ctx.createMediaStreamDestination();

                // Mic Path
                const micSource = ctx.createMediaStreamSource(new MediaStream([micTrack]));
                const micGain = ctx.createGain();
                micGain.gain.value = !isMuted && !isDeafened ? 1 : 0;
                micSource.connect(micGain);
                micGain.connect(dest);

                // Screen Audio Path
                console.log("Creating media source for screen audio track:", screenAudioTrack.label);
                const screenSource = ctx.createMediaStreamSource(new MediaStream([screenAudioTrack]));
                const screenGain = ctx.createGain();
                screenGain.gain.value = 1.0; // Ensure full volume for system audio
                screenSource.connect(screenGain);
                screenGain.connect(dest);

                // References
                audioContextRef.current = ctx;
                micGainNodeRef.current = micGain;
                mixedStreamRef.current = dest;

                if (ctx.state === 'suspended') {
                    await ctx.resume();
                }

                console.log("Audio mixing setup complete with system audio. Tracks in mixed stream:", dest.stream.getAudioTracks().length);

                audioTrackToUse = dest.stream.getAudioTracks()[0];
            } else {
                console.log("No system audio track found in screen stream. Available tracks:", screenStream.getTracks().map(t => t.kind));
                // No system audio, just reuse existing mic track (or get new one)
                if (localStreamRef.current) {
                    audioTrackToUse = localStreamRef.current.getAudioTracks()[0];
                } else {
                    // Fallback logic
                    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioTrackToUse = s.getAudioTracks()[0];
                }
            }

            const newStream = new MediaStream([
                audioTrackToUse,
                screenTrack
            ]);
            localStreamRef.current = newStream;
            setLocalStream(newStream);

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
                    } else {
                        // Ensure both tracks are on the new stream
                        if (audioSender) {
                            pc.removeTrack(audioSender);
                        }
                        pc.addTrack(screenTrack, newStream);
                        if (audioTrackToUse) {
                            pc.addTrack(audioTrackToUse, newStream);
                        }
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
            // If user cancelled, don't show error
            if (err instanceof Error && err.name === 'NotAllowedError') {
                console.log("Screen sharing permission denied");
            } else if (err instanceof Error && err.name === 'AbortError') {
                console.log("Screen sharing cancelled by user");
            } else {
                alert('Не удалось начать демонстрацию экрана. Проверьте разрешения браузера.');
            }
        }
    };

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

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Ensure context is resumed on interaction if needed
        if (audioCtx.state === 'suspended') {
            const resume = () => audioCtx.resume().catch(console.error);
            document.addEventListener('click', resume, { once: true });
        }

        const checkSpeaking = () => {
            const nowSpeaking = new Set<string>();
            const threshold = 0.01; // Slightly lower threshold for better sensitivity

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
            audioCtx.close();
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
            toggleNoiseSuppression
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
                        volume={userVolumes.has(userId) ? userVolumes.get(userId)! : 1}
                        isDeafened={isDeafened}
                        isLocalMuted={localMutes.has(userId)}
                    />
                ))}
            </div>
        </VoiceContext.Provider>
    );
};
