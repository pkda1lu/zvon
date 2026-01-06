import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Friendship } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { ChatIcon, CloseIcon } from './Icons';
import './FriendsPanel.css';

interface FriendsPanelProps {
  onStartDM: (userId: string) => void;
  onUserClick: (userId: string) => void;
}

const FriendsPanel: React.FC<FriendsPanelProps> = ({ onStartDM, onUserClick }) => {
  const [friends, setFriends] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'friends' | 'pending' | 'add'>('friends');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (activeTab === 'friends') {
      fetchFriends();
    } else if (activeTab === 'pending') {
      fetchPendingRequests();
    }
    setPanelMessage(null); // Clear message when switching tabs
  }, [activeTab]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setPanelMessage({ text, type });
    setTimeout(() => setPanelMessage(null), 3000);
  };

  const fetchFriends = async () => {
    try {
      const response = await axios.get('/api/friends');
      setFriends(response.data);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const response = await axios.get('/api/friends/pending');
      setPendingRequests(response.data);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      try {
        const response = await axios.get(`/api/friends/search?query=${encodeURIComponent(query)}`);
        setSearchResults(response.data);
      } catch (error) {
        console.error('Error searching users:', error);
      }
    } else {
      setSearchResults([]);
    }
  };

  const sendFriendRequest = async (userId: string) => {
    if (loadingAction) return;
    setLoadingAction(userId);
    try {
      await axios.post('/api/friends/request', { userId });
      await handleSearch(searchQuery);
      showMessage('Запрос на добавление в друзья отправлен', 'success');
    } catch (error: any) {
      showMessage(error.response?.data?.message || 'Ошибка отправки запроса', 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const acceptRequest = async (requestId: string) => {
    if (loadingAction) return;
    setLoadingAction(requestId);
    try {
      await axios.post(`/api/friends/accept/${requestId}`);
      await fetchPendingRequests();
      await fetchFriends();
      showMessage('Заявка принята', 'success');
    } catch (error) {
      console.error('Error accepting request:', error);
      showMessage('Не удалось принять заявку', 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const removeFriend = async (friendshipId: string) => {
    if (!window.confirm('Вы уверены?')) return;
    try {
      await axios.delete(`/api/friends/${friendshipId}`);
      await fetchFriends();
      await fetchPendingRequests();
      showMessage('Выполнено', 'success');
    } catch (error) {
      console.error('Error removing friend:', error);
      showMessage('Ошибка при удалении', 'error');
    }
  };

  return (
    <div className="friends-panel">
      <div className="friends-tabs">
        <button
          className={activeTab === 'friends' ? 'active' : ''}
          onClick={() => setActiveTab('friends')}
        >
          Друзья ({friends.length})
        </button>
        <button
          className={activeTab === 'pending' ? 'active' : ''}
          onClick={() => setActiveTab('pending')}
        >
          Запросы ({pendingRequests.length})
        </button>
        <button
          className={activeTab === 'add' ? 'active' : ''}
          onClick={() => setActiveTab('add')}
        >
          Добавить
        </button>
      </div>

      <div className="friends-content">
        {activeTab === 'friends' && (
          <div className="friends-list">
            {friends.length === 0 ? (
              <div className="empty-state">У вас пока нет друзей</div>
            ) : (
              friends.map((friend) => (
                <div key={friend._id} className="friend-item">
                  <div className="friend-avatar" onClick={() => onUserClick(friend._id)} style={{ cursor: 'pointer' }}>
                    {getAvatarUrl(friend.avatar) ? (
                      <img src={getAvatarUrl(friend.avatar)!} alt={friend.username} />
                    ) : (
                      <span>{friend.username.charAt(0).toUpperCase()}</span>
                    )}
                    <div className={`status-indicator ${friend.status}`}></div>
                  </div>
                  <div className="friend-info" onClick={() => onUserClick(friend._id)} style={{ cursor: 'pointer' }}>
                    <div className="friend-name">{friend.username}</div>
                    <div className="friend-status">{friend.status}</div>
                  </div>
                  <div className="friend-actions">
                    <button
                      className="dm-button"
                      onClick={() => onStartDM(friend._id)}
                      title="Написать сообщение"
                    >
                      <ChatIcon size={20} />
                    </button>
                    <button
                      className="remove-button"
                      onClick={() => removeFriend((friend as any).friendshipId)}
                      title="Удалить из друзей"
                    >
                      <CloseIcon size={20} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="pending-requests">
            {pendingRequests.length === 0 ? (
              <div className="empty-state">Нет входящих запросов</div>
            ) : (
              pendingRequests.map((request) => (
                <div key={request._id} className="request-item">
                  <div className="request-avatar" onClick={() => onUserClick(request.requester._id)} style={{ cursor: 'pointer' }}>
                    {getAvatarUrl(request.requester.avatar) ? (
                      <img src={getAvatarUrl(request.requester.avatar)!} alt={request.requester.username} />
                    ) : (
                      <span>{request.requester.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="request-info" onClick={() => onUserClick(request.requester._id)} style={{ cursor: 'pointer' }}>
                    <div className="request-name">{request.requester.username}</div>
                    <div className="request-text">хочет добавить вас в друзья</div>
                  </div>
                  <div className="request-actions">
                    <button
                      className="accept-button"
                      onClick={() => acceptRequest(request._id)}
                    >
                      Принять
                    </button>
                    <button
                      className="reject-button"
                      onClick={() => removeFriend(request._id)}
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'add' && (
          <div className="add-friend">
            <input
              type="text"
              placeholder="Поиск пользователей..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="search-input"
              autoFocus
            />

            {panelMessage && (
              <div className={`panel-message ${panelMessage.type}`}>
                {panelMessage.text}
              </div>
            )}

            <div className="search-results">
              {searchResults.map((user) => (
                <div key={user._id} className="search-result-item">
                  <div className="result-avatar" onClick={() => onUserClick(user._id)} style={{ cursor: 'pointer' }}>
                    {getAvatarUrl(user.avatar) ? (
                      <img src={getAvatarUrl(user.avatar)!} alt={user.username} />
                    ) : (
                      <span>{user.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="result-info" onClick={() => onUserClick(user._id)} style={{ cursor: 'pointer' }}>
                    <div className="result-name">{user.username}</div>
                    <div className="result-email">{user.email}</div>
                  </div>
                  <button
                    className="add-button"
                    onClick={() => sendFriendRequest(user._id)}
                    disabled={!!loadingAction}
                  >
                    {loadingAction === user._id ? '...' : 'Добавить'}
                  </button>
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

