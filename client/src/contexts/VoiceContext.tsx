import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { createDeepFilterProcessor } from '../utils/deepFilter';
import { SOUNDS, soundManager } from '../utils/sounds';
import { nativeAudioManager } from '../utils/nativeAudio';
import axios from 'axios';
import { useDialog } from './DialogContext';
import { getAvatarUrl } from '../utils/avatar';
import {
    Room,
    RoomEvent,
    RemoteParticipant,
    RemoteTrack,
    RemoteTrackPublication,
    Track,
    ConnectionState,
    VideoPresets,
    VideoQuality,
    TrackPublication,
    ConnectionQuality
} from 'livekit-client';

// --- Types ---

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
    userStates: Map<string, { isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean; isVideoOn?: boolean; isServerMuted?: boolean; isServerDeafened?: boolean }>;
    localMutes: Set<string>;
    toggleLocalMute: (userId: string) => void;
    noiseSuppressionMode: 'none' | 'standard' | 'rnnoise' | 'deepfilter';
    setNoiseSuppressionMode: (mode: 'none' | 'standard' | 'rnnoise' | 'deepfilter') => void;
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
    startScreenShare: (sourceId: string, options?: any) => Promise<void>;
    stopScreenShare: () => void;
    remoteScreenStreams: Map<string, MediaStream>;
    isVideoOn: boolean;
    toggleVideo: () => Promise<void>;
    localCameraStream: MediaStream | null;
    screenVolumes: Map<string, number>;
    setScreenVolume: (userId: string, volume: number) => void;
    watchedScreenIds: Set<string>;
    setWatchingScreen: (userId: string, isWatching: boolean) => void;
    inputSensitivity: number;
    setInputSensitivity: (val: number) => void;
    isAutomaticSensitivity: boolean;
    setIsAutomaticSensitivity: (val: boolean) => void;
    echoCancellation: boolean;
    setEchoCancellation: (val: boolean) => void;
    autoGainControl: boolean;
    setAutoGainControl: (val: boolean) => void;
    attenuation: number;
    setAttenuation: (val: number) => void;
    startTestStream: () => Promise<void>;
    stopTestStream: () => void;
    ping: number;
    connectionQuality: ConnectionQuality;
    roomConnectionState: ConnectionState;
    isOverlayEnabled: boolean;
    toggleOverlay: () => void;
    overlayPosition: string;
    setOverlayPosition: (pos: string) => void;
    overlayOpacity: number;
    setOverlayOpacity: (opacity: number) => void;
    overlaySize: number;
    setOverlaySize: (size: number) => void;
    publishExternalAudioTrack: (track: MediaStreamTrack, name?: string) => Promise<string | null>;
    publishExternalVideoTrack: (track: MediaStreamTrack, name?: string) => Promise<string | null>;
    unpublishExternalAudioTrack: (publicationSid: string) => Promise<void>;
    replaceExternalTrack: (publicationSid: string, newTrack: MediaStreamTrack) => Promise<boolean>;
    voicePresences: Map<string, VoicePresenceInfo>;
    presenceAudioStreams: Map<string, MediaStream>;
    presenceVideoStreams: Map<string, MediaStream>;
    sendPresenceControl: (channelId: string, sessionId: string, controlId: string, value?: any) => void;
    presenceVolumes: Map<string, number>;
    setPresenceVolume: (sessionId: string, volume: number) => void;
}

export interface VoicePresenceInfo {
    sessionId: string;
    channelId: string;
    ownerUserId: string;
    displayName: string;
    subtitle?: string | null;
    accentColor?: string | null;
    avatar: string | null;
    appId?: string | null;
    background: { type: 'image' | 'color' | 'video'; url?: string; color?: string } | null;
    controls: any[];
}

interface VoiceLevelContextType {
    currentInputLevel: number;
    speakingUsers: Set<string>;
}

// --- Contexts ---

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

// --- Sub-Providers ---

/**
 * VoiceLevelProvider: Isolates high-frequency state updates (levels, speaking status)
 * to prevent re-rendering the entire app every 40ms.
 */
const VoiceLevelProvider: React.FC<{ 
    children: React.ReactNode, 
    testStream: MediaStream | null,
    vadStream: MediaStream | null,
    user: any,
    isConnected: boolean,
    isMuted: boolean,
    isServerMuted: boolean,
    inputSensitivity: number,
    isAutomaticSensitivity: boolean,
    userStates: Map<string, any>,
    remoteSpeakingUsersRef: React.MutableRefObject<Set<string>>,
    getAudioContext: () => AudioContext,
    roomRef: React.MutableRefObject<Room | null>
}> = ({ 
    children, testStream, vadStream, user, isConnected, isMuted, isServerMuted, 
    inputSensitivity, isAutomaticSensitivity, userStates, 
    remoteSpeakingUsersRef, getAudioContext, roomRef 
}) => {
    const [currentInputLevel, setCurrentInputLevel] = useState(-100);
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    
    const lastSpeakingTimeRef = useRef<number>(0);
    const lastVadMessageTimeRef = useRef<number>(0);
    const vadInitTimeRef = useRef<number>(0);
    const isVadActiveRef = useRef(false);
    const workletNodesRef = useRef<Map<string, AudioWorkletNode>>(new Map());
    const vadSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const registeredWorkletsRef = useRef<WeakSet<AudioContext>>(new WeakSet());

    const inputSensitivityRef = useRef(inputSensitivity);
    const isAutomaticSensitivityRef = useRef(isAutomaticSensitivity);
    useEffect(() => { inputSensitivityRef.current = inputSensitivity; }, [inputSensitivity]);
    useEffect(() => { isAutomaticSensitivityRef.current = isAutomaticSensitivity; }, [isAutomaticSensitivity]);

    // VAD Setup and Level Monitoring
    useEffect(() => {
        const stream = testStream || vadStream;
        const localId = user?._id || 'local';

        if (!stream) {
            setCurrentInputLevel(-100);
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
                const vadWorkletCode = `
class VADProcessor extends AudioWorkletProcessor {
    constructor() { super(); this._lastUpdate = 0; this._rms = 0; }
    process(inputs) {
        const input = inputs[0];
        if (input && input[0] && input[0].length > 0) {
            const samples = input[0];
            let sumOfSquares = 0;
            for (let i = 0; i < samples.length; i++) sumOfSquares += samples[i] * samples[i];
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

                if (!registeredWorkletsRef.current.has(audioCtx)) {
                    try { await audioCtx.audioWorklet.addModule(url); } catch (e) { }
                    registeredWorkletsRef.current.add(audioCtx);
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
                if (workletNodesRef.current.has(localId)) workletNodesRef.current.get(localId)?.disconnect();
                workletNodesRef.current.set(localId, vadNode);
                isVadActiveRef.current = true;
                vadInitTimeRef.current = Date.now();
            } catch (error) {
                console.warn('[Voice] VAD setup failed');
            }
        };
        setupLocalVAD();
    }, [vadStream, testStream, user?._id, getAudioContext]);

    // Speaker status loop
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const nowSpeaking = new Set<string>();
            const localId = user?._id || 'local';
            const VAD_HOLD_TIME = 250;
            const isLocalVADOpen = (now - lastSpeakingTimeRef.current) < VAD_HOLD_TIME;
            if (isLocalVADOpen && !isMuted && !isServerMuted) nowSpeaking.add(localId);

            remoteSpeakingUsersRef.current.forEach(userId => {
                const state = userStates.get(userId);
                if (!(state?.isMuted || state?.isServerMuted || state?.isDeafened || state?.isServerDeafened)) {
                    nowSpeaking.add(userId);
                }
            });

            setSpeakingUsers(prev => {
                if (prev.size !== nowSpeaking.size) return nowSpeaking;
                for (const id of nowSpeaking) if (!prev.has(id)) return nowSpeaking;
                return prev;
            });
        }, 60);
        return () => clearInterval(interval);
    }, [isConnected, isMuted, isServerMuted, userStates, user?._id]);

    const value = useMemo(() => ({ currentInputLevel, speakingUsers }), [currentInputLevel, speakingUsers]);
    return <VoiceLevelContext.Provider value={value}>{children}</VoiceLevelContext.Provider>;
};

// --- Remote audio playback ---
// В серверных каналах remoteStreams наполнялся в TrackSubscribed, но нигде не
// воспроизводился (в отличие от DM-звонков в VoiceCall) — поэтому собеседников
// было не слышно, хотя обводка говорящего (ActiveSpeakers) работала. Этот
// рендерер монтирует по <audio> на каждый удалённый поток и проигрывает звук.
const RemoteAudioElement: React.FC<{
    stream: MediaStream; muted: boolean; volume: number; sinkId?: string;
}> = ({ stream, muted, volume, sinkId }) => {
    const ref = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || !stream) return;
        if (el.srcObject !== stream) el.srcObject = stream;
        const tryPlay = () => el.play().catch(() => {
            // Автоплей мог быть заблокирован — повторим по первому клику пользователя.
            const retry = () => { el.play().catch(() => {}); document.removeEventListener('click', retry); };
            document.addEventListener('click', retry, { once: true });
        });
        tryPlay();
    }, [stream]);
    useEffect(() => {
        if (ref.current) ref.current.volume = Math.min(Math.max(muted ? 0 : volume, 0), 1);
    }, [muted, volume]);
    useEffect(() => {
        const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
        if (el && sinkId && typeof el.setSinkId === 'function') el.setSinkId(sinkId).catch(() => {});
    }, [sinkId]);
    return <audio ref={ref} autoPlay playsInline />;
};

const RemoteAudioRenderer: React.FC<{
    streams: Map<string, MediaStream>; muted: boolean; volume: number; sinkId?: string;
}> = ({ streams, muted, volume, sinkId }) => (
    <>
        {Array.from(streams.entries()).map(([uid, stream]) => (
            <RemoteAudioElement key={uid} stream={stream} muted={muted} volume={volume} sinkId={sinkId} />
        ))}
    </>
);

// --- Main Provider ---

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket } = useSocket();
    const { user, updateUser } = useAuth();
    const { alert } = useDialog();

    // Refs
    const roomRef = useRef<Room | null>(null);
    const activeChannelIdRef = useRef<string | null>(null);
    const isConnectedRef = useRef(false);
    const localStreamRef = useRef<MediaStream | null>(null);
    const vadStreamRef = useRef<MediaStream | null>(null);
    const testStreamRef = useRef<MediaStream | null>(null);
    const remoteSpeakingUsersRef = useRef<Set<string>>(new Set());
    const audioContextRef = useRef<AudioContext | null>(null);
    const livekitTrackRef = useRef<MediaStreamTrack | null>(null);

    // States
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isServerMuted, setIsServerMuted] = useState(false);
    const [isServerDeafened, setIsServerDeafened] = useState(false);
    const [noiseSuppressionMode, setNoiseSuppressionModeState] = useState<'none' | 'standard' | 'rnnoise' | 'deepfilter'>(() => {
        const stored = localStorage.getItem('noiseSuppressionMode') as 'none' | 'standard' | 'rnnoise' | 'deepfilter' | null;
        if (stored) return stored;
        if (user?.settings?.interaction?.voice?.noiseSuppression === false) return 'none';
        return 'rnnoise';
    });
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [testStream, setTestStream] = useState<MediaStream | null>(null);
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
    const [userStates, setUserStates] = useState<Map<string, any>>(new Map());
    const [localMutes, setLocalMutes] = useState<Set<string>>(new Set());
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
    const [isVideoOn, setIsVideoOn] = useState(false);
    const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
    const [inputSensitivity, setInputSensitivity] = useState(() => user?.settings?.interaction?.voice?.inputSensitivity || Number(localStorage.getItem('inputSensitivity')) || -50);
    const [isAutomaticSensitivity, setIsAutomaticSensitivity] = useState(() => user?.settings?.interaction?.voice?.isAutomaticSensitivity ?? (localStorage.getItem('isAutomaticSensitivity') !== 'false'));
    const [echoCancellation, setEchoCancellation] = useState(() => user?.settings?.interaction?.voice?.echoCancellation ?? (localStorage.getItem('echoCancellation') !== 'false'));
    const [autoGainControl, setAutoGainControl] = useState(() => user?.settings?.interaction?.voice?.autoGainControl ?? (localStorage.getItem('autoGainControl') !== 'false'));
    const [attenuation, setAttenuation] = useState(() => user?.settings?.interaction?.voice?.attenuation || Number(localStorage.getItem('attenuation')) || 0);

    const isInitialMount = useRef(true);

    // Sync from server
    useEffect(() => {
        const v = user?.settings?.interaction?.voice;
        if (v) {
            if (v.noiseSuppression !== undefined) setNoiseSuppressionModeState(v.noiseSuppression ? 'rnnoise' : 'none');
            if (v.echoCancellation !== undefined) setEchoCancellation(v.echoCancellation);
            if (v.autoGainControl !== undefined) setAutoGainControl(v.autoGainControl);
            if (v.attenuation !== undefined) setAttenuation(v.attenuation);
            if (v.inputSensitivity !== undefined) setInputSensitivity(v.inputSensitivity);
            if (v.isAutomaticSensitivity !== undefined) setIsAutomaticSensitivity(v.isAutomaticSensitivity);
        }
    }, [user?.settings?.interaction?.voice]);

    // Save to server
    const saveVoiceSettings = useCallback(async () => {
        if (!user) return;
        try {
            const { data } = await axios.put('/api/users/settings', {
                settings: {
                    interaction: {
                        voice: {
                            noiseSuppression: noiseSuppressionMode !== 'none',
                            echoCancellation,
                            autoGainControl,
                            attenuation,
                            inputSensitivity,
                            isAutomaticSensitivity
                        }
                    }
                }
            });
            updateUser({ settings: data.settings });
        } catch (err) {
            console.error('Failed to save voice settings:', err);
        }
    }, [user, updateUser, noiseSuppressionMode, echoCancellation, autoGainControl, attenuation, inputSensitivity, isAutomaticSensitivity]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        const timer = setTimeout(saveVoiceSettings, 2000);
        return () => clearTimeout(timer);
    }, [noiseSuppressionMode, echoCancellation, autoGainControl, attenuation, inputSensitivity, isAutomaticSensitivity, saveVoiceSettings]);
    const [ping, setPing] = useState(0);
    const [connectionQuality, setConnectionQuality] = useState(ConnectionQuality.Unknown);
    const [roomConnectionState, setRoomConnectionState] = useState(ConnectionState.Disconnected);

    // Sync refs
    useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);
    useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

    // Persistence
    useEffect(() => {
        localStorage.setItem('selectedInputDeviceId', selectedInputDeviceId);
        localStorage.setItem('selectedOutputDeviceId', selectedOutputDeviceId);
        localStorage.setItem('inputVolume', String(inputVolume));
        localStorage.setItem('outputVolume', String(outputVolume));
        localStorage.setItem('inputSensitivity', String(inputSensitivity));
        localStorage.setItem('isAutomaticSensitivity', String(isAutomaticSensitivity));
        localStorage.setItem('echoCancellation', String(echoCancellation));
        localStorage.setItem('autoGainControl', String(autoGainControl));
        localStorage.setItem('attenuation', String(attenuation));
    }, [selectedInputDeviceId, selectedOutputDeviceId, inputVolume, outputVolume, inputSensitivity, isAutomaticSensitivity, echoCancellation, autoGainControl, attenuation]);

    const getAudioContext = useCallback(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            soundManager.setAudioContext(audioContextRef.current);
        }
        if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume().catch(() => { });
        return audioContextRef.current;
    }, []);

    const refreshDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setInputDevices(devices.filter(d => d.kind === 'audioinput'));
            setOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
            setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
        } catch (err) { }
    }, []);

    useEffect(() => {
        refreshDevices();
        navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    }, [refreshDevices]);

    const handleLocalMicPublication = useCallback(async (publication: TrackPublication) => {
        const track = publication.track;
        if (!track || !track.mediaStreamTrack) return;
        
        const finalTrack = track.mediaStreamTrack;
        livekitTrackRef.current = finalTrack;
        finalTrack.enabled = !isMuted && !isServerMuted && !isDeafened && !isServerDeafened;

        setLocalStream(new MediaStream([finalTrack]));
        localStreamRef.current = new MediaStream([finalTrack]);

        if (vadStreamRef.current) vadStreamRef.current.getTracks().forEach(t => t.stop());
        const vadClone = finalTrack.clone();
        vadClone.enabled = true;
        vadStreamRef.current = new MediaStream([vadClone]);
    }, [isMuted, isServerMuted, isDeafened, isServerDeafened]);

    const leaveChannel = useCallback(async () => {
        if (roomRef.current) await roomRef.current.disconnect();
        roomRef.current = null;
        if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        if (vadStreamRef.current) vadStreamRef.current.getTracks().forEach(t => t.stop());
        vadStreamRef.current = null;
        
        setLocalStream(null);
        setRemoteStreams(new Map());
        setConnectedUsers([]);
        setIsConnected(false);
        setActiveChannelId(null);
        setRoomConnectionState(ConnectionState.Disconnected);
        if (socket && activeChannelIdRef.current) socket.emit('leave-voice-channel', { channelId: activeChannelIdRef.current });
        soundManager.play(SOUNDS.VOICE_LEAVE, 0.4);
    }, [socket]);

    const joinChannel = useCallback(async (channelId: string) => {
        if (isConnectedRef.current || roomRef.current) await leaveChannel();
        try {
            const { data } = await axios.get('/api/livekit/token', { params: { roomName: `channel-${channelId}`, identity: user?._id } });
            const room = new Room();
            roomRef.current = room;
            room.on(RoomEvent.ActiveSpeakersChanged, s => remoteSpeakingUsersRef.current = new Set(s.map(p => p.identity)));
            room.on(RoomEvent.TrackSubscribed, (track, pub, part) => {
                if (track.kind === Track.Kind.Audio) setRemoteStreams(prev => new Map(prev).set(part.identity, new MediaStream([track.mediaStreamTrack!])));
            });
            room.on(RoomEvent.TrackUnsubscribed, (track, pub, part) => {
                setRemoteStreams(prev => { const n = new Map(prev); n.delete(part.identity); return n; });
            });
            room.on(RoomEvent.LocalTrackPublished, pub => {
                if (pub.source === Track.Source.Microphone) handleLocalMicPublication(pub);
            });
            // Без этих подписок roomConnectionState навсегда оставался Disconnected,
            // и панель всегда показывала «Связь потеряна», даже при рабочем звонке.
            room.on(RoomEvent.ConnectionStateChanged, state => setRoomConnectionState(state));
            room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
                if (participant?.identity === room.localParticipant.identity) setConnectionQuality(quality);
            });

            await room.connect(data.serverUrl, data.token);
            setRoomConnectionState(room.state);
            await room.localParticipant.setMicrophoneEnabled(true, { deviceId: selectedInputDeviceId !== 'default' ? selectedInputDeviceId : undefined });
            
            setIsConnected(true);
            setActiveChannelId(channelId);
            if (socket) socket.emit('join-voice-channel', { channelId });
            soundManager.play(SOUNDS.VOICE_JOIN, 0.4);
        } catch (e) {
            await alert('Ошибка подключения');
        }
    }, [user?._id, selectedInputDeviceId, socket, handleLocalMicPublication, leaveChannel]);

    const startTestStream = useCallback(async () => {
        if (testStreamRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedInputDeviceId !== 'default' ? { exact: selectedInputDeviceId } : undefined } });
            testStreamRef.current = stream;
            setTestStream(stream);
        } catch (e) { }
    }, [selectedInputDeviceId]);

    const stopTestStream = useCallback(() => {
        if (testStreamRef.current) {
            testStreamRef.current.getTracks().forEach(t => t.stop());
            testStreamRef.current = null;
            setTestStream(null);
        }
    }, []);

    const toggleMute = () => setIsMuted(prev => {
        const next = !prev;
        if (livekitTrackRef.current) livekitTrackRef.current.enabled = !next && !isServerMuted && !isDeafened && !isServerDeafened;
        return next;
    });

    const toggleDeafen = () => setIsDeafened(prev => !prev);

    // Context Value (Memoized)
    const voiceContextValue = useMemo(() => ({
        isConnected, activeChannelId, joinChannel, leaveChannel, isMuted, isDeafened,
        isServerMuted, isServerDeafened, toggleMute, toggleDeafen,
        connectedUsers, localStream, remoteStreams, userVolumes: new Map(), setUserVolume: () => {},
        userStates, localMutes, toggleLocalMute: () => {}, noiseSuppressionMode, setNoiseSuppressionMode: setNoiseSuppressionModeState,
        audioContext: audioContextRef.current, inputDevices, outputDevices, videoDevices,
        selectedInputDeviceId, setSelectedInputDeviceId, selectedOutputDeviceId, setSelectedOutputDeviceId,
        selectedVideoDeviceId, setSelectedVideoDeviceId, inputVolume, setInputVolume, outputVolume, setOutputVolume,
        refreshDevices, isScreenSharing, screenStream, startScreenShare: async () => {}, stopScreenShare: () => {},
        remoteScreenStreams, isVideoOn, toggleVideo: async () => {}, localCameraStream, screenVolumes: new Map(), setScreenVolume: () => {},
        watchedScreenIds: new Set<string>(), setWatchingScreen: () => {}, inputSensitivity, setInputSensitivity,
        isAutomaticSensitivity, setIsAutomaticSensitivity, 
        echoCancellation, setEchoCancellation,
        autoGainControl, setAutoGainControl,
        attenuation, setAttenuation,
        startTestStream, stopTestStream,
        ping, connectionQuality, roomConnectionState, isOverlayEnabled: false, toggleOverlay: () => {},
        overlayPosition: 'top-left', setOverlayPosition: () => {}, overlayOpacity: 1, setOverlayOpacity: () => {},
        overlaySize: 1, setOverlaySize: () => {}, publishExternalAudioTrack: async () => null,
        publishExternalVideoTrack: async () => null, unpublishExternalAudioTrack: async () => {},
        replaceExternalTrack: async () => false, voicePresences: new Map(), presenceAudioStreams: new Map(),
        presenceVideoStreams: new Map(), sendPresenceControl: () => {}, presenceVolumes: new Map(), setPresenceVolume: () => {}
    }), [
        isConnected, activeChannelId, isMuted, isDeafened, isServerMuted, isServerDeafened,
        connectedUsers, localStream, remoteStreams, userStates, localMutes, noiseSuppressionMode,
        inputDevices, outputDevices, videoDevices, selectedInputDeviceId, selectedOutputDeviceId,
        selectedVideoDeviceId, inputVolume, outputVolume, isScreenSharing, screenStream,
        remoteScreenStreams, isVideoOn, localCameraStream, inputSensitivity, isAutomaticSensitivity,
        echoCancellation, autoGainControl, attenuation,
        ping, connectionQuality, roomConnectionState, startTestStream, stopTestStream, joinChannel, leaveChannel
    ]);

    return (
        <VoiceContext.Provider value={voiceContextValue}>
            <RemoteAudioRenderer
                streams={remoteStreams}
                muted={isDeafened || isServerDeafened}
                volume={outputVolume ?? 1}
                sinkId={selectedOutputDeviceId !== 'default' ? selectedOutputDeviceId : undefined}
            />
            <VoiceLevelProvider
                testStream={testStream}
                vadStream={vadStreamRef.current}
                user={user}
                isConnected={isConnected}
                isMuted={isMuted}
                isServerMuted={isServerMuted}
                inputSensitivity={inputSensitivity}
                isAutomaticSensitivity={isAutomaticSensitivity}
                userStates={userStates}
                remoteSpeakingUsersRef={remoteSpeakingUsersRef}
                getAudioContext={getAudioContext}
                roomRef={roomRef}
            >
                {children}
            </VoiceLevelProvider>
        </VoiceContext.Provider>
    );
};
