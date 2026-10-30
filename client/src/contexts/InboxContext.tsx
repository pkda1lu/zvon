import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import type { AwardNotice } from '../components/AwardNotification';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';
import { Message, User } from '../types';
import { SOUNDS, soundManager } from '../utils/sounds';
import { getAvatarUrl } from '../utils/avatar';
import { OPEN_NOTIFICATION_EVENT } from '../utils/navIntents';

export interface InboxItem {
    id: string;
    type: 'mention' | 'dm' | 'friend_request' | 'moderation' | 'award';
    awardNotice?: AwardNotice;
    title: string;
    content: string;
    timestamp: Date;
    author?: {
        _id: string;
        username: string;
        avatar: string | null;
        badges?: string[];
        displayedTag?: User['displayedTag'];
    };
    link?: {
        serverId?: string;
        channelId?: string;
        dmId?: string;
        messageId?: string;
        createdAt?: string;
    };
    /** Куда ведёт уведомление, кроме каналов и ЛС: заявки в друзья, жалоба, заявка Vlyne ID. */
    target?: { kind: string; id?: string };
    data?: any;
    read: boolean;
}

interface InboxContextType {
    items: InboxItem[];
    unreadCount: number;
    addItem: (item: Omit<InboxItem, 'id' | 'timestamp' | 'read'>) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    removeItem: (id: string) => void;
    clearInbox: () => void;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);
const saveAwardNotice = (item: InboxItem | undefined, action: 'read' | 'dismiss') => {
    if (!item?.awardNotice) return;
    const { grantId, noticeAt } = item.awardNotice;
    axios.patch(`/api/awards/notifications/${grantId}`, { action, noticeAt }).catch(() => {});
};

export const useInbox = () => {
    const context = useContext(InboxContext);
    if (!context) throw new Error('useInbox must be used within InboxProvider');
    return context;
};

export const InboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket } = useSocket();
    const { user } = useAuth();
    const { addNotification } = useNotifications();
    const [items, setItems] = useState<InboxItem[]>(() => {
        const saved = localStorage.getItem('zvon_inbox');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return parsed.filter((item: any) => item.type !== 'award').map((item: any) => ({ ...item, timestamp: new Date(item.timestamp) }));
            } catch (e) { return []; }
        }
        return [];
    });
    const itemsRef = useRef(items);
    itemsRef.current = items;

    useEffect(() => {
        // Award notices belong to the authenticated account, including on shared devices.
        setItems(prev => prev.filter(item => item.type !== 'award'));
        if (!user?._id) return;
        let cancelled = false, loading = false, initialized = false;
        const seen = new Set<string>();
        const load = async () => {
            if (loading) return;
            loading = true;
            try {
                const { data } = await axios.get<AwardNotice[]>('/api/awards/notifications');
                if (cancelled || !Array.isArray(data)) return;
                const notices: InboxItem[] = data.map(notice => ({
                    id: notice.id, type: 'award', title: 'Вам присвоена новая награда', content: notice.award.name,
                    timestamp: new Date(notice.noticeAt), read: notice.read, awardNotice: notice,
                    target: { kind: 'awards', id: user._id }
                }));
                setItems(prev => [...notices, ...prev.filter(item => item.type !== 'award')].sort((a, b) => +b.timestamp - +a.timestamp).slice(0, 50));
                for (const item of notices) {
                    if (initialized && !seen.has(item.id) && !item.read) {
                        addNotification({ title: 'Новая награда в вашей коллекции', content: item.content, type: 'info', onClick: () => {
                            saveAwardNotice(item, 'read');
                            setItems(prev => prev.map(i => i.id === item.id ? { ...i, read: true } : i));
                            window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATION_EVENT, { detail: item }));
                        } });
                        soundManager.play(SOUNDS.MESSAGE_NOTIFY, 0.4);
                    }
                    seen.add(item.id);
                }
                initialized = true;
            } catch { /* Keep cached notices until the next reconnect or poll. */ }
            finally { loading = false; }
        };
        void load();
        const interval = window.setInterval(load, 30000);
        socket?.on('award-granted', load);
        socket?.on('connect', load);
        return () => { cancelled = true; clearInterval(interval); socket?.off('award-granted', load); socket?.off('connect', load); };
    }, [user?._id, socket, addNotification]);

    useEffect(() => {
        localStorage.setItem('zvon_inbox', JSON.stringify(items.filter(item => item.type !== 'award')));
    }, [items]);

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    /**
     * Переход к тому, о чём уведомление: его обрабатывает Main (маршрутизатор
     * один для входящих, тоста и системного уведомления). Окно выводим вперёд —
     * по системному уведомлению кликают, когда Zvon свёрнут или в трее.
     */
    const openItem = useCallback((item: InboxItem) => {
        saveAwardNotice(item, 'read');
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, read: true } : i));
        (window as any).electron?.ipc?.send('focus-main-window');
        window.focus();
        window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATION_EVENT, { detail: item }));
    }, []);

    const sendNativeNotification = useCallback((title: string, body: string, iconUrl?: string | null, onClick?: () => void) => {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        // Don't show if window is focused (optional, but requested "all in windows")
        // if (document.hasFocus()) return;

        const notification = new Notification(title, {
            body,
            icon: iconUrl ? iconUrl : undefined,
            silent: true // We use our own sound manager
        });

        notification.onclick = () => {
            notification.close();
            if (onClick) onClick(); else window.focus();
        };
    }, []);

    const addItem = useCallback((item: Omit<InboxItem, 'id' | 'timestamp' | 'read'>) => {
        const newItem: InboxItem = {
            ...item,
            id: Math.random().toString(36).substring(2, 11),
            timestamp: new Date(),
            read: false
        };
        setItems(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50 items
        soundManager.play(SOUNDS.MESSAGE_NOTIFY, 0.4);

        addNotification({
            title: item.title,
            content: item.content,
            type: item.type === 'mention' ? 'message' : 'info',
            avatar: item.author?.avatar || undefined,
            onClick: () => openItem(newItem)
        });

        sendNativeNotification(
            item.title,
            item.content,
            item.author?.avatar ? getAvatarUrl(item.author.avatar) : null,
            () => openItem(newItem)
        );
    }, [addNotification, sendNativeNotification, openItem]);

    const markAsRead = useCallback((id: string) => {
        saveAwardNotice(itemsRef.current.find(item => item.id === id), 'read');
        setItems(prev => prev.map(item => item.id === id ? { ...item, read: true } : item));
    }, []);

    const markAllAsRead = useCallback(() => {
        itemsRef.current.filter(item => !item.read).forEach(item => saveAwardNotice(item, 'read'));
        setItems(prev => prev.map(item => ({ ...item, read: true })));
    }, []);

    const removeItem = useCallback((id: string) => {
        saveAwardNotice(itemsRef.current.find(item => item.id === id), 'dismiss');
        setItems(prev => prev.filter(item => item.id !== id));
    }, []);

    const clearInbox = useCallback(() => {
        itemsRef.current.forEach(item => saveAwardNotice(item, 'dismiss'));
        setItems([]);
    }, []);

    const unreadCount = useMemo(() => items.filter(i => !i.read).length, [items]);

    useEffect(() => {
        if (!socket || !user) return;

        const handleMention = (message: Message) => {
            addItem({
                type: 'mention',
                title: `@${user.username} упомянут в #${(message.channel as any)?.name || 'канале'}`,
                content: message.content,
                author: {
                    _id: message.author._id,
                    username: message.author.username,
                    avatar: message.author.avatar || null,
                    badges: message.author.badges || [],
                    displayedTag: message.author.displayedTag
                },
                // channel приходит объектом (выше берём его name) — раньше в
                // channelId попадал весь объект, и переход в канал не срабатывал.
                link: {
                    serverId: typeof message.channel === 'object' ? String((message.channel as any)?.server?._id || (message.channel as any)?.server || '') || undefined : undefined,
                    channelId: typeof message.channel === 'object' ? String((message.channel as any)?._id || '') : String(message.channel || ''),
                    messageId: message._id,
                    createdAt: message.createdAt as any
                },
                data: message
            });
        };

        const handleFriendRequest = (friendship: any) => {
            const requester = friendship.requester;
            addItem({
                type: 'friend_request',
                title: 'Новый запрос в друзья',
                content: `${requester.username} хочет добавить вас в друзья`,
                author: {
                    _id: requester._id,
                    username: requester.username,
                    avatar: requester.avatar || null,
                    badges: requester.badges || [],
                    displayedTag: requester.displayedTag
                },
                target: { kind: 'friend_request' },
                data: friendship
            });
        };

        const handleFriendRequestAccepted = (friendship: any) => {
            const other = friendship.recipient._id === user._id ? friendship.requester : friendship.recipient;
            addItem({
                type: 'friend_request',
                title: 'Запрос в друзья принят',
                content: `${other.username} принял ваш запрос в друзья`,
                author: {
                    _id: other._id,
                    username: other.username,
                    avatar: other.avatar || null,
                    badges: (other as any).badges || [],
                    displayedTag: (other as any).displayedTag
                },
                target: { kind: 'friend_accepted' },
                data: friendship
            });
        };

        // Сообщения от модерации — сохраняем во «Входящих» (левый сайдбар),
        // а не только во всплывающем тосте. addItem сам покажет тост и сыграет звук.
        const handleModeration = (data: any) => {
            if (!data?.message) return;
            const title = data.type === 'moderation_violation'
                ? 'Предупреждение модерации'
                : data.type === 'content_report'
                ? 'Новая жалоба'
                : data.type === 'problem_report'
                ? 'Новая жалоба на проблему'
                : data.type === 'problem_resolved'
                ? 'Ваша жалоба обработана'
                : data.type === 'vlyne_app_request'
                ? 'Заявка на подключение к Vlyne ID'
                : data.type === 'vlyne_app_reply'
                ? 'Ответ по заявке Vlyne ID'
                : data.type === 'vlyne_app_decision'
                ? 'Решение по заявке Vlyne ID'
                : 'Сообщение от модерации';
            // Подпись отправителя тоже своя: «Модерация» у заявки Vlyne ID
            // сбивает с толку — она приходит не от модерации, а к ней.
            const authorName = data.type === 'problem_report' || data.type === 'problem_resolved'
                ? 'Репорт'
                : String(data.type || '').startsWith('vlyne_app')
                ? 'Vlyne ID'
                : 'Модерация';
            addItem({
                type: 'moderation',
                title,
                content: data.message,
                author: { _id: 'moderation', username: authorName, avatar: null },
                target: { kind: String(data.type || ''), id: data.reportId ? String(data.reportId) : data.requestId ? String(data.requestId) : undefined }
            });
        };

        socket.on('mention', handleMention);
        socket.on('friend-request', handleFriendRequest);
        socket.on('friend-request-accepted', handleFriendRequestAccepted);
        socket.on('notification', handleModeration);

        return () => {
            socket.off('mention', handleMention);
            socket.off('friend-request', handleFriendRequest);
            socket.off('friend-request-accepted', handleFriendRequestAccepted);
            socket.off('notification', handleModeration);
        };
    }, [socket, user, addItem]);

    const value = useMemo(() => ({
        items,
        unreadCount,
        addItem,
        markAsRead,
        markAllAsRead,
        removeItem,
        clearInbox
    }), [items, unreadCount, addItem, markAsRead, markAllAsRead, removeItem, clearInbox]);

    return (
        <InboxContext.Provider value={value}>
            {children}
        </InboxContext.Provider>
    );
};
