import { useEffect, useRef } from 'react';
import { User } from '../types';
import { useSocket } from '../contexts/SocketContext';
import { useNotifications } from '../contexts/NotificationContext';

const INVITATIONS = [
    'Может, вместе?)',
    'Самое время составить компанию!)',
    'Похоже, пора собирать команду)',
    'Присоединишься к игре?)',
];

function gameName(user: Partial<User>): string | null {
    const activity = user.activity;
    if (user.status === 'offline' || activity?.type !== 'playing' || activity.miniAppData) return null;
    return activity.name?.trim() || null;
}

export function useFriendGameNotifications(friends: User[], onOpenProfile: (id: string) => void) {
    const { socket } = useSocket();
    const { addNotification } = useNotifications();
    const friendsRef = useRef(friends);
    const openProfileRef = useRef(onOpenProfile);
    const games = useRef(new Map<string, string | null>());
    const lastNotice = useRef(new Map<string, { game: string; at: number }>());
    friendsRef.current = friends;
    openProfileRef.current = onOpenProfile;

    useEffect(() => {
        const ids = new Set(friends.map(friend => friend._id));
        for (const friend of friends) {
            if (!games.current.has(friend._id)) games.current.set(friend._id, gameName(friend));
        }
        for (const id of games.current.keys()) {
            if (!ids.has(id)) {
                games.current.delete(id);
                lastNotice.current.delete(id);
            }
        }
    }, [friends]);

    useEffect(() => {
        if (!socket) return;
        const update = (patch: Partial<User> & { _id: string }) => {
            if (!Object.prototype.hasOwnProperty.call(patch, 'activity')) return;
            const friend = friendsRef.current.find(item => item._id === patch._id);
            if (!friend) return;
            const next = { ...friend, ...patch };
            const game = gameName(next);
            const previous = games.current.get(friend._id);
            games.current.set(friend._id, game);
            if (!game || previous === game) return;

            const recent = lastNotice.current.get(friend._id);
            const now = Date.now();
            if (recent?.game === game && now - recent.at < 5 * 60 * 1000) return;
            lastNotice.current.set(friend._id, { game, at: now });
            const name = next.displayName || next.username;
            addNotification({
                type: 'game',
                title: game,
                content: `${name} играет в ${game}. ${INVITATIONS[Math.floor(Math.random() * INVITATIONS.length)]}`,
                avatar: next.activity?.assets?.largeImage,
                duration: 60000,
                onClick: () => openProfileRef.current(friend._id),
            });
        };
        const reconnect = () => {
            games.current = new Map(friendsRef.current.map(friend => [friend._id, gameName(friend)]));
        };
        socket.on('user-updated', update);
        socket.on('connect', reconnect);
        return () => {
            socket.off('user-updated', update);
            socket.off('connect', reconnect);
        };
    }, [socket, addNotification]);
}
