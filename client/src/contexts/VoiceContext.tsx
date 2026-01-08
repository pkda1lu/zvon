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
    voiceVolume: number; // User-specific volume adjustment
    streamVolume: number;
    isDeafened: boolean;
    isLocalMuted: boolean;
    isWatched: boolean;
    sharedContext: AudioContext | null;
    outputDeviceId: string; // New: Selected output device
    masterVolume: number;   // New: Master output volume
}> = ({ userId, stream, voiceVolume, streamVolume, isDeafened, isLocalMuted, isWatched, sharedContext, outputDeviceId, masterVolume }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const [trackCount, setTrackCount] = useState(0);

    // Modernized RemoteAudio: We now expect a single mixed audio track from the sender
    // if they are screen sharing, or just their mic track if they are not.
    // This solves issues with multiple tracks not playing on some clients.

    // Listen for track additions/removals to re-trigger audio setup
    useEffect(() => {
        const update = () => {
            setTrackCount(stream.getAudioTracks().length);
        };
        stream.onaddtrack = update;
        stream.onremovetrack = update;
        update();
        return () => {
            stream.onaddtrack = null;
            stream.onremovetrack = null;
        };
    }, [stream]);

    // Apply Output Device ID
    useEffect(() => {
        const applySinkId = async (element: HTMLAudioElement | null, deviceId: string) => {
            if (element && (element as any).setSinkId) {
                try {
                    await (element as any).setSinkId(deviceId);
                } catch (err) {
                    console.error('[RemoteAudio] Failed to set sink ID:', err);
                }
            }
        };
        applySinkId(audioRef.current, outputDeviceId);
    }, [outputDeviceId]);

    useEffect(() => {
        if (!stream || !sharedContext) return;

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
            return;
        }

        // We use the first available audio track
        if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.muted = true; // Still muted because we route through Web Audio
            audioRef.current.play().catch(() => { });
        }

        const ctx = sharedContext;
        if (sourceNodeRef.current) sourceNodeRef.current.disconnect();

        try {
            const source = ctx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;

            if (!gainNodeRef.current) {
                const gainNode = ctx.createGain();
                gainNodeRef.current = gainNode;
                gainNode.connect(ctx.destination);
            }

            // Adjust volume based on whether the user is being "watched" (for screen share)
            // or just participating in voice. 
            // In our new mixed system, the volume control might need to be unified.
            const baseVolume = isWatched ? Math.max(voiceVolume, streamVolume) : voiceVolume;
            const finalVolume = (isDeafened || isLocalMuted) ? 0 : (baseVolume * 1.5 * masterVolume);
            gainNodeRef.current.gain.value = finalVolume;

            source.connect(gainNodeRef.current);
        } catch (err) {
            console.error(`[RemoteAudio] Error setting up Web Audio for ${userId}:`, err);
        }

        return () => {
            if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
        };
    }, [stream, userId, sharedContext, trackCount]);

    // Update gain when volumes change
    useEffect(() => {
        if (gainNodeRef.current && sharedContext) {
            const baseVolume = isWatched ? Math.max(voiceVolume, streamVolume) : voiceVolume;
            const targetGain = (isDeafened || isLocalMuted) ? 0 : (baseVolume * 1.5 * masterVolume);
            gainNodeRef.current.gain.setTargetAtTime(targetGain, sharedContext.currentTime, 0.1);
        }
    }, [voiceVolume, streamVolume, masterVolume, isDeafened, isLocalMuted, isWatched, sharedContext]);

    return <audio ref={audioRef} autoPlay playsInline muted style={{ display: 'none' }} />;
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
    inputDevices: MediaDeviceInfo[];
    outputDevices: MediaDeviceInfo[];
    videoDevices: MediaDeviceInfo[];
    selectedInputDeviceId: string;
    setSelectedInputDeviceId: (id: string) => void;
    selectedOutputDeviceId: string;
    setSelectedOutputDeviceId: (id: string) => void;
    selectedVideoDeviceId: string;
    setSelectedVideoDeviceId: (id: string) => void;
    inputVolume: number;
    setInputVolume: (val: number) => void;
    outputVolume: number;
    setOutputVolume: (val: number) => void;
    refreshDevices: () => Promise<void>;
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

    // Device Management State
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

    const [selectedInputDeviceId, setSelectedInputDeviceId] = useState(() => localStorage.getItem('selectedInputDeviceId') || 'default');
    const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(() => localStorage.getItem('selectedOutputDeviceId') || 'default');
    const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState(() => localStorage.getItem('selectedVideoDeviceId') || 'default');

    const [inputVolume, setInputVolume] = useState(() => Number(localStorage.getItem('inputVolume')) || 1.0);
    const [outputVolume, setOutputVolume] = useState(() => Number(localStorage.getItem('outputVolume')) || 1.0);

    // Persist settings
    useEffect(() => { localStorage.setItem('selectedInputDeviceId', selectedInputDeviceId); }, [selectedInputDeviceId]);
    useEffect(() => { localStorage.setItem('selectedOutputDeviceId', selectedOutputDeviceId); }, [selectedOutputDeviceId]);
    useEffect(() => { localStorage.setItem('selectedVideoDeviceId', selectedVideoDeviceId); }, [selectedVideoDeviceId]);
    useEffect(() => { localStorage.setItem('inputVolume', String(inputVolume)); }, [inputVolume]);
    useEffect(() => { localStorage.setItem('outputVolume', String(outputVolume)); }, [outputVolume]);

    const refreshDevices = useCallback(async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); // Request proper permission to list labels
            const devices = await navigator.mediaDevices.enumerateDevices();
            setInputDevices(devices.filter(d => d.kind === 'audioinput'));
            setOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
            setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
        } catch (err) {
            console.error('[VoiceContext] Error enumerating devices:', err);
        }
    }, []);

    useEffect(() => {
        refreshDevices();
        navigator.mediaDevices.ondevicechange = () => {
            console.log('[VoiceContext] Devices changed, refreshing...');
            refreshDevices();
        };
    }, [refreshDevices]);

    // Handle Input Device Change seamlessly
    useEffect(() => {
        if (isConnectedRef.current && activeChannelId) {
            console.log('[VoiceContext] Input device changed to:', selectedInputDeviceId);
            // Re-join logic essentially, but optimized?
            // For now, simple re-request of getUserMedia with new constraint
            const restartStream = async () => {
                try {
                    const constraints = {
                        audio: {
                            deviceId: selectedInputDeviceId !== 'default' ? { exact: selectedInputDeviceId } : undefined,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        },
                        video: false
                    };
                    const newStream = await navigator.mediaDevices.getUserMedia(constraints);

                    // Stop old tracks
                    if (rawMicStreamRef.current) {
                        rawMicStreamRef.current.getTracks().forEach(t => t.stop());
                    }
                    rawMicStreamRef.current = newStream;

                    let streamToUse = newStream;
                    if (isNoiseSuppressionEnabled) {
                        try {
                            const ctx = getAudioContext();
                            streamToUse = await setupNoiseSuppression(ctx, newStream);
                        } catch (e) { console.error("Re-applying NS failed:", e); }
                    }

                    setLocalStream(streamToUse);
                    localStreamRef.current = streamToUse;
                    streamToUse.getAudioTracks().forEach(t => t.enabled = !isMuted && !isDeafened);

                    // Replace track in all peers
                    const newTrack = streamToUse.getAudioTracks()[0];
                    if (newTrack) {
                        peersRef.current.forEach(async (pc) => {
                            const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                            if (sender) await sender.replaceTrack(newTrack);
                        });
                    }

                } catch (err) {
                    console.error("Failed to switch input device:", err);
                }
            };
            restartStream();
        }
    }, [selectedInputDeviceId]);


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

        // Sync sound manager to the same context for proper AEC filtering
        soundManager.setAudioContext(ctx);

        if (ctx.state === 'suspended') {
            const resume = () => ctx.resume().catch(() => { });
            document.addEventListener('click', resume, { once: true });
            document.addEventListener('mousedown', resume, { once: true });
        }

        return ctx;
    }, []);

    const toggleScreenAudio = useCallback(() => {
        setIsSharingScreenAudio(prev => {
            const newState = !prev;

            // Update the gain node in our mixer if it exists
            const systemGain = (window as any).systemGainNode;
            if (systemGain) {
                systemGain.gain.setTargetAtTime(newState ? 1 : 0, getAudioContext().currentTime, 0.1);
            }

            if (localStreamRef.current) {
                const tracks = localStreamRef.current.getAudioTracks();
                // If we are NOT using the mixer (legacy or fallback), update the track directly
                if (tracks.length > 1) {
                    tracks[1].enabled = newState;
                }
            }
            return newState;
        });
    }, [getAudioContext]);

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
                    deviceId: selectedInputDeviceId !== 'default' ? { exact: selectedInputDeviceId } : undefined,
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

        // Update Mixer Gain if present
        if (micGainNodeRef.current) {
            micGainNodeRef.current.gain.setTargetAtTime(newMuted ? 0 : 1, getAudioContext().currentTime, 0.05);
        }

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
            // 1. Stop ALL tracks of the old stream (Video AND Audio)
            // This ensures system audio stops capturing immediately
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
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
            // Also remove any extra audio tracks (System Audio)
            peersRef.current.forEach(async (pc, targetUserId) => {
                try {
                    const senders = pc.getSenders();

                    // Remove Video Sender
                    const videoSender = senders.find(s => s.track?.kind === 'video');
                    if (videoSender) {
                        pc.removeTrack(videoSender);
                    }

                    // Handle Audio Senders
                    // We expect potentially 2 audio senders: Mic and System Audio
                    const audioSenders = senders.filter(s => s.track?.kind === 'audio');

                    if (audioSenders.length > 0) {
                        // Keep the first sender for Microphone and update its track
                        const primaryAudioSender = audioSenders[0];
                        const newMicTrack = stream.getAudioTracks()[0];
                        await primaryAudioSender.replaceTrack(newMicTrack).catch(e => console.error("Error replacing audio track:", e));

                        // Remove any additional audio senders (System Audio)
                        for (let i = 1; i < audioSenders.length; i++) {
                            pc.removeTrack(audioSenders[i]);
                        }
                    }

                    // Renegotiate to tell remote that video/extra-audio is gone
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
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    } as any,
                    selfBrowserSurface: 'exclude' // Prevent capturing the app itself (Zvon)
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
                    // Try with audio first and selfBrowserSurface exclude
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
                console.log('[VoiceContext] Screen track ended natively');
                // Use a functional check or a ref to ensure we stop correctly
                if (isScreenSharingRef.current) {
                    toggleScreenShare();
                }
            };

            // Set track degree of importance
            screenTrack.contentHint = 'motion'; // Optimize for movement (games)

            // NEW MIXED AUDIO SYSTEM
            // Instead of sending multiple tracks, we mix them using Web Audio
            // for the best compatibility and quality control.

            const ctx = getAudioContext();
            const mixerDestination = ctx.createMediaStreamDestination();

            // 1. Setup Microphone Source
            const micStream = rawMicStreamRef.current || await navigator.mediaDevices.getUserMedia({ audio: true });
            const micSource = ctx.createMediaStreamSource(micStream);
            const micGain = ctx.createGain();
            micGain.gain.value = isMuted ? 0 : 1;
            micGainNodeRef.current = micGain;

            micSource.connect(micGain);
            micGain.connect(mixerDestination);

            // 2. Setup System Audio Source
            if (screenAudioTrack) {
                // EXTREME ECHOCANCELLATION: This is the key to blocking Zvon's audio.
                // We enable echoCancellation and selfBrowserSurface exclusion.
                try {
                    await screenAudioTrack.applyConstraints({
                        echoCancellation: true,
                        noiseSuppression: true,
                        // @ts-ignore - Chromium specific flag to exclude current window sound from loopback
                        selfBrowserSurface: 'exclude',
                        // @ts-ignore - Support older Chromium flags if still active
                        googEchoCancellation: true,
                        googAutoGainControl: true,
                        googNoiseSuppression: true
                    } as any);
                } catch (e) {
                    console.warn("Failed to apply advanced constraints to system audio:", e);
                }

                const systemStream = new MediaStream([screenAudioTrack]);
                const systemSource = ctx.createMediaStreamSource(systemStream);
                const systemGain = ctx.createGain();
                systemGain.gain.value = isSharingScreenAudio ? 1 : 0;
                // Store reference for toggling system audio
                (window as any).systemGainNode = systemGain;

                systemSource.connect(systemGain);
                systemGain.connect(mixerDestination);
            }

            const mixedAudioTrack = mixerDestination.stream.getAudioTracks()[0];
            const tracks: MediaStreamTrack[] = [screenTrack, mixedAudioTrack];

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

            // 3. Update peers and renegotiate with the new MIXED stream
            peersRef.current.forEach(async (pc, targetUserId) => {
                try {
                    const senders = pc.getSenders();
                    const videoSender = senders.find(s => s.track?.kind === 'video');
                    const audioSender = senders.find(s => s.track?.kind === 'audio');

                    if (videoSender) {
                        await videoSender.replaceTrack(screenTrack);
                    } else {
                        pc.addTrack(screenTrack, newStream);
                    }

                    if (audioSender) {
                        await audioSender.replaceTrack(mixedAudioTrack);
                    } else {
                        pc.addTrack(mixedAudioTrack, newStream);
                    }

                    // Remove any orphaned audio senders if they exist
                    const extraShowAudioSenders = senders.filter(s => s.track?.kind === 'audio').slice(1);
                    extraShowAudioSenders.forEach(s => pc.removeTrack(s));

                    // Renegotiate
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket?.emit('voice-offer', { targetUserId, offer: pc.localDescription });
                } catch (e) {
                    console.error("Renegotiation error (start share):", e);
                }
            });

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
            // Standard behavior: separate tracks
            if (localStreamRef.current) {
                const micTracks = rawMicStreamRef.current?.getAudioTracks() || [];
                localStreamRef.current.getAudioTracks().forEach(track => {
                    const isMicTrack = micTracks.some(t => t.id === track.id) || track.label.toLowerCase().includes('mic') || track.label.toLowerCase().includes('audio input');

                    if (isMicTrack) {
                        track.enabled = audioTrackEnabled;
                    } else {
                        // This is likely screen audio.
                        // It should follow its own toggle (isSharingScreenAudio) and only be muted if deafened
                        track.enabled = !isDeafened && isSharingScreenAudio;
                    }
                });
            }
        }
    }, [isMuted, isDeafened, isSharingScreenAudio]);

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
            audioContext,
            inputDevices,
            outputDevices,
            videoDevices,
            selectedInputDeviceId,
            setSelectedInputDeviceId,
            selectedOutputDeviceId,
            setSelectedOutputDeviceId,
            selectedVideoDeviceId,
            setSelectedVideoDeviceId,
            inputVolume,
            setInputVolume,
            outputVolume,
            setOutputVolume,
            refreshDevices
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
                        outputDeviceId={selectedOutputDeviceId}
                        masterVolume={outputVolume}
                    />
                ))}
            </div>
        </VoiceContext.Provider>
    );
};
