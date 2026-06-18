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

// Шлёт состав голосового канала и кто говорит в окно оверлея (Electron).
// Без этого оверлей получал пустой список участников и показывал только заставку
// «Zvon Оверлей запущен». Монтируется внутри обоих провайдеров (см. VoiceProvider).
const OverlaySync: React.FC = () => {
    const { isConnected, connectedUsers, userStates, isMuted, isDeafened } = useVoice();
    const { speakingUsers } = useVoiceLevels();
    const { user } = useAuth();

    useEffect(() => {
        const electron = (window as any).electron;
        if (!electron?.ipc) return;
        if (!isConnected) {
            electron.ipc.send('update-overlay-data', { users: [] });
            return;
        }
        const users: any[] = [];
        // Себя добавляем всегда: сервер в voice-existing-users присылает только тех,
        // кто был в канале ДО нас, поэтому в connectedUsers нас нет.
        if (user) {
            users.push({
                id: user._id,
                username: user.displayName || user.username,
                avatar: getAvatarUrl(user.avatar),
                isSpeaking: speakingUsers.has(String(user._id)),
                isMuted,
                isDeafened,
            });
        }
        (connectedUsers || []).forEach((u: any) => {
            if (String(u._id) === String(user?._id)) return; // не дублируем себя
            const st = userStates.get(String(u._id));
            users.push({
                id: u._id,
                username: u.nickname || u.username,
                avatar: getAvatarUrl(u.avatar),
                isSpeaking: speakingUsers.has(String(u._id)),
                isMuted: !!(st?.isMuted || st?.isServerMuted),
                isDeafened: !!(st?.isDeafened || st?.isServerDeafened),
            });
        });
        electron.ipc.send('update-overlay-data', { users });
    }, [isConnected, connectedUsers, userStates, speakingUsers, isMuted, isDeafened, user?._id]);

    return null;
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
// Проигрывание удалённого аудио через WebAudio GainNode — это позволяет усиление
// выше 100% (до 200%+), чего нельзя сделать через <audio>.volume (он ограничен 1.0).
// Граф: stream → GainNode → MediaStreamDestination → <audio> (для выбора устройства
// вывода через setSinkId). Плюс скрытый muted <audio> с исходным потоком —
// обходим баг Chromium, когда createMediaStreamSource от удалённого WebRTC молчит.
const RemoteAudioElement: React.FC<{
    stream: MediaStream; muted: boolean; volume: number; sinkId?: string;
}> = ({ stream, muted, volume, sinkId }) => {
    const ref = useRef<HTMLAudioElement>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const keepAliveRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el || !stream) return;
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx: AudioContext = new Ctx();
        ctxRef.current = ctx;

        // keep-alive: держит WebRTC-поток «живым» для createMediaStreamSource.
        const keepAlive = new Audio();
        keepAlive.srcObject = stream;
        keepAlive.muted = true;
        keepAlive.play().catch(() => {});
        keepAliveRef.current = keepAlive;

        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        const dest = ctx.createMediaStreamDestination();
        source.connect(gain);
        gain.connect(dest);
        gainRef.current = gain;

        el.srcObject = dest.stream;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const tryPlay = () => el.play().catch(() => {
            const retry = () => { ctx.resume().catch(() => {}); el.play().catch(() => {}); document.removeEventListener('click', retry); };
            document.addEventListener('click', retry, { once: true });
        });
        tryPlay();

        return () => {
            try { source.disconnect(); gain.disconnect(); } catch {}
            try { keepAlive.pause(); keepAlive.srcObject = null; } catch {}
            gainRef.current = null;
            ctx.close().catch(() => {});
        };
    }, [stream]);

    // Усиление: gain 0..2+ (muted → 0). Верхний предел с запасом, чтобы не «резать» 200%.
    useEffect(() => {
        if (gainRef.current) gainRef.current.gain.value = muted ? 0 : Math.min(Math.max(volume, 0), 5);
    }, [muted, volume]);

    useEffect(() => {
        const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
        if (el && sinkId && typeof el.setSinkId === 'function') el.setSinkId(sinkId).catch(() => {});
    }, [sinkId]);

    return <audio ref={ref} autoPlay playsInline />;
};

const RemoteAudioRenderer: React.FC<{
    streams: Map<string, MediaStream>;
    deafened: boolean;
    outputVolume: number;
    userVolumes: Map<string, number>;
    localMutes: Set<string>;
    sinkId?: string;
}> = ({ streams, deafened, outputVolume, userVolumes, localMutes, sinkId }) => (
    <>
        {Array.from(streams.entries()).map(([uid, stream]) => (
            <RemoteAudioElement
                key={uid}
                stream={stream}
                muted={deafened || localMutes.has(uid)}
                volume={outputVolume * (userVolumes.get(uid) ?? 1)}
                sinkId={sinkId}
            />
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
    const screenStreamRef = useRef<MediaStream | null>(null);
    // Аудио-трек демонстрации (звук приложения через нативный драйвер, только Electron).
    const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);

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
    // Персональная громкость участников (0..2, 1 = 100%), сохраняется между сессиями.
    const [userVolumes, setUserVolumesState] = useState<Map<string, number>>(() => {
        try { const s = localStorage.getItem('userVolumes'); if (s) return new Map(Object.entries(JSON.parse(s)) as [string, number][]); } catch { /* ignore */ }
        return new Map();
    });
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
    // Кого из стримеров мы сейчас смотрим, и громкость их трансляций.
    const [watchedScreenIds, setWatchedScreenIds] = useState<Set<string>>(new Set());
    const [screenVolumes, setScreenVolumes] = useState<Map<string, number>>(new Map());
    const [isVideoOn, setIsVideoOn] = useState(false);
    const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
    const [inputSensitivity, setInputSensitivity] = useState(() => user?.settings?.interaction?.voice?.inputSensitivity || Number(localStorage.getItem('inputSensitivity')) || -50);
    const [isAutomaticSensitivity, setIsAutomaticSensitivity] = useState(() => user?.settings?.interaction?.voice?.isAutomaticSensitivity ?? (localStorage.getItem('isAutomaticSensitivity') !== 'false'));
    const [echoCancellation, setEchoCancellation] = useState(() => user?.settings?.interaction?.voice?.echoCancellation ?? (localStorage.getItem('echoCancellation') !== 'false'));
    const [autoGainControl, setAutoGainControl] = useState(() => user?.settings?.interaction?.voice?.autoGainControl ?? (localStorage.getItem('autoGainControl') !== 'false'));
    const [attenuation, setAttenuation] = useState(() => user?.settings?.interaction?.voice?.attenuation || Number(localStorage.getItem('attenuation')) || 0);

    const isInitialMount = useRef(true);
    // Стабильная сериализация голосовых настроек (фиксированный порядок ключей)
    // для сравнения «что уже синхронизировано с сервером».
    const serializeVoice = (v: any): string => JSON.stringify({
        noiseSuppression: v?.noiseSuppression,
        echoCancellation: v?.echoCancellation,
        autoGainControl: v?.autoGainControl,
        attenuation: v?.attenuation,
        inputSensitivity: v?.inputSensitivity,
        isAutomaticSensitivity: v?.isAutomaticSensitivity,
    });
    // Снимок настроек, уже синхронизированных с сервером. Разрывает петлю
    // save → updateUser → sync-эффект → setState → save → …
    const lastSyncedRef = useRef<string>(serializeVoice({
        noiseSuppression: noiseSuppressionMode !== 'none',
        echoCancellation, autoGainControl, attenuation, inputSensitivity, isAutomaticSensitivity,
    }));

    // Sync from server
    useEffect(() => {
        const v = user?.settings?.interaction?.voice;
        if (!v) return;
        const serialized = serializeVoice(v);
        if (serialized === lastSyncedRef.current) return; // ничего нового — не трогаем state
        lastSyncedRef.current = serialized;
        // noiseSuppression на сервере — это boolean (вкл/выкл); конкретный режим
        // ('standard'/'rnnoise'/'deepfilter') хранится локально, поэтому НЕ затираем его,
        // а только переключаем on/off — иначе режим скачет и провоцирует пересохранение.
        if (v.noiseSuppression !== undefined) {
            setNoiseSuppressionModeState(prev => v.noiseSuppression ? (prev === 'none' ? 'rnnoise' : prev) : 'none');
        }
        if (v.echoCancellation !== undefined) setEchoCancellation(v.echoCancellation);
        if (v.autoGainControl !== undefined) setAutoGainControl(v.autoGainControl);
        if (v.attenuation !== undefined) setAttenuation(v.attenuation);
        if (v.inputSensitivity !== undefined) setInputSensitivity(v.inputSensitivity);
        if (v.isAutomaticSensitivity !== undefined) setIsAutomaticSensitivity(v.isAutomaticSensitivity);
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
            lastSyncedRef.current = serializeVoice(data?.settings?.interaction?.voice);
            updateUser({ settings: data.settings });
        } catch (err) {
            console.error('Failed to save voice settings:', err);
        }
    }, [user, updateUser, noiseSuppressionMode, echoCancellation, autoGainControl, attenuation, inputSensitivity, isAutomaticSensitivity]);

    // Держим актуальную ссылку на saveVoiceSettings в ref, чтобы её пересоздание
    // (после updateUser) не перезапускало эффект-дебаунсер.
    const saveVoiceSettingsRef = useRef(saveVoiceSettings);
    useEffect(() => { saveVoiceSettingsRef.current = saveVoiceSettings; }, [saveVoiceSettings]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        const current = serializeVoice({
            noiseSuppression: noiseSuppressionMode !== 'none',
            echoCancellation, autoGainControl, attenuation, inputSensitivity, isAutomaticSensitivity,
        });
        if (current === lastSyncedRef.current) return; // уже синхронизировано — не шлём
        const timer = setTimeout(() => {
            lastSyncedRef.current = current;
            saveVoiceSettingsRef.current();
        }, 2000);
        return () => clearTimeout(timer);
    }, [noiseSuppressionMode, echoCancellation, autoGainControl, attenuation, inputSensitivity, isAutomaticSensitivity]);
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
        setRemoteScreenStreams(new Map());
        setConnectedUsers([]);
        setUserStates(new Map());
        setWatchedScreenIds(new Set());
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
                const mst = track.mediaStreamTrack;
                if (!mst) return;
                // Видео И ЗВУК демонстрации — в отдельную карту, чтобы звук стрима
                // не играл сам по себе через общий аудио-рендерер, а только когда
                // зритель смотрит трансляцию (через её <video>). Микрофон/камера — в общий поток.
                const isScreen = pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
                const setter = isScreen ? setRemoteScreenStreams : setRemoteStreams;
                setter(prev => {
                    const next = new Map(prev);
                    const existing = next.get(part.identity);
                    const tracks = existing ? existing.getTracks().filter(t => t.id !== mst.id) : [];
                    tracks.push(mst);
                    next.set(part.identity, new MediaStream(tracks));
                    return next;
                });
            });
            room.on(RoomEvent.TrackUnsubscribed, (track, pub, part) => {
                const mst = track.mediaStreamTrack;
                const isScreen = pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
                const setter = isScreen ? setRemoteScreenStreams : setRemoteStreams;
                setter(prev => {
                    const next = new Map(prev);
                    const existing = next.get(part.identity);
                    if (existing) {
                        const remaining = existing.getTracks().filter(t => t.id !== mst?.id);
                        if (remaining.length === 0) next.delete(part.identity);
                        else next.set(part.identity, new MediaStream(remaining));
                    }
                    return next;
                });
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

    // Сообщаем серверу/другим участникам своё состояние (мьют/деаф/экран/видео).
    const emitVoiceState = useCallback((overrides: Partial<{ isMuted: boolean; isDeafened: boolean; isScreenSharing: boolean; isVideoOn: boolean }> = {}) => {
        if (socket && activeChannelIdRef.current) {
            socket.emit('voice-state-update', {
                channelId: activeChannelIdRef.current,
                isMuted, isDeafened, isScreenSharing, isVideoOn,
                ...overrides
            });
        }
    }, [socket, isMuted, isDeafened, isScreenSharing, isVideoOn]);

    // Камера в голосовом канале: публикуем/снимаем видеотрек через LiveKit и
    // отдаём локальный поток для собственной плитки. Раньше было заглушкой.
    const toggleVideo = useCallback(async () => {
        if (!roomRef.current) { console.warn('[Voice] toggleVideo: нет активного подключения'); return; }
        const next = !isVideoOn;
        try {
            await roomRef.current.localParticipant.setCameraEnabled(
                next,
                selectedVideoDeviceId && selectedVideoDeviceId !== 'default' ? { deviceId: selectedVideoDeviceId } : undefined
            );
            if (next) {
                const pub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
                const mst = pub?.track?.mediaStreamTrack;
                setLocalCameraStream(mst ? new MediaStream([mst]) : null);
            } else {
                setLocalCameraStream(null);
            }
            setIsVideoOn(next);
            emitVoiceState({ isVideoOn: next });
        } catch (e) {
            console.error('[Voice] toggleVideo failed:', e);
            await alert('Не удалось переключить камеру: ' + (e as Error).message);
        }
    }, [isVideoOn, selectedVideoDeviceId, emitVoiceState]);

    const startScreenShare = useCallback(async (sourceId: string, options?: any) => {
        if (!roomRef.current) { console.warn('[Voice] startScreenShare: нет активного подключения'); return; }
        const isElectron = !!(window as any).electron;
        // В Electron нужен выбранный источник; в вебе источник выбирается нативным пикером.
        if (isElectron && !sourceId) { console.warn('[Voice] startScreenShare: не выбран источник'); return; }
        try {
            console.log('[Voice] Запуск трансляции экрана, источник:', sourceId || '(web picker)');
            const frameRate = parseInt(options?.frameRate || '30', 10);
            const resolution = options?.resolution || '1080';
            let bitrate = 10_000_000;
            if (resolution === '2160') bitrate = frameRate >= 60 ? 60_000_000 : 40_000_000;
            else if (resolution === '1440') bitrate = frameRate >= 60 ? 25_000_000 : 18_000_000;
            else if (resolution === '1080') bitrate = frameRate >= 60 ? 15_000_000 : 10_000_000;
            else if (resolution === '720') bitrate = frameRate >= 60 ? 8_000_000 : 5_000_000;

            let stream: MediaStream;
            if (isElectron && sourceId) {
                // Electron: захват конкретного источника через desktopCapturer sourceId.
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxFrameRate: frameRate } } as any
                } as any);
            } else {
                // Веб: нативный системный пикер браузера. Звук экрана/вкладки — через getDisplayMedia.
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: { ideal: frameRate } },
                    audio: !!options?.withAudio
                });
            }
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && roomRef.current) {
                (videoTrack as any).contentHint = frameRate >= 60 ? 'motion' : 'detail';
                await roomRef.current.localParticipant.publishTrack(videoTrack, {
                    source: Track.Source.ScreenShare,
                    videoCodec: options?.videoCodec || 'vp9',
                    simulcast: false,
                    degradationPreference: 'maintain-resolution',
                    videoEncoding: { maxBitrate: bitrate, maxFramerate: frameRate }
                });
                // Когда пользователь жмёт системную «Stop sharing» — корректно завершаем.
                videoTrack.addEventListener('ended', () => { stopScreenShareRef.current(); });
            }
            screenStreamRef.current = stream;

            // Звук демонстрации.
            if (isElectron) {
                // Electron: звук приложения через нативный C++ драйвер (WASAPI process-loopback).
                if (options?.withAudio && roomRef.current) {
                    try {
                        console.log('[Voice] Захват звука демонстрации через нативный драйвер…');
                        const audioStream = await nativeAudioManager.startcapture(sourceId);
                        const screenAudioTrack = audioStream.getAudioTracks()[0];
                        if (screenAudioTrack) {
                            // Звук стрима НЕ зависит от мьюта/деафа микрофона — держим трек
                            // всегда включённым; кнопки микрофона трогают только livekitTrackRef.
                            screenAudioTrack.enabled = true;
                            screenAudioTrackRef.current = screenAudioTrack;
                            await roomRef.current.localParticipant.publishTrack(screenAudioTrack, {
                                source: Track.Source.ScreenShareAudio,
                                dtx: false,
                                red: false
                            });
                            console.log('[Voice] Звук демонстрации опубликован');
                        } else {
                            console.warn('[Voice] Нативный драйвер не вернул аудио-трек');
                        }
                    } catch (audioErr) {
                        console.error('[Voice] Не удалось захватить звук демонстрации:', audioErr);
                        // Видео уже идёт — не валим всю трансляцию из-за звука.
                    }
                }
            } else {
                // Веб: звук экрана/вкладки уже в потоке getDisplayMedia (если пользователь его дал).
                const webAudioTrack = stream.getAudioTracks()[0];
                if (webAudioTrack && roomRef.current) {
                    try {
                        webAudioTrack.enabled = true;
                        screenAudioTrackRef.current = webAudioTrack;
                        await roomRef.current.localParticipant.publishTrack(webAudioTrack, {
                            source: Track.Source.ScreenShareAudio,
                            dtx: false,
                            red: false
                        });
                        console.log('[Voice] Звук демонстрации (web) опубликован');
                    } catch (audioErr) {
                        console.error('[Voice] Не удалось опубликовать звук демонстрации (web):', audioErr);
                    }
                }
            }

            setScreenStream(stream);
            setIsScreenSharing(true);
            soundManager.play(SOUNDS.SCREENSHARE_ON, 0.4);
            emitVoiceState({ isScreenSharing: true });
            console.log('[Voice] Трансляция экрана запущена');
        } catch (e) {
            console.error('[Voice] Ошибка запуска трансляции экрана:', e);
            await alert('Не удалось начать трансляцию: ' + (e as Error).message);
        }
    }, [emitVoiceState]);

    const stopScreenShare = useCallback(async () => {
        // Звук демонстрации: останавливаем нативный захват и снимаем трек с публикации.
        if (screenAudioTrackRef.current) {
            try { if (roomRef.current) await roomRef.current.localParticipant.unpublishTrack(screenAudioTrackRef.current); } catch (e) { console.warn('[Voice] unpublish screen audio failed:', e); }
            try { screenAudioTrackRef.current.stop(); } catch {}
            screenAudioTrackRef.current = null;
        }
        try { nativeAudioManager.stopCapture(); } catch (e) { console.warn('[Voice] nativeAudio stopCapture failed:', e); }

        try {
            if (roomRef.current) await roomRef.current.localParticipant.setScreenShareEnabled(false);
        } catch (e) { console.warn('[Voice] setScreenShareEnabled(false) failed:', e); }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
        }
        setScreenStream(null);
        setIsScreenSharing(false);
        soundManager.play(SOUNDS.SCREENSHARE_OFF, 0.4);
        emitVoiceState({ isScreenSharing: false });
    }, [emitVoiceState]);

    // Стабильная ссылка на stopScreenShare для обработчика 'ended' внутри start.
    const stopScreenShareRef = useRef(stopScreenShare);
    useEffect(() => { stopScreenShareRef.current = stopScreenShare; }, [stopScreenShare]);

    // Смотрящая сторона: включить/выключить просмотр чужой трансляции.
    // Поток уже приходит в remoteScreenStreams (авто-подписка), здесь только
    // переключаем флаг отображения — раньше это была заглушка и кнопка «Смотреть» не работала.
    const setWatchingScreen = useCallback((uId: string, watching: boolean) => {
        setWatchedScreenIds(prev => {
            const next = new Set(prev);
            if (watching) next.add(uId); else next.delete(uId);
            return next;
        });
    }, []);

    const setScreenVolume = useCallback((uId: string, volume: number) => {
        setScreenVolumes(prev => new Map(prev).set(uId, volume));
    }, []);

    // Персональная громкость участника (применяется в RemoteAudioRenderer).
    const setUserVolume = useCallback((uId: string, volume: number) => {
        setUserVolumesState(prev => {
            const next = new Map(prev).set(uId, volume);
            try { localStorage.setItem('userVolumes', JSON.stringify(Object.fromEntries(next))); } catch { /* ignore */ }
            return next;
        });
    }, []);

    // Локальный мьют участника (только для себя) — RemoteAudioRenderer глушит его поток.
    const toggleLocalMute = useCallback((uId: string) => {
        setLocalMutes(prev => {
            const next = new Set(prev);
            if (next.has(uId)) next.delete(uId); else next.add(uId);
            return next;
        });
    }, []);

    // Если стример прекратил трансляцию — убираем его из «смотрим».
    useEffect(() => {
        setWatchedScreenIds(prev => {
            if (prev.size === 0) return prev;
            let changed = false;
            const next = new Set(prev);
            for (const id of prev) {
                if (!remoteScreenStreams.has(id)) { next.delete(id); changed = true; }
            }
            return changed ? next : prev;
        });
    }, [remoteScreenStreams]);

    // Состояния других участников (мьют/деаф/демонстрация/видео) — чтобы у них
    // корректно отображались индикаторы и плитка трансляции.
    useEffect(() => {
        if (!socket) return;
        const onUserState = (data: any) => {
            if (!data?.userId) return;
            setUserStates(prev => {
                const next = new Map(prev);
                next.set(String(data.userId), {
                    isMuted: !!data.isMuted,
                    isDeafened: !!data.isDeafened,
                    isScreenSharing: !!data.isScreenSharing,
                    isVideoOn: !!data.isVideoOn,
                    isServerMuted: !!data.isServerMuted,
                    isServerDeafened: !!data.isServerDeafened
                });
                return next;
            });
        };
        socket.on('voice-user-state-update', onUserState);
        return () => { socket.off('voice-user-state-update', onUserState); };
    }, [socket]);

    // Список участников канала и их НАЧАЛЬНЫЕ состояния. Сервер шлёт это при входе
    // (voice-existing-users) и при появлении/уходе других — без этого зашедший в
    // канал не видел ни участников, ни их мьют/деаф/трансляцию, пока те не переключат.
    useEffect(() => {
        if (!socket) return;
        const toState = (u: any) => ({
            isMuted: !!u?.isMuted, isDeafened: !!u?.isDeafened,
            isScreenSharing: !!u?.isScreenSharing, isVideoOn: !!u?.isVideoOn,
            isServerMuted: !!u?.isServerMuted, isServerDeafened: !!u?.isServerDeafened
        });
        const onExisting = (users: any[]) => {
            if (!Array.isArray(users)) return;
            setConnectedUsers(users as any);
            setUserStates(prev => {
                const next = new Map(prev);
                users.forEach(u => { if (u?._id) next.set(String(u._id), toState(u)); });
                return next;
            });
        };
        const onJoined = (data: any) => {
            const uid = data?.userId; const u = data?.user;
            if (!uid) return;
            if (u) setConnectedUsers(prev => prev.some((p: any) => String(p._id) === String(uid)) ? prev : [...prev, u]);
            setUserStates(prev => new Map(prev).set(String(uid), toState(u || data)));
        };
        const onLeft = (data: any) => {
            const uid = data?.userId;
            if (!uid) return;
            setConnectedUsers(prev => prev.filter((p: any) => String(p._id) !== String(uid)));
            setUserStates(prev => { const n = new Map(prev); n.delete(String(uid)); return n; });
            setRemoteStreams(prev => { const n = new Map(prev); n.delete(uid); return n; });
            setRemoteScreenStreams(prev => { const n = new Map(prev); n.delete(uid); return n; });
        };
        socket.on('voice-existing-users', onExisting);
        socket.on('voice-user-joined', onJoined);
        socket.on('voice-user-left', onLeft);
        return () => {
            socket.off('voice-existing-users', onExisting);
            socket.off('voice-user-joined', onJoined);
            socket.off('voice-user-left', onLeft);
        };
    }, [socket]);

    // Context Value (Memoized)
    const voiceContextValue = useMemo(() => ({
        isConnected, activeChannelId, joinChannel, leaveChannel, isMuted, isDeafened,
        isServerMuted, isServerDeafened, toggleMute, toggleDeafen,
        connectedUsers, localStream, remoteStreams, userVolumes, setUserVolume,
        userStates, localMutes, toggleLocalMute, noiseSuppressionMode, setNoiseSuppressionMode: setNoiseSuppressionModeState,
        audioContext: audioContextRef.current, inputDevices, outputDevices, videoDevices,
        selectedInputDeviceId, setSelectedInputDeviceId, selectedOutputDeviceId, setSelectedOutputDeviceId,
        selectedVideoDeviceId, setSelectedVideoDeviceId, inputVolume, setInputVolume, outputVolume, setOutputVolume,
        refreshDevices, isScreenSharing, screenStream, startScreenShare, stopScreenShare,
        remoteScreenStreams, isVideoOn, toggleVideo, localCameraStream, screenVolumes, setScreenVolume,
        watchedScreenIds, setWatchingScreen, inputSensitivity, setInputSensitivity,
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
        ping, connectionQuality, roomConnectionState, startTestStream, stopTestStream, joinChannel, leaveChannel,
        startScreenShare, stopScreenShare, watchedScreenIds, screenVolumes, setWatchingScreen, setScreenVolume,
        userVolumes, setUserVolume, toggleLocalMute, toggleVideo, localCameraStream
    ]);

    return (
        <VoiceContext.Provider value={voiceContextValue}>
            <RemoteAudioRenderer
                streams={remoteStreams}
                deafened={isDeafened || isServerDeafened}
                outputVolume={outputVolume ?? 1}
                userVolumes={userVolumes}
                localMutes={localMutes}
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
                <OverlaySync />
                {children}
            </VoiceLevelProvider>
        </VoiceContext.Provider>
    );
};
