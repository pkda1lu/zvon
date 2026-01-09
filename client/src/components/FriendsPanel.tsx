import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Friendship } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { useSocket } from '../contexts/SocketContext';
import { ChatIcon, CloseIcon } from './Icons';
import { useAuth } from '../contexts/AuthContext';
import './FriendsPanel.css';

interface FriendsPanelProps {
  onStartDM: (userId: string) => void;
  onUserClick: (userId: string) => void;
  unreadCounts: Record<string, number>;
}

interface DMDict { [userId: string]: string; }

const FriendsPanel: React.FC<FriendsPanelProps> = ({ onStartDM, onUserClick, unreadCounts }) => {
  const { socket } = useSocket();
  const { user: currentUser } = useAuth();
  const [friends, setFriends] = useState<User[]>([]);
  const [userDMs, setUserDMs] = useState<DMDict>({});
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'friends' | 'pending' | 'add'>('friends');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (activeTab === 'friends') { fetchFriends(); fetchDMs(); }
    else if (activeTab === 'pending') fetchPendingRequests();
    setPanelMessage(null);
  }, [activeTab]);

  const fetchDMs = async () => {
    if (!currentUser) return;
    try {
      const res = await axios.get('/api/direct-messages');
      const dict: DMDict = {};
      res.data.forEach((dm: any) => {
        const other = dm.participants.find((p: any) => p._id !== currentUser._id);
        if (other) dict[other._id] = dm._id;
      });
      setUserDMs(dict);
    } catch (e) { }
  };

  useEffect(() => {
    if (!socket) return;
    const handleUserUpdated = (u: any) => {
      setFriends(prev => prev.map(f => f._id === u._id ? { ...f, ...u } : f));
      setSearchResults(prev => prev.map(f => f._id === u._id ? { ...f, ...u } : f));
    };
    const handleFriendRequest = () => { if (activeTab === 'pending') fetchPendingRequests(); };
    const handleFriendshipAccepted = () => { fetchFriends(); if (activeTab === 'pending') fetchPendingRequests(); };
    socket.on('user-updated', handleUserUpdated);
    socket.on('friend-request', handleFriendRequest);
    socket.on('friendship-accepted', handleFriendshipAccepted);
    return () => { socket.off('user-updated', handleUserUpdated); socket.off('friend-request', handleFriendRequest); socket.off('friendship-accepted', handleFriendshipAccepted); };
  }, [socket, activeTab]);

  const showMessage = (text: string, type: 'success' | 'error') => { setPanelMessage({ text, type }); setTimeout(() => setPanelMessage(null), 3000); };
  const fetchFriends = async () => { try { setFriends((await axios.get('/api/friends')).data); } catch (e) { } };
  const fetchPendingRequests = async () => { try { setPendingRequests((await axios.get('/api/friends/pending')).data); } catch (e) { } };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) { try { setSearchResults((await axios.get(`/api/friends/search?query=${encodeURIComponent(query)}`)).data); } catch (e) { } }
    else setSearchResults([]);
  };

  const sendFriendRequest = async (userId: string) => {
    if (loadingAction) return;
    setLoadingAction(userId);
    try { await axios.post('/api/friends/request', { userId }); await handleSearch(searchQuery); showMessage('Запрос отправлен', 'success'); }
    catch (e: any) { showMessage(e.response?.data?.message || 'Ошибка', 'error'); }
    finally { setLoadingAction(null); }
  };

  const acceptRequest = async (id: string) => {
    if (loadingAction) return;
    setLoadingAction(id);
    try { await axios.post(`/api/friends/accept/${id}`); await fetchPendingRequests(); await fetchFriends(); showMessage('Заявка принята', 'success'); }
    catch (e) { showMessage('Ошибка', 'error'); }
    finally { setLoadingAction(null); }
  };

  const removeFriend = async (id: string) => {
    if (!window.confirm('Вы уверены?')) return;
    try { await axios.delete(`/api/friends/${id}`); await fetchFriends(); await fetchPendingRequests(); showMessage('Выполнено', 'success'); }
    catch (e) { showMessage('Ошибка', 'error'); }
  };

  return (
    <div className="friends-panel">
      <div className="friends-tabs">
        <button className={activeTab === 'friends' ? 'active' : ''} onClick={() => setActiveTab('friends')}>Друзья ({friends.length})</button>
        <button className={activeTab === 'pending' ? 'active' : ''} onClick={() => setActiveTab('pending')}>Запросы ({pendingRequests.length})</button>
        <button className={activeTab === 'add' ? 'active' : ''} onClick={() => setActiveTab('add')}>Добавить</button>
      </div>
      <div className="friends-content">
        {activeTab === 'friends' && (
          <div className="friends-list">
            {friends.length === 0 ? <div className="empty-state">У вас пока нет друзей</div> : friends.map(f => (
              <div key={f._id} className="friend-item">
                <div className="friend-avatar" onClick={() => onUserClick(f._id)} style={{ cursor: 'pointer' }}>{getAvatarUrl(f.avatar) ? <img src={getAvatarUrl(f.avatar)!} alt="" /> : <span>{f.username.charAt(0).toUpperCase()}</span>}<div className={`status-indicator ${f.status}`}></div></div>
                <div className="friend-info" onClick={() => onUserClick(f._id)} style={{ cursor: 'pointer' }}><div className="friend-name">{f.username}{userDMs[f._id] && unreadCounts[userDMs[f._id]] > 0 && <span className="unread-count-badge">{unreadCounts[userDMs[f._id]]}</span>}</div><div className="friend-status">{f.activity ? <span className="activity-status">Играет в {f.activity.name}</span> : f.status}</div></div>
                <div className="friend-actions"><button className="dm-button" onClick={() => onStartDM(f._id)} title="Написать сообщение"><ChatIcon size={20} /></button><button className="remove-button" onClick={() => removeFriend((f as any).friendshipId)} title="Удалить из друзей"><CloseIcon size={20} /></button></div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'pending' && (
          <div className="pending-requests">
            {pendingRequests.length === 0 ? <div className="empty-state">Нет входящих запросов</div> : pendingRequests.map(r => (
              <div key={r._id} className="request-item">
                <div className="request-avatar" onClick={() => onUserClick(r.requester._id)} style={{ cursor: 'pointer' }}>{getAvatarUrl(r.requester.avatar) ? <img src={getAvatarUrl(r.requester.avatar)!} alt="" /> : <span>{r.requester.username.charAt(0).toUpperCase()}</span>}</div>
                <div className="request-info" onClick={() => onUserClick(r.requester._id)} style={{ cursor: 'pointer' }}><div className="request-name">{r.requester.username}</div><div className="request-text">хочет добавить вас в друзья</div></div>
                <div className="request-actions"><button className="accept-button" onClick={() => acceptRequest(r._id)}>Принять</button><button className="reject-button" onClick={() => removeFriend(r._id)}>Отклонить</button></div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'add' && (
          <div className="add-friend">
            <input type="text" placeholder="Поиск пользователей..." value={searchQuery} onChange={e => handleSearch(e.target.value)} className="search-input" autoFocus />
            {panelMessage && <div className={`panel-message ${panelMessage.type}`}>{panelMessage.text}</div>}
            <div className="search-results">
              {searchResults.map(u => (
                <div key={u._id} className="search-result-item">
                  <div className="result-avatar" onClick={() => onUserClick(u._id)} style={{ cursor: 'pointer' }}>{getAvatarUrl(u.avatar) ? <img src={getAvatarUrl(u.avatar)!} alt="" /> : <span>{u.username.charAt(0).toUpperCase()}</span>}</div>
                  <div className="result-info" onClick={() => onUserClick(u._id)} style={{ cursor: 'pointer' }}><div className="result-name">{u.username}</div><div className="result-email">{u.email}</div></div>
                  <button className="add-button" onClick={() => sendFriendRequest(u._id)} disabled={!!loadingAction}>{loadingAction === u._id ? '...' : 'Добавить'}</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FriendsPanel;
