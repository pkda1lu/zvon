import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { SOUNDS, soundManager } from '../utils/sounds';
import { nativeAudioManager } from '../utils/nativeAudio';

// Remote Audio Component to handle lifecycle properly
const RemoteAudio: React.FC<{
    userId: string;
    stream: MediaStream;
    voiceVolume: number; // User-specific volume adjustment
    isDeafened: boolean;
    isLocalMuted: boolean;
    sharedContext: AudioContext | null;
    outputDeviceId: string;
    masterVolume: number;
}> = ({ userId, stream, voiceVolume, isDeafened, isLocalMuted, sharedContext, outputDeviceId, masterVolume }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // Apply Output Device ID
    useEffect(() => {
        const applySinkId = async (element: HTMLAudioElement | null, deviceId: string) => {
            if (element && (element as any).setSinkId) {
                try {
                    await (element as any).setSinkId(deviceId);
                } catch (err) { }
            }
        };
        applySinkId(audioRef.current, outputDeviceId);
    }, [outputDeviceId]);

    // Setup Audio Graph (Source -> Gain -> Destination) or Fallback
    useEffect(() => {
        if (!stream) return;

        // basic setup
        if (audioRef.current) {
            audioRef.current.srcObject = stream;
            // If we have an AudioContext, we mute the element and route through Web Audio
            // If NOT, we unmute the element and play directly
            audioRef.current.muted = !!sharedContext;
            audioRef.current.play().catch(() => { });
        }

        if (!sharedContext) return;

        const ctx = sharedContext;

        // Cleanup previous source if any
        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.disconnect(); } catch (e) { }
        }

        // Create new Gain Node if needed (persistent for this component instance usually)
        if (!gainNodeRef.current) {
            gainNodeRef.current = ctx.createGain();
            gainNodeRef.current.connect(ctx.destination);
        }

        try {
            const source = ctx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;
            source.connect(gainNodeRef.current);
        } catch (err) {
            console.error("Error creating media stream source", err);
            // Fallback to direct playback if Web Audio fails
            if (audioRef.current) {
                audioRef.current.muted = false;
            }
        }

        return () => {
            if (sourceNodeRef.current) {
                try { sourceNodeRef.current.disconnect(); } catch (e) { }
            }
        };
    }, [stream, sharedContext]);

    // Handle Volume Changes (Smoothly)
    useEffect(() => {
        const finalVolume = (isDeafened || isLocalMuted) ? 0 : (voiceVolume * 1.5 * masterVolume);

        if (gainNodeRef.current && sharedContext) {
            // Web Audio Path
            try {
                gainNodeRef.current.gain.cancelScheduledValues(sharedContext.currentTime);
                gainNodeRef.current.gain.setTargetAtTime(finalVolume, sharedContext.currentTime, 0.05);
            } catch (e) {
                gainNodeRef.current.gain.value = finalVolume;
            }
        } else if (audioRef.current && !audioRef.current.muted) {
            // Fallback: Direct Audio Element Volume (Clamped to 0-1)
            // Note: HTMLAudioElement volume is 0.0 to 1.0. We lose the x1.5 boost capability here.
            audioRef.current.volume = Math.min(Math.max(finalVolume, 0), 1);
        }
    }, [voiceVolume, isDeafened, isLocalMuted, masterVolume, sharedContext]);

    // Cleanup Gain Node on unmount
    useEffect(() => {
        return () => {
            if (gainNodeRef.current) {
                try { gainNodeRef.current.disconnect(); } catch (e) { }
                gainNodeRef.current = null;
            }
        };
    }, []);

    return <audio ref={audioRef} autoPlay playsInline muted style={{ display: 'none' }} />;
};

const RemoteScreen: React.FC<{
    userId: string;
    stream: MediaStream;
    outputDeviceId: string;
    masterVolume: number;
    isWatching: boolean;
    volume: number;
}> = ({ userId, stream, outputDeviceId, masterVolume, isWatching, volume }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const applySinkId = async (element: HTMLAudioElement | null, deviceId: string) => {
            if (element && (element as any).setSinkId) {
                try { await (element as any).setSinkId(deviceId); } catch (err) { }
            }
        };
        applySinkId(audioRef.current, outputDeviceId);
    }, [outputDeviceId]);

    useEffect(() => {
        if (!stream) return;
        if (videoRef.current) videoRef.current.srcObject = stream;
        if (audioRef.current && stream.getAudioTracks().length > 0) {
            audioRef.current.srcObject = new MediaStream(stream.getAudioTracks());
            // Only play audio if watching
            const finalVolume = isWatching ? (volume * masterVolume) : 0;
            audioRef.current.volume = finalVolume;
            if (isWatching) {
                audioRef.current.play().catch(() => { });
            } else {
                audioRef.current.pause();
            }
        }
    }, [stream, masterVolume, isWatching, volume]);

    return (
        <div style={{ display: 'none' }}>
            <video ref={videoRef} autoPlay playsInline muted />
            <audio ref={audioRef} autoPlay muted={!isWatching} />
        </div>
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
    connectedUsers: User[];
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    userVolumes: Map<string, number>;
    setUserVolume: (userId: string, volume: number) => void;
    userStates: Map<string, { isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean }>;
    localMutes: Set<string>;
    toggleLocalMute: (userId: string) => void;
    speakingUsers: Set<string>;
    isNoiseSuppressionEnabled: boolean;
    toggleNoiseSuppression: () => void;
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
    isScreenSharing: boolean;
    screenStream: MediaStream | null;
    startScreenShare: (sourceId: string) => Promise<void>;
    stopScreenShare: () => void;
    remoteScreenStreams: Map<string, MediaStream>;
    screenVolumes: Map<string, number>;
    setScreenVolume: (userId: string, volume: number) => void;
    watchedScreenIds: Set<string>;
    setWatchingScreen: (userId: string, isWatching: boolean) => void;
    inputSensitivity: number;
    setInputSensitivity: (val: number) => void;
    isAutomaticSensitivity: boolean;
    setIsAutomaticSensitivity: (val: boolean) => void;
    currentInputLevel: number;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export const useVoice = () => {
    const context = useContext(VoiceContext);
    if (!context) throw new Error('useVoice must be used within VoiceProvider');
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

    const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState(() => {
        return localStorage.getItem('noiseSuppression') === 'true';
    });

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const rawMicStreamRef = useRef<MediaStream | null>(null);

    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

    const [selectedInputDeviceId, setSelectedInputDeviceId] = useState(() => localStorage.getItem('selectedInputDeviceId') || 'default');
    const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(() => localStorage.getItem('selectedOutputDeviceId') || 'default');
    const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState(() => localStorage.getItem('selectedVideoDeviceId') || 'default');

    const [inputVolume, setInputVolume] = useState(() => Number(localStorage.getItem('inputVolume')) || 1.0);
    const [outputVolume, setOutputVolume] = useState(() => Number(localStorage.getItem('outputVolume')) || 1.0);

    const [connectedUsers, setConnectedUsers] = useState<User[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [userVolumes, setUserVolumes] = useState<Map<string, number>>(new Map());
    const [userStates, setUserStates] = useState<Map<string, { isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean }>>(new Map());
    const [localMutes, setLocalMutes] = useState<Set<string>>(new Set());
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
    const [screenVolumes, setScreenVolumes] = useState<Map<string, number>>(new Map());
    const [watchedScreenIds, setWatchedScreenIds] = useState<Set<string>>(new Set());

    // Input Sensitivity (VAD)
    const [inputSensitivity, setInputSensitivity] = useState(() => Number(localStorage.getItem('inputSensitivity')) || -50);
    const [isAutomaticSensitivity, setIsAutomaticSensitivity] = useState(() => {
        const stored = localStorage.getItem('isAutomaticSensitivity');
        return stored === null ? true : stored === 'true';
    });
    // For visualization in settings
    const [currentInputLevel, setCurrentInputLevel] = useState(-100);

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
    const speakingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const audioContextRef = useRef<AudioContext | null>(null);

    useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

    useEffect(() => {
        localStorage.setItem('selectedInputDeviceId', selectedInputDeviceId);
        localStorage.setItem('selectedOutputDeviceId', selectedOutputDeviceId);
        localStorage.setItem('selectedVideoDeviceId', selectedVideoDeviceId);
        localStorage.setItem('inputVolume', String(inputVolume));
        localStorage.setItem('outputVolume', String(outputVolume));
        localStorage.setItem('inputSensitivity', String(inputSensitivity));
        localStorage.setItem('isAutomaticSensitivity', String(isAutomaticSensitivity));
    }, [selectedInputDeviceId, selectedOutputDeviceId, selectedVideoDeviceId, inputVolume, outputVolume, inputSensitivity, isAutomaticSensitivity]);

    const refreshDevices = useCallback(async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => { });
            const devices = await navigator.mediaDevices.enumerateDevices();
            setInputDevices(devices.filter(d => d.kind === 'audioinput'));
            setOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
            setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
        } catch (err) { }
    }, []);

    useEffect(() => {
        refreshDevices();
        navigator.mediaDevices.ondevicechange = refreshDevices;
    }, [refreshDevices]);

    const getAudioContext = useCallback(() => {
        if (audioContextRef.current) {
            if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume().catch(() => { });
            return audioContextRef.current;
        }
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        setAudioContext(ctx);
        soundManager.setAudioContext(ctx);
        return ctx;
    }, []);

    const handleTrack = useCallback((userId: string, stream: MediaStream) => {
        // Distinguish between voice and screen sharing streams
        // Use video track presence as a reliable indicator for screen sharing in Zvon
        const isScreen = stream.id.startsWith('screen-') || stream.getVideoTracks().length > 0;

        if (isScreen) {
            setRemoteScreenStreams(prev => new Map(prev).set(userId, stream));
        } else {
            setRemoteStreams(prev => new Map(prev).set(userId, stream));
        }
    }, []);

    const createPeer = useCallback((targetUserId: string, initiator: boolean) => {
        if (peersRef.current.has(targetUserId)) return peersRef.current.get(targetUserId)!;

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ],
        });

        peersRef.current.set(targetUserId, pc);

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
        }

        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => pc.addTrack(track, screenStreamRef.current!));
        }

        pc.ontrack = (event) => {
            const stream = event.streams[0];
            const isScreen = stream.id.startsWith('screen-') || stream.getVideoTracks().length > 0;

            if (isScreen) {
                setRemoteScreenStreams(prev => new Map(prev).set(targetUserId, stream));
            } else {
                setRemoteStreams(prev => new Map(prev).set(targetUserId, stream));
            }
        };
        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('voice-ice-candidate', { targetUserId, candidate: event.candidate });
            }
        };

        const negotiate = async () => {
            if (pc.signalingState !== 'stable') return;
            try {
                console.log('[Voice] Negotiating...');
                const offer = await pc.createOffer();
                if (pc.signalingState !== 'stable') return;
                await pc.setLocalDescription(offer);
                if (socket) {
                    socket.emit('voice-offer', { targetUserId, offer: pc.localDescription });
                }
            } catch (err) {
                console.error('[Voice] Negotiation failed:', err);
            }
        };

        let negotiationTimeout: any = null;
        pc.onnegotiationneeded = () => {
            if (pc.signalingState !== 'stable') return;
            clearTimeout(negotiationTimeout);
            negotiationTimeout = setTimeout(negotiate, 150);
        };

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                const alreadyExists = pc.getSenders().some(s => s.track?.id === track.id);
                if (!alreadyExists) {
                    pc.addTrack(track, localStreamRef.current!);
                }
            });
        }

        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => {
                const alreadyExists = pc.getSenders().some(s => s.track?.id === track.id);
                if (!alreadyExists) {
                    pc.addTrack(track, screenStreamRef.current!);
                }
            });
        }

        if (initiator) {
            // Initiator starts the first negotiation
            negotiate();
        }
        return pc;
    }, [socket, handleTrack]);

    const leaveChannel = useCallback(() => {
        if (!activeChannelId) return;
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (rawMicStreamRef.current) {
            rawMicStreamRef.current.getTracks().forEach(track => track.stop());
            rawMicStreamRef.current = null;
        }
        setLocalStream(null);
        peersRef.current.forEach(pc => pc.close());
        peersRef.current.clear();
        pendingCandidatesRef.current.clear();
        setRemoteStreams(new Map());
        setConnectedUsers([]);
        if (socket && isConnectedRef.current) {
            socket.emit('leave-voice-channel', { channelId: activeChannelId });
        }
        setIsConnected(false);
        setActiveChannelId(null);
        stopScreenShare();
        soundManager.play(SOUNDS.VOICE_LEAVE, 0.4);
    }, [socket, activeChannelId]);

    const startScreenShare = useCallback(async (sourceId: string) => {
        try {
            const hasElectron = !!(window as any).electron;
            let stream: MediaStream;

            if (hasElectron) {
                // Get Video Only from Browser
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId,
                            maxWidth: 1920,
                            maxHeight: 1080,
                            maxFrameRate: 60,
                            minFrameRate: 30
                        }
                    } as any
                });

                // Get Audio from Native Module
                try {
                    const audioStream = await nativeAudioManager.startcapture(sourceId);
                    const tracks = audioStream.getAudioTracks();
                    console.log(`[Voice] Native audio capture started. Tracks: ${tracks.length}`);
                    tracks.forEach(track => {
                        console.log(`[Voice] Adding native audio track: ${track.id}`);
                        stream.addTrack(track);
                    });
                } catch (err) {
                    console.error("Native audio capture failed, proceeding with video only:", err);
                }

            } else {
                // Standard Browser Implementation
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId,
                            echoCancellation: true,
                            noiseSuppression: false,
                            autoGainControl: false,
                            googAutoGainControl: false,
                            googNoiseSuppression: false,
                            channelCount: 2,
                            sampleRate: 48000
                        }
                    } as any,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId,
                            maxWidth: 1920,
                            maxHeight: 1080,
                            maxFrameRate: 60,
                            minFrameRate: 30
                        }
                    } as any
                });
            }

            // Optimize for low latency (prioritize motion/framerate over detail)
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                if ('contentHint' in videoTrack) {
                    (videoTrack as any).contentHint = 'motion';
                }
            }

            // Enable WDA_EXCLUDEFROMCAPTURE to hide the application from the screen capture
            if ((window as any).electron && (window as any).electron.setContentProtection) {
                await (window as any).electron.setContentProtection(true);
            }

            const newStream = new MediaStream(stream.getTracks());
            Object.defineProperty(newStream, 'id', { value: `screen-${user?._id}-${Date.now()}` });

            setScreenStream(newStream);
            screenStreamRef.current = newStream;
            setIsScreenSharing(true);
            soundManager.play(SOUNDS.SCREENSHARE_ON, 0.4);

            // Important: sort tracks (video first, then audio) to keep SDP order consistent
            const sortedTracks = newStream.getTracks().sort((a, b) => a.kind === 'video' ? -1 : 1);

            peersRef.current.forEach(pc => {
                sortedTracks.forEach(track => {
                    console.log(`[Voice] Adding ${track.kind} track to peer:`, track.id);
                    pc.addTrack(track, newStream);
                });
            });

            if (socket && activeChannelId) {
                socket.emit('voice-state-update', { channelId: activeChannelId, isMuted, isDeafened, isScreenSharing: true });
            }
        } catch (err) {
            console.error('Error starting screen share:', err);
        }
    }, [socket, activeChannelId, isMuted, isDeafened, user?._id]);

    const stopScreenShare = useCallback(() => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }
        nativeAudioManager.stopCapture();
        setScreenStream(null);
        setIsScreenSharing(false);
        soundManager.play(SOUNDS.SCREENSHARE_TOGGLE, 0.4);

        // Remove tracks from peers
        peersRef.current.forEach(async pc => {
            if (pc.signalingState === 'closed') return;

            const senders = pc.getSenders();
            let changed = false;
            senders.forEach(sender => {
                if (!sender.track) return;

                // If the track is not part of the local mic/camera stream, it's a screen share track.
                const isLocalMic = localStreamRef.current?.getTracks().some(t => t.id === sender.track?.id);
                if (!isLocalMic) {
                    try {
                        console.log('[Voice] Removing track from peer:', sender.track.kind);
                        pc.removeTrack(sender);
                        changed = true;
                    } catch (e) {
                        console.warn('[Voice] Error removing track:', e);
                    }
                }
            });

            // Re-negotiation happens if tracks were actually removed
            if (changed && pc.signalingState === 'stable') {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    const targetUserId = Array.from(peersRef.current.entries()).find(e => e[1] === pc)?.[0];
                    if (targetUserId) socket?.emit('voice-offer', { targetUserId, offer: pc.localDescription });
                } catch (e) {
                    console.error('[Voice] Error during stop-negotiation:', e);
                }
            }
        });

        if (socket && activeChannelId) {
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted, isDeafened, isScreenSharing: false });
        }

        // Disable WDA_EXCLUDEFROMCAPTURE
        if ((window as any).electron && (window as any).electron.setContentProtection) {
            (window as any).electron.setContentProtection(false);
        }
    }, [socket, activeChannelId, isMuted, isDeafened]);

    const joinChannel = useCallback(async (channelId: string) => {
        if (isConnectedRef.current) leaveChannel();
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
            rawMicStreamRef.current = stream;
            rawMicStreamRef.current = stream;
            let streamToUse = stream.clone();
            if (isNoiseSuppressionEnabled) {
                try {
                    streamToUse = await setupNoiseSuppression(getAudioContext(), stream);
                } catch (err) { }
            }
            setLocalStream(streamToUse);
            localStreamRef.current = streamToUse;
            streamToUse.getAudioTracks().forEach(t => t.enabled = !isMuted && !isDeafened);
            setActiveChannelId(channelId);
            setIsConnected(true);
            soundManager.play(SOUNDS.VOICE_JOIN, 0.4);
        } catch (error) {
            alert('Не удалось подключиться к голосовому каналу.');
        }
    }, [isMuted, isDeafened, leaveChannel, selectedInputDeviceId, isNoiseSuppressionEnabled, getAudioContext]);

    useEffect(() => {
        if (!socket || !isConnected || !activeChannelId || !localStreamRef.current) return;

        const handleExistingUsers = (users: any[]) => {
            const others = users.filter(u => u._id !== user?._id);
            setConnectedUsers(others);

            // Populate userStates for existing users
            setUserStates(prev => {
                const newMap = new Map(prev);
                others.forEach(u => {
                    newMap.set(u._id, {
                        isMuted: u.isMuted || false,
                        isDeafened: u.isDeafened || false,
                        isScreenSharing: u.isScreenSharing || false
                    });
                });
                return newMap;
            });

            others.forEach(u => createPeer(u._id, true));
        };

        const handleUserJoined = (data: { userId: string; user: any }) => {
            if (data.userId === user?._id) return;
            setConnectedUsers(prev => prev.find(u => u._id === data.user._id) ? prev : [...prev, data.user]);
            if (data.user.isMuted !== undefined) {
                setUserStates(prev => new Map(prev).set(data.userId, {
                    isMuted: data.user.isMuted,
                    isDeafened: data.user.isDeafened,
                    isScreenSharing: data.user.isScreenSharing || false
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
            try {
                const pc = createPeer(data.fromUserId, false);
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const pending = pendingCandidatesRef.current.get(data.fromUserId);
                if (pending) {
                    for (const candidate of pending) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    pendingCandidatesRef.current.delete(data.fromUserId);
                }
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('voice-answer', { targetUserId: data.fromUserId, answer });
            } catch (err) { }
        };

        const handleAnswer = async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
            try {
                const pc = peersRef.current.get(data.fromUserId);
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    const pending = pendingCandidatesRef.current.get(data.fromUserId);
                    if (pending) {
                        for (const candidate of pending) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                        pendingCandidatesRef.current.delete(data.fromUserId);
                    }
                }
            } catch (err) { }
        };

        const handleCandidate = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
            try {
                const pc = peersRef.current.get(data.fromUserId);
                if (pc) {
                    if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    else {
                        const pending = pendingCandidatesRef.current.get(data.fromUserId) || [];
                        pending.push(data.candidate);
                        pendingCandidatesRef.current.set(data.fromUserId, pending);
                    }
                }
            } catch (err) { }
        };

        const handleUserStateUpdate = (data: { userId: string; isMuted: boolean; isDeafened: boolean; isScreenSharing?: boolean }) => {
            setUserStates(prev => {
                const oldState = prev.get(data.userId);
                if (data.userId !== user?._id) {
                    if (data.isScreenSharing && (!oldState || !oldState.isScreenSharing)) {
                        // Play screenshare on sound if it just started
                        soundManager.play(SOUNDS.SCREENSHARE_ON, 0.4);
                    } else if (!data.isScreenSharing && oldState && oldState.isScreenSharing) {
                        // Play toggle/stop sound if it just stopped
                        soundManager.play(SOUNDS.SCREENSHARE_TOGGLE, 0.4);
                    }
                }

                const newMap = new Map(prev);
                newMap.set(data.userId, {
                    isMuted: data.isMuted,
                    isDeafened: data.isDeafened,
                    isScreenSharing: data.isScreenSharing || false
                } as any);
                return newMap;
            });
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
            socket.off('voice-existing-users');
            socket.off('voice-user-joined');
            socket.off('voice-user-left');
            socket.off('voice-offer');
            socket.off('voice-answer');
            socket.off('voice-ice-candidate');
            socket.off('voice-user-state-update');
        };
    }, [socket, isConnected, activeChannelId, createPeer, user]);

    const toggleMute = () => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !newMuted && !isDeafened);
        if (socket && activeChannelId) {
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted: newMuted, isDeafened, isScreenSharing });
        }
    };

    const toggleDeafen = () => {
        const newDeafened = !isDeafened;
        setIsDeafened(newDeafened);
        if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !isMuted && !newDeafened);
        if (socket && activeChannelId) {
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted, isDeafened: newDeafened, isScreenSharing });
        }
    };

    const toggleNoiseSuppression = useCallback(async () => {
        const newState = !isNoiseSuppressionEnabled;
        setIsNoiseSuppressionEnabled(newState);
        localStorage.setItem('noiseSuppression', String(newState));
        if (isConnectedRef.current && rawMicStreamRef.current) {
            let newStream: MediaStream;
            if (newState) {
                try {
                    newStream = await setupNoiseSuppression(getAudioContext(), rawMicStreamRef.current);
                } catch (e) {
                    newStream = rawMicStreamRef.current.clone();
                }
            } else {
                newStream = rawMicStreamRef.current.clone();
            }
            setLocalStream(newStream);
            localStreamRef.current = newStream;
            newStream.getAudioTracks().forEach(t => t.enabled = !isMuted && !isDeafened);
            const audioTrack = newStream.getAudioTracks()[0];
            if (audioTrack) {
                peersRef.current.forEach(async (pc) => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    if (sender) await sender.replaceTrack(audioTrack).catch(() => { });
                });
            }
        }
    }, [isNoiseSuppressionEnabled, isMuted, isDeafened, getAudioContext]);

    const lastSpeakingTimeRef = useRef<number>(0);

    useEffect(() => {
        if (!isConnected) {
            analysersRef.current.clear();
            setSpeakingUsers(new Set());
            return;
        }
        const audioCtx = getAudioContext();
        const interval = setInterval(() => {
            const nowSpeaking = new Set<string>();
            const now = Date.now();

            // Analyze local user
            if (localStreamRef.current && !isMuted) {
                const analyser = analysersRef.current.get(user?._id || 'local');
                if (analyser) {
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    dataArray.fill(128); // Pre-fill with silence
                    analyser.getByteTimeDomainData(dataArray);

                    let sumOfSquares = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        const normalized = (dataArray[i] - 128) / 128;
                        sumOfSquares += normalized * normalized;
                    }
                    const rms = Math.sqrt(sumOfSquares / dataArray.length);
                    const db = 20 * Math.log10(rms); // typically -100 to 0

                    if (isFinite(db)) {
                        setCurrentInputLevel(db);
                    }

                    // Hysteresis logic and Hold Time
                    const baseThreshold = isAutomaticSensitivity ? -60 : inputSensitivity;

                    if (db > baseThreshold) {
                        lastSpeakingTimeRef.current = now;
                    }

                    const VAD_HOLD_TIME = 200; // ms
                    const isVADOpen = (now - lastSpeakingTimeRef.current) < VAD_HOLD_TIME;

                    if (isVADOpen) {
                        if (user?._id) nowSpeaking.add(user._id);
                    }

                    // Apply Gating to Tracks
                    const shouldBeEnabled = !isMuted && !isDeafened && isVADOpen;
                    localStreamRef.current.getAudioTracks().forEach(t => {
                        if (t.enabled !== shouldBeEnabled) t.enabled = shouldBeEnabled;
                    });
                }
            } else {
                setCurrentInputLevel(-100);
            }

            // Analyze remote users
            analysersRef.current.forEach((analyser, userId) => {
                if (userId === user?._id) return;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                dataArray.fill(128);
                analyser.getByteTimeDomainData(dataArray);
                let sumOfSquares = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sumOfSquares += normalized * normalized;
                }
                const rms = Math.sqrt(sumOfSquares / dataArray.length);
                const db = 20 * Math.log10(rms);

                if (db > -50) nowSpeaking.add(userId);
            });

            setSpeakingUsers(prev => {
                if (prev.size === nowSpeaking.size && Array.from(prev).every(u => nowSpeaking.has(u))) {
                    return prev;
                }
                return nowSpeaking;
            });
        }, 50);

        const updateAnalysers = () => {
            analysersRef.current.clear();
            if (rawMicStreamRef.current && user?._id && !isMuted) {
                try {
                    const source = audioCtx.createMediaStreamSource(rawMicStreamRef.current);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    analysersRef.current.set(user._id, analyser);
                } catch (err) { }
            }
            remoteStreams.forEach((stream, userId) => {
                try {
                    const source = audioCtx.createMediaStreamSource(stream);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    analysersRef.current.set(userId, analyser);
                } catch (err) { }
            });
        };
        updateAnalysers();
        return () => {
            clearInterval(interval);
            speakingTimeoutsRef.current.forEach(t => clearTimeout(t));
            speakingTimeoutsRef.current.clear();
        };
    }, [isConnected, localStream, remoteStreams, user?._id, isMuted, getAudioContext]);

    const setUserVolume = useCallback((userId: string, volume: number) => {
        setUserVolumes(prev => new Map(prev).set(userId, volume));
    }, []);

    const toggleLocalMute = useCallback((userId: string) => {
        setLocalMutes(prev => {
            const newMutes = new Set(prev);
            if (newMutes.has(userId)) newMutes.delete(userId);
            else newMutes.add(userId);
            return newMutes;
        });
    }, []);

    const setScreenVolume = useCallback((userId: string, volume: number) => {
        setScreenVolumes(prev => new Map(prev).set(userId, volume));
    }, []);

    const setWatchingScreen = useCallback((userId: string, isWatching: boolean) => {
        setWatchedScreenIds(prev => {
            const next = new Set(prev);
            if (isWatching) next.add(userId);
            else next.delete(userId);
            return next;
        });
    }, []);

    return (
        <VoiceContext.Provider value={{
            isConnected, activeChannelId, joinChannel, leaveChannel, isMuted, isDeafened, toggleMute, toggleDeafen,
            connectedUsers, localStream, remoteStreams, userVolumes, setUserVolume, userStates, localMutes,
            toggleLocalMute, speakingUsers, isNoiseSuppressionEnabled, toggleNoiseSuppression, audioContext,
            inputDevices, outputDevices, videoDevices, selectedInputDeviceId, setSelectedInputDeviceId,
            selectedOutputDeviceId, setSelectedOutputDeviceId, selectedVideoDeviceId, setSelectedVideoDeviceId,
            inputVolume, setInputVolume, outputVolume, setOutputVolume, refreshDevices,
            isScreenSharing, screenStream, startScreenShare, stopScreenShare, remoteScreenStreams,
            screenVolumes, setScreenVolume, watchedScreenIds, setWatchingScreen,
            inputSensitivity, setInputSensitivity, isAutomaticSensitivity, setIsAutomaticSensitivity, currentInputLevel
        }}>
            {children}
            <div style={{ display: 'none' }}>
                {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
                    <RemoteAudio
                        key={`audio-${userId}`} userId={userId} stream={stream}
                        voiceVolume={userVolumes.get(userId) ?? 1} isDeafened={isDeafened}
                        isLocalMuted={localMutes.has(userId)} sharedContext={audioContext}
                        outputDeviceId={selectedOutputDeviceId} masterVolume={outputVolume}
                    />
                ))}
                {Array.from(remoteScreenStreams.entries()).map(([userId, stream]) => (
                    <RemoteScreen
                        key={`screen-${userId}`} userId={userId} stream={stream}
                        outputDeviceId={selectedOutputDeviceId} masterVolume={outputVolume}
                        isWatching={watchedScreenIds.has(userId)}
                        volume={screenVolumes.get(userId) ?? 1}
                    />
                ))}
            </div>
        </VoiceContext.Provider>
    );
};
