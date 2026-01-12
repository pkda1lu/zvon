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

        // Check and resume context if needed
        if (ctx.state === 'suspended') {
            ctx.resume()
                .then(() => console.log("[Voice] AudioContext resumed for RemoteAudio"))
                .catch(err => {
                    console.error("[Voice] Failed to resume AudioContext, falling back to element:", err);
                    if (audioRef.current) audioRef.current.muted = false;
                });
        }

        try {
            // Use clone to avoid 'stealing' the stream if other sources are created (like analysers)
            // although some browsers allow multiple sources, this is safer.
            // Actually, for playback we want the original stream often, but let's try direct first.
            // A better pattern for Web Audio playback:
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

        // Strict threshold: Only use Web Audio if we REALLY need the boost (> 1.0)
        // And ensure we have a valid context.
        const useWebAudio = !!sharedContext && (finalVolume > 1.0);

        if (useWebAudio && gainNodeRef.current) {
            // WEB AUDIO PATH
            if (audioRef.current) audioRef.current.muted = true; // Silence the element directly

            try {
                // Smooth transition
                gainNodeRef.current.gain.cancelScheduledValues(sharedContext.currentTime);
                gainNodeRef.current.gain.setTargetAtTime(finalVolume, sharedContext.currentTime, 0.05);
            } catch (e) {
                // Fallback instant
                gainNodeRef.current.gain.value = finalVolume;
            }
        } else {
            // DIRECT ELEMENT PATH (Standard)
            // If gain node exists, silence it to save processing (or disconnect/ignore it)
            if (gainNodeRef.current) {
                try { gainNodeRef.current.gain.value = 0; } catch (e) { }
            }

            if (audioRef.current) {
                audioRef.current.muted = false; // Unmute element
                // HTML Audio volume is 0.0 -> 1.0
                audioRef.current.volume = Math.min(Math.max(finalVolume, 0), 1);
            }
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
    isServerMuted: boolean;
    isServerDeafened: boolean;
    toggleMute: () => void;
    toggleDeafen: () => void;
    connectedUsers: User[];
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    userVolumes: Map<string, number>;
    setUserVolume: (userId: string, volume: number) => void;
    userStates: Map<string, { isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean; isServerMuted?: boolean; isServerDeafened?: boolean }>;
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
    startTestStream: () => Promise<void>;
    stopTestStream: () => void;
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
    const [isServerMuted, setIsServerMuted] = useState(false); // New state
    const [isServerDeafened, setIsServerDeafened] = useState(false); // New state

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
    const [userVolumes, setUserVolumes] = useState<Map<string, number>>(() => {
        const stored = localStorage.getItem('userVolumes');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                return new Map(Object.entries(parsed) as [string, number][]);
            } catch (e) {
                return new Map();
            }
        }
        return new Map();
    });
    const [userStates, setUserStates] = useState<Map<string, { isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean; isServerMuted?: boolean; isServerDeafened?: boolean }>>(new Map());
    const [localMutes, setLocalMutes] = useState<Set<string>>(() => {
        const stored = localStorage.getItem('localMutes');
        if (stored) {
            try {
                return new Set(JSON.parse(stored) as string[]);
            } catch (e) {
                return new Set();
            }
        }
        return new Set();
    });
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
    const peerStatesRef = useRef<Map<string, { makingOffer: boolean; ignoreOffer: boolean; isSettingRemoteAnswerPending: boolean }>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
    const [testStream, setTestStream] = useState<MediaStream | null>(null);
    const testStreamRef = useRef<MediaStream | null>(null);
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
        if (!peersRef.current.has(targetUserId)) {
            console.log(`[Voice] Creating new peer for ${targetUserId}. Role: ${initiator ? 'Impolite (Initiator)' : 'Polite'}`);

            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                ],
            });

            peersRef.current.set(targetUserId, pc);
            peerStatesRef.current.set(targetUserId, {
                makingOffer: false,
                ignoreOffer: false,
                isSettingRemoteAnswerPending: false
            });

            pc.ontrack = (event) => {
                console.log(`[Voice] Received track from ${targetUserId}, stream ID: ${event.streams[0].id}`);
                handleTrack(targetUserId, event.streams[0]);
            };

            pc.onicecandidate = (event) => {
                if (event.candidate && socket) {
                    socket.emit('voice-ice-candidate', { targetUserId, candidate: event.candidate });
                }
            };

            pc.onnegotiationneeded = async () => {
                const state = peerStatesRef.current.get(targetUserId);
                if (!state) return;
                try {
                    state.makingOffer = true;
                    console.log(`[Voice] Negotiation needed for ${targetUserId}. Making offer...`);
                    await pc.setLocalDescription();
                    if (socket) {
                        socket.emit('voice-offer', { targetUserId, offer: pc.localDescription });
                    }
                } catch (err) {
                    console.error(`[Voice] Offer creation failed for ${targetUserId}:`, err);
                } finally {
                    state.makingOffer = false;
                }
            };

            pc.oniceconnectionstatechange = () => {
                if (pc.iceConnectionState === 'failed') {
                    console.warn(`[Voice] ICE failed for ${targetUserId}. Restarting...`);
                    pc.restartIce();
                }
            };

            // Add existing tracks
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, localStreamRef.current!);
                });
            }

            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, screenStreamRef.current!);
                });
            }
        }

        return peersRef.current.get(targetUserId)!;
    }, [socket, user?._id]);

    const startTestStream = useCallback(async () => {
        if (localStreamRef.current || testStreamRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: selectedInputDeviceId !== 'default' ? { exact: selectedInputDeviceId } : undefined,
                }
            });
            testStreamRef.current = stream;
            setTestStream(stream);
        } catch (err) {
            console.error("Failed to start test stream", err);
        }
    }, [selectedInputDeviceId]);

    const stopTestStream = useCallback(() => {
        if (testStreamRef.current) {
            testStreamRef.current.getTracks().forEach(t => t.stop());
            testStreamRef.current = null;
            setTestStream(null);
        }
    }, []);

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
        peerStatesRef.current.clear();
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

        // Force resume context on join action
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();
        } catch (e) { }

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
            // Respect server mute/deafen as well
            const effectiveMuted = isMuted || isServerMuted;
            const effectiveDeafened = isDeafened || isServerDeafened;
            streamToUse.getAudioTracks().forEach(t => t.enabled = !effectiveMuted && !effectiveDeafened);

            setActiveChannelId(channelId);
            setIsConnected(true);
            soundManager.play(SOUNDS.VOICE_JOIN, 0.4);
        } catch (error) {
            alert('Не удалось подключиться к голосовому каналу.');
        }
    }, [isMuted, isDeafened, isServerMuted, isServerDeafened, leaveChannel, selectedInputDeviceId, isNoiseSuppressionEnabled, getAudioContext]);

    const joinChannelRef = useRef(joinChannel);
    useEffect(() => {
        joinChannelRef.current = joinChannel;
    }, [joinChannel]);

    useEffect(() => {
        if (!socket || !isConnected || !activeChannelId || !localStreamRef.current) return;

        const handleExistingUsers = (users: any[]) => {
            const others = users.filter(u => u._id !== user?._id);
            setConnectedUsers(others);

            setUserStates(prev => {
                const newMap = new Map(prev);
                others.forEach(u => {
                    newMap.set(u._id, {
                        isMuted: u.isMuted || false,
                        isDeafened: u.isDeafened || false,
                        isScreenSharing: u.isScreenSharing || false,
                        isServerMuted: u.isServerMuted || false,
                        isServerDeafened: u.isServerDeafened || false
                    });
                });
                return newMap;
            });

            others.forEach(u => {
                const myId = String(user?._id);
                const otherId = String(u._id);
                const isInitiator = myId < otherId;
                console.log(`[Voice] Creating peer for existing user ${u.username} (${u._id}). Initiator: ${isInitiator}`);
                createPeer(u._id, isInitiator);
            });
        };

        const handleUserJoined = (data: { userId: string; user: any }) => {
            if (data.userId === user?._id) return;
            setConnectedUsers(prev => prev.find(u => u._id === data.user._id) ? prev : [...prev, data.user]);

            const myId = String(user?._id);
            const otherId = String(data.userId);
            const isInitiator = myId < otherId;
            console.log(`[Voice] User joined: ${data.user.username} (${data.userId}). Initiator: ${isInitiator}`);
            createPeer(data.userId, isInitiator);

            if (data.user.isMuted !== undefined) {
                setUserStates(prev => new Map(prev).set(data.userId, {
                    isMuted: data.user.isMuted,
                    isDeafened: data.user.isDeafened,
                    isScreenSharing: data.user.isScreenSharing || false,
                    isServerMuted: data.user.isServerMuted || false,
                    isServerDeafened: data.user.isServerDeafened || false
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
            const pc = createPeer(data.fromUserId, false);
            const state = peerStatesRef.current.get(data.fromUserId);
            if (!state) return;

            try {
                const polite = String(user?._id) > String(data.fromUserId);
                const offerCollision = state.makingOffer || pc.signalingState !== 'stable';

                state.ignoreOffer = !polite && offerCollision;
                if (state.ignoreOffer) {
                    console.log(`[Voice] Ignoring offer from ${data.fromUserId} due to collision (impolite)`);
                    return;
                }

                if (offerCollision) {
                    console.log(`[Voice] Collision detected, rolling back for ${data.fromUserId} (polite)`);
                    await Promise.all([
                        pc.setLocalDescription({ type: 'rollback' }),
                        pc.setRemoteDescription(new RTCSessionDescription(data.offer))
                    ]);
                } else {
                    console.log(`[Voice] Handling offer from ${data.fromUserId}`);
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('voice-answer', { targetUserId: data.fromUserId, answer });

                // Process queued candidates
                const pending = pendingCandidatesRef.current.get(data.fromUserId);
                if (pending) {
                    for (const candidate of pending) {
                        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { }
                    }
                    pendingCandidatesRef.current.delete(data.fromUserId);
                }
            } catch (err) {
                console.error(`[Voice] Error handling offer from ${data.fromUserId}:`, err);
            }
        };

        const handleAnswer = async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
            const pc = peersRef.current.get(data.fromUserId);
            if (!pc) return;
            try {
                console.log(`[Voice] Handling answer from ${data.fromUserId}`);
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                const pending = pendingCandidatesRef.current.get(data.fromUserId);
                if (pending) {
                    for (const candidate of pending) {
                        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { }
                    }
                    pendingCandidatesRef.current.delete(data.fromUserId);
                }
            } catch (err) {
                console.error(`[Voice] Error handling answer from ${data.fromUserId}:`, err);
            }
        };

        const handleCandidate = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
            const pc = peersRef.current.get(data.fromUserId);
            const state = peerStatesRef.current.get(data.fromUserId);

            try {
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    if (state && state.ignoreOffer) return;
                    const pending = pendingCandidatesRef.current.get(data.fromUserId) || [];
                    pending.push(data.candidate);
                    pendingCandidatesRef.current.set(data.fromUserId, pending);
                }
            } catch (err) {
                if (!state || !state.ignoreOffer) {
                    console.warn(`[Voice] Error adding ICE candidate from ${data.fromUserId}:`, err);
                }
            }
        };

        const handleUserStateUpdate = (data: { userId: string; isMuted: boolean; isDeafened: boolean; isScreenSharing?: boolean; isServerMuted?: boolean; isServerDeafened?: boolean }) => {
            setUserStates(prev => {
                const oldState = prev.get(data.userId);
                if (data.userId !== user?._id) {
                    if (data.isScreenSharing && (!oldState || !oldState.isScreenSharing)) {
                        soundManager.play(SOUNDS.SCREENSHARE_ON, 0.4);
                    } else if (!data.isScreenSharing && oldState && oldState.isScreenSharing) {
                        soundManager.play(SOUNDS.SCREENSHARE_TOGGLE, 0.4);
                    }
                }

                const newMap = new Map(prev);
                newMap.set(data.userId, {
                    isMuted: data.isMuted,
                    isDeafened: data.isDeafened,
                    isScreenSharing: data.isScreenSharing || false,
                    isServerMuted: data.isServerMuted || false,
                    isServerDeafened: data.isServerDeafened || false
                } as any);
                return newMap;
            });
        };

        const handleForceJoin = (data: { channelId: string }) => {
            joinChannelRef.current(data.channelId);
        };

        const handleServerStateUpdate = (data: { isServerMuted?: boolean; isServerDeafened?: boolean }) => {
            if (data.isServerMuted !== undefined) setIsServerMuted(data.isServerMuted);
            if (data.isServerDeafened !== undefined) setIsServerDeafened(data.isServerDeafened);
        };

        socket.on('voice-existing-users', handleExistingUsers);
        socket.on('voice-user-joined', handleUserJoined);
        socket.on('voice-user-left', handleUserLeft);
        socket.on('voice-offer', handleOffer);
        socket.on('voice-answer', handleAnswer);
        socket.on('voice-ice-candidate', handleCandidate);
        socket.on('voice-user-state-update', handleUserStateUpdate);

        // New Handlers
        socket.on('force-join-voice', handleForceJoin);
        socket.on('voice-server-state-update', handleServerStateUpdate);

        const handleForceDisconnect = () => {
            console.log('Forced disconnect from voice');
            setActiveChannelId(null);
            setIsConnected(false);
            setConnectedUsers([]);
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
                localStreamRef.current = null;
                setLocalStream(null);
            }
            // We don't need to emit 'leave-voice-channel' because server already removed us
        };
        socket.on('force-disconnect-voice', handleForceDisconnect);

        socket.emit('join-voice-channel', { channelId: activeChannelId });

        return () => {
            socket.off('voice-existing-users');
            socket.off('voice-user-joined');
            socket.off('voice-user-left');
            socket.off('voice-offer');
            socket.off('voice-answer');
            socket.off('voice-ice-candidate');
            socket.off('voice-user-state-update');
            socket.off('force-join-voice');
            socket.off('voice-server-state-update');
            socket.off('force-disconnect-voice');
        };
    }, [socket, isConnected, activeChannelId, createPeer, user?._id]);

    const toggleMute = () => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        const effectiveMuted = newMuted || isServerMuted;
        const effectiveDeafened = isDeafened || isServerDeafened;
        if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !effectiveMuted && !effectiveDeafened);
        if (socket && activeChannelId) {
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted: newMuted, isDeafened, isScreenSharing });
        }
    };

    const toggleDeafen = () => {
        const newDeafened = !isDeafened;
        setIsDeafened(newDeafened);
        const effectiveMuted = isMuted || isServerMuted;
        const effectiveDeafened = newDeafened || isServerDeafened;
        if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !effectiveMuted && !effectiveDeafened);
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
            const effectiveMuted = isMuted || isServerMuted;
            const effectiveDeafened = isDeafened || isServerDeafened;
            newStream.getAudioTracks().forEach(t => t.enabled = !effectiveMuted && !effectiveDeafened);
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
        const audioCtx = getAudioContext();
        const interval = setInterval(() => {
            const nowSpeaking = new Set<string>();
            const now = Date.now();

            // Analyze local user
            const micStream = localStreamRef.current || testStreamRef.current;
            if (micStream && !isMuted && !isServerMuted) {
                let analyser = analysersRef.current.get(user?._id || 'local');

                // If no analyser but we have a stream (e.g. test stream just started), create one
                if (!analyser && micStream) {
                    try {
                        const source = audioCtx.createMediaStreamSource(micStream);
                        analyser = audioCtx.createAnalyser();
                        analyser.fftSize = 256;
                        source.connect(analyser);
                        analysersRef.current.set(user?._id || 'local', analyser);
                    } catch (err) { }
                }

                if (analyser) {
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

                    if (isFinite(db)) {
                        setCurrentInputLevel(db);
                    }

                    // Hysteresis logic
                    const baseThreshold = isAutomaticSensitivity ? -60 : inputSensitivity;
                    if (db > baseThreshold) {
                        lastSpeakingTimeRef.current = now;
                    }

                    const VAD_HOLD_TIME = 200;
                    const isVADOpen = (now - lastSpeakingTimeRef.current) < VAD_HOLD_TIME;

                    if (isVADOpen && isConnected) {
                        if (user?._id) nowSpeaking.add(user._id);
                    }

                    // Apply Gating only if connected
                    if (isConnected && localStreamRef.current) {
                        const shouldBeEnabled = !isMuted && !isServerMuted && !isDeafened && !isServerDeafened && isVADOpen;
                        localStreamRef.current.getAudioTracks().forEach(t => {
                            if (t.enabled !== shouldBeEnabled) t.enabled = shouldBeEnabled;
                        });
                    }
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
                const state = userStates.get(userId);
                const isUserMuted = state?.isMuted || state?.isServerMuted || state?.isDeafened || state?.isServerDeafened;

                if (db > -50 && !isUserMuted) nowSpeaking.add(userId);
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
            const micStream = localStreamRef.current || testStreamRef.current;
            if (micStream && (user?._id || 'local')) {
                // Even if muted, we might want to see the visualizer if we are just "soft muted" in UI
                // But typically if hardware muted, no data.
                // We use a CLONE to ensure we don't screw up the sender track.
                try {
                    const streamClone = micStream.clone();
                    streamClone.getAudioTracks().forEach(t => t.enabled = true);

                    const source = audioCtx.createMediaStreamSource(streamClone);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    analysersRef.current.set(user?._id || 'local', analyser);
                } catch (err) {
                    console.warn("Failed to create local analyser", err);
                }
            }

            remoteStreams.forEach((stream, userId) => {
                try {
                    // Use a clone for the analyser to avoid interfering with playback
                    // IMPORTANT: Cloned tracks might start disabled or muted in some browsers, ensure they are active
                    const streamClone = stream.clone();
                    streamClone.getAudioTracks().forEach(t => t.enabled = true);

                    const source = audioCtx.createMediaStreamSource(streamClone);
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
    }, [isConnected, localStream, remoteStreams, user?._id, isMuted, isServerMuted, isDeafened, isServerDeafened, userStates, getAudioContext]);

    const setUserVolume = useCallback((userId: string, volume: number) => {
        setUserVolumes(prev => {
            const next = new Map(prev);
            next.set(userId, volume);
            localStorage.setItem('userVolumes', JSON.stringify(Object.fromEntries(next)));
            return next;
        });
    }, []);

    const toggleLocalMute = useCallback((userId: string) => {
        setLocalMutes(prev => {
            const newMutes = new Set(prev);
            if (newMutes.has(userId)) newMutes.delete(userId);
            else newMutes.add(userId);
            localStorage.setItem('localMutes', JSON.stringify(Array.from(newMutes)));
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

    // Unlock AudioContext on user interaction
    useEffect(() => {
        const unlockAudio = () => {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().then(() => {
                    console.log("[Voice] AudioContext unlocked by user interaction");
                }).catch(console.error);
            }
            if (soundManager['audioContext'] && soundManager['audioContext'].state === 'suspended') {
                soundManager['audioContext'].resume().catch(() => { });
            }
        };
        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);
        return () => {
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    }, []);

    // Determine effective mute state for logic that re-enables tracks dynamically
    useEffect(() => {
        if (localStreamRef.current) {
            const effectiveMuted = isMuted || isServerMuted;
            const effectiveDeafened = isDeafened || isServerDeafened;
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !effectiveMuted && !effectiveDeafened);
        }
    }, [isServerMuted, isServerDeafened, isMuted, isDeafened]);

    return (
        <VoiceContext.Provider value={{
            isConnected, activeChannelId, joinChannel, leaveChannel, isMuted, isDeafened,
            isServerMuted, isServerDeafened, toggleMute, toggleDeafen,
            connectedUsers, localStream, remoteStreams, userVolumes, setUserVolume, userStates, localMutes,
            toggleLocalMute, speakingUsers, isNoiseSuppressionEnabled, toggleNoiseSuppression, audioContext,
            inputDevices, outputDevices, videoDevices, selectedInputDeviceId, setSelectedInputDeviceId,
            selectedOutputDeviceId, setSelectedOutputDeviceId, selectedVideoDeviceId, setSelectedVideoDeviceId,
            inputVolume, setInputVolume, outputVolume, setOutputVolume, refreshDevices,
            isScreenSharing, screenStream, startScreenShare, stopScreenShare, remoteScreenStreams,
            screenVolumes, setScreenVolume, watchedScreenIds, setWatchingScreen,
            inputSensitivity, setInputSensitivity, isAutomaticSensitivity, setIsAutomaticSensitivity, currentInputLevel,
            startTestStream, stopTestStream
        }}>
            {children}
            <div style={{ display: 'none' }}>
                {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
                    <RemoteAudio
                        key={`audio-${userId}`} userId={userId} stream={stream}
                        voiceVolume={userVolumes.get(userId) ?? 1}
                        isDeafened={isDeafened || isServerDeafened}
                        isLocalMuted={localMutes.has(userId) || (userStates.get(userId)?.isServerMuted ?? false)}
                        sharedContext={audioContext}
                        outputDeviceId={selectedOutputDeviceId}
                        masterVolume={outputVolume}
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
