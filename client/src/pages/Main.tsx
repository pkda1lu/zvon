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

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    selectedServerRef.current = selectedServer;
  }, [selectedServer]);

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


  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = e.clientX - 72; // Subtracting the first fixed sidebar width
      if (newWidth > 200 && newWidth < 500) {
        setSidebarWidth(newWidth);
      }
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

    const handleStartCallEvent = (e: any) => {
      handleStartDirectCall(e.detail.user, e.detail.dmId);
    };

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
      } catch (err) {
        console.error('Error opening DM by id:', err);
      }
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

  const startResizing = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
  };

  // Clear unread counts when selecting channel or DM
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
      if (response.data.length > 0) {
        setSelectedServer(response.data[0]);
        if (response.data[0].channels.length > 0) {
          setSelectedChannel(response.data[0].channels[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (channelId: string) => {
    try {
      const response = await axios.get(`/api/messages/channel/${channelId}`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, []);

  const fetchDMMessages = useCallback(async (dmId: string) => {
    try {
      const response = await axios.get(`/api/direct-messages/${dmId}/messages`);
      setDmMessages(response.data);
    } catch (error) {
      console.error('Error fetching DM messages:', error);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Join all server rooms for real-time updates
  useEffect(() => {
    if (socket && servers.length > 0) {
      console.log('Joining all server rooms:', servers.map(s => s._id));
      servers.forEach(server => {
        socket.emit('join-server', server._id);
      });
    }
  }, [socket, servers.length]); // Use length to avoid re-running on deep object changes unless needed

  const handleServerUpdate = useCallback((updatedServer: Server) => {
    console.log('Server update received:', updatedServer.name, updatedServer._id);
    setServers(prev => prev.map(s => s._id === updatedServer._id ? updatedServer : s));
    setSelectedServer(prev => {
      if (prev && prev._id === updatedServer._id) {
        return updatedServer;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleCallOffer = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit; dmId: string }) => {
      if (!activeCall) {
        try {
          const response = await axios.get<User>(`/api/users/${data.fromUserId}`);
          setActiveCall({
            user: response.data,
            isIncoming: true,
            dmId: data.dmId || '',
            offer: data
          });
        } catch (err) {
          console.error("Error handling incoming call offer:", err);
        }
      }
    };

    const handleServerRolesUpdate = (data: { serverId: string; roles: any[] }) => {
      console.log('Roles updated for server:', data.serverId);
      setServers(prev => prev.map(s => s._id === data.serverId ? { ...s, roles: data.roles } : s));
      setSelectedServer(prev => (prev && prev._id === data.serverId) ? { ...prev, roles: data.roles } : prev);
    };

    const handleServerMemberUpdate = (data: { serverId: string; member: any }) => {
      console.log('Member update received:', data.serverId, data.member?.user?.username || data.member?.user);
      const getMemberUserId = (m: any) => String(m.user?._id || m.user);
      const targetUserId = getMemberUserId(data.member);

      setServers(prev => prev.map(s => {
        if (s._id === data.serverId) {
          return {
            ...s,
            members: s.members.map(m => getMemberUserId(m) === targetUserId ? data.member : m)
          };
        }
        return s;
      }));
      setSelectedServer(prev => {
        if (prev && prev._id === data.serverId) {
          return {
            ...prev,
            members: prev.members.map(m => getMemberUserId(m) === targetUserId ? data.member : m)
          };
        }
        return prev;
      });
    };


    const handleUserUpdate = (updatedUser: Partial<User> & { _id: string }) => {
      const getMemberUserId = (m: any) => String(m.user?._id || m.user);
      const targetUserId = String(updatedUser._id);

      setServers(prev => prev.map(server => ({
        ...server,
        members: server.members.map(member =>
          getMemberUserId(member) === targetUserId
            ? { ...member, user: { ...member.user, ...updatedUser } }
            : member
        )
      })));

      setSelectedServer(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(member =>
            getMemberUserId(member) === targetUserId
              ? { ...member, user: { ...member.user, ...updatedUser } }
              : member
          )
        };
      });

      setSelectedDM(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map(p =>
            p._id === updatedUser._id ? { ...p, ...updatedUser } : p
          )
        };
      });

      if (updatedUser._id === user?._id) {
        updateUser(updatedUser);
      }
    };

    const handleServerMemberJoined = (data: { serverId: string; member: any; server?: Server }) => {
      console.log('Member joined event:', data.serverId, data.member?.user?.username || 'unknown');
      // If the full server object is provided, use it for best sync
      if (data.server) {
        console.log('Using full server object from join event');
        handleServerUpdate(data.server);
        return;
      }

      const getMemberUserId = (m: any) => String(m.user?._id || m.user);
      const newUserId = getMemberUserId(data.member);

      setServers(prev => prev.map(s => {
        if (s._id === data.serverId) {
          // Check if already in list to avoid duplicates
          if (s.members.some(m => getMemberUserId(m) === newUserId)) return s;
          return { ...s, members: [...s.members, data.member] };
        }
        return s;
      }));
      setSelectedServer(prev => {
        if (prev && prev._id === data.serverId) {
          if (prev.members.some(m => getMemberUserId(m) === newUserId)) return prev;
          return { ...prev, members: [...prev.members, data.member] };
        }
        return prev;
      });
    };

    const handleServerMemberLeft = (data: { serverId: string; userId: string }) => {
      console.log('Member left event:', data.serverId, data.userId);
      const getMemberUserId = (m: any) => String(m.user?._id || m.user);
      const targetUserId = String(data.userId);

      setServers(prev => prev.map(s => {
        if (s._id === data.serverId) {
          return { ...s, members: s.members.filter(m => getMemberUserId(m) !== targetUserId) };
        }
        return s;
      }));
      setSelectedServer(prev => {
        if (prev && prev._id === data.serverId) {
          return { ...prev, members: prev.members.filter(m => getMemberUserId(m) !== targetUserId) };
        }
        return prev;
      });

      // If the current user is the one who left/was kicked
      const currentUserId = userRef.current?._id;
      if (currentUserId && targetUserId === String(currentUserId)) {
        // Automatically leave voice if it was from this server
        leaveChannel();

        setServers(prev => prev.filter(s => s._id !== data.serverId));
        setSelectedServer(prev => prev && prev._id === data.serverId ? null : prev);
        setSelectedChannel(prev => {
          if (prev) {
            const channelServerId = typeof prev.server === 'string' ? prev.server : prev.server?._id;
            if (String(channelServerId) === data.serverId) return null;
          }
          return prev;
        });
      }
    };

    const handleServerKicked = (data: { serverId: string }) => {
      // Automatically leave voice if it was from this server
      leaveChannel();

      setServers(prev => prev.filter(s => s._id !== data.serverId));
      setSelectedServer(prev => prev && prev._id === data.serverId ? null : prev);
      setSelectedChannel(prev => {
        if (prev) {
          const channelServerId = typeof prev.server === 'string' ? prev.server : prev.server?._id;
          if (String(channelServerId) === data.serverId) return null;
        }
        return prev;
      });
    };

    const handleServerDeletedSocket = (data: { serverId: string }) => {
      handleServerDelete(data.serverId);
    };

    socket.on('call-offer', handleCallOffer);
    socket.on('server-roles-updated', handleServerRolesUpdate);
    socket.on('server-member-updated', handleServerMemberUpdate);
    socket.on('server-updated', handleServerUpdate);
    socket.on('user-updated', handleUserUpdate);
    socket.on('server-member-joined', handleServerMemberJoined);
    socket.on('server-member-left', handleServerMemberLeft);
    socket.on('server-kicked', handleServerKicked);
    socket.on('server-deleted', handleServerDeletedSocket);

    return () => {
      socket.off('call-offer', handleCallOffer);
      socket.off('server-roles-updated', handleServerRolesUpdate);
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

        // Show visual notification if not in the active channel/DM
        const isCurrentChannel = selectedChannel && message.channel === selectedChannel._id;
        const isCurrentDM = selectedDM && message.directMessage === selectedDM._id;

        if (!isCurrentChannel && !isCurrentDM) {
          // Increment unread count
          const id = message.directMessage || message.channel;
          if (id) {
            setUnreadCounts(prev => ({
              ...prev,
              [id]: (prev[id] || 0) + 1
            }));
          }

          addNotification({
            title: message.author.username,
            content: message.content,
            type: 'message',
            avatar: message.author.avatar || undefined,
            onClick: () => {
              // Navigate to the message source
              if (message.directMessage) {
                const dmEvent = new CustomEvent('start-dm-by-id', { detail: { dmId: message.directMessage } });
                window.dispatchEvent(dmEvent);
              } else if (message.channel) {
                // Find server and channel
                const server = servers.find(s => s.channels.some(c => c._id === message.channel));
                if (server) {
                  setSelectedServer(server);
                  const channel = server.channels.find(c => c._id === message.channel);
                  if (channel) setSelectedChannel(channel);
                  setShowFriends(false);
                  setSelectedDM(null);
                }
              }
            }
          });
        }
      }
    };

    socket.on('new-message', handleGlobalMessage);
    return () => {
      socket.off('new-message', handleGlobalMessage);
    };
  }, [socket, user, selectedChannel?._id, selectedDM?._id, servers, addNotification]);

  useEffect(() => {
    if (!selectedChannel || !socket) return;

    if (selectedChannel.type === 'text') {
      setMessages([]);
      setSelectedDM(null);

      socket.emit('join-channel', selectedChannel._id);
      fetchMessages(selectedChannel._id);

      const handleNewMessage = (message: Message) => {
        if (message.channel === selectedChannel._id) {
          setMessages((prev) => [...prev, message]);
        }
      };

      const handleMessageDeleted = (messageId: string) => {
        setMessages((prev) => prev.filter(m => m._id !== messageId));
      };

      socket.on('new-message', handleNewMessage);
      socket.on('message-deleted', handleMessageDeleted);

      return () => {
        socket.emit('leave-channel', selectedChannel._id);
        socket.off('new-message', handleNewMessage);
        socket.off('message-deleted', handleMessageDeleted);
      };
    } else {
      // Voice channel or other type - clear messages
      setMessages([]);
      setSelectedDM(null);
    }
  }, [selectedChannel, socket, fetchMessages]);

  useEffect(() => {
    if (!selectedDM || !socket) return;

    setDmMessages([]);
    setSelectedChannel(null);
    fetchDMMessages(selectedDM._id);

    const handleNewMessage = (message: Message) => {
      if (message.directMessage === selectedDM._id) {
        setDmMessages((prev) => [...prev, message]);
      }
    };

    const handleMessageDeleted = (messageId: string) => {
      setDmMessages((prev) => prev.filter(m => m._id !== messageId));
    };

    socket.on('new-message', handleNewMessage);
    socket.on('message-deleted', handleMessageDeleted);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message-deleted', handleMessageDeleted);
    };
  }, [selectedDM, socket, fetchDMMessages]);

  const handleCreateServer = async (name: string) => {
    try {
      const response = await axios.post('/api/servers', { name });
      setServers((prev) => [...prev, response.data]);
      setSelectedServer(response.data);
      if (socket) {
        socket.emit('join-server', response.data._id);
      }
      if (response.data.channels.length > 0) {
        setSelectedChannel(response.data.channels[0]);
      }
    } catch (error) {
      console.error('Error creating server:', error);
    }
  };

  const handleChannelSelect = (channel: Channel) => {
    setSelectedChannel(channel);
    setSelectedDM(null);
    setShowFriends(false);
    // Clear messages when selecting voice channel
    if (channel.type === 'voice') {
      setMessages([]);
    }
  };

  const handleStartDM = async (userId: string) => {
    try {
      const response = await axios.get(`/api/direct-messages/user/${userId}`);
      setSelectedDM(response.data);
      setSelectedChannel(null);
      setShowFriends(false);
    } catch (error) {
      console.error('Error starting DM:', error);
    }
  };

  const handleStartDirectCall = (user: User, dmId: string) => {
    setActiveCall({
      user,
      isIncoming: false,
      dmId
    });
  };

  // Functional updates are handled via socket listeners or manual triggers

  // Functional updates are handled via socket listeners or manual triggers
  // Removing shadowed handleServerUpdate to avoid confusion

  const handleServerDelete = (serverId: string) => {
    setServers(prev => prev.filter(s => s._id !== serverId));
    if (selectedServer?._id === serverId) {
      setSelectedServer(null);
      setSelectedChannel(null);
    }
  };

  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }

  return (
    <div className="main-container">
      <Sidebar
        user={user!}
        servers={servers}
        unreadCounts={unreadCounts}
        selectedServer={selectedServer}
        onServerSelect={(server) => {
          setSelectedServer(server);
          setShowFriends(false);
          setSelectedDM(null);
        }}
        onCreateServer={handleCreateServer}
        onServerJoined={(server) => {
          setServers((prev) => [...prev, server]);
          setSelectedServer(server);
          if (socket) {
            socket.emit('join-server', server._id);
          }
          if (server.channels.length > 0) {
            setSelectedChannel(server.channels[0]);
          }
        }}
        onLogout={logout}
        onShowFriends={() => {
          setShowFriends(true);
          setSelectedServer(null);
          setSelectedChannel(null);
          setSelectedDM(null);
        }}
      />
      {showFriends && (
        <FriendsPanel
          onStartDM={handleStartDM}
          onUserClick={setShowProfileUserId}
          unreadCounts={unreadCounts}
        />
      )}
      {selectedServer && !showFriends && (
        <>
          <ServerSidebar
            server={selectedServer}
            selectedChannel={selectedChannel}
            unreadCounts={unreadCounts}
            onChannelSelect={handleChannelSelect}
            onChannelCreated={fetchServers}
            onUserClick={setShowProfileUserId}
            onOpenSettings={() => setShowServerSettings(true)}
            onServerClick={() => setShowServerProfile(true)}
            style={{ width: `${sidebarWidth}px` }}
          />
          <div className="sidebar-resizer" onMouseDown={startResizing} />
        </>
      )}
      {selectedChannel && !showFriends && (
        selectedChannel.type === 'text' ? (
          <ChannelView
            channel={selectedChannel}
            server={selectedServer!}
            messages={messages}
            socket={socket}
            onUserClick={setShowProfileUserId}
          />
        ) : (
          <VoiceChannelView
            channel={selectedChannel}
            server={selectedServer!}
            onUserClick={setShowProfileUserId}
            onMessageClick={handleStartDM}
            onCallClick={async (userId) => {
              try {
                const response = await axios.get(`/api/direct-messages/user/${userId}`);
                const dm = response.data;
                const other = dm.participants.find((p: User) => p._id !== user?._id);
                if (other) {
                  handleStartDirectCall(other, dm._id);
                }
              } catch (e) {
                console.error("Error starting call from context", e);
              }
            }}
          />
        )
      )}
      {selectedDM && !showFriends && (
        <DMView
          dm={selectedDM}
          messages={dmMessages}
          socket={socket}
          onClose={() => setSelectedDM(null)}
          onStartCall={handleStartDirectCall}
          onUserClick={setShowProfileUserId}
        />
      )}
      {!selectedChannel && !selectedDM && !showFriends && (
        <div className="empty-view">
          <h2>Добро пожаловать в Zvon!</h2>
          <p>Выберите сервер или откройте панель друзей, чтобы начать общение</p>
        </div>
      )}

      {/* Show overlay if connected to voice but viewing something else */}
      {activeChannelId && activeChannelId !== selectedChannel?._id && (
        (() => {
          // Find the active channel object
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
                  // Find the server this channel belongs to
                  const serverId = typeof activeVoiceChannel!.server === 'string'
                    ? activeVoiceChannel!.server
                    : activeVoiceChannel!.server._id;
                  const server = servers.find(s => s._id === serverId);
                  if (server) setSelectedServer(server);
                  handleChannelSelect(activeVoiceChannel!);
                }}
              />
            );
          }
          return null;
        })()
      )}
      {activeCall && (
        <VoiceCall
          socket={socket}
          otherUser={activeCall.user}
          dmId={activeCall.dmId}
          initialIncomingCall={activeCall.isIncoming}
          initialOffer={activeCall.offer}
          onEndCall={() => setActiveCall(null)}
        />
      )}
      {showProfileUserId && (
        <UserProfileCard
          userId={showProfileUserId}
          onClose={() => setShowProfileUserId(null)}
          serverId={selectedServer?._id}
          currentUser={user}
          currentServer={selectedServer}
        />
      )}
      {selectedServer && showServerSettings && (
        <ServerSettingsModal
          isOpen={showServerSettings}
          onClose={() => setShowServerSettings(false)}
          server={selectedServer}
          onServerUpdate={handleServerUpdate}
          onServerDelete={handleServerDelete}
        />
      )}
      {selectedServer && showServerProfile && (
        <ServerProfileCard
          server={selectedServer}
          onClose={() => setShowServerProfile(false)}
        />
      )}
      {showUserServerProfile && serverProfileServerId && user && (
        <UserServerProfileModal
          server={servers.find(s => s._id === serverProfileServerId)!}
          user={user}
          onClose={() => setShowUserServerProfile(false)}
          onUpdate={handleServerUpdate}
        />
      )}
    </div>
  );
};

export default Main;
