import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { SOUNDS, soundManager } from '../utils/sounds';
import { nativeAudioManager } from '../utils/nativeAudio';
import axios from 'axios';
import {
    Room,
    RoomEvent,
    RemoteParticipant,
    RemoteTrack,
    RemoteTrackPublication,
    LocalTrackPublication,
    LocalParticipant,
    Track,
    Participant,
    ConnectionState,
    VideoPresets,
    createAudioAnalyser,
    TrackPublication
} from 'livekit-client';

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

    // Handle Volume and Mute
    useEffect(() => {
        if (!audioRef.current) return;
        const finalVolume = (isDeafened || isLocalMuted) ? 0 : (voiceVolume * masterVolume);
        audioRef.current.volume = Math.min(Math.max(finalVolume, 0), 1);
    }, [voiceVolume, isDeafened, isLocalMuted, masterVolume]);

    // Setup Stream and Playback
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !stream) return;

        audio.srcObject = stream;
        audio.muted = false;

        const attemptPlay = () => {
            audio.play().catch(e => {
                if (e.name === 'NotAllowedError') {
                    console.log("[Voice] Playback blocked, waiting for interaction");
                } else {
                    console.warn("[Voice] Playback error:", e);
                }
            });
        };

        attemptPlay();

        // Retry play on next interaction just in case
        const unlock = () => { attemptPlay(); window.removeEventListener('click', unlock); };
        window.addEventListener('click', unlock);

        return () => window.removeEventListener('click', unlock);
    }, [stream]);

    useEffect(() => {
        if (audioRef.current && (audioRef.current as any).setSinkId) {
            (audioRef.current as any).setSinkId(outputDeviceId).catch(() => { });
        }
    }, [outputDeviceId]);

    return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
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
    startScreenShare: (sourceId: string, options?: { resolution?: string, frameRate?: string }) => Promise<void>;
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

    const roomRef = useRef<Room | null>(null);
    const isJoiningRef = useRef(false);
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

    // Cleanup on unmount of VoiceProvider
    useEffect(() => {
        return () => {
            if (activeChannelId) {
                leaveChannel();
            }
            if (roomRef.current) {
                roomRef.current.disconnect();
                roomRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => { });
            }
        };
    }, []);

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
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            setAudioContext(audioContextRef.current); // Update React state
            soundManager.setAudioContext(audioContextRef.current); // Initialize soundManager
        }
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(() => { });
        }
        return audioContextRef.current;
    }, []);

    const handleTrackSubscribed = (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
    ) => {
        if (track.kind === Track.Kind.Audio || track.kind === Track.Kind.Video) {
            const userId = participant.identity;
            const isScreen = publication.source === Track.Source.ScreenShare ||
                publication.source === Track.Source.ScreenShareAudio;

            console.log(`[Voice] Track subscribed: ${track.kind} from ${userId} (Source: ${publication.source})`);

            if (isScreen) {
                setRemoteScreenStreams(prev => {
                    const existing = prev.get(userId);
                    const tracks = existing ? [...existing.getTracks().filter(t => t.kind !== track.kind), track.mediaStreamTrack!] : [track.mediaStreamTrack!];
                    return new Map(prev).set(userId, new MediaStream(tracks));
                });

                // Fallback: ensure UI knows screen is being shared if socket update missed
                setUserStates(prev => {
                    const state = prev.get(userId);
                    if (state && !state.isScreenSharing) {
                        const next = new Map(prev);
                        next.set(userId, { ...state, isScreenSharing: true });
                        return next;
                    }
                    return prev;
                });
            } else {
                setRemoteStreams(prev => {
                    const existing = prev.get(userId);
                    const tracks = existing ? [...existing.getTracks().filter(t => t.kind !== track.kind), track.mediaStreamTrack!] : [track.mediaStreamTrack!];
                    const stream = new MediaStream(tracks);

                    if (track.kind === Track.Kind.Audio) {
                        try {
                            const ctx = getAudioContext();
                            const source = ctx.createMediaStreamSource(stream);
                            const analyser = ctx.createAnalyser();
                            analyser.fftSize = 256;
                            source.connect(analyser);
                            analysersRef.current.set(userId, analyser);
                        } catch (e) { console.warn('Analyser failed for', userId, e); }
                    }

                    return new Map(prev).set(userId, stream);
                });
            }
        }
    };

    const handleTrackUnsubscribed = (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
    ) => {
        const userId = participant.identity;
        const isScreen = publication.source === Track.Source.ScreenShare ||
            publication.source === Track.Source.ScreenShareAudio;

        console.log(`[Voice] Track unsubscribed: ${track.kind} from ${userId} (Source: ${publication.source})`);

        if (isScreen) {
            setRemoteScreenStreams(prev => {
                const existing = prev.get(userId);
                if (!existing) return prev;
                const remaining = existing.getTracks().filter(t => t.id !== track.mediaStreamTrack?.id);
                if (remaining.length === 0) {
                    const next = new Map(prev);
                    next.delete(userId);
                    return next;
                }
                return new Map(prev).set(userId, new MediaStream(remaining));
            });
        } else {
            setRemoteStreams(prev => {
                const existing = prev.get(userId);
                if (!existing) return prev;
                const remaining = existing.getTracks().filter(t => t.id !== track.mediaStreamTrack?.id);

                if (track.kind === Track.Kind.Audio) {
                    analysersRef.current.delete(userId);
                }

                if (remaining.length === 0) {
                    const next = new Map(prev);
                    next.delete(userId);
                    return next;
                }
                return new Map(prev).set(userId, new MediaStream(remaining));
            });
        }
    };

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

    const leaveChannel = useCallback(async () => {
        if (!activeChannelId && !roomRef.current) return;

        if (roomRef.current) {
            await roomRef.current.disconnect();
            roomRef.current = null;
        }

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (rawMicStreamRef.current) {
            rawMicStreamRef.current.getTracks().forEach(track => track.stop());
            rawMicStreamRef.current = null;
        }
        setLocalStream(null);
        setRemoteStreams(new Map());
        setRemoteScreenStreams(new Map());
        setConnectedUsers([]);

        if (socket && isConnectedRef.current && activeChannelId) {
            socket.emit('leave-voice-channel', { channelId: activeChannelId });
        }

        setIsConnected(false);
        setActiveChannelId(null);
        stopScreenShare();
        soundManager.play(SOUNDS.VOICE_LEAVE, 0.4);
    }, [socket, activeChannelId]);

    const startScreenShare = useCallback(async (sourceId: string, options?: { resolution?: string, frameRate?: string }) => {
        try {
            const hasElectron = !!(window as any).electron;
            let stream: MediaStream;

            const resolution = options?.resolution || '720';
            const frameRate = parseInt(options?.frameRate || '30', 10);

            let width = 1280;
            let height = 720;
            let bitrate = 8_000_000;

            if (resolution === '2160') {
                width = 3840;
                height = 2160;
                // Bitrate: 35-45 Mbps (Good), 60 Mbps (Excellent). 120fps gets 100Mbps.
                bitrate = frameRate >= 120 ? 100_000_000 : (frameRate >= 60 ? 60_000_000 : 40_000_000);
            } else if (resolution === '1440') {
                width = 2560;
                height = 1440;
                // Bitrate: 16-25 Mbps. 120fps gets 40Mbps.
                bitrate = frameRate >= 120 ? 40_000_000 : (frameRate >= 60 ? 25_000_000 : 18_000_000);
            } else if (resolution === '1080') {
                width = 1920;
                height = 1080;
                // Bitrate: 12-15 Mbps. 120fps gets 25Mbps.
                bitrate = frameRate >= 120 ? 25_000_000 : (frameRate >= 60 ? 15_000_000 : 10_000_000);
            } else if (resolution === '720') {
                width = 1280;
                height = 720;
                bitrate = frameRate >= 60 ? 8_000_000 : 5_000_000;
            } else if (resolution === '480') {
                width = 854;
                height = 480;
                bitrate = frameRate >= 60 ? 3_000_000 : 2_000_000;
            }

            // Efficient Electron constraints
            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: width,
                        minHeight: height,
                        maxWidth: width > 1920 ? width : 3840,
                        maxHeight: height > 1080 ? height : 2160,
                        maxFrameRate: frameRate
                    }
                } as any
            };
            if (hasElectron) {
                stream = await navigator.mediaDevices.getUserMedia(constraints);

                // Add native audio if available
                try {
                    const audioStream = await nativeAudioManager.startcapture(sourceId);
                    audioStream.getAudioTracks().forEach((track: MediaStreamTrack) => stream.addTrack(track));
                } catch (err) {
                    console.warn("Native audio capture failed, proceeding with video only:", err);
                }

            } else {
                // Standard Browser Implementation
                stream = await (navigator.mediaDevices as any).getDisplayMedia({
                    video: {
                        width: { ideal: width },
                        height: { ideal: height },
                        frameRate: { ideal: frameRate }
                    },
                    audio: true
                });
            }

            // Optimize for smoothness vs sharpness
            stream.getVideoTracks().forEach(t => {
                if (t.contentHint) {
                    // For 60/120fps, 'motion' is critical for smoothness
                    (t as any).contentHint = frameRate >= 60 ? 'motion' : 'detail';
                }
            });

            // Publish to LiveKit
            if (roomRef.current) {
                const videoTrack = stream.getVideoTracks()[0];
                const audioTrack = stream.getAudioTracks()[0];

                if (videoTrack) {
                    await roomRef.current.localParticipant.publishTrack(videoTrack, {
                        name: 'screen_video',
                        source: Track.Source.ScreenShare,
                        videoEncoding: {
                            maxBitrate: bitrate,
                            maxFramerate: frameRate,
                        },
                        videoCodec: 'h264',
                        simulcast: false // Disable simulcast to use ALL bandwidth for the primary stream
                    });
                }
                if (audioTrack) {
                    await roomRef.current.localParticipant.publishTrack(audioTrack, { name: 'screen_audio', source: Track.Source.ScreenShareAudio });
                }
                console.log(`[Voice] Screen share published: ${resolution}p @ ${frameRate}fps (${bitrate}bps)`);
            }

            screenStreamRef.current = stream;
            setScreenStream(stream);
            setIsScreenSharing(true);

            if (socket && activeChannelId) {
                socket.emit('voice-state-update', { channelId: activeChannelId, isMuted, isDeafened, isScreenSharing: true });
            }
        } catch (err) {
            console.error('Error starting screen share:', err);
        }
    }, [socket, activeChannelId, isMuted, isDeafened, user?._id]);

    const stopScreenShare = useCallback(async () => {
        if (roomRef.current) {
            await roomRef.current.localParticipant.setScreenShareEnabled(false);
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }
        nativeAudioManager.stopCapture();
        setScreenStream(null);
        setIsScreenSharing(false);
        soundManager.play(SOUNDS.SCREENSHARE_TOGGLE, 0.4);

        if (socket && activeChannelId) {
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted, isDeafened, isScreenSharing: false });
        }

        // Disable WDA_EXCLUDEFROMCAPTURE
        if ((window as any).electron && (window as any).electron.setContentProtection) {
            (window as any).electron.setContentProtection(false);
        }
    }, [socket, activeChannelId, isMuted, isDeafened]);

    const joinChannel = useCallback(async (channelId: string) => {
        if (isJoiningRef.current) {
            console.warn('[LiveKit] Join already in progress, ignoring...');
            return;
        }

        // Use either the flag or the presence of a room as a reason to cleanup first
        if (isConnectedRef.current || roomRef.current) {
            await leaveChannel();
        }

        isJoiningRef.current = true;
        try {
            // 1. Get token from server
            const { data } = await axios.get('/api/livekit/token', {
                params: {
                    roomName: `channel-${channelId}`,
                    identity: user?._id?.toString()
                }
            });

            const { token, serverUrl } = data;
            console.log('[LiveKit] Received token from server. Type:', typeof token, 'Length:', token?.length);

            if (typeof token !== 'string') {
                console.error('[LiveKit] Received invalid token type:', typeof token, token);
                throw new Error('Invalid token received from server');
            }

            // 2. Connect to LiveKit
            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
                publishDefaults: {
                    dtx: true,
                    simulcast: true,
                    red: true,
                }
            });

            roomRef.current = room;

            // 3. Setup Events
            room
                .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
                    const ids = new Set(speakers.map(s => s.identity));
                    setSpeakingUsers(prev => {
                        // Check if local user is speaking (VAD logic handles it but LiveKit might too)
                        // For now, merged LiveKit speakers with local VAD
                        return ids;
                    });
                })
                .on(RoomEvent.ConnectionStateChanged, (state) => {
                    console.log('[LiveKit] Connection state changed:', state);
                })
                .on(RoomEvent.Disconnected, (reason) => {
                    console.log('[LiveKit] Disconnected from room:', reason);
                    if (reason !== undefined) {
                        // Only trigger leave if it's an unexpected disconnect
                        // setIsConnected(false);
                        // setActiveChannelId(null);
                    }
                })
                .on(RoomEvent.Reconnecting, () => console.log('[LiveKit] Reconnecting...'))
                .on(RoomEvent.Reconnected, () => console.log('[LiveKit] Reconnected'))
                .on(RoomEvent.ParticipantConnected, (participant) => {
                    console.log('[LiveKit] Participant connected:', participant.identity);
                })
                .on(RoomEvent.ParticipantDisconnected, (participant) => {
                    console.log('[LiveKit] Participant disconnected:', participant.identity);
                    setRemoteStreams(prev => {
                        const next = new Map(prev);
                        next.delete(participant.identity);
                        return next;
                    });
                })
                .on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
                .on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
                .on(RoomEvent.LocalTrackPublished, (publication) => {
                    if (publication.source === Track.Source.ScreenShare) {
                        setIsScreenSharing(true);
                    }
                })
                .on(RoomEvent.LocalTrackUnpublished, (publication) => {
                    if (publication.source === Track.Source.ScreenShare) {
                        setIsScreenSharing(false);
                    }
                });

            await room.connect(serverUrl, token);

            // Safety check: verify we are still the current room
            if (roomRef.current !== room) {
                console.warn('[LiveKit] Join cancelled during connection');
                await room.disconnect();
                return;
            }

            console.log('[LiveKit] Connected to room');

            // 4. Publish Audio
            await room.localParticipant.setMicrophoneEnabled(true, {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            });

            if (roomRef.current !== room) {
                console.warn('[LiveKit] Join cancelled after mic enabled');
                await room.disconnect();
                return;
            }

            // Update local stream state for visualization
            const localAudioTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (localAudioTrack?.track) {
                const stream = new MediaStream([localAudioTrack.track.mediaStreamTrack!]);
                setLocalStream(stream);
                localStreamRef.current = stream;
            }

            setActiveChannelId(channelId);
            setIsConnected(true);
            soundManager.play(SOUNDS.VOICE_JOIN, 0.4);

            if (socket) {
                socket.emit('join-voice-channel', { channelId });
            }

        } catch (error) {
            console.error('Failed to join LiveKit room:', error);
            // Cleanup on failure
            if (roomRef.current) {
                roomRef.current.disconnect();
                roomRef.current = null;
            }
            alert('Не удалось подключиться к голосовому каналу.');
        } finally {
            isJoiningRef.current = false;
        }
    }, [user?._id, leaveChannel, socket]);

    const joinChannelRef = useRef(joinChannel);
    useEffect(() => {
        joinChannelRef.current = joinChannel;
    }, [joinChannel]);

    useEffect(() => {
        if (!socket || !isConnected || !activeChannelId || !localStreamRef.current) return;

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
                });
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

        socket.on('voice-existing-users', (users) => setConnectedUsers(users.filter((u: any) => u._id !== user?._id)));
        socket.on('voice-user-joined', (data) => {
            if (data.userId !== user?._id) {
                setConnectedUsers(prev => prev.find(u => u._id === data.user._id) ? prev : [...prev, data.user]);
            }
        });
        socket.on('voice-user-left', (data) => setConnectedUsers(prev => prev.filter(u => u._id !== data.userId)));
        socket.on('voice-user-state-update', handleUserStateUpdate);
        socket.on('force-join-voice', handleForceJoin);
        socket.on('voice-server-state-update', handleServerStateUpdate);

        const handleForceDisconnect = () => {
            leaveChannel();
        };
        socket.on('force-disconnect-voice', handleForceDisconnect);

        socket.emit('join-voice-channel', { channelId: activeChannelId });

        return () => {
            socket.off('voice-existing-users');
            socket.off('voice-user-joined');
            socket.off('voice-user-left');
            socket.off('voice-user-state-update');
            socket.off('force-join-voice');
            socket.off('voice-server-state-update');
            socket.off('force-disconnect-voice');
        };
    }, [socket, isConnected, activeChannelId, user?._id, leaveChannel]);

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
            if (audioTrack && roomRef.current) {
                // LiveKit track replacement
                const trackPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
                if (trackPub?.track) {
                    (trackPub.track as any).replaceTrack(audioTrack);
                }
            }
        }
    }, [isNoiseSuppressionEnabled, isMuted, isDeafened, getAudioContext]);

    const lastSpeakingTimeRef = useRef<number>(0);

    // Unified VAD and Local Indicator Loop
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const nowSpeaking = new Set<string>();

            // Analyze Local User
            const localId = user?._id || 'local';
            const localAnalyser = analysersRef.current.get(localId);
            if (localAnalyser) {
                const dataArray = new Uint8Array(localAnalyser.frequencyBinCount);
                localAnalyser.getByteTimeDomainData(dataArray);

                let sumOfSquares = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sumOfSquares += normalized * normalized;
                }
                const rms = Math.sqrt(sumOfSquares / dataArray.length);
                const db = 20 * Math.log10(rms);

                if (isFinite(db)) {
                    setCurrentInputLevel(db);
                    const baseThreshold = isAutomaticSensitivity ? -60 : inputSensitivity;
                    if (db > baseThreshold) lastSpeakingTimeRef.current = now;
                }

                const VAD_HOLD_TIME = 200;
                const isVADOpen = (now - lastSpeakingTimeRef.current) < VAD_HOLD_TIME;
                if (isVADOpen) nowSpeaking.add(localId);

                // Apply Gating
                if (isConnected && localStreamRef.current) {
                    const shouldBeEnabled = !isMuted && !isServerMuted && !isDeafened && !isServerDeafened && isVADOpen;
                    localStreamRef.current.getAudioTracks().forEach(t => {
                        if (t.enabled !== shouldBeEnabled) t.enabled = shouldBeEnabled;
                    });
                }
            } else {
                setCurrentInputLevel(-100);
            }

            // Analyze Remote Users
            analysersRef.current.forEach((analyser, userId) => {
                if (userId === (user?._id || 'local')) return;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
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

            setSpeakingUsers(nowSpeaking);
        }, 50);

        return () => clearInterval(interval);
    }, [isConnected, isMuted, isServerMuted, isDeafened, isServerDeafened, userStates, inputSensitivity, isAutomaticSensitivity, user?._id]);

    // Local Analyser Lifecycle (for initial setup or stream changes)
    useEffect(() => {
        const stream = localStream || testStream;
        const localId = user?._id || 'local';

        if (!stream) {
            analysersRef.current.delete(localId);
            return;
        }

        const createLocalAnalyser = async () => {
            try {
                const audioCtx = getAudioContext();
                // Ensure room for new tracks
                if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => { });

                const source = audioCtx.createMediaStreamSource(stream);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                analysersRef.current.set(localId, analyser);
                console.log("[Voice] Created local analyser for", localId);
            } catch (err) {
                console.warn("[Voice] Local analyser failed:", err);
            }
        };

        createLocalAnalyser();
    }, [localStream, testStream, user?._id, getAudioContext]);


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
