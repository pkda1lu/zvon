import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { User } from '../types';

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
    localStream: MediaStream | null; // For visualization
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

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const [connectedUsers, setConnectedUsers] = useState<User[]>([]);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

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
                audio: true,
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

        socket.on('voice-existing-users', handleExistingUsers);
        socket.on('voice-user-joined', handleUserJoined);
        socket.on('voice-user-left', handleUserLeft);
        socket.on('voice-offer', handleOffer);
        socket.on('voice-answer', handleAnswer);
        socket.on('voice-ice-candidate', handleCandidate);

        socket.emit('join-voice-channel', { channelId: activeChannelId });

        return () => {
            socket.off('voice-existing-users', handleExistingUsers);
            socket.off('voice-user-joined', handleUserJoined);
            socket.off('voice-user-left', handleUserLeft);
            socket.off('voice-offer', handleOffer);
            socket.off('voice-answer', handleAnswer);
            socket.off('voice-ice-candidate', handleCandidate);
        };
    }, [socket, isConnected, activeChannelId, createPeer, user]);

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    const toggleDeafen = () => {
        setIsDeafened(!isDeafened);
    };

    useEffect(() => {
        if (localStreamRef.current) {
            const audioTrackEnabled = !isMuted && !isDeafened;
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = audioTrackEnabled;
            });
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
            connectedUsers,
            localStream
        }}>
            {children}
            {/* Hidden Audio Elements for Remote Streams */}
            <div style={{ display: 'none' }}>
                {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
                    <audio
                        key={userId}
                        ref={el => {
                            if (el && el.srcObject !== stream) {
                                el.srcObject = stream;
                                el.play().catch(e => console.error('Error playing audio:', e));
                            }
                        }}
                        autoPlay
                        playsInline
                        muted={isDeafened}
                    />
                ))}
            </div>
        </VoiceContext.Provider>
    );
};
