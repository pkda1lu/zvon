import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useVoice } from '../contexts/VoiceContext';
import axios from 'axios';
import { Server, Channel, Message, DirectMessage, User, MiniApp } from '../types';
import Sidebar from '../components/Sidebar';
import ServerSidebar from '../components/ServerSidebar';
import ChannelView from '../components/ChannelView';
import VoiceChannelView from '../components/VoiceChannelView';
import Room3DView from '../components/Room3DView';
import ActiveVoiceOverlay from '../components/ActiveVoiceOverlay';
import FriendsPanel from '../components/FriendsPanel';
import ShowcaseView from '../components/ShowcaseView';
import MiniAppContainer from '../components/MiniAppContainer';
import DMView from '../components/DMView';
import DMSidebar from '../components/DMSidebar';
import VoiceCall from '../components/VoiceCall';
import UserProfileCard from '../components/UserProfileCard';
import ServerSettingsLayout from '../pages/serverSettings/ServerSettingsLayout';
import ServerProfileCard from '../components/ServerProfileCard';
import UserServerProfileModal from '../components/UserServerProfileModal';
import ServerMembers from '../components/ServerMembers';
import { SOUNDS, soundManager } from '../utils/sounds';
import { addRecentMiniApp } from '../utils/recentMiniApps';
import { getBrand } from '../utils/branding';
import { useNotifications } from '../contexts/NotificationContext';
import { useDialog } from '../contexts/DialogContext';
import { useInbox } from '../contexts/InboxContext';
import { useWindowSettings } from '../contexts/WindowSettingsContext';
import { useGestureSettings } from '../contexts/GestureSettingsContext';
import JoinServerModal from '../components/JoinServerModal';
import ServerInviteModal from '../components/ServerInviteModal';
import ForwardMessageModal from '../components/ForwardMessageModal';
import SettingsModal from '../components/SettingsModal';
import Inbox from '../components/Inbox';
import CreateGroupDMModal from '../components/CreateGroupDMModal';
import VerificationWarning from '../components/VerificationWarning';
import PostAnnouncements from '../components/posts/PostAnnouncements';
import { ChatIcon, UsersIcon, LayoutGridIcon, SettingsIcon } from '../components/Icons';
import { AnimatePresence, motion } from 'framer-motion';
import {
  sidebarSwapVariants,
  contentSwapVariants,
  innerKeyVariants,
  iosSpring,
  iosFade,
} from '../animations/transitions';
import './Main.css';

import { useAppearance } from '../contexts/AppearanceContext';

const Main: React.FC = () => {
  const { user, logout, updateUser, updateGlobalUser } = useAuth();
  const { pageScales, interfaceScale } = useAppearance();
  const brand = getBrand();
  const { socket } = useSocket();
  const { activeChannelId, leaveChannel } = useVoice();
  const { addNotification } = useNotifications();
  const { alert: showAlert, confirm: customConfirm } = useDialog();
  const { unreadCount: inboxUnreadCount } = useInbox();

  // Достаём текст ошибки старта ЛС (например, ограничение приватности получателя)
  // и показываем его пользователю.
  const reportDMError = (error: any) => {
    const msg = error?.response?.data?.message;
    if (error?.response?.status === 403 && msg) {
      showAlert(msg, 'Не удалось начать переписку');
    }
  };
  const { streamerModeEnabled, changeStatusToStreaming } = useWindowSettings();
  const { settings: gestureSettings } = useGestureSettings();

  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showFriends, setShowFriends] = useState(false);
  const [selectedDM, setSelectedDM] = useState<DirectMessage | null>(null);
  const [dmMessages, setDmMessages] = useState<Message[]>([]);
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInbox, setShowInbox] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showShowcase, setShowShowcase] = useState(false);
  const [openMiniApps, setOpenMiniApps] = useState<MiniApp[]>([]);
  const [minimizedMiniAppIds, setMinimizedMiniAppIds] = useState<Set<string>>(new Set());
  const [showVoiceChat, setShowVoiceChat] = useState(false);

  useEffect(() => {
    setShowVoiceChat(false);
  }, [selectedChannel]);

  const userRef = useRef(user);
  const selectedServerRef = useRef(selectedServer);
  const serversRef = useRef(servers);
  const activeChannelIdRef = useRef(activeChannelId);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { selectedServerRef.current = selectedServer; }, [selectedServer]);
  useEffect(() => { serversRef.current = servers; }, [servers]);
  useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);

  // Покидаем голосовой канал только если он принадлежит указанному серверу
  const leaveVoiceIfInServer = (serverId: string) => {
    const channelId = activeChannelIdRef.current;
    if (!channelId) return;
    const server = serversRef.current.find((s: Server) => s._id === serverId);
    if (server && server.channels.some((c: Channel) => c._id === channelId)) {
      leaveChannel();
    }
  };

  // Нельзя одновременно находиться в голосовом канале сервера и в ЛС-звонке —
  // оба используют микрофон и свою LiveKit-комнату. Перед подключением к звонку
  // (исходящему или входящему) выходим из серверного войса. Читаем актуальный
  // канал через ref, звук выхода играет только если мы реально были в канале.
  const leaveServerVoiceForCall = useCallback(async () => {
    if (activeChannelIdRef.current) await leaveChannel();
  }, [leaveChannel]);

  const [activeCall, setActiveCall] = useState<{
    user: User;
    isIncoming: boolean;
    dmId: string;
    offer?: any;
    isGroup?: boolean;
    dmName?: string;
  } | null>(null);
  const [showProfileUserId, setShowProfileUserId] = useState<string | null>(null);
  const [profilePosition, setProfilePosition] = useState<{ x: number, y: number } | null>(null);
  // Профиль без привязки к серверу (напр. клик по своей аватарке в sidebar-user) — игнорируем selectedServer.
  const [profileScopeless, setProfileScopeless] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showServerProfile, setShowServerProfile] = useState(false);
  const [serverProfilePosition, setServerProfilePosition] = useState<{ x: number, y: number } | null>(null);
  const [showUserServerProfile, setShowUserServerProfile] = useState(false);
  const [serverProfileServerId, setServerProfileServerId] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteServerId, setInviteServerId] = useState<string | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string>('profile');
  const [settingsInitialData, setSettingsInitialData] = useState<any>(null);

  const handleOpenSettings = (tab: string = 'profile', data: any = null) => {
    setSettingsInitialTab(tab);
    setSettingsInitialData(data);
    setShowSettingsModal(true);
  };
  const SIDEBAR_WIDTH = 280;
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('secondarySidebarWidth');
    return saved ? parseInt(saved, 10) : 280;
  });
  const [membersWidth, setMembersWidth] = useState<number>(() => {
    const saved = localStorage.getItem('membersSidebarWidth');
    return saved ? parseInt(saved, 10) : 240;
  });
  const [voiceChatWidth, setVoiceChatWidth] = useState<number>(() => {
    const saved = localStorage.getItem('voiceChatSidebarWidth');
    return saved ? parseInt(saved, 10) : 320;
  });

  const handleSidebarResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const delta = currentX - startX;
      const newWidth = Math.min(Math.max(startWidth + delta, 180), 480);
      setSidebarWidth(newWidth);
      localStorage.setItem('secondarySidebarWidth', newWidth.toString());
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  };

  const handleMembersResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startWidth = membersWidth;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const delta = startX - currentX; // Dragging left increases width
      const newWidth = Math.min(Math.max(startWidth + delta, 180), 420);
      setMembersWidth(newWidth);
      localStorage.setItem('membersSidebarWidth', newWidth.toString());
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  };

  const handleVoiceChatResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startWidth = voiceChatWidth;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const delta = startX - currentX; // Dragging left increases width
      const newWidth = Math.min(Math.max(startWidth + delta, 260), 600);
      setVoiceChatWidth(newWidth);
      localStorage.setItem('voiceChatSidebarWidth', newWidth.toString());
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  };
  const hasViewInitializedRef = useRef(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [mobileView, setMobileView] = useState<'sidebar' | 'content' | 'members'>('sidebar');
  const [showMembersSidebar, setShowMembersSidebar] = useState<boolean>(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || !gestureSettings.enabled || showSettings) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || !gestureSettings.enabled || !touchStartRef.current || showSettings) return;
    if (showFriends || showShowcase || showSettings) return; // Disable swipe gestures on Friends, Showcase & Settings
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const end = e.changedTouches[0];
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > 600) return; // too slow

    const threshold = gestureSettings.swipeSensitivity === 'low' ? 120 : gestureSettings.swipeSensitivity === 'high' ? 20 : 50;

    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.2) return; // not horizontal or far enough

    const isVoice = selectedChannel?.type === 'voice' || selectedChannel?.type === 'room';

    let actionTriggered = false;
    if (dx < 0) { // Swipe Right-to-Left (forward)
      if (isVoice) {
        if (mobileView === 'sidebar') { setMobileView('content'); actionTriggered = true; }
        else if (mobileView === 'content' && !showVoiceChat) { setShowVoiceChat(true); actionTriggered = true; }
      } else {
        if (mobileView === 'sidebar') {
          if (selectedServer || selectedDM || showFriends) { setMobileView('content'); actionTriggered = true; }
        } else if (mobileView === 'content') {
          if (selectedServer && selectedServer.showMembersList !== false) { setMobileView('members'); actionTriggered = true; }
        }
      }
    } else if (dx > 0) { // Swipe Left-to-Right (back)
      if (isVoice) {
        if (showVoiceChat) { setShowVoiceChat(false); actionTriggered = true; }
        else if (mobileView === 'content') { setMobileView('sidebar'); actionTriggered = true; }
      } else {
        if (mobileView === 'members') { setMobileView('content'); actionTriggered = true; }
        else if (mobileView === 'content') { setMobileView('sidebar'); actionTriggered = true; }
      }
    }

    if (actionTriggered && gestureSettings.hapticFeedback && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch (err) {}
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileView('content'); // Default to content on desktop, though CSS will handle it
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (selectedServer) {
      localStorage.setItem('lastServerId', selectedServer._id);
    }
  }, [selectedServer]);

  useEffect(() => {
    if (selectedChannel) {
      localStorage.setItem('lastChannelId', selectedChannel._id);
    }
  }, [selectedChannel]);

  useEffect(() => {
    const handleStartDMEvent = (e: any) => {
      const dm = e.detail.dm;
      // Добавляем чат в список, если его там ещё нет (например, новая переписка
      // от имени модерации) — чтобы он сразу появился в сайдбаре / хабе «Модерация».
      if (dm?._id) setDms((prev: DirectMessage[]) => prev.some(d => d._id === dm._id) ? prev : [dm, ...prev]);
      setSelectedDM(dm);
      setSelectedChannel(null);
      setSelectedServer(null);
      setShowFriends(false);
      setMobileView('content');
    };
    const handleStartCallEvent = (e: any) => { handleStartDirectCall(e.detail.user, e.detail.dmId); };
    const handleOpenServerProfileSettings = (e: any) => {
      handleOpenSettings('server-profiles', { serverId: e.detail.serverId });
    };
    const handleStartDMById = async (e: any) => {
      try {
        const response = await axios.get(`/api/direct-messages/${e.detail.dmId}`);
        setSelectedDM(response.data);
        setSelectedChannel(null);
        setSelectedServer(null);
        setShowFriends(false);
        setMobileView('content');
      } catch (err) { }
    };
    const handleOpenMiniAppEvent = (e: any) => {
      handleOpenMiniApp(e.detail.app);
    };
    const handleOpenDM = async (e: any) => {
      try {
        const response = await axios.get(`/api/direct-messages/user/${e.detail.userId}`);
        setSelectedDM(response.data);
        setSelectedChannel(null);
        setSelectedServer(null);
        setShowFriends(false);
        setMobileView('content');
      } catch (err) { reportDMError(err); }
    };
    const handleSelectServerEvent = (e: any) => {
      const srvId = e.detail.serverId;
      const channelId = e.detail.channelId;
      const srv = servers.find(s => s._id === srvId);
      if (srv) {
        setSelectedServer(srv);
        // Явно указанный канал (напр. клик по "друзья в голосовом" в Активных контактах)
        // имеет приоритет над каналом по умолчанию.
        const targetChannel = channelId ? srv.channels.find((c: any) => c._id === channelId) : null;
        if (targetChannel) {
          setSelectedChannel(targetChannel);
        } else {
          // Сразу выбираем канал по умолчанию (как при клике по серверу в рейле).
          // Иначе при выборе сервера из профиля канал обнулялся и контент-область
          // оставалась пустой — «пропадала часть экрана».
          const firstTextChannel = srv.channels.find((c: any) => c.type === 'text');
          if (firstTextChannel) setSelectedChannel(firstTextChannel);
          else if (srv.channels.length > 0) setSelectedChannel(srv.channels[0]);
          else setSelectedChannel(null);
        }
        setSelectedDM(null);
        setShowFriends(false);
        setMobileView('content');
      } else {
        // Пользователь не состоит в этом сервере (например, кликнул по основному
        // серверу в карточке профиля) — показываем приглашение присоединиться.
        setInviteServerId(srvId);
      }
    };

    const handleKeybindAction = (e: any) => {
      const { action } = e.detail;
      
      switch (action) {
        case 'server-next': {
          if (servers.length <= 1) return;
          const currentIndex = selectedServer ? servers.findIndex(s => s._id === selectedServer._id) : -1;
          const nextIndex = (currentIndex + 1) % servers.length;
          const nextServer = servers[nextIndex];
          setSelectedServer(nextServer);
          setShowFriends(false);
          setShowShowcase(false);
          setSelectedDM(null);
          break;
        }
        case 'server-prev': {
          if (servers.length <= 1) return;
          const currentIndex = selectedServer ? servers.findIndex(s => s._id === selectedServer._id) : -1;
          const prevIndex = (currentIndex - 1 + servers.length) % servers.length;
          const prevServer = servers[prevIndex];
          setSelectedServer(prevServer);
          setShowFriends(false);
          setShowShowcase(false);
          setSelectedDM(null);
          break;
        }
        case 'channel-next': {
          if (!selectedServer) return;
          const channels = selectedServer.channels;
          if (channels.length <= 1) return;
          const currentIndex = selectedChannel ? channels.findIndex(c => c._id === selectedChannel._id) : -1;
          const nextIndex = (currentIndex + 1) % channels.length;
          setSelectedChannel(channels[nextIndex]);
          break;
        }
        case 'channel-prev': {
          if (!selectedServer) return;
          const channels = selectedServer.channels;
          if (channels.length <= 1) return;
          const currentIndex = selectedChannel ? channels.findIndex(c => c._id === selectedChannel._id) : -1;
          const prevIndex = (currentIndex - 1 + channels.length) % channels.length;
          setSelectedChannel(channels[prevIndex]);
          break;
        }
        case 'mark-chat-read': {
          if (selectedChannel) {
            setUnreadCounts(prev => {
              const next = { ...prev };
              delete next[selectedChannel._id];
              return next;
            });
          } else if (selectedDM) {
            setUnreadCounts(prev => {
              const next = { ...prev };
              delete next[selectedDM._id];
              return next;
            });
          }
          break;
        }
        case 'mark-server-read': {
          if (selectedServer) {
            setUnreadCounts(prev => {
              const next = { ...prev };
              selectedServer.channels.forEach(c => delete next[c._id]);
              return next;
            });
          }
          break;
        }
        case 'open-notifications': {
          setShowInbox(prev => !prev);
          break;
        }
        case 'scroll-up': {
          window.dispatchEvent(new CustomEvent('zvon-scroll-chat', { detail: { direction: 'up' } }));
          break;
        }
        case 'scroll-down': {
          window.dispatchEvent(new CustomEvent('zvon-scroll-chat', { detail: { direction: 'down' } }));
          break;
        }
        case 'edit-last': {
          window.dispatchEvent(new CustomEvent('zvon-edit-last-message'));
          break;
        }
        case 'delete-last': {
          window.dispatchEvent(new CustomEvent('zvon-delete-last-message'));
          break;
        }
        case 'close-window': {
          if (showSettingsModal) setShowSettingsModal(false);
          else if (showServerSettings) setShowServerSettings(false);
          else if (showJoinModal) setShowJoinModal(false);
          else if (showCreateGroupModal) setShowCreateGroupModal(false);
          else if (showInbox) setShowInbox(false);
          else if (showProfileUserId) setShowProfileUserId(null);
          else if (showServerProfile) setShowServerProfile(false);
          else if (showUserServerProfile) setShowUserServerProfile(false);
          else if (inviteServerId) setInviteServerId(null);
          else if (forwardMessage) setForwardMessage(null);
          else {
              // @ts-ignore
              if (window.electron && window.electron.ipc) {
                  // @ts-ignore
                  window.electron.ipc.send('close-window');
              }
          }
          break;
        }
        case 'minimize-to-tray': {
            // @ts-ignore
            if (window.electron && window.electron.ipc) {
                // @ts-ignore
                window.electron.ipc.send('minimize-to-tray');
            }
            break;
        }
      }
    };

    // Открытие приглашения внутри приложения (клик по ссылке/карточке приглашения
    // в сообщении). Резолвим код в сервер: если пользователь уже состоит в сервере —
    // просто выбираем его, иначе показываем модалку-приглашение.
    const handleOpenInviteEvent = async (e: any) => {
      const code = e.detail?.code;
      if (!code) return;
      try {
        const { data } = await axios.get(`/api/invites/${code}`);
        const srvId = data?.server?._id;
        if (!srvId) return;
        if (servers.some(s => s._id === srvId)) {
          window.dispatchEvent(new CustomEvent('select-server', { detail: { serverId: srvId } }));
        } else {
          setInviteServerId(srvId);
        }
      } catch (err) { /* приглашение недействительно — тихо игнорируем */ }
    };

    // Открытие окна пересылки сообщения (клик по «Переслать» в действиях сообщения).
    const handleOpenForwardEvent = (e: any) => {
      if (e.detail?.message) setForwardMessage(e.detail.message);
    };

    window.addEventListener('start-dm', handleStartDMEvent);
    window.addEventListener('start-call', handleStartCallEvent);
    window.addEventListener('open-server-profile-settings', handleOpenServerProfileSettings);
    window.addEventListener('start-dm-by-id', handleStartDMById);
    window.addEventListener('open-mini-app', handleOpenMiniAppEvent);
    window.addEventListener('open-dm', handleOpenDM);
    window.addEventListener('select-server', handleSelectServerEvent);
    window.addEventListener('open-invite', handleOpenInviteEvent);
    window.addEventListener('open-forward', handleOpenForwardEvent);
    window.addEventListener('zvon-keybind-action', handleKeybindAction);
    return () => {
      window.removeEventListener('start-dm', handleStartDMEvent);
      window.removeEventListener('start-call', handleStartCallEvent);
      window.removeEventListener('open-server-profile-settings', handleOpenServerProfileSettings);
      window.removeEventListener('start-dm-by-id', handleStartDMById);
      window.removeEventListener('open-mini-app', handleOpenMiniAppEvent);
      window.removeEventListener('open-dm', handleOpenDM);
      window.removeEventListener('select-server', handleSelectServerEvent);
      window.removeEventListener('open-invite', handleOpenInviteEvent);
      window.removeEventListener('open-forward', handleOpenForwardEvent);
      window.removeEventListener('zvon-keybind-action', handleKeybindAction);
    };
  }, [servers, selectedServer, selectedChannel, selectedDM, showSettingsModal, showServerSettings, showJoinModal, showCreateGroupModal, showInbox, showProfileUserId, showServerProfile, showUserServerProfile, inviteServerId, forwardMessage]);


  // --- Activity orchestration ---
  // Game (from electron detection) has priority. If no game is running, fall
  // back to the most-recently-opened mini-app. If neither, clear activity.
  // Minimizing a mini-app does NOT clear activity — it keeps running.
  const [currentGameActivity, setCurrentGameActivity] = useState<any>(null);

  useEffect(() => {
    // @ts-ignore
    const electron = window.electron;
    if (electron && socket && user) {
      electron.getCurrentActivity?.().then((activity: any) => {
        if (activity) setCurrentGameActivity({
          name: activity.name, type: 'playing',
          assets: { largeImage: activity.icon },
          timestamps: { start: activity.startTime },
        });
      });
      const removeActivityListener = electron.onActivityChanged?.((activity: any) => {
        if (activity) {
          setCurrentGameActivity({
            name: activity.name, type: 'playing',
            assets: { largeImage: activity.icon },
            timestamps: { start: activity.startTime },
          });
        } else {
          setCurrentGameActivity(null);
        }
      });
      return () => { if (removeActivityListener) removeActivityListener(); };
    }
  }, [socket, user?._id]);

  // Single source of truth: emit activity based on current game + open mini-apps.
  useEffect(() => {
    if (!socket) return;

    if (streamerModeEnabled && changeStatusToStreaming) {
      socket.emit('activity-update', {
        name: 'Streaming',
        type: 'streaming',
        state: 'В эфире',
        details: 'Трансляция через OBS',
        assets: { largeImage: 'streaming', largeText: 'В эфире' },
        timestamps: { start: Date.now() },
      });
      return;
    }

    if (currentGameActivity) {
      socket.emit('activity-update', currentGameActivity);
      return;
    }
    if (openMiniApps.length > 0) {
      const app = openMiniApps[openMiniApps.length - 1];
      socket.emit('activity-update', {
        name: app.name,
        type: 'playing',
        state: 'В приложении',
        details: app.description ? app.description.slice(0, 100) : '',
        assets: { largeImage: app.avatar || null, largeText: app.name },
        timestamps: { start: Date.now() },
        miniAppData: app,
      });
      return;
    }
    socket.emit('activity-update', null);
    // ВАЖНО: streamerModeEnabled/changeStatusToStreaming тоже в зависимостях —
    // иначе при выключении режима стримера эффект не перезапускался и активность
    // «streaming» зависала (и тянула битую картинку /api/uploads/streaming → 404).
  }, [socket, currentGameActivity, openMiniApps, streamerModeEnabled, changeStatusToStreaming]);

  // Auto-open a collaborative mini-app (e.g. watch-together) when another member
  // of our voice channel starts a session, or when we join a channel that already
  // has one running. The server emits 'miniapp-open-app' with the app id.
  useEffect(() => {
    if (!socket) return;
    const onOpenApp = async ({ appId }: { appId: string }) => {
      // Always make sure it's not minimized (restore if the user had collapsed it).
      setMinimizedMiniAppIds(p => { if (!p.has(appId)) return p; const n = new Set(p); n.delete(appId); return n; });
      setOpenMiniApps(prev => {
        if (prev.find(a => a._id === appId)) return prev; // already open — just restored above
        // Fetch the app meta then append (guard against double-open via the ref check above).
        axios.get(`/api/miniapps/${appId}`)
          .then(r => {
            const app = r.data?.app || r.data;
            if (app && app._id) {
              setMinimizedMiniAppIds(p => { const n = new Set(p); n.delete(app._id); return n; });
              setOpenMiniApps(cur => cur.find(a => a._id === app._id) ? cur : [...cur, app]);
            }
          })
          .catch(err => console.warn('[MiniApp] auto-open failed:', err?.message));
        return prev;
      });
    };
    // Triggered remotely (host starts a session) and locally (clicking a watch tile).
    const onLocalOpenApp = (e: Event) => {
      const appId = (e as CustomEvent).detail?.appId;
      if (appId) onOpenApp({ appId });
    };
    socket.on('miniapp-open-app', onOpenApp);
    window.addEventListener('zvon-open-miniapp', onLocalOpenApp);
    return () => {
      socket.off('miniapp-open-app', onOpenApp);
      window.removeEventListener('zvon-open-miniapp', onLocalOpenApp);
    };
  }, [socket]);

  useEffect(() => {
    if (selectedChannel) {
      setUnreadCounts((prev: Record<string, number>) => {
        if (!prev[selectedChannel._id]) return prev;
        const next = { ...prev };
        delete next[selectedChannel._id];
        return next;
      });
    }
  }, [selectedChannel]);

  useEffect(() => {
    if (selectedDM) {
      setUnreadCounts((prev: Record<string, number>) => {
        if (!prev[selectedDM._id]) return prev;
        const next = { ...prev };
        delete next[selectedDM._id];
        return next;
      });
    }
  }, [selectedDM]);

  const fetchServers = useCallback(async () => {
    try {
      const response = await axios.get('/api/servers/me');
      const serversData = response.data;
      setServers(serversData);

      if (!hasViewInitializedRef.current && serversData.length > 0 && !selectedServerRef.current) {
        hasViewInitializedRef.current = true;

        const lastServerId = localStorage.getItem('lastServerId');
        const savedServer = lastServerId ? serversData.find((s: any) => s._id === lastServerId) : null;
        const targetServer = savedServer || serversData[0];

        setSelectedServer(targetServer);

        const lastChannelId = localStorage.getItem('lastChannelId');
        const savedChannel = lastChannelId ? targetServer.channels.find((c: any) => c._id === lastChannelId) : null;

        if (savedChannel) {
          setSelectedChannel(savedChannel);
        } else {
          const firstTextChannel = targetServer.channels.find((c: any) => c.type === 'text');
          if (firstTextChannel) setSelectedChannel(firstTextChannel);
          else if (targetServer.channels.length > 0) setSelectedChannel(targetServer.channels[0]);
        }
      } else if (!hasViewInitializedRef.current) {
        hasViewInitializedRef.current = true;
      }
    } catch (error) { } finally { setLoading(false); }
  }, []);

  const fetchDMs = useCallback(async () => {
    try {
      const response = await axios.get('/api/direct-messages');
      setDms(response.data);
    } catch (error) { }
  }, []);

  const fetchFriends = useCallback(async () => {
    try {
      const response = await axios.get('/api/friends');
      setFriends(response.data);
    } catch (error) { }
  }, []);

  const fetchMessages = useCallback(async (channelId: string) => {
    try {
      const response = await axios.get(`/api/messages/channel/${channelId}`);
      setMessages(response.data);
      setHasMore(response.data.length === 50);

      const pinsRes = await axios.get(`/api/messages/channel/${channelId}/pins`);
      setPinnedMessages(pinsRes.data);
    } catch (error) { }
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (!selectedChannel || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const lastMessage = messages[0];
      const response = await axios.get(`/api/messages/channel/${selectedChannel._id}`, {
        params: { before: lastMessage.createdAt }
      });
      if (response.data.length > 0) {
        setMessages((prev: Message[]) => [...response.data, ...prev]);
        setHasMore(response.data.length === 50);
      } else {
        setHasMore(false);
      }
    } catch (error) { } finally { setIsLoadingMore(false); }
  }, [selectedChannel, messages, isLoadingMore, hasMore]);

  const fetchDMMessages = useCallback(async (dmId: string) => {
    try {
      const response = await axios.get(`/api/direct-messages/${dmId}/messages`);
      setDmMessages(response.data);
      setHasMore(response.data.length === 50);

      const pinsRes = await axios.get(`/api/direct-messages/${dmId}/pins`);
      setPinnedMessages(pinsRes.data);
    } catch (error) { }
  }, []);

  const loadMoreDMMessages = useCallback(async () => {
    if (!selectedDM || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const lastMessage = dmMessages[0];
      const response = await axios.get(`/api/direct-messages/${selectedDM._id}/messages`, {
        params: { before: lastMessage.createdAt }
      });
      if (response.data.length > 0) {
        setDmMessages((prev: Message[]) => [...response.data, ...prev]);
        setHasMore(response.data.length === 50);
      } else {
        setHasMore(false);
      }
    } catch (error) { } finally { setIsLoadingMore(false); }
  }, [selectedDM, dmMessages, isLoadingMore, hasMore]);

  useEffect(() => {
    fetchServers();
    fetchDMs();
    fetchFriends();
  }, [fetchServers, fetchDMs, fetchFriends]);

  useEffect(() => {
    if (socket && servers.length > 0) {
      servers.forEach((server: Server) => socket.emit('join-server', server._id));
    }
  }, [socket, servers.length]);

  const handleServerUpdate = useCallback((updatedServer: Server) => {
    setServers((prev: Server[]) => prev.map((s: Server) => s._id === updatedServer._id ? updatedServer : s));
    setSelectedServer((prev: Server | null) => (prev && prev._id === updatedServer._id) ? updatedServer : prev);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleCallOffer = async (data: any) => {
      if (!activeCall) {
        try {
          const response = await axios.get<User>(`/api/users/${data.fromUserId}`);
          let dmName = '';
          if (data.isGroup && data.dmId) {
            try {
              const dmRes = await axios.get(`/api/direct-messages/${data.dmId}`);
              const dm = dmRes.data;
              dmName = dm.name || dm.participants.filter((p: any) => p._id !== user?._id).map((p: any) => p.username).join(', ');
            } catch (e) { }
          }

          setActiveCall({
            user: response.data,
            isIncoming: true,
            dmId: data.dmId || '',
            offer: data,
            isGroup: !!data.isGroup,
            dmName
          });

          // Send Native Notification
          // @ts-ignore
          if (window.electron && window.electron.ipc) {
            // @ts-ignore
            window.electron.ipc.send('show-native-notification', {
              title: data.isGroup ? 'Групповой звонок' : 'Входящий звонок',
              body: data.isGroup ? `${response.data.username} начал звонок в группе` : `Вам звонит ${response.data.username}`,
              silent: false
            });
          }
        } catch (err) { }
      }
    };
    const handleServerMemberUpdate = (data: { serverId: string; member: any }) => {
      const targetUserId = String(data.member.user?._id || data.member.user);
      if (data.member.user && typeof data.member.user !== 'string') {
        updateGlobalUser(targetUserId, data.member.user);
      }
      setServers((prev: Server[]) => prev.map((s: Server) => s._id === data.serverId ? { ...s, members: s.members.map((m: any) => String(m.user?._id || m.user) === targetUserId ? data.member : m) } : s));
      setSelectedServer((prev: Server | null) => (prev && prev._id === data.serverId) ? { ...prev, members: prev.members.map((m: any) => String(m.user?._id || m.user) === targetUserId ? data.member : m) } : prev);
    };

    const handleUserUpdate = (updatedUser: Partial<User> & { _id: string }) => {
      const targetUserId = String(updatedUser._id);
      updateGlobalUser(targetUserId, updatedUser);
      setFriends((prev: User[]) => prev.map((f: User) => f._id === targetUserId ? { ...f, ...updatedUser } : f));
      setServers((prev: Server[]) => prev.map((server: Server) => ({
        ...server,
        members: server.members.map((member: any) => String(member.user?._id || member.user) === targetUserId ? { ...member, user: { ...member.user, ...updatedUser } } : member)
      })));
      setSelectedServer((prev: Server | null) => prev ? {
        ...prev,
        members: prev.members.map((member: any) => String(member.user?._id || member.user) === targetUserId ? { ...member, user: { ...member.user, ...updatedUser } } : member)
      } : prev);
      setSelectedDM((prev: DirectMessage | null) => prev ? {
        ...prev,
        participants: prev.participants.map((p: User) => p._id === updatedUser._id ? { ...p, ...updatedUser } : p)
      } : prev);
      if (updatedUser._id === user?._id) updateUser(updatedUser);
    };

    const handleServerMemberJoined = (data: { serverId: string; member: any; server?: Server }) => {
      if (data.server) { handleServerUpdate(data.server); return; }
      const newUserId = String(data.member.user?._id || data.member.user);
      if (data.member.user && typeof data.member.user !== 'string') {
        updateGlobalUser(newUserId, data.member.user);
      }
      setServers((prev: Server[]) => prev.map((s: Server) => (s._id === data.serverId && !s.members.some((m: any) => String(m.user?._id || m.user) === newUserId)) ? { ...s, members: [...s.members, data.member] } : s));
      setSelectedServer((prev: Server | null) => (prev && prev._id === data.serverId && !prev.members.some((m: any) => String(m.user?._id || m.user) === newUserId)) ? { ...prev, members: [...prev.members, data.member] } : prev);
    };
    const handleServerMemberLeft = (data: { serverId: string; userId: string }) => {
      const targetUserId = String(data.userId);
      setServers((prev: Server[]) => prev.map((s: Server) => s._id === data.serverId ? { ...s, members: s.members.filter((m: any) => String(m.user?._id || m.user) !== targetUserId) } : s));
      setSelectedServer((prev: Server | null) => (prev && prev._id === data.serverId) ? { ...prev, members: prev.members.filter((m: any) => String(m.user?._id || m.user) !== targetUserId) } : prev);
      if (userRef.current?._id && targetUserId === String(userRef.current._id)) {
        leaveVoiceIfInServer(data.serverId);
        setServers((prev: Server[]) => prev.filter((s: Server) => s._id !== data.serverId));
        setSelectedServer((prev: Server | null) => prev && prev._id === data.serverId ? null : prev);
        setSelectedChannel((prev: Channel | null) => (prev && String((prev.server as any)?._id || prev.server) === data.serverId) ? null : prev);
      }
    };
    const handleServerKicked = (data: { serverId: string }) => {
      leaveVoiceIfInServer(data.serverId);
      setServers((prev: Server[]) => prev.filter((s: Server) => s._id !== data.serverId));
      setSelectedServer((prev: Server | null) => prev && prev._id === data.serverId ? null : prev);
      setSelectedChannel((prev: Channel | null) => (prev && String((prev.server as any)?._id || prev.server) === data.serverId) ? null : prev);
    };
    const handleServerDeletedSocket = (data: { serverId: string }) => { handleServerDelete(data.serverId); };
    const handleDmDeleted = (data: { dmId: string }) => {
      setDms((prev: DirectMessage[]) => prev.filter((d: DirectMessage) => d._id !== data.dmId));
      setSelectedDM((prev: DirectMessage | null) => (prev && prev._id === data.dmId) ? null : prev);
      setForwardMessage((prev: Message | null) => (prev && prev.directMessage === data.dmId) ? null : prev);
    };
    const handleUserVerified = (data: { isVerified: boolean }) => {
      if (userRef.current) {
        updateUser({ ...userRef.current, isVerified: data.isVerified });
      }
    };

    socket.on('call-offer', handleCallOffer);
    socket.on('server-member-updated', handleServerMemberUpdate);
    socket.on('server-updated', handleServerUpdate);
    socket.on('user-updated', handleUserUpdate);
    socket.on('server-member-joined', handleServerMemberJoined);
    socket.on('server-member-left', handleServerMemberLeft);
    socket.on('server-kicked', handleServerKicked);
    socket.on('server-deleted', handleServerDeletedSocket);
    socket.on('dm-deleted', handleDmDeleted);
    socket.on('user-verified', handleUserVerified);
    return () => {
      socket.off('call-offer', handleCallOffer);
      socket.off('server-member-updated', handleServerMemberUpdate);
      socket.off('server-updated', handleServerUpdate);
      socket.off('user-updated', handleUserUpdate);
      socket.off('server-member-joined', handleServerMemberJoined);
      socket.off('server-member-left', handleServerMemberLeft);
      socket.off('server-kicked', handleServerKicked);
      socket.off('server-deleted', handleServerDeletedSocket);
      socket.off('dm-deleted', handleDmDeleted);
      socket.off('user-verified', handleUserVerified);
    };
  }, [socket, activeCall, user, updateUser, handleServerUpdate]);

  useEffect(() => {
    if (!socket || !user) return;
    const s = socket;
    const handleGlobalMessage = (message: Message) => {
      if (message.author._id !== user._id) {
        const isSelected = (selectedChannel && message.channel === selectedChannel._id) || (selectedDM && message.directMessage === selectedDM._id);

        if (!isSelected) {
          const id = message.directMessage || message.channel;
          if (id) setUnreadCounts((prev: Record<string, number>) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));

          // Only show old toast for channel messages WITHOUT mentions of current user. 
          // DMs and Mentions are now handled by InboxContext (persistent + new toast).
          const isMentioned = message.mentions?.some(m => m._id === user._id);

          if (!message.directMessage && !isMentioned) {
            soundManager.play(SOUNDS.MESSAGE_NOTIFY, 0.5);
            addNotification({
              title: message.author.username, content: message.content, type: 'message', avatar: message.author.avatar || undefined,
              onClick: () => {
                const server = servers.find(s => s.channels.some(c => c._id === message.channel));
                if (server) {
                  setSelectedServer(server);
                  const channel = server.channels.find(c => c._id === message.channel);
                  if (channel) setSelectedChannel(channel);
                  setShowFriends(false); setSelectedDM(null);
                }
              }
            });
          }
        }
      }
    };
    s.on('new-message', handleGlobalMessage);

    const handleMessagePinnedUpdate = (message: Message) => {
      setMessages((prev: Message[]) => prev.map((m: Message) => m._id === message._id ? { ...m, pinned: message.pinned, pinnedAt: message.pinnedAt } : m));
      setDmMessages((prev: Message[]) => prev.map((m: Message) => m._id === message._id ? { ...m, pinned: message.pinned, pinnedAt: message.pinnedAt } : m));

      if (message.pinned) {
        setPinnedMessages((prev: Message[]) => {
          if (prev.some((p: Message) => p._id === message._id)) return prev;
          return [message, ...prev].sort((a, b) => new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime());
        });
      } else {
        setPinnedMessages((prev: Message[]) => prev.filter((p: Message) => p._id !== message._id));
      }
    };

    s.on('message-pinned-update', handleMessagePinnedUpdate);

    return () => {
      s.off('new-message', handleGlobalMessage);
      s.off('message-pinned-update', handleMessagePinnedUpdate);
    };
  }, [socket, user, selectedChannel?._id, selectedDM?._id, servers, addNotification]);

  useEffect(() => {
    if (!selectedChannel || !socket) return;
    const s = socket;
    if (selectedChannel.type === 'text' || selectedChannel.type === 'voice' || selectedChannel.type === 'room') {
      setMessages([]); setSelectedDM(null);
      s.emit('join-channel', selectedChannel._id);
      fetchMessages(selectedChannel._id);
      const handleNewMessage = (message: Message) => { if (message.channel === selectedChannel._id) setMessages((prev: Message[]) => [...prev, message]); };
      const handleMessageDeleted = (messageId: string) => setMessages((prev: Message[]) => prev.filter((m: Message) => m._id !== messageId));
      s.on('new-message', handleNewMessage);
      s.on('message-deleted', handleMessageDeleted);
      return () => {
        s.emit('leave-channel', selectedChannel._id);
        s.off('new-message', handleNewMessage);
        s.off('message-deleted', handleMessageDeleted);
      };
    } else { setMessages([]); setSelectedDM(null); }
  }, [selectedChannel, socket, fetchMessages]);

  useEffect(() => {
    if (!selectedDM || !socket) return;
    const s = socket;
    setDmMessages([]); setSelectedChannel(null);
    fetchDMMessages(selectedDM._id);
    const handleNewMessage = (message: Message) => { if (message.directMessage === selectedDM._id) setDmMessages((prev: Message[]) => [...prev, message]); };
    const handleMessageDeleted = (messageId: string) => setDmMessages((prev: Message[]) => prev.filter((m: Message) => m._id !== messageId));
    s.on('new-message', handleNewMessage);
    s.on('message-deleted', handleMessageDeleted);
    return () => { s.off('new-message', handleNewMessage); s.off('message-deleted', handleMessageDeleted); };
  }, [selectedDM, socket, fetchDMMessages]);

  const handleCreateServer = async (name: string) => {
    try {
      const response = await axios.post('/api/servers', { name });
      setServers((prev: Server[]) => [...prev, response.data]);
      setSelectedServer(response.data);
      if (socket) socket.emit('join-server', response.data._id);
      if (response.data.channels.length > 0) setSelectedChannel(response.data.channels[0]);
    } catch (error) { }
  };

  const handleChannelSelect = (channel: Channel) => {
    setInitialUnreadCount(unreadCounts[channel._id] || 0);
    setMessages([]);
    setSelectedChannel(channel);
    setSelectedDM(null);
    setShowFriends(false);
    setMobileView('content');
    
  };
  const handleStartDM = async (userId: string) => {
    try {
      const response = await axios.get(`/api/direct-messages/user/${userId}`);
      setInitialUnreadCount(unreadCounts[response.data._id] || 0);
      setDmMessages([]);
      setSelectedDM(response.data);
      setSelectedChannel(null);
      setSelectedServer(null);
      setShowFriends(false);
      setMobileView('content');
    } catch (error) { reportDMError(error); }
  };
  const handleStartDirectCall = (user: User, dmId: string) => { setActiveCall({ user, isIncoming: false, dmId, isGroup: false }); };
  const handleStartGroupCall = () => {
    if (!selectedDM || !user) return;
    const dmName = selectedDM.name || selectedDM.participants.filter(p => p._id !== user._id).map(p => p.username).join(', ');
    setActiveCall({
      user: user, // Current user is the one starting, but in group calls this simplifies things
      isIncoming: false,
      dmId: selectedDM._id,
      isGroup: true,
      dmName
    });
  };
  const handleServerDelete = (serverId: string) => {
    setServers(prev => prev.filter(s => s._id !== serverId));
    if (selectedServer?._id === serverId) { setSelectedServer(null); setSelectedChannel(null); }
  };
  const handleDeleteDM = async (dm: DirectMessage) => {
    const isGroup = dm.participants.length > 2 || !!dm.name;
    const ok = await customConfirm(
      isGroup
        ? 'Удалить эту беседу у всех участников вместе со всей перепиской? Действие необратимо.'
        : 'Удалить этот чат у обоих собеседников вместе со всей перепиской? Действие необратимо.',
      'Удалить чат',
      'Удалить',
      'Отмена'
    );
    if (!ok) return;
    try {
      await axios.delete(`/api/direct-messages/${dm._id}`);
      // Локальное состояние обновится по сокет-событию dm-deleted, но на случай
      // его потери чистим список и здесь.
      setDms((prev: DirectMessage[]) => prev.filter(d => d._id !== dm._id));
      setSelectedDM((prev: DirectMessage | null) => (prev && prev._id === dm._id) ? null : prev);
    } catch (err) { /* ошибку покажет общий обработчик */ }
  };

  const handleServerLeave = (serverId: string) => {
    setServers(prev => prev.filter(s => s._id !== serverId));
    if (selectedServer?._id === serverId) { setSelectedServer(null); setSelectedChannel(null); }
  };

    const handleShowShowcase = () => {
        setShowSettingsModal(false);
        setShowShowcase(true);
        setShowFriends(false);
        setSelectedServer(null);
        setSelectedChannel(null);
        setSelectedDM(null);
        setMobileView('content');
    };

    const handleOpenMiniApp = (app: MiniApp) => {
        // Запоминаем запуск, чтобы предлагать приложение для быстрого повторного
        // вызова (например, из панели голосового чата).
        addRecentMiniApp(app);
        // If app already open but minimized — just restore it.
        setMinimizedMiniAppIds(prev => { const n = new Set(prev); n.delete(app._id); return n; });
        if (!openMiniApps.find(a => a._id === app._id)) {
            setOpenMiniApps([...openMiniApps, app]);
        }
    };

    const handleCloseMiniApp = (appId: string) => {
        setOpenMiniApps(openMiniApps.filter(a => a._id !== appId));
        setMinimizedMiniAppIds(prev => { const n = new Set(prev); n.delete(appId); return n; });
        // Activity is recomputed by the centralized effect (game > miniapps > null).
    };

    const handleMinimizeMiniApp = (appId: string) => {
        setMinimizedMiniAppIds(prev => new Set(prev).add(appId));
    };

    const handleRestoreMiniApp = (appId: string) => {
        setMinimizedMiniAppIds(prev => { const n = new Set(prev); n.delete(appId); return n; });
    };

    const handleUserClick = (userId: string, event?: React.MouseEvent | CustomEvent, scopeless?: boolean) => {
    setShowProfileUserId(userId);
    setProfileScopeless(!!scopeless);
    if (event) {
      if ('clientX' in event) {
        setProfilePosition({ x: event.clientX, y: event.clientY });
      } else if (event.detail && typeof event.detail.x === 'number') {
        setProfilePosition({ x: event.detail.x, y: event.detail.y });
      }
    } else {
      setProfilePosition(null);
    }
  };

  const handleServerProfileClick = (event?: React.MouseEvent) => {
    setShowServerProfile(true);
    if (event) {
      setServerProfilePosition({ x: event.clientX, y: event.clientY });
    } else {
      setServerProfilePosition(null);
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div
      className={`main-container ${isMobile ? 'is-mobile' : ''} view-${mobileView} ${(!!(selectedChannel || selectedDM) && mobileView === 'content') ? 'in-conversation' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {( (!isMobile || mobileView === 'sidebar') ) && (
        <Sidebar
          isMobile={isMobile}
          user={user!} servers={servers} unreadCounts={unreadCounts} selectedServer={selectedServer}
          onServerSelect={(server) => {
              setSelectedServer(server); setShowFriends(false); setShowShowcase(false); setSelectedDM(null);
            const firstTextChannel = server.channels.find(c => c.type === 'text');
            if (firstTextChannel) {
              setMessages([]);
              setSelectedChannel(firstTextChannel);
              fetchMessages(firstTextChannel._id);
            }
            else if (server.channels.length > 0) setSelectedChannel(server.channels[0]);
            // On mobile, selecting a server stays in sidebar mode to show channel list
          }}
          onCreateServer={handleCreateServer}
          onServerJoined={(server) => { setServers((prev) => [...prev, server]); setSelectedServer(server); if (socket) socket.emit('join-server', server._id); if (server.channels.length > 0) setSelectedChannel(server.channels[0]); }}
          onLogout={logout} onShowFriends={() => { setShowFriends(false); setShowShowcase(false); setSelectedServer(null); setSelectedChannel(null); setSelectedDM(null); setMobileView('sidebar'); }}
          showFriends={showFriends}
          onShowShowcase={handleShowShowcase}
          showShowcase={showShowcase}
          onServerLeave={handleServerLeave}
          onOpenJoinModal={() => setShowJoinModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenProfile={handleUserClick}
          onToggleInbox={() => setShowInbox(!showInbox)}
          inboxUnreadCount={inboxUnreadCount}
          minimizedMiniApps={openMiniApps.filter(a => minimizedMiniAppIds.has(a._id))}
          onRestoreMiniApp={handleRestoreMiniApp}
          onCloseMiniApp={handleCloseMiniApp}
        />
      )}

      {/* --- SECOND SIDEBAR AREA --- */}
      {(() => {
        // Derive which secondary sidebar (if any) to render. Server sidebar wins when
        // a server is selected and we're not on the friends panel; otherwise DMSidebar.
        const sidebarKind: 'server' | 'dm' | null =
          selectedServer && !showFriends ? 'server'
          : (!selectedServer && !showShowcase) ? 'dm'
          : null;
        if (!(!isMobile || mobileView === 'sidebar')) return null;
        // Direction: server sidebar slides in from the right, DM sidebar from the left.
        const dir = sidebarKind === 'server' ? 1 : -1;
        const currentSidebarScale = (pageScales?.scaleMode === 'separate' && pageScales?.sidebar !== undefined)
          ? pageScales.sidebar
          : interfaceScale;
        const computedSidebarWidth = isMobile ? '100%' : `${sidebarWidth}px`;

        return (
          <React.Fragment>
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              {sidebarKind === 'server' && (
                <motion.div
                  key="server-sidebar"
                  className="secondary-sidebar-container"
                  style={{ width: computedSidebarWidth }}
                  custom={dir}
                  variants={sidebarSwapVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={iosSpring}
                >
                  <ServerSidebar
                    server={selectedServer!}
                    selectedChannel={selectedChannel}
                    unreadCounts={unreadCounts}
                    onChannelSelect={handleChannelSelect}
                    onChannelCreated={fetchServers}
                    onUserClick={handleUserClick}
                    onOpenSettings={() => setShowServerSettings(true)}
                    onServerClick={handleServerProfileClick}
                    style={{ width: '100%' }}
                  />
                </motion.div>
              )}
              {sidebarKind === 'dm' && (
                <motion.div
                  key="dm-sidebar"
                  className="secondary-sidebar-container"
                  style={{ width: computedSidebarWidth }}
                  custom={dir}
                  variants={sidebarSwapVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={iosSpring}
                >
                  <DMSidebar
                    dms={dms}
                    selectedDM={selectedDM}
                    onDMSelect={(dm) => {
                      setSelectedDM(dm);
                      setShowFriends(false);
                        setShowShowcase(false);
                        setSelectedServer(null);
                      setMobileView('content');
                    }}
                    onShowFriends={() => {
                      setShowFriends(true);
                        setShowShowcase(false);
                        setSelectedDM(null);
                      setMobileView(isMobile ? 'content' : 'sidebar');
                    }}
                    onAddDM={() => setShowCreateGroupModal(true)}
                    onDeleteDM={handleDeleteDM}
                    showFriends={showFriends}
                    currentUser={user!}
                    unreadCounts={unreadCounts}
                    style={{ width: '100%' }}
                    isMobile={isMobile}
                    friends={friends}
                    servers={servers}
                    onUserClick={handleUserClick}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            {!isMobile && sidebarKind && (
              <div
                className="sidebar-resizer"
                onMouseDown={handleSidebarResizeStart}
                onTouchStart={handleSidebarResizeStart}
                title="Перетащите для изменения ширины"
              />
            )}
          </React.Fragment>
        );
      })()}

      {/* --- CONTENT AREA --- */}
      {((!isMobile || mobileView === 'content' || mobileView === 'members')) && (
        <div className="main-content-area">
          <VerificationWarning onOpenSettings={() => setShowSettingsModal(true)} />
          {(() => {
            // Mutually-exclusive content swap. Outer key drives section change;
            // inner AnimatePresence inside Channel/DM blocks animates id swap separately.
            const contentKey: string | null = showShowcase ? 'showcase'
              : showFriends ? 'friends'
              : selectedChannel ? `channel-${selectedChannel.type}`
              : selectedDM ? 'dm'
              : !selectedServer ? 'empty-welcome'
              : null;

            return (
              <AnimatePresence mode="wait" initial={false}>
                {contentKey === 'showcase' && (
                  <motion.div
                    key="showcase"
                    className="content-swap-layer"
                    variants={contentSwapVariants}
                    initial="initial" animate="animate" exit="exit"
                    transition={iosSpring}
                  >
                    <ShowcaseView
                      onOpenMiniApp={handleOpenMiniApp}
                      onBack={() => setMobileView('sidebar')}
                      isMobile={isMobile}
                      friends={friends}
                      servers={servers}
                      onUserClick={handleUserClick}
                    />
                  </motion.div>
                )}

                {contentKey === 'friends' && (
                  <motion.div
                    key="friends"
                    className="content-swap-layer"
                    variants={contentSwapVariants}
                    initial="initial" animate="animate" exit="exit"
                    transition={iosSpring}
                  >
                    <FriendsPanel
                      friends={friends}
                      setFriends={setFriends}
                      onStartDM={handleStartDM}
                      onUserClick={handleUserClick}
                      unreadCounts={unreadCounts}
                      onBack={() => setMobileView('sidebar')}
                      isMobile={isMobile}
                      servers={servers}
                    />
                  </motion.div>
                )}

                {contentKey === 'channel-text' && selectedChannel && (
                  <motion.div
                    key="channel-text"
                    className="content-swap-layer"
                    variants={contentSwapVariants}
                    initial="initial" animate="animate" exit="exit"
                    transition={iosSpring}
                  >
                    {/* Plain remount on channel-id change — no inner exit animation.
                        VoiceChannelView portals its controls to #voice-controls-portal,
                        and a delayed unmount made those buttons linger across channel
                        switches. */}
                    <div key={selectedChannel._id} className="content-inner-layer">
                      <ChannelView
                        channel={selectedChannel}
                        server={selectedServer!}
                        messages={messages}
                        socket={socket}
                        onUserClick={handleUserClick}
                        initialUnreadCount={unreadCounts[selectedChannel._id]}
                        hasMore={hasMore}
                        isLoadingMore={isLoadingMore}
                        onLoadMore={loadMoreMessages}
                        pinnedMessages={pinnedMessages}
                        setMessages={setMessages}
                        onBack={() => setMobileView('sidebar')}
                        onToggleMembers={() => {
                          if (isMobile) {
                            setMobileView((prev: string) => prev === 'members' ? 'content' : 'members');
                          } else {
                            setShowMembersSidebar(prev => !prev);
                          }
                        }}
                        showMembersSidebar={isMobile ? mobileView === 'members' : showMembersSidebar}
                        isMobile={isMobile}
                      />
                    </div>
                  </motion.div>
                )}

                {contentKey === 'channel-voice' && selectedChannel && (
                  <motion.div
                    key="channel-voice"
                    className="content-swap-layer"
                    variants={contentSwapVariants}
                    initial="initial" animate="animate" exit="exit"
                    transition={iosSpring}
                  >
                    <div key={selectedChannel._id} className="voice-chat-container">
                      <div className="content-inner-layer">
                        <VoiceChannelView
                          channel={selectedChannel}
                          server={selectedServer!}
                          onUserClick={handleUserClick}
                          onMessageClick={handleStartDM}
                          onCallClick={async (userId) => {
                            try {
                              const response = await axios.get(`/api/direct-messages/user/${userId}`);
                              const other = response.data.participants.find((p: User) => p._id !== user?._id);
                              if (other) handleStartDirectCall(other, response.data._id);
                            } catch (e) { reportDMError(e); }
                          }}
                          onBack={() => setMobileView('sidebar')}
                          isMobile={isMobile}
                          onToggleChat={() => setShowVoiceChat(!showVoiceChat)}
                        />
                      </div>
                      {showVoiceChat && (
                        <React.Fragment>
                          {!isMobile && (
                            <div
                              className="sidebar-resizer"
                              onMouseDown={handleVoiceChatResizeStart}
                              onTouchStart={handleVoiceChatResizeStart}
                              title="Перетащите для изменения ширины"
                            />
                          )}
                          <div className="voice-chat-sidebar" style={!isMobile ? { width: `${voiceChatWidth}px` } : undefined}>
                            <ChannelView
                              channel={selectedChannel}
                              server={selectedServer!}
                              messages={messages}
                              socket={socket}
                              onUserClick={handleUserClick}
                              initialUnreadCount={unreadCounts[selectedChannel._id]}
                              hasMore={hasMore}
                              isLoadingMore={isLoadingMore}
                              onLoadMore={loadMoreMessages}
                              pinnedMessages={pinnedMessages}
                              setMessages={setMessages}
                              onBack={() => setMobileView('sidebar')}
                              isMobile={isMobile}
                            />
                          </div>
                        </React.Fragment>
                      )}
                    </div>
                  </motion.div>
                )}

                {contentKey === 'channel-room' && selectedChannel && (
                  <motion.div
                    key="channel-room"
                    className="content-swap-layer"
                    variants={contentSwapVariants}
                    initial="initial" animate="animate" exit="exit"
                    transition={iosSpring}
                  >
                    <div key={selectedChannel._id} className="voice-chat-container">
                      <div className="content-inner-layer">
                        <Room3DView
                          channel={selectedChannel}
                          server={selectedServer!}
                          onUserClick={handleUserClick}
                          isMobile={isMobile}
                          onToggleChat={() => setShowVoiceChat(!showVoiceChat)}
                        />
                      </div>
                      {showVoiceChat && (
                        <React.Fragment>
                          {!isMobile && (
                            <div
                              className="sidebar-resizer"
                              onMouseDown={handleVoiceChatResizeStart}
                              onTouchStart={handleVoiceChatResizeStart}
                              title="Перетащите для изменения ширины"
                            />
                          )}
                          <div className="voice-chat-sidebar" style={!isMobile ? { width: `${voiceChatWidth}px` } : undefined}>
                            <ChannelView
                              channel={selectedChannel}
                              server={selectedServer!}
                              messages={messages}
                              socket={socket}
                              onUserClick={handleUserClick}
                              initialUnreadCount={unreadCounts[selectedChannel._id]}
                              hasMore={hasMore}
                              isLoadingMore={isLoadingMore}
                              onLoadMore={loadMoreMessages}
                              pinnedMessages={pinnedMessages}
                              setMessages={setMessages}
                              onBack={() => setMobileView('sidebar')}
                              isMobile={isMobile}
                            />
                          </div>
                        </React.Fragment>
                      )}
                    </div>
                  </motion.div>
                )}

                {contentKey === 'dm' && selectedDM && (
                  <motion.div
                    key="dm"
                    className="content-swap-layer"
                    variants={contentSwapVariants}
                    initial="initial" animate="animate" exit="exit"
                    transition={iosSpring}
                  >
                    <div key={selectedDM._id} className="content-inner-layer">
                      <DMView
                        dm={selectedDM}
                        messages={dmMessages}
                        socket={socket}
                        onClose={() => { setSelectedDM(null); setShowFriends(true); setMobileView('sidebar'); }}
                        onStartCall={handleStartDirectCall}
                        onStartGroupCall={handleStartGroupCall}
                        onUserClick={handleUserClick}
                        initialUnreadCount={unreadCounts[selectedDM._id]}
                        hasMore={hasMore}
                        isLoadingMore={isLoadingMore}
                        onLoadMore={loadMoreDMMessages}
                        pinnedMessages={pinnedMessages.filter(m => m.directMessage === selectedDM._id)}
                        setMessages={setDmMessages}
                        onBack={() => setMobileView('sidebar')}
                        isMobile={isMobile}
                      />
                    </div>
                  </motion.div>
                )}

                {contentKey === 'empty-welcome' && (
                  <motion.div
                    key="empty-welcome"
                    className="content-swap-layer empty-view"
                    variants={contentSwapVariants}
                    initial="initial" animate="animate" exit="exit"
                    transition={iosSpring}
                  >
                    <h2>Добро пожаловать в {brand.name}!</h2>
                    <p>Выберите друга или сервер, чтобы начать общение</p>
                  </motion.div>
                )}
              </AnimatePresence>
            );
          })()}

          {selectedServer && selectedServer.showMembersList !== false && !showFriends && selectedChannel?.type !== 'voice' && selectedChannel?.type !== 'room' && (isMobile ? mobileView === 'members' : showMembersSidebar) && (
            <React.Fragment>
              {!isMobile && (
                <div
                  className="sidebar-resizer"
                  onMouseDown={handleMembersResizeStart}
                  onTouchStart={handleMembersResizeStart}
                  title="Перетащите для изменения ширины"
                />
              )}
              <div
                className={`members-sidebar-wrapper ${isMobile ? 'is-mobile' : ''}`}
                style={!isMobile ? { width: `${membersWidth}px` } : undefined}
              >
                <ServerMembers
                  server={selectedServer}
                  onUserClick={handleUserClick}
                  onBack={() => setMobileView('content')}
                  isMobile={isMobile}
                />
              </div>
            </React.Fragment>
          )}
        </div>
      )}

      {/* --- MOBILE BOTTOM NAVIGATION --- */}
      {(() => {
        if (!isMobile) return null;
        // Hide while reading a conversation (composer needs the space) and on the
        // full-screen members overlay.
        const inConversation = !!(selectedChannel || selectedDM) && mobileView === 'content';
        if (inConversation || mobileView === 'members' || showServerSettings) return null;

        const active: 'chats' | 'friends' | 'showcase' | 'settings' | null =
          showSettingsModal ? 'settings'
          : showShowcase ? 'showcase'
          : showFriends ? 'friends'
          : (!selectedServer ? 'chats' : null);

        const goChats = () => {
          setShowSettingsModal(false);
          setShowFriends(false); setShowShowcase(false);
          setSelectedServer(null); setSelectedChannel(null);
          setMobileView('sidebar');
        };
        const goFriends = () => {
          setShowSettingsModal(false);
          setShowFriends(true); setShowShowcase(false);
          setSelectedServer(null); setSelectedChannel(null); setSelectedDM(null);
          setMobileView('content');
        };

        return (
          <nav className="mobile-bottom-nav">
            <button className={`mbn-item ${active === 'chats' ? 'active' : ''}`} onClick={goChats}>
              <ChatIcon size={22} />
              <span>Чаты</span>
            </button>
            <button className={`mbn-item ${active === 'friends' ? 'active' : ''}`} onClick={goFriends}>
              <UsersIcon size={22} />
              <span>Друзья</span>
            </button>
            <button className={`mbn-item ${active === 'showcase' ? 'active' : ''}`} onClick={handleShowShowcase}>
              <LayoutGridIcon size={22} />
              <span>Витрина</span>
            </button>
            <button className={`mbn-item ${active === 'settings' ? 'active' : ''}`} onClick={() => setShowSettingsModal(true)}>
              <SettingsIcon size={22} />
              <span>Настройки</span>
            </button>
          </nav>
        );
      })()}

      <AnimatePresence>
        {activeCall && (
          <VoiceCall
            key="voice-call"
            socket={socket}
            otherUser={activeCall.user}
            dmId={activeCall.dmId}
            isGroup={activeCall.isGroup}
            dmName={activeCall.dmName}
            initialIncomingCall={activeCall.isIncoming}
            initialOffer={activeCall.offer}
            onEndCall={() => setActiveCall(null)}
            onOpenProfile={handleUserClick}
            onCallConnecting={leaveServerVoiceForCall}
          />
        )}
      </AnimatePresence>

      {showProfileUserId && (
        <UserProfileCard
          userId={showProfileUserId}
          onClose={() => { setShowProfileUserId(null); setProfilePosition(null); }}
          serverId={profileScopeless ? undefined : selectedServer?._id}
          position={profilePosition}
          onUserClick={handleUserClick}
        />
      )}

      {showServerSettings && selectedServer && <ServerSettingsLayout isOpen={showServerSettings} onClose={() => setShowServerSettings(false)} server={selectedServer} onServerUpdate={handleServerUpdate} onServerDelete={handleServerDelete} />}

      {showServerProfile && selectedServer && (
        <ServerProfileCard
          server={selectedServer}
          onClose={() => { setShowServerProfile(false); setServerProfilePosition(null); }}
          onLeave={handleServerLeave}
          position={serverProfilePosition}
          onUserClick={handleUserClick}
        />
      )}

      {showUserServerProfile && serverProfileServerId && <UserServerProfileModal isOpen={showUserServerProfile} onClose={() => setShowUserServerProfile(false)} serverId={serverProfileServerId} onUpdate={handleServerUpdate} />}

      {showJoinModal && (
        <JoinServerModal
          isOpen={showJoinModal}
          onClose={() => setShowJoinModal(false)}
          onJoin={(server) => {
            setServers((prev: Server[]) => [...prev, server]);
            setSelectedServer(server);
            if (socket) socket.emit('join-server', server._id);
            if (server.channels.length > 0) setSelectedChannel(server.channels[0]);
          }}
          onCreate={handleCreateServer}
        />
      )}

      {inviteServerId && (
        <ServerInviteModal
          isOpen={!!inviteServerId}
          serverId={inviteServerId}
          onClose={() => setInviteServerId(null)}
          onJoined={(server) => {
            setServers((prev: Server[]) => prev.some(s => s._id === server._id) ? prev : [...prev, server]);
            setSelectedServer(server);
            if (socket) socket.emit('join-server', server._id);
            const firstTextChannel = server.channels?.find((c: any) => c.type === 'text');
            if (firstTextChannel) setSelectedChannel(firstTextChannel);
            else if (server.channels?.length > 0) setSelectedChannel(server.channels[0]);
            setSelectedDM(null);
            setShowFriends(false);
            setMobileView('content');
          }}
        />
      )}

      {forwardMessage && user && (
        <ForwardMessageModal
          isOpen={!!forwardMessage}
          onClose={() => setForwardMessage(null)}
          message={forwardMessage}
          servers={servers}
          currentUser={user}
          socket={socket}
        />
      )}

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        initialTab={settingsInitialTab}
        initialData={settingsInitialData}
      />

      <PostAnnouncements />

      {showCreateGroupModal && (
        <CreateGroupDMModal
          isOpen={showCreateGroupModal}
          onClose={() => setShowCreateGroupModal(false)}
          friends={friends}
          onCreated={async (dmId) => {
            try {
              const res = await axios.get(`/api/direct-messages/${dmId}`);
              setDms((prev: DirectMessage[]) => [res.data, ...prev.filter((d: DirectMessage) => d._id !== dmId)]);
              setSelectedDM(res.data);
              setShowFriends(false);
            } catch (e) { }
          }}
        />
      )}

      <AnimatePresence>
        {showInbox && (
          <React.Fragment key="inbox-stack">
            <motion.div
              key="inbox-backdrop"
              className="inbox-backdrop"
              onClick={() => setShowInbox(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
            <Inbox
              key="inbox"
              onClose={() => setShowInbox(false)}
              onItemClick={(item) => {
                if (item.type === 'mention' || item.type === 'dm') {
                  if (item.link?.dmId) {
                    window.dispatchEvent(new CustomEvent('start-dm-by-id', { detail: { dmId: item.link.dmId } }));
                  } else if (item.link?.channelId) {
                    const server = servers.find(s => s.channels.some(c => c._id === item.link?.channelId));
                    if (server) {
                      setSelectedServer(server);
                      const channel = server.channels.find(c => c._id === item.link?.channelId);
                      if (channel) setSelectedChannel(channel);
                      setShowFriends(false);
                      setSelectedDM(null);
                    }
                  }
                } else if (item.type === 'friend_request') {
                  setShowFriends(true);
                  setSelectedServer(null);
                  setSelectedChannel(null);
                  setSelectedDM(null);
                }
                setShowInbox(false);
              }}
            />
          </React.Fragment>
        )}
      </AnimatePresence>
      <div id="voice-controls-portal" />

        <MiniAppContainer
            openApps={openMiniApps}
            minimizedIds={minimizedMiniAppIds}
            onClose={handleCloseMiniApp}
            onMinimize={handleMinimizeMiniApp}
        />
    </div>
  );
};

export default Main;
