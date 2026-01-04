import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useVoice } from '../contexts/VoiceContext';
import axios from 'axios';
import { Server, Channel, Message, DirectMessage } from '../types';
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
import { User } from '../types';
import './Main.css';

const Main: React.FC = () => {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const { activeChannelId } = useVoice();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showFriends, setShowFriends] = useState(false);
  const [selectedDM, setSelectedDM] = useState<DirectMessage | null>(null);
  const [dmMessages, setDmMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCall, setActiveCall] = useState<{
    user: User;
    isIncoming: boolean;
    dmId: string;
    offer?: { fromUserId: string; offer: RTCSessionDescriptionInit; dmId: string };
  } | null>(null);
  const [showProfileUserId, setShowProfileUserId] = useState<string | null>(null);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showServerProfile, setShowServerProfile] = useState(false);
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

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    console.log('Main component useEffect for socket events. Socket connected:', socket?.connected);
    if (socket) {
      const handleCallOffer = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit; dmId: string }) => {
        console.log('Received call-offer event on client:', data);
        console.log('Current activeCall state:', activeCall ? 'Active' : 'Null');

        if (!activeCall) {
          try {
            const dmId = data.dmId || '';
            console.log('Fetching caller info for ID:', data.fromUserId);
            const response = await axios.get<User>(`/api/users/${data.fromUserId}`);
            console.log('Caller info fetched:', response.data.username);

            setActiveCall({
              user: response.data,
              isIncoming: true,
              dmId: dmId,
              offer: data
            });
            console.log('activeCall state updated with incoming call');
          } catch (err) {
            console.error("Error handling incoming call offer:", err);
          }
        } else {
          console.log('Ignoring call-offer: activeCall already exists');
        }
      };

      socket.on('call-offer', handleCallOffer);

      socket.on('server-roles-updated', (data: { serverId: string; roles: any[] }) => {
        setServers(prev => prev.map(s => s._id === data.serverId ? { ...s, roles: data.roles } : s));
        setSelectedServer(prev => (prev && prev._id === data.serverId) ? { ...prev, roles: data.roles } : prev);
      });

      socket.on('server-member-updated', (data: { serverId: string; member: any }) => {
        setServers(prev => prev.map(s => {
          if (s._id === data.serverId) {
            return {
              ...s,
              members: s.members.map(m => m.user._id === data.member.user._id ? data.member : m)
            };
          }
          return s;
        }));
        setSelectedServer(prev => {
          if (prev && prev._id === data.serverId) {
            return {
              ...prev,
              members: prev.members.map(m => m.user._id === data.member.user._id ? data.member : m)
            };
          }
          return prev;
        });
      });

      return () => {
        console.log('Removing call-offer listener');
        socket.off('call-offer', handleCallOffer);
        socket.off('server-roles-updated');
        socket.off('server-member-updated');
      };
    }
  }, [socket, activeCall]);

  useEffect(() => {
    if (selectedChannel && socket) {
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
    }
  }, [selectedChannel, socket]);

  useEffect(() => {
    if (selectedDM && socket) {
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
    }
  }, [selectedDM, socket]);

  const fetchServers = async () => {
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
  };

  const fetchMessages = async (channelId: string) => {
    try {
      const response = await axios.get(`/api/messages/channel/${channelId}`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleCreateServer = async (name: string) => {
    try {
      const response = await axios.post('/api/servers', { name });
      setServers((prev) => [...prev, response.data]);
      setSelectedServer(response.data);
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

  const fetchDMMessages = async (dmId: string) => {
    try {
      const response = await axios.get(`/api/direct-messages/${dmId}/messages`);
      setDmMessages(response.data);
    } catch (error) {
      console.error('Error fetching DM messages:', error);
    }
  };

  const handleStartDirectCall = (user: User, dmId: string) => {
    setActiveCall({
      user,
      isIncoming: false,
      dmId
    });
  };

  const handleServerUpdate = (updatedServer: Server) => {
    setServers(prev => prev.map(s => s._id === updatedServer._id ? updatedServer : s));
    if (selectedServer?._id === updatedServer._id) {
      setSelectedServer(updatedServer);
    }
  };

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
        />
      )}
      {selectedServer && !showFriends && (
        <>
          <ServerSidebar
            server={selectedServer}
            selectedChannel={selectedChannel}
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
            onUserClick={setShowProfileUserId}
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
            return <ActiveVoiceOverlay channel={activeVoiceChannel} />;
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
    </div>
  );
};

export default Main;
