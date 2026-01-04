import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useVoice } from '../contexts/VoiceContext';
import axios from 'axios';
import { Server, Channel, Message, DirectMessage, Group } from '../types';
import Sidebar from '../components/Sidebar';
import ServerSidebar from '../components/ServerSidebar';
import ChannelView from '../components/ChannelView';
import VoiceChannelView from '../components/VoiceChannelView';
import ActiveVoiceOverlay from '../components/ActiveVoiceOverlay';
import FriendsPanel from '../components/FriendsPanel';
import DMView from '../components/DMView';
import VoiceCall from '../components/VoiceCall';
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
    offer?: { fromUserId: string; offer: RTCSessionDescriptionInit };
  } | null>(null);

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (socket) {
      const handleCallOffer = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
        if (!activeCall) {
          try {
            const response = await axios.get<User>(`/api/users/${data.fromUserId}`);
            setActiveCall({
              user: response.data,
              isIncoming: true,
              offer: data
            });
          } catch (err) {
            console.error("Error fetching caller info", err);
          }
        }
      };

      socket.on('call-offer', handleCallOffer);
      return () => {
        socket.off('call-offer', handleCallOffer);
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

      socket.on('new-message', handleNewMessage);

      return () => {
        socket.emit('leave-channel', selectedChannel._id);
        socket.off('new-message', handleNewMessage);
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

      socket.on('new-message', handleNewMessage);

      return () => {
        socket.off('new-message', handleNewMessage);
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

  const handleStartDirectCall = (user: User) => {
    setActiveCall({
      user,
      isIncoming: false
    });
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
        <FriendsPanel onStartDM={handleStartDM} />
      )}
      {selectedServer && !showFriends && (
        <ServerSidebar
          server={selectedServer}
          selectedChannel={selectedChannel}
          onChannelSelect={handleChannelSelect}
          onChannelCreated={fetchServers}
        />
      )}
      {selectedChannel && !showFriends && (
        selectedChannel.type === 'text' ? (
          <ChannelView
            channel={selectedChannel}
            messages={messages}
            socket={socket}
          />
        ) : (
          <VoiceChannelView
            channel={selectedChannel}
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
          initialIncomingCall={activeCall.isIncoming}
          initialOffer={activeCall.offer}
          onEndCall={() => setActiveCall(null)}
        />
      )}
    </div>
  );
};

export default Main;
