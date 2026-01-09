import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';
import { setupNoiseSuppression } from '../utils/audioProcessing';
import { SOUNDS, soundManager } from '../utils/sounds';

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

    useEffect(() => {
        if (!stream || !sharedContext) return;

        if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.muted = true;
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

            const finalVolume = (isDeafened || isLocalMuted) ? 0 : (voiceVolume * 1.5 * masterVolume);
            gainNodeRef.current.gain.value = finalVolume;

            source.connect(gainNodeRef.current);
        } catch (err) { }

        return () => {
            if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
        };
    }, [stream, userId, sharedContext, isDeafened, isLocalMuted, voiceVolume, masterVolume]);

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
    connectedUsers: User[];
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    userVolumes: Map<string, number>;
    setUserVolume: (userId: string, volume: number) => void;
    userStates: Map<string, { isMuted: boolean; isDeafened: boolean }>;
    localMutes: Set<string>;
    toggleLocalMute: (userId: string) => void;
    speakingUsers: Set<string>;
    isNoiseSuppressionEnabled: boolean;
    toggleNoiseSuppression: () => void;
    audioContext: AudioContext | null;
    inputDevices: MediaDeviceInfo[];
    outputDevices: MediaDeviceInfo[];
    selectedInputDeviceId: string;
    setSelectedInputDeviceId: (id: string) => void;
    selectedOutputDeviceId: string;
    setSelectedOutputDeviceId: (id: string) => void;
    inputVolume: number;
    setInputVolume: (val: number) => void;
    outputVolume: number;
    setOutputVolume: (val: number) => void;
    refreshDevices: () => Promise<void>;
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

    const [selectedInputDeviceId, setSelectedInputDeviceId] = useState(() => localStorage.getItem('selectedInputDeviceId') || 'default');
    const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(() => localStorage.getItem('selectedOutputDeviceId') || 'default');

    const [inputVolume, setInputVolume] = useState(() => Number(localStorage.getItem('inputVolume')) || 1.0);
    const [outputVolume, setOutputVolume] = useState(() => Number(localStorage.getItem('outputVolume')) || 1.0);

    const [connectedUsers, setConnectedUsers] = useState<User[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [userVolumes, setUserVolumes] = useState<Map<string, number>>(new Map());
    const [userStates, setUserStates] = useState<Map<string, { isMuted: boolean; isDeafened: boolean }>>(new Map());
    const [localMutes, setLocalMutes] = useState<Set<string>>(new Set());
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
    const speakingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const audioContextRef = useRef<AudioContext | null>(null);

    useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

    useEffect(() => {
        localStorage.setItem('selectedInputDeviceId', selectedInputDeviceId);
        localStorage.setItem('selectedOutputDeviceId', selectedOutputDeviceId);
        localStorage.setItem('inputVolume', String(inputVolume));
        localStorage.setItem('outputVolume', String(outputVolume));
    }, [selectedInputDeviceId, selectedOutputDeviceId, inputVolume, outputVolume]);

    const refreshDevices = useCallback(async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            setInputDevices(devices.filter(d => d.kind === 'audioinput'));
            setOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
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
        setRemoteStreams(prev => new Map(prev).set(userId, stream));
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

        pc.ontrack = (event) => handleTrack(targetUserId, event.streams[0]);
        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('voice-ice-candidate', { targetUserId, candidate: event.candidate });
            }
        };

        if (initiator) {
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    if (socket) socket.emit('voice-offer', { targetUserId, offer: pc.localDescription });
                })
                .catch(() => { });
        }
        return pc;
    }, [socket, handleTrack]);

    const leaveChannel = useCallback(() => {
        if (!activeChannelId) return;
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
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
        soundManager.play(SOUNDS.VOICE_LEAVE, 0.4);
    }, [socket, activeChannelId]);

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
            let streamToUse = stream;
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

        const handleExistingUsers = (users: User[]) => {
            const others = users.filter(u => u._id !== user?._id);
            setConnectedUsers(others);
            others.forEach(u => createPeer(u._id, true));
        };

        const handleUserJoined = (data: { userId: string; user: any }) => {
            if (data.userId === user?._id) return;
            setConnectedUsers(prev => prev.find(u => u._id === data.user._id) ? prev : [...prev, data.user]);
            if (data.user.isMuted !== undefined) {
                setUserStates(prev => new Map(prev).set(data.userId, { isMuted: data.user.isMuted, isDeafened: data.user.isDeafened }));
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

        const handleUserStateUpdate = (data: { userId: string; isMuted: boolean; isDeafened: boolean }) => {
            setUserStates(prev => new Map(prev).set(data.userId, { isMuted: data.isMuted, isDeafened: data.isDeafened }));
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
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted: newMuted, isDeafened, isScreenSharing: false });
        }
    };

    const toggleDeafen = () => {
        const newDeafened = !isDeafened;
        setIsDeafened(newDeafened);
        if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !isMuted && !newDeafened);
        if (socket && activeChannelId) {
            socket.emit('voice-state-update', { channelId: activeChannelId, isMuted, isDeafened: newDeafened, isScreenSharing: false });
        }
    };

    const toggleNoiseSuppression = useCallback(async () => {
        const newState = !isNoiseSuppressionEnabled;
        setIsNoiseSuppressionEnabled(newState);
        localStorage.setItem('noiseSuppression', String(newState));
        if (isConnectedRef.current && rawMicStreamRef.current) {
            let newStream = rawMicStreamRef.current;
            if (newState) {
                try {
                    newStream = await setupNoiseSuppression(getAudioContext(), rawMicStreamRef.current);
                } catch (e) { }
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

    useEffect(() => {
        if (!isConnected) {
            analysersRef.current.clear();
            setSpeakingUsers(new Set());
            return;
        }
        const audioCtx = getAudioContext();
        const interval = setInterval(() => {
            const nowSpeaking = new Set<string>();
            const threshold = 0.015;
            analysersRef.current.forEach((analyser, userId) => {
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteTimeDomainData(dataArray);
                let sumOfSquares = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sumOfSquares += normalized * normalized;
                }
                if (Math.sqrt(sumOfSquares / dataArray.length) > threshold) nowSpeaking.add(userId);
            });
            setSpeakingUsers(prev => {
                const newSet = new Set(nowSpeaking);
                return newSet;
            });
        }, 100);

        const updateAnalysers = () => {
            analysersRef.current.clear();
            if (localStream && user?._id && !isMuted) {
                try {
                    const source = audioCtx.createMediaStreamSource(localStream);
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

    return (
        <VoiceContext.Provider value={{
            isConnected, activeChannelId, joinChannel, leaveChannel, isMuted, isDeafened, toggleMute, toggleDeafen,
            connectedUsers, localStream, remoteStreams, userVolumes, setUserVolume, userStates, localMutes,
            toggleLocalMute, speakingUsers, isNoiseSuppressionEnabled, toggleNoiseSuppression, audioContext,
            inputDevices, outputDevices, selectedInputDeviceId, setSelectedInputDeviceId, selectedOutputDeviceId,
            setSelectedOutputDeviceId, inputVolume, setInputVolume, outputVolume, setOutputVolume, refreshDevices
        }}>
            {children}
            <div style={{ display: 'none' }}>
                {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
                    <RemoteAudio
                        key={userId} userId={userId} stream={stream}
                        voiceVolume={userVolumes.get(userId) ?? 1} isDeafened={isDeafened}
                        isLocalMuted={localMutes.has(userId)} sharedContext={audioContext}
                        outputDeviceId={selectedOutputDeviceId} masterVolume={outputVolume}
                    />
                ))}
            </div>
        </VoiceContext.Provider>
    );
};
