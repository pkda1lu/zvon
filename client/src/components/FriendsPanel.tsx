import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Friendship, Server } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { useSocket } from '../contexts/SocketContext';
import { ChatIcon, CloseIcon } from './Icons';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import UserAvatar from './UserAvatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import ActiveContacts from './ActiveContacts';
import { useAppearance } from '../contexts/AppearanceContext';
import { motion } from 'framer-motion';
import { iosSpring } from '../animations/transitions';
import './FriendsPanel.css';

interface FriendsPanelProps {
  friends: User[];
  setFriends: React.Dispatch<React.SetStateAction<User[]>>;
  onStartDM: (userId: string) => void;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  unreadCounts: Record<string, number>;
  onBack?: () => void;
  isMobile?: boolean;
  servers?: Server[];
}

/** Подписи статусов. В списке стояло сырое значение из базы — «offline». */
const STATUS_LABELS: Record<string, string> = {
  online: 'В сети',
  away: 'Отошёл',
  busy: 'Не беспокоить',
  offline: 'Не в сети',
};

interface DMDict { [userId: string]: string; }

const FriendsPanel: React.FC<FriendsPanelProps> = ({ friends, setFriends, onStartDM, onUserClick, unreadCounts, onBack, isMobile, servers = [] }) => {
  const { socket } = useSocket();
  const { user: currentUser } = useAuth();
  const { confirm } = useDialog();
  const { interfaceScale, reduceMotion } = useAppearance();
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
    const handleFriendRequest = () => { if (activeTab === 'pending') fetchPendingRequests(); };
    const handleFriendshipAccepted = () => { fetchFriends(); if (activeTab === 'pending') fetchPendingRequests(); };
    // Дружба разорвана блокировкой — перечитываем список, чтобы человек
    // не остался в панели до её повторного открытия.
    const handleFriendRemoved = () => { fetchFriends(); };
    socket.on('friend-request', handleFriendRequest);
    socket.on('friend-request-accepted', handleFriendshipAccepted);
    socket.on('friend-removed', handleFriendRemoved);
    return () => {
      socket.off('friend-request', handleFriendRequest);
      socket.off('friend-request-accepted', handleFriendshipAccepted);
      socket.off('friend-removed', handleFriendRemoved);
    };
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
    if (!(await confirm('Вы уверены?'))) return;
    try { await axios.delete(`/api/friends/${id}`); await fetchFriends(); await fetchPendingRequests(); showMessage('Выполнено', 'success'); }
    catch (e) { showMessage('Ошибка', 'error'); }
  };

  const tabCounts = {
    friends: friends.length,
    pending: pendingRequests.length,
  };

  return (
    /*
     * Фон — общий для всех панелей приложения (panel-hero). Раньше здесь был
     * свой: волны, кольца и крупный шар в центре. Он занимал весь экран под
     * коротким списком и не встречался больше нигде, из-за чего раздел
     * выпадал из приложения. Комментарий в panel-hero.css прямо говорит, что
     * общий фон и был выделен отсюда — осталось им же и воспользоваться.
     */
    <div className="friends-panel panel-hero">
      <div className="panel-hero-bg" aria-hidden="true">
        <div className="blob cyan" />
        <div className="blob purple" />
        <div className="blob pink" />
      </div>

      <div className="friends-main-container">
        <div className="friends-left-section">
          {/* Отдельной шапки для телефона больше нет: она содержала только
              надпись «Друзья», а общий заголовок ниже даёт ту же надпись на
              всех размерах — на телефоне выходило два одинаковых заголовка
              подряд. */}
          {/*
            Заголовок панели, а не рекламная обложка. Прежний занимал четверть
            экрана: надзаголовок, крупный градиентный заголовок и слоган на
            «ты» — так говорит посадочная страница, а не раздел приложения,
            куда заходят по десять раз в день.
          */}
          <header className="friends-header">
            <h2 className="friends-header-title">Друзья</h2>
            <p className="friends-header-sub">
              {activeTab === 'pending' ? 'Входящие заявки в друзья.'
                : activeTab === 'add' ? 'Найдите человека по имени и отправьте заявку.'
                : 'Нажмите на строку, чтобы открыть профиль.'}
            </p>
          </header>

          {/* Вкладки того же вида, что в панели личных сообщений: подложка
              одна и переезжает между ними. */}
          <div className="friends-tabs" role="tablist">
            {([
              { id: 'friends', label: 'Друзья', count: tabCounts.friends, accent: false },
              { id: 'pending', label: 'Заявки', count: tabCounts.pending, accent: true },
              { id: 'add', label: 'Добавить', count: 0, accent: false },
            ] as const).map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                className={`friends-tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id as any)}
              >
                {activeTab === t.id && (
                  <motion.span
                    layoutId="friends-tab-pill"
                    className="friends-tab-pill"
                    transition={reduceMotion ? { duration: 0 } : iosSpring}
                  />
                )}
                <span className="friends-tab-label">
                  {t.label}
                  {t.count > 0 && (
                    <span className={`friends-tab-count${t.accent ? ' accent' : ''}`}>{t.count}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="friends-content custom-scrollbar">
            {activeTab === 'friends' && (
              <div className="friends-list">
                {friends.length === 0 ? <div className="empty-state">У вас пока нет друзей</div> : friends.map(f => (
                  <div key={f._id} className="friend-item">
                    <div className="friend-avatar-wrap">
                      <UserAvatar
                        user={f}
                        size={38 * interfaceScale}
                        className="friend-avatar"
                        onClick={(e) => onUserClick(f._id, e)}
                      />
                      <div className={`status-indicator ${f.status}`}></div>
                    </div>
                    <div className="friend-info" onClick={(e) => onUserClick(f._id, e)} style={{ cursor: 'pointer' }}>
                      <div className="friend-name">
                        {f.displayName || f.username}
                        <UserBadges badges={f.badges} serverTag={resolveServerTag(f)} size={14 * interfaceScale} />
                        {userDMs[f._id] && unreadCounts[userDMs[f._id]] > 0 && <span className="unread-count-badge">{unreadCounts[userDMs[f._id]]}</span>}
                      </div>
                      <div className="friend-status">
                        {f.activity?.name ? (
                          <span className="activity-status">
                            {f.activity.type === 'listening' ? `Слушает в ${f.activity.name}`
                              : f.activity.type === 'watching' ? `Смотрит в ${f.activity.name}`
                              : f.activity.type === 'using' ? `Использует ${f.activity.name}`
                              : f.activity.type === 'streaming' ? `В эфире: ${f.activity.name}`
                              : `Играет в ${f.activity.name}`}
                          </span>
                        ) : STATUS_LABELS[f.status] || STATUS_LABELS.offline}
                      </div>
                    </div>
                    {/* Кнопки проявляются при наведении: постоянно висящие
                        иконки у каждой строки — шум, а «удалить из друзей»
                        рядом с курсором ещё и опасно нажать случайно. */}
                    <div className="friend-actions">
                      <button className="friend-action-btn" onClick={() => onStartDM(f._id)} title="Написать сообщение">
                        <ChatIcon size={16 * interfaceScale} />
                      </button>
                      <button className="friend-action-btn remove" onClick={() => removeFriend((f as any).friendshipId)} title="Удалить из друзей">
                        <CloseIcon size={16 * interfaceScale} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'pending' && (
              <div className="pending-requests">
                {pendingRequests.length === 0 ? <div className="empty-state">Нет входящих запросов</div> : pendingRequests.map(r => (
                  <div key={r._id} className="request-item">
                    <UserAvatar
                      user={r.requester}
                      size={38 * interfaceScale}
                      className="request-avatar"
                      onClick={(e) => onUserClick(r.requester._id, e)}
                    />
                    <div className="request-info" onClick={(e) => onUserClick(r.requester._id, e)} style={{ cursor: 'pointer' }}>
                      <div className="request-name">
                        {r.requester.displayName || r.requester.username}
                        <UserBadges badges={r.requester.badges} serverTag={resolveServerTag(r.requester)} size={14 * interfaceScale} />
                      </div>
                      <div className="request-text">хочет добавить вас в друзья</div>
                    </div>
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
                      <UserAvatar
                        user={u}
                        size={40 * interfaceScale}
                        className="result-avatar"
                        onClick={(e) => onUserClick(u._id, e)}
                      />
                      <div className="result-info" onClick={(e) => onUserClick(u._id, e)} style={{ cursor: 'pointer' }}>
                        <div className="result-name">
                          {u.displayName || u.username}
                          <UserBadges badges={u.badges} serverTag={resolveServerTag(u)} size={14 * interfaceScale} />
                        </div>
                      </div>
                      <button className="add-button" onClick={() => sendFriendRequest(u._id)} disabled={!!loadingAction}>{loadingAction === u._id ? '...' : 'Добавить'}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {!isMobile && (
          <ActiveContacts
            friends={currentUser ? [...friends, currentUser] : friends}
            servers={servers}
            onUserClick={onUserClick}
          />
        )}
      </div>
    </div>
  );
};

export default FriendsPanel;
