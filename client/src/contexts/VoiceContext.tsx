import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';
import ScreenSourceSelector, { ScreenSource } from '../components/ScreenSourceSelector';

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

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const [connectedUsers, setConnectedUsers] = useState<User[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [userVolumes, setUserVolumes] = useState<Map<string, number>>(new Map());
    const [userStates, setUserStates] = useState<Map<string, { isMuted: boolean; isDeafened: boolean }>>(new Map());

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

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
        setRemoteStreams(prev => new Map(prev).set(userId, stream));
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
            setLocalStream(stream);
            localStreamRef.current = stream;

            // Apply initial mute state
            stream.getAudioTracks().forEach(t => t.enabled = !isMuted && !isDeafened);

            setActiveChannelId(channelId);
            setIsConnected(true);

            // Socket join logic happens in useEffect below
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
            const others = users.filter(u => u._id !== user?._id);
            setConnectedUsers(others);

            others.forEach(u => {
                createPeer(u._id, true);
            });
        };

        const handleUserJoined = (data: { userId: string; user: User }) => {
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
            try {
                const pc = createPeer(data.fromUserId, false);
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

                const pending = pendingCandidatesRef.current.get(data.fromUserId);
                if (pending) {
                    for (const candidate of pending) {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    pendingCandidatesRef.current.delete(data.fromUserId);
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

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

        socket.on('voice-existing-users', handleExistingUsers);
        socket.on('voice-user-joined', handleUserJoined);
        socket.on('voice-user-left', handleUserLeft);
        socket.on('voice-offer', handleOffer);
        socket.on('voice-answer', handleAnswer);
        socket.on('voice-ice-candidate', handleCandidate);
        socket.on('voice-user-state-update', handleUserStateUpdate);

        socket.emit('join-voice-channel', { channelId: activeChannelId });

        return () => {
            socket.off('voice-existing-users', handleExistingUsers);
            socket.off('voice-user-joined', handleUserJoined);
            socket.off('voice-user-left', handleUserLeft);
            socket.off('voice-offer', handleOffer);
            socket.off('voice-answer', handleAnswer);
            socket.off('voice-ice-candidate', handleCandidate);
            socket.off('voice-user-state-update', handleUserStateUpdate);
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

                // We need a fresh mic stream to mix
                const micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                // Setup Web Audio
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const dest = ctx.createMediaStreamDestination();

                // Mic Path
                const micSource = ctx.createMediaStreamSource(micStream);
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
                console.log("Audio mixing setup complete with system audio.");

                audioTrackToUse = dest.stream.getAudioTracks()[0];
            } else {
                // No system audio, just reuse existing mic track (or get new one)
                if (localStreamRef.current) {
                    audioTrackToUse = localStreamRef.current.getAudioTracks()[0];
                } else {
                    // Fallback logic
                    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioTrackToUse = s.getAudioTracks()[0];
                }
            }

            setLocalStream(prev => {
                const newStream = new MediaStream([
                    audioTrackToUse,
                    screenTrack
                ]);
                localStreamRef.current = newStream;
                return newStream;
            });

            // Add video track to peers and renegotiate
            Array.from(peersRef.current.entries()).forEach(async ([targetUserId, pc]) => {
                try {
                    const senders = pc.getSenders();

                    // Update Audio Track (Replace with mixed or existing)
                    const audioSender = senders.find(s => s.track?.kind === 'audio');
                    if (audioSender) {
                        await audioSender.replaceTrack(audioTrackToUse).catch(e => console.error("Error replacing audio track:", e));
                    }

                    // Update/Add Video Track
                    const videoSender = senders.find(s => s.track?.kind === 'video');
                    if (videoSender) {
                        await videoSender.replaceTrack(screenTrack).catch(e => console.error("Error replacing video track:", e));
                    } else {
                        try {
                            // Use the current stream reference
                            const currentStream = localStreamRef.current;
                            if (currentStream) {
                                pc.addTrack(screenTrack, currentStream);
                            }
                        } catch (e) {
                            console.warn("Track already added or invalid access:", e);
                        }
                    }

                    // Renegotiate to notify remote peer about new video track
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);

                    if (socket) {
                        socket.emit('voice-offer', {
                            targetUserId,
                            offer: pc.localDescription
                        });
                    }
                } catch (e) {
                    console.error("Renegotiation error (start share):", e);
                }
            });

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
            userStates
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
                    <audio
                        key={userId}
                        ref={el => {
                            if (el) {
                                const existingEl = audioElementsRef.current.get(userId);
                                if (existingEl !== el) {
                                    audioElementsRef.current.set(userId, el);
                                    el.srcObject = stream;
                                    // Force play with multiple attempts for Electron compatibility
                                    const attemptPlay = async () => {
                                        try {
                                            await el.play();
                                            console.log(`Audio playing for user ${userId}`);
                                        } catch (error) {
                                            console.error(`Error playing audio for user ${userId}:`, error);
                                            // Retry after a short delay
                                            setTimeout(() => {
                                                el.play().catch(e => console.error('Retry play failed:', e));
                                            }, 100);
                                        }
                                    };
                                    attemptPlay();
                                    // Also try on user interaction
                                    const handleInteraction = () => {
                                        el.play().catch(e => console.error('Interaction play failed:', e));
                                        document.removeEventListener('click', handleInteraction);
                                        document.removeEventListener('keydown', handleInteraction);
                                    };
                                    document.addEventListener('click', handleInteraction, { once: true });
                                    document.addEventListener('keydown', handleInteraction, { once: true });
                                }
                                try {
                                    // HTML Audio volume must be between 0 and 1. 
                                    // If we want > 1 (e.g. 200%), we'd need a GainNode.
                                    // For now, let's cap it at 1.0 to prevent IndexSizeError crash.
                                    const vol = userVolumes.has(userId) ? userVolumes.get(userId)! : 1;
                                    el.volume = Math.min(1, Math.max(0, vol));
                                } catch (e) {
                                    console.error("Error setting volume:", e);
                                }
                                el.muted = isDeafened;
                            } else {
                                audioElementsRef.current.delete(userId);
                            }
                        }}
                        autoPlay
                        playsInline
                        muted={isDeafened}
                        onLoadedMetadata={(e) => {
                            const el = e.currentTarget;
                            el.play().catch(err => console.error('Metadata loaded play failed:', err));
                        }}
                    />
                ))}
            </div>
        </VoiceContext.Provider>
    );
};
