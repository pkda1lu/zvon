import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { SOUNDS, soundManager } from '../utils/sounds';
import { nativeAudioManager } from '../utils/nativeAudio';
import vadWorkletUrl from '../utils/vad-worklet.js?url';
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
    voiceVolume: number;
    isDeafened: boolean;
    isLocalMuted: boolean;
    sharedContext: AudioContext | null;
    outputDeviceId: string;
    masterVolume: number;
}> = ({ userId, stream, voiceVolume, isDeafened, isLocalMuted, sharedContext, outputDeviceId, masterVolume }) => {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (!audioRef.current) return;
        const finalVolume = (isDeafened || isLocalMuted) ? 0 : (voiceVolume * masterVolume);
        audioRef.current.volume = Math.min(Math.max(finalVolume, 0), 1);
    }, [voiceVolume, isDeafened, isLocalMuted, masterVolume]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !stream) return;

        if (audio.srcObject !== stream) {
            audio.srcObject = stream;
        }

        audio.muted = false;
        const play = async () => {
            try {
                await audio.play();
                console.log(`[Voice] Playing stream for ${userId}`);
            } catch (e: any) {
                if (e.name !== 'AbortError') {
                    console.warn(`[Voice] Playback failed for ${userId}:`, e);
                    // Retry on click is handled by the global listener, 
                    // but we can also try to resume context here
                    if (sharedContext?.state === 'suspended') {
                        await sharedContext.resume().catch(() => { });
                        await audio.play().catch(() => { });
                    }
                }
            }
        };
        play();

    }, [stream, sharedContext, userId]);

    // Handle Output Device (SinkId)
    useEffect(() => {
        if (audioRef.current && (audioRef.current as any).setSinkId) {
            const devId = outputDeviceId === 'default' ? '' : outputDeviceId;
            (audioRef.current as any).setSinkId(devId).catch((e: any) => console.error("[Voice] SinkId error:", e));
        }
    }, [outputDeviceId]);

    return <audio ref={audioRef} autoPlay playsInline />;
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
    startTestStream: () => Promise<void>;
    stopTestStream: () => void;
}

interface VoiceLevelContextType {
    currentInputLevel: number;
    speakingUsers: Set<string>;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);
const VoiceLevelContext = createContext<VoiceLevelContextType | undefined>(undefined);

export const useVoice = () => {
    const context = useContext(VoiceContext);
    if (!context) throw new Error('useVoice must be used within VoiceProvider');
    return context;
};

export const useVoiceLevels = () => {
    const context = useContext(VoiceLevelContext);
    if (!context) throw new Error('useVoiceLevels must be used within VoiceProvider');
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
    const sourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
    const workletNodesRef = useRef<Map<string, AudioWorkletNode>>(new Map());
    const vadStreamRef = useRef<MediaStream | null>(null);
    const vadSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const [testStream, setTestStream] = useState<MediaStream | null>(null);
    const testStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const isVadActiveRef = useRef(false);
    const lastSpeakingTimeRef = useRef<number>(0);
    const lastVadMessageTimeRef = useRef<number>(0);
    const registeredWorkletsRef = useRef<Set<string>>(new Set());

    // Sync refs for the interval to avoid re-creation
    const inputSensitivityRef = useRef(inputSensitivity);
    const isAutomaticSensitivityRef = useRef(isAutomaticSensitivity);
    useEffect(() => { inputSensitivityRef.current = inputSensitivity; }, [inputSensitivity]);
    useEffect(() => { isAutomaticSensitivityRef.current = isAutomaticSensitivity; }, [isAutomaticSensitivity]);

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

                            // Disconnect old source if exists
                            if (sourcesRef.current.has(userId)) {
                                sourcesRef.current.get(userId)?.disconnect();
                            }

                            const source = ctx.createMediaStreamSource(stream);
                            const analyser = ctx.createAnalyser();
                            analyser.fftSize = 256;
                            source.connect(analyser);

                            analysersRef.current.set(userId, analyser);
                            sourcesRef.current.set(userId, source);
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
                    if (sourcesRef.current.has(userId)) {
                        sourcesRef.current.get(userId)?.disconnect();
                        sourcesRef.current.delete(userId);
                    }
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

            // Cleanup worklet if it was for testing
            const localId = user?._id || 'local';
            if (workletNodesRef.current.has(localId)) {
                workletNodesRef.current.get(localId)?.disconnect();
                workletNodesRef.current.delete(localId);
            }
        }
    }, [user?._id]);

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

        // Cleanup local worklet
        const localId = user?._id || 'local';
        if (workletNodesRef.current.has(localId)) {
            workletNodesRef.current.get(localId)?.disconnect();
            workletNodesRef.current.delete(localId);
        }

        // Cleanup remote analysers and sources
        analysersRef.current.forEach(a => a.disconnect());
        analysersRef.current.clear();
        sourcesRef.current.forEach(s => s.disconnect());
        sourcesRef.current.clear();

        if (vadSourceRef.current) {
            vadSourceRef.current.disconnect();
            vadSourceRef.current = null;
        }
        if (vadStreamRef.current) {
            vadStreamRef.current.getTracks().forEach(t => t.stop());
            vadStreamRef.current = null;
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

            // Efficient Electron constraints - Use ideal instead of mandatory for resolution
            // to avoid 'green bars' padding from Electron's capture engine
            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        maxFrameRate: frameRate
                    },
                    optional: [
                        { maxWidth: 3840 },
                        { maxHeight: 2160 }
                    ]
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
                deviceId: selectedInputDeviceId !== 'default' ? selectedInputDeviceId : undefined
            });

            if (roomRef.current !== room) {
                console.warn('[LiveKit] Join cancelled after mic enabled');
                await room.disconnect();
                return;
            }

            // Update local stream state for visualization
            const localAudioTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (localAudioTrack?.track) {
                const track = localAudioTrack.track.mediaStreamTrack!;
                const stream = new MediaStream([track]);
                setLocalStream(stream);
                localStreamRef.current = stream;

                // Store raw stream for noise suppression toggling
                const rawTrack = track.clone();
                rawTrack.enabled = true; // Ensure it's ALWAYS on for VAD/Internal use
                rawMicStreamRef.current = new MediaStream([rawTrack]);

                // Dedicated Stream for VAD (cloned from raw)
                const vadTrack = track.clone();
                vadTrack.enabled = true;
                vadStreamRef.current = new MediaStream([vadTrack]);

                console.log(`[Voice] Published mic: ${track.label} (ID: ${selectedInputDeviceId})`);
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
    }, [user?._id, leaveChannel, socket, selectedInputDeviceId]);

    // Effect to handle input device changes in real-time
    useEffect(() => {
        const handleDeviceChange = async () => {
            // Update Test Stream if it exists
            if (testStreamRef.current) {
                console.log(`[Voice] Switching test stream to device: ${selectedInputDeviceId}`);
                testStreamRef.current.getTracks().forEach(t => t.stop());
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            deviceId: selectedInputDeviceId !== 'default' ? { exact: selectedInputDeviceId } : undefined,
                        }
                    });
                    testStreamRef.current = stream;
                    setTestStream(stream);
                } catch (err) {
                    console.error("[Voice] Failed to switch test stream device:", err);
                }
            }

            // Update LiveKit track if connected
            if (roomRef.current && isConnected) {
                console.log(`[Voice] Switching LiveKit microphone to device: ${selectedInputDeviceId}`);
                try {
                    await roomRef.current.localParticipant.setMicrophoneEnabled(true, {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        deviceId: selectedInputDeviceId !== 'default' ? selectedInputDeviceId : undefined
                    });

                    // Update local context streams from the new track
                    const localAudioTrack = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
                    if (localAudioTrack?.track) {
                        const baseTrack = localAudioTrack.track.mediaStreamTrack!;

                        // Cleanup old clones before creating new ones
                        if (rawMicStreamRef.current) {
                            rawMicStreamRef.current.getTracks().forEach(t => t.stop());
                        }
                        if (vadStreamRef.current) {
                            vadStreamRef.current.getTracks().forEach(t => t.stop());
                        }

                        // Store raw clean track for noise suppression input
                        const rawTrack = baseTrack.clone();
                        rawTrack.enabled = true;
                        rawMicStreamRef.current = new MediaStream([rawTrack]);

                        // Dedicated Stream for VAD
                        const vadTrack = baseTrack.clone();
                        vadTrack.enabled = true;
                        vadStreamRef.current = new MediaStream([vadTrack]);

                        // Handle Noise Suppression re-application
                        let finalTrack = baseTrack;
                        if (isNoiseSuppressionEnabled) {
                            try {
                                const suppressedStream = await setupNoiseSuppression(getAudioContext(), rawMicStreamRef.current);
                                const suppressedTrack = suppressedStream.getAudioTracks()[0];
                                if (suppressedTrack) {
                                    await (localAudioTrack.track as any).replaceTrack(suppressedTrack);
                                    finalTrack = suppressedTrack;
                                }
                            } catch (e) {
                                console.warn("[Voice] NS re-apply failed during device switch:", e);
                            }
                        }

                        // Apply current mute state to the final track
                        const effectiveMuted = isMuted || isServerMuted;
                        const effectiveDeafened = isDeafened || isServerDeafened;
                        finalTrack.enabled = !effectiveMuted && !effectiveDeafened;

                        const stream = new MediaStream([finalTrack]);
                        setLocalStream(stream);
                        localStreamRef.current = stream;

                        console.log(`[Voice] Switched mic to: ${finalTrack.label} (NS: ${isNoiseSuppressionEnabled}, Muted: ${effectiveMuted})`);
                    }
                } catch (err) {
                    console.error("[Voice] Failed to switch microphone in call:", err);
                }
            }
        };

        handleDeviceChange();
    }, [selectedInputDeviceId, isConnected, isNoiseSuppressionEnabled, isMuted, isDeafened, isServerMuted, isServerDeafened, getAudioContext]);

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
    }, [socket, isConnected, activeChannelId, localStream, user?._id, leaveChannel]);

    const toggleMute = () => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);

        // Sound feedback
        soundManager.play(newMuted ? SOUNDS.MUTE : SOUNDS.UNMUTE, 0.4);

        const effectiveMuted = (newMuted || isServerMuted);
        const effectiveDeafened = (isDeafened || isServerDeafened);

        // Robust LiveKit track management
        if (roomRef.current) {
            roomRef.current.localParticipant.setMicrophoneEnabled(!effectiveMuted && !effectiveDeafened).catch(err => {
                console.warn("[Voice] Failed to sync LiveKit mic state:", err);
            });
        }

        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => {
                t.enabled = !effectiveMuted && !effectiveDeafened;
            });
        }

        if (socket && activeChannelId) {
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted: newMuted, isDeafened, isScreenSharing });
        }
    };

    const toggleDeafen = () => {
        const newDeafened = !isDeafened;
        setIsDeafened(newDeafened);

        // Sound feedback
        soundManager.play(newDeafened ? SOUNDS.MUTE : SOUNDS.UNMUTE, 0.4); // Use mute sounds as fallback for now

        const effectiveMuted = (isMuted || isServerMuted);
        const effectiveDeafened = (newDeafened || isServerDeafened);

        // If deafened, we should also mute locally to avoid feedback/confusion
        if (roomRef.current) {
            roomRef.current.localParticipant.setMicrophoneEnabled(!effectiveMuted && !effectiveDeafened).catch(err => {
                console.warn("[Voice] Failed to sync LiveKit mic state via deafen:", err);
            });
        }

        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => {
                t.enabled = !effectiveMuted && !effectiveDeafened;
            });
        }

        if (socket && activeChannelId) {
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted, isDeafened: newDeafened, isScreenSharing });
        }
    };

    // Electron Integration: Shortcuts and Tray Sync
    useEffect(() => {
        // @ts-ignore
        if (window.electron && window.electron.ipc) {
            // @ts-ignore
            const uncurryMute = window.electron.ipc.on('toggle-mute-shortcut', () => {
                toggleMute();
            });
            // @ts-ignore
            const uncurryDeafen = window.electron.ipc.on('toggle-deafen-shortcut', () => {
                toggleDeafen();
            });

            return () => {
                uncurryMute();
                uncurryDeafen();
            };
        }
    }, [toggleMute, toggleDeafen]);

    useEffect(() => {
        // @ts-ignore
        if (window.electron && window.electron.ipc) {
            // @ts-ignore
            window.electron.ipc.send('voice-state-sync', {
                isMuted,
                isDeafened,
                isConnected
            });
        }
    }, [isMuted, isDeafened, isConnected]);


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


    // Unified VAD and Local Indicator Loop (Optimized for remote users only)
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const nowSpeaking = new Set<string>();

            // Local user speaking status (calculated via worklet message handler in another effect)
            const localId = user?._id || 'local';
            const VAD_HOLD_TIME = 250;
            const isLocalVADOpen = (now - lastSpeakingTimeRef.current) < VAD_HOLD_TIME;
            if (isLocalVADOpen) nowSpeaking.add(localId);

            // Apply Gating only when required
            if (isConnected && localStreamRef.current) {
                const now = Date.now();
                // Watchdog: If VAD is supposed to be active but hasn't sent a message in 5s, it might be stuck
                if (isVadActiveRef.current && (now - lastVadMessageTimeRef.current > 5000) && lastVadMessageTimeRef.current !== 0) {
                    console.warn("[Voice] VAD watchdog triggered: No messages for 5s. Falling back to always-on.");
                    isVadActiveRef.current = false;
                }

                // If VAD failed to init or got stuck, we just keep the mic open (fail-safe)
                const isSpeaking = isVadActiveRef.current ? isLocalVADOpen : true;
                const shouldBeEnabled = !isMuted && !isServerMuted && !isDeafened && !isServerDeafened && isSpeaking;
                const tracks = localStreamRef.current.getAudioTracks();
                for (let i = 0; i < tracks.length; i++) {
                    if (tracks[i].enabled !== shouldBeEnabled) {
                        tracks[i].enabled = shouldBeEnabled;
                        console.log(`[Voice] Track ${tracks[i].label} enabled = ${shouldBeEnabled} (VAD: ${isVadActiveRef.current}, Speaking: ${isSpeaking})`);
                    }
                }
            }

            // Analyze Remote Users (Still using analysers for simpler integration)
            analysersRef.current.forEach((analyser, userId) => {
                if (userId === localId) return;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteTimeDomainData(dataArray);
                let sumOfSquares = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sumOfSquares += normalized * normalized;
                }
                const rms = Math.sqrt(sumOfSquares / dataArray.length);
                const db = rms > 1e-5 ? 20 * Math.log10(rms) : -100;
                const state = userStates.get(userId);
                const isUserMuted = state?.isMuted || state?.isServerMuted || state?.isDeafened || state?.isServerDeafened;

                if (db > -50 && !isUserMuted) nowSpeaking.add(userId);
            });

            // Deep comparison to prevent redundant state updates
            setSpeakingUsers(prev => {
                if (prev.size !== nowSpeaking.size) return nowSpeaking;
                for (const id of nowSpeaking) {
                    if (!prev.has(id)) return nowSpeaking;
                }
                return prev;
            });
        }, 60); // Slightly more relaxed interval for better performance

        return () => clearInterval(interval);
    }, [isConnected, isMuted, isServerMuted, isDeafened, isServerDeafened, userStates, user?._id]);

    // Local Audio Monitoring with AudioWorklet
    useEffect(() => {
        // Use vadStream if in call, otherwise testStream for settings
        const stream = vadStreamRef.current || testStream;
        const localId = user?._id || 'local';

        if (!stream) {
            if (workletNodesRef.current.has(localId)) {
                workletNodesRef.current.get(localId)?.disconnect();
                workletNodesRef.current.delete(localId);
            }
            if (vadSourceRef.current) {
                vadSourceRef.current.disconnect();
                vadSourceRef.current = null;
            }
            return;
        }

        const setupLocalVAD = async () => {
            try {
                const audioCtx = getAudioContext();
                if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => { });

                // VAD Worklet Source - Inlined for reliability in production
                const vadWorkletCode = `
class VADProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._lastUpdate = 0;
        this._rms = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input[0] && input[0].length > 0) {
            const samples = input[0];
            let sumOfSquares = 0;
            for (let i = 0; i < samples.length; i++) {
                sumOfSquares += samples[i] * samples[i];
            }
            this._rms = Math.sqrt(sumOfSquares / samples.length);

            const now = Date.now();
            if (now - this._lastUpdate > 40) {
                this.port.postMessage({ rms: this._rms });
                this._lastUpdate = now;
            }
        }
        return true;
    }
}
registerProcessor('vad-processor', VADProcessor);
`;

                const blob = new Blob([vadWorkletCode], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);

                // Only register if not already registered for this context
                if (!registeredWorkletsRef.current.has('vad-processor')) {
                    await audioCtx.audioWorklet.addModule(url);
                    registeredWorkletsRef.current.add('vad-processor');
                    console.log("[Voice] VAD Worklet module added");
                }

                if (vadSourceRef.current) vadSourceRef.current.disconnect();

                const source = audioCtx.createMediaStreamSource(stream);
                const vadNode = new AudioWorkletNode(audioCtx, 'vad-processor');

                vadNode.port.onmessage = (event) => {
                    const { rms } = event.data;
                    lastVadMessageTimeRef.current = Date.now();
                    const db = rms > 1e-5 ? 20 * Math.log10(rms) : -100;
                    setCurrentInputLevel(db);
                    const baseThreshold = isAutomaticSensitivityRef.current ? -70 : inputSensitivityRef.current;
                    if (db > baseThreshold) lastSpeakingTimeRef.current = Date.now();
                };

                source.connect(vadNode);
                vadSourceRef.current = source;

                if (workletNodesRef.current.has(localId)) {
                    workletNodesRef.current.get(localId)?.disconnect();
                }
                workletNodesRef.current.set(localId, vadNode);
                isVadActiveRef.current = true;
                console.log("[Voice] VAD initialized successfully");

            } catch (error) {
                console.warn('[Voice] VAD setup failed, falling back to analyzer:', error);
                isVadActiveRef.current = false;

                // Fallback to Analyser
                try {
                    const audioCtx = getAudioContext();
                    const source = audioCtx.createMediaStreamSource(stream);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    analysersRef.current.set(localId, analyser);
                } catch (fallbackErr) { }
            }
        };

        setupLocalVAD();
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
        const unlockAudio = async () => {
            console.log("[Voice] Global interaction detected, resuming all audio...");
            if (audioContextRef.current) {
                if (audioContextRef.current.state === 'suspended') {
                    await audioContextRef.current.resume().catch(console.error);
                }
            }
            if (soundManager['audioContext'] && soundManager['audioContext'].state === 'suspended') {
                await soundManager['audioContext'].resume().catch(() => { });
            }

            // Also try to find all audio tags and play them
            const audios = document.querySelectorAll('audio');
            audios.forEach(a => {
                if (a.paused && a.srcObject) {
                    a.play().catch(() => { });
                }
            });
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

            // Sync hardware/LiveKit track
            if (roomRef.current) {
                roomRef.current.localParticipant.setMicrophoneEnabled(!effectiveMuted && !effectiveDeafened).catch(() => { });
            }

            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !effectiveMuted && !effectiveDeafened);
        }
    }, [isServerMuted, isServerDeafened, isMuted, isDeafened, isConnected]);

    const voiceLevelValue = useMemo(() => ({
        currentInputLevel,
        speakingUsers
    }), [currentInputLevel, speakingUsers]);

    return (
        <VoiceContext.Provider value={{
            isConnected, activeChannelId, joinChannel, leaveChannel, isMuted, isDeafened,
            isServerMuted, isServerDeafened, toggleMute, toggleDeafen,
            connectedUsers, localStream, remoteStreams, userVolumes, setUserVolume, userStates, localMutes,
            toggleLocalMute, isNoiseSuppressionEnabled, toggleNoiseSuppression, audioContext,
            inputDevices, outputDevices, videoDevices, selectedInputDeviceId, setSelectedInputDeviceId,
            selectedOutputDeviceId, setSelectedOutputDeviceId, selectedVideoDeviceId, setSelectedVideoDeviceId,
            inputVolume, setInputVolume, outputVolume, setOutputVolume, refreshDevices,
            isScreenSharing, screenStream, startScreenShare, stopScreenShare, remoteScreenStreams,
            screenVolumes, setScreenVolume, watchedScreenIds, setWatchingScreen,
            inputSensitivity, setInputSensitivity, isAutomaticSensitivity, setIsAutomaticSensitivity,
            startTestStream, stopTestStream
        }}>
            <VoiceLevelContext.Provider value={voiceLevelValue}>
                {children}
                <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
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
            </VoiceLevelContext.Provider>
        </VoiceContext.Provider>
    );
};
