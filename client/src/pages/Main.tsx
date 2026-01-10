import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useVoice } from '../contexts/VoiceContext';
import axios from 'axios';
import { Server, Channel, Message, DirectMessage, User } from '../types';
import Sidebar from '../components/Sidebar';
import ServerSidebar from '../components/ServerSidebar';
import ChannelView from '../components/ChannelView';
import VoiceChannelView from '../components/VoiceChannelView';
import ActiveVoiceOverlay from '../components/ActiveVoiceOverlay';
import FriendsPanel from '../components/FriendsPanel';
import DMView from '../components/DMView';
import VoiceCall from '../components/VoiceCall';
import UserProfileCard from '../components/UserProfileCard';
import ServerSettingsModal from '../components/ServerSettingsModal';
import ServerProfileCard from '../components/ServerProfileCard';
import UserServerProfileModal from '../components/UserServerProfileModal';
import ServerMembers from '../components/ServerMembers';
import { SOUNDS, soundManager } from '../utils/sounds';
import { useNotifications } from '../contexts/NotificationContext';
import './Main.css';

const Main: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const { socket } = useSocket();
  const { activeChannelId, leaveChannel } = useVoice();
  const { addNotification } = useNotifications();

  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [showFriends, setShowFriends] = useState(false);
  const [selectedDM, setSelectedDM] = useState<DirectMessage | null>(null);
  const [dmMessages, setDmMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const userRef = useRef(user);
  const selectedServerRef = useRef(selectedServer);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { selectedServerRef.current = selectedServer; }, [selectedServer]);

  const [activeCall, setActiveCall] = useState<{
    user: User;
    isIncoming: boolean;
    dmId: string;
    offer?: { fromUserId: string; offer: RTCSessionDescriptionInit; dmId: string };
  } | null>(null);
  const [showProfileUserId, setShowProfileUserId] = useState<string | null>(null);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showServerProfile, setShowServerProfile] = useState(false);
  const [showUserServerProfile, setShowUserServerProfile] = useState(false);
  const [serverProfileServerId, setServerProfileServerId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const isResizingRef = useRef(false);
  const hasViewInitializedRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = e.clientX - 72;
      if (newWidth > 200 && newWidth < 500) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = 'default';
    };
    const handleStartDMEvent = (e: any) => {
      setSelectedDM(e.detail.dm);
      setSelectedChannel(null);
      setSelectedServer(null);
      setShowFriends(false);
    };
    const handleStartCallEvent = (e: any) => { handleStartDirectCall(e.detail.user, e.detail.dmId); };
    const handleOpenServerProfileSettings = (e: any) => {
      setServerProfileServerId(e.detail.serverId);
      setShowUserServerProfile(true);
    };
    const handleStartDMById = async (e: any) => {
      try {
        const response = await axios.get(`/api/direct-messages/${e.detail.dmId}`);
        setSelectedDM(response.data);
        setSelectedChannel(null);
        setSelectedServer(null);
        setShowFriends(false);
      } catch (err) { }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('start-dm', handleStartDMEvent);
    window.addEventListener('start-call', handleStartCallEvent);
    window.addEventListener('open-server-profile-settings', handleOpenServerProfileSettings);
    window.addEventListener('start-dm-by-id', handleStartDMById);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('start-dm', handleStartDMEvent);
      window.removeEventListener('start-call', handleStartCallEvent);
      window.removeEventListener('open-server-profile-settings', handleOpenServerProfileSettings);
      window.removeEventListener('start-dm-by-id', handleStartDMById);
    };
  }, []);

  useEffect(() => {
    // @ts-ignore
    const electron = window.electron;
    if (electron && socket && user) {
      electron.getCurrentActivity?.().then((activity: any) => {
        if (activity) {
          socket.emit('activity-update', {
            name: activity.name,
            type: 'playing',
            assets: { largeImage: activity.icon },
            timestamps: { start: activity.startTime }
          });
        }
      });
      const removeActivityListener = electron.onActivityChanged?.((activity: any) => {
        if (activity) {
          socket.emit('activity-update', {
            name: activity.name,
            type: 'playing',
            assets: { largeImage: activity.icon },
            timestamps: { start: activity.startTime }
          });
        } else {
          socket.emit('activity-update', null);
        }
      });
      return () => { if (removeActivityListener) removeActivityListener(); };
    }
  }, [socket, user?._id]);

  const startResizing = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    if (selectedChannel) {
      setUnreadCounts(prev => {
        if (!prev[selectedChannel._id]) return prev;
        const next = { ...prev };
        delete next[selectedChannel._id];
        return next;
      });
    }
  }, [selectedChannel]);

  useEffect(() => {
    if (selectedDM) {
      setUnreadCounts(prev => {
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
      setServers(response.data);
      if (!hasViewInitializedRef.current && response.data.length > 0 && !selectedServerRef.current) {
        hasViewInitializedRef.current = true;
        const firstServer = response.data[0];
        setSelectedServer(firstServer);
        const firstTextChannel = firstServer.channels.find((c: any) => c.type === 'text');
        if (firstTextChannel) setSelectedChannel(firstTextChannel);
        else if (firstServer.channels.length > 0) setSelectedChannel(firstServer.channels[0]);
      } else if (!hasViewInitializedRef.current) hasViewInitializedRef.current = true;
    } catch (error) { } finally { setLoading(false); }
  }, []);

  const fetchMessages = useCallback(async (channelId: string) => {
    try {
      const response = await axios.get(`/api/messages/channel/${channelId}`);
      setMessages(response.data);
    } catch (error) { }
  }, []);

  const fetchDMMessages = useCallback(async (dmId: string) => {
    try {
      const response = await axios.get(`/api/direct-messages/${dmId}/messages`);
      setDmMessages(response.data);
    } catch (error) { }
  }, []);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  useEffect(() => {
    if (socket && servers.length > 0) {
      servers.forEach(server => socket.emit('join-server', server._id));
    }
  }, [socket, servers.length]);

  const handleServerUpdate = useCallback((updatedServer: Server) => {
    setServers(prev => prev.map(s => s._id === updatedServer._id ? updatedServer : s));
    setSelectedServer(prev => (prev && prev._id === updatedServer._id) ? updatedServer : prev);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleCallOffer = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit; dmId: string }) => {
      if (!activeCall) {
        try {
          const response = await axios.get<User>(`/api/users/${data.fromUserId}`);
          setActiveCall({ user: response.data, isIncoming: true, dmId: data.dmId || '', offer: data });
        } catch (err) { }
      }
    };
    const handleServerMemberUpdate = (data: { serverId: string; member: any }) => {
      const targetUserId = String(data.member.user?._id || data.member.user);
      setServers(prev => prev.map(s => s._id === data.serverId ? { ...s, members: s.members.map(m => String(m.user?._id || m.user) === targetUserId ? data.member : m) } : s));
      setSelectedServer(prev => (prev && prev._id === data.serverId) ? { ...prev, members: prev.members.map(m => String(m.user?._id || m.user) === targetUserId ? data.member : m) } : prev);
    };
    const handleUserUpdate = (updatedUser: Partial<User> & { _id: string }) => {
      const targetUserId = String(updatedUser._id);
      setServers(prev => prev.map(server => ({
        ...server,
        members: server.members.map(member => String(member.user?._id || member.user) === targetUserId ? { ...member, user: { ...member.user, ...updatedUser } } : member)
      })));
      setSelectedServer(prev => prev ? {
        ...prev,
        members: prev.members.map(member => String(member.user?._id || member.user) === targetUserId ? { ...member, user: { ...member.user, ...updatedUser } } : member)
      } : prev);
      setSelectedDM(prev => prev ? {
        ...prev,
        participants: prev.participants.map(p => p._id === updatedUser._id ? { ...p, ...updatedUser } : p)
      } : prev);
      if (updatedUser._id === user?._id) updateUser(updatedUser);
    };
    const handleServerMemberJoined = (data: { serverId: string; member: any; server?: Server }) => {
      if (data.server) { handleServerUpdate(data.server); return; }
      const newUserId = String(data.member.user?._id || data.member.user);
      setServers(prev => prev.map(s => (s._id === data.serverId && !s.members.some(m => String(m.user?._id || m.user) === newUserId)) ? { ...s, members: [...s.members, data.member] } : s));
      setSelectedServer(prev => (prev && prev._id === data.serverId && !prev.members.some(m => String(m.user?._id || m.user) === newUserId)) ? { ...prev, members: [...prev.members, data.member] } : prev);
    };
    const handleServerMemberLeft = (data: { serverId: string; userId: string }) => {
      const targetUserId = String(data.userId);
      setServers(prev => prev.map(s => s._id === data.serverId ? { ...s, members: s.members.filter(m => String(m.user?._id || m.user) !== targetUserId) } : s));
      setSelectedServer(prev => (prev && prev._id === data.serverId) ? { ...prev, members: prev.members.filter(m => String(m.user?._id || m.user) !== targetUserId) } : prev);
      if (userRef.current?._id && targetUserId === String(userRef.current._id)) {
        leaveChannel();
        setServers(prev => prev.filter(s => s._id !== data.serverId));
        setSelectedServer(prev => prev && prev._id === data.serverId ? null : prev);
        setSelectedChannel(prev => (prev && String((prev.server as any)?._id || prev.server) === data.serverId) ? null : prev);
      }
    };
    const handleServerKicked = (data: { serverId: string }) => {
      leaveChannel();
      setServers(prev => prev.filter(s => s._id !== data.serverId));
      setSelectedServer(prev => prev && prev._id === data.serverId ? null : prev);
      setSelectedChannel(prev => (prev && String((prev.server as any)?._id || prev.server) === data.serverId) ? null : prev);
    };
    const handleServerDeletedSocket = (data: { serverId: string }) => { handleServerDelete(data.serverId); };

    socket.on('call-offer', handleCallOffer);
    socket.on('server-member-updated', handleServerMemberUpdate);
    socket.on('server-updated', handleServerUpdate);
    socket.on('user-updated', handleUserUpdate);
    socket.on('server-member-joined', handleServerMemberJoined);
    socket.on('server-member-left', handleServerMemberLeft);
    socket.on('server-kicked', handleServerKicked);
    socket.on('server-deleted', handleServerDeletedSocket);
    return () => {
      socket.off('call-offer', handleCallOffer);
      socket.off('server-member-updated', handleServerMemberUpdate);
      socket.off('server-updated', handleServerUpdate);
      socket.off('user-updated', handleUserUpdate);
      socket.off('server-member-joined', handleServerMemberJoined);
      socket.off('server-member-left', handleServerMemberLeft);
      socket.off('server-kicked', handleServerKicked);
      socket.off('server-deleted', handleServerDeletedSocket);
    };
  }, [socket, activeCall, user, updateUser, handleServerUpdate]);

  useEffect(() => {
    if (!socket || !user) return;
    const handleGlobalMessage = (message: Message) => {
      if (message.author._id !== user._id) {
        soundManager.play(SOUNDS.MESSAGE_NOTIFY, 0.5);
        if (!(selectedChannel && message.channel === selectedChannel._id) && !(selectedDM && message.directMessage === selectedDM._id)) {
          const id = message.directMessage || message.channel;
          if (id) setUnreadCounts(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
          addNotification({
            title: message.author.username, content: message.content, type: 'message', avatar: message.author.avatar || undefined,
            onClick: () => {
              if (message.directMessage) window.dispatchEvent(new CustomEvent('start-dm-by-id', { detail: { dmId: message.directMessage } }));
              else if (message.channel) {
                const server = servers.find(s => s.channels.some(c => c._id === message.channel));
                if (server) {
                  setSelectedServer(server);
                  const channel = server.channels.find(c => c._id === message.channel);
                  if (channel) setSelectedChannel(channel);
                  setShowFriends(false); setSelectedDM(null);
                }
              }
            }
          });
        }
      }
    };
    socket.on('new-message', handleGlobalMessage);
    return () => { socket.off('new-message', handleGlobalMessage); };
  }, [socket, user, selectedChannel?._id, selectedDM?._id, servers, addNotification]);

  useEffect(() => {
    if (!selectedChannel || !socket) return;
    if (selectedChannel.type === 'text') {
      setMessages([]); setSelectedDM(null);
      socket.emit('join-channel', selectedChannel._id);
      fetchMessages(selectedChannel._id);
      const handleNewMessage = (message: Message) => { if (message.channel === selectedChannel._id) setMessages((prev) => [...prev, message]); };
      const handleMessageDeleted = (messageId: string) => setMessages((prev) => prev.filter(m => m._id !== messageId));
      socket.on('new-message', handleNewMessage);
      socket.on('message-deleted', handleMessageDeleted);
      return () => {
        socket.emit('leave-channel', selectedChannel._id);
        socket.off('new-message', handleNewMessage);
        socket.off('message-deleted', handleMessageDeleted);
      };
    } else { setMessages([]); setSelectedDM(null); }
  }, [selectedChannel, socket, fetchMessages]);

  useEffect(() => {
    if (!selectedDM || !socket) return;
    setDmMessages([]); setSelectedChannel(null);
    fetchDMMessages(selectedDM._id);
    const handleNewMessage = (message: Message) => { if (message.directMessage === selectedDM._id) setDmMessages((prev) => [...prev, message]); };
    const handleMessageDeleted = (messageId: string) => setDmMessages((prev) => prev.filter(m => m._id !== messageId));
    socket.on('new-message', handleNewMessage);
    socket.on('message-deleted', handleMessageDeleted);
    return () => { socket.off('new-message', handleNewMessage); socket.off('message-deleted', handleMessageDeleted); };
  }, [selectedDM, socket, fetchDMMessages]);

  const handleCreateServer = async (name: string) => {
    try {
      const response = await axios.post('/api/servers', { name });
      setServers((prev) => [...prev, response.data]);
      setSelectedServer(response.data);
      if (socket) socket.emit('join-server', response.data._id);
      if (response.data.channels.length > 0) setSelectedChannel(response.data.channels[0]);
    } catch (error) { }
  };

  const handleChannelSelect = (channel: Channel) => { setSelectedChannel(channel); setSelectedDM(null); setShowFriends(false); if (channel.type === 'voice') setMessages([]); };
  const handleStartDM = async (userId: string) => {
    try {
      const response = await axios.get(`/api/direct-messages/user/${userId}`);
      setSelectedDM(response.data); setSelectedChannel(null); setSelectedServer(null); setShowFriends(false);
    } catch (error) { }
  };
  const handleStartDirectCall = (user: User, dmId: string) => { setActiveCall({ user, isIncoming: false, dmId }); };
  const handleServerDelete = (serverId: string) => {
    setServers(prev => prev.filter(s => s._id !== serverId));
    if (selectedServer?._id === serverId) { setSelectedServer(null); setSelectedChannel(null); }
  };
  const handleServerLeave = (serverId: string) => {
    setServers(prev => prev.filter(s => s._id !== serverId));
    if (selectedServer?._id === serverId) { setSelectedServer(null); setSelectedChannel(null); }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div className="main-container">
      <Sidebar
        user={user!} servers={servers} unreadCounts={unreadCounts} selectedServer={selectedServer}
        onServerSelect={(server) => {
          setSelectedServer(server); setShowFriends(false); setSelectedDM(null);
          const firstTextChannel = server.channels.find(c => c.type === 'text');
          if (firstTextChannel) { setSelectedChannel(firstTextChannel); fetchMessages(firstTextChannel._id); }
          else if (server.channels.length > 0) setSelectedChannel(server.channels[0]);
        }}
        onCreateServer={handleCreateServer}
        onServerJoined={(server) => { setServers((prev) => [...prev, server]); setSelectedServer(server); if (socket) socket.emit('join-server', server._id); if (server.channels.length > 0) setSelectedChannel(server.channels[0]); }}
        onLogout={logout} onShowFriends={() => { setShowFriends(true); setSelectedServer(null); setSelectedChannel(null); setSelectedDM(null); }}
        onServerLeave={handleServerLeave}
      />
      {showFriends && <FriendsPanel onStartDM={handleStartDM} onUserClick={setShowProfileUserId} unreadCounts={unreadCounts} />}
      {selectedServer && !showFriends && (
        <>
          <ServerSidebar
            server={selectedServer} selectedChannel={selectedChannel} unreadCounts={unreadCounts} onChannelSelect={handleChannelSelect}
            onChannelCreated={fetchServers} onUserClick={setShowProfileUserId} onOpenSettings={() => setShowServerSettings(true)}
            onServerClick={() => setShowServerProfile(true)} style={{ width: `${sidebarWidth}px` }}
          />
          <div className="sidebar-resizer" onMouseDown={startResizing} />
        </>
      )}
      {selectedChannel && !showFriends && (
        selectedChannel.type === 'text' ? (
          <ChannelView channel={selectedChannel} server={selectedServer!} messages={messages} socket={socket} onUserClick={setShowProfileUserId} />
        ) : (
          <VoiceChannelView
            channel={selectedChannel} server={selectedServer!} onUserClick={setShowProfileUserId} onMessageClick={handleStartDM}
            onCallClick={async (userId) => {
              try {
                const response = await axios.get(`/api/direct-messages/user/${userId}`);
                const other = response.data.participants.find((p: User) => p._id !== user?._id);
                if (other) handleStartDirectCall(other, response.data._id);
              } catch (e) { }
            }}
          />
        )
      )}
      {selectedServer && !showFriends && <ServerMembers server={selectedServer} onUserClick={setShowProfileUserId} />}
      {selectedDM && !showFriends && <DMView dm={selectedDM} messages={dmMessages} socket={socket} onClose={() => setSelectedDM(null)} onStartCall={handleStartDirectCall} onUserClick={setShowProfileUserId} />}
      {!selectedChannel && !selectedDM && !showFriends && (
        <div className="empty-view"><h2>Добро пожаловать в Zvon!</h2><p>Выберите сервер или откройте панель друзей, чтобы начать общение</p></div>
      )}

      {activeChannelId && activeChannelId !== selectedChannel?._id && (() => {
        let activeVoiceChannel: Channel | undefined;
        for (const s of servers) {
          activeVoiceChannel = s.channels.find(c => c._id === activeChannelId);
          if (activeVoiceChannel) break;
        }
        if (activeVoiceChannel) {
          return (
            <ActiveVoiceOverlay
              channel={activeVoiceChannel}
              onReturn={() => {
                const serverId = typeof activeVoiceChannel!.server === 'string' ? activeVoiceChannel!.server : activeVoiceChannel!.server._id;
                const server = servers.find(s => s._id === serverId);
                if (server) setSelectedServer(server);
                handleChannelSelect(activeVoiceChannel!);
              }}
            />
          );
        }
        return null;
      })()}
      {activeCall && <VoiceCall socket={socket} otherUser={activeCall.user} dmId={activeCall.dmId} initialIncomingCall={activeCall.isIncoming} initialOffer={activeCall.offer} onEndCall={() => setActiveCall(null)} />}
      {showProfileUserId && <UserProfileCard userId={showProfileUserId} onClose={() => setShowProfileUserId(null)} serverId={selectedServer?._id} />}
      {showServerSettings && selectedServer && <ServerSettingsModal isOpen={showServerSettings} onClose={() => setShowServerSettings(false)} server={selectedServer} onServerUpdate={handleServerUpdate} onServerDelete={handleServerDelete} />}
      {showServerProfile && selectedServer && <ServerProfileCard server={selectedServer} onClose={() => setShowServerProfile(false)} onLeave={handleServerLeave} />}
      {showUserServerProfile && serverProfileServerId && <UserServerProfileModal isOpen={showUserServerProfile} onClose={() => setShowUserServerProfile(false)} serverId={serverProfileServerId} onUpdate={handleServerUpdate} />}
    </div>
  );
};

export default Main;
