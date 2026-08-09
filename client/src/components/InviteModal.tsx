import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { SearchIcon, LinkIcon, UserPlusIcon, CopyIcon, SettingsIcon, CheckIcon } from './Icons';
import Modal from './Modal';
import { User } from '../types';
import UserAvatar from './UserAvatar';
import { useWindowSettings } from '../contexts/WindowSettingsContext';
import { getInviteUrl } from '../utils/inviteLinks';
import './InviteModal.css';

interface InviteModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  serverId: string; 
  serverName?: string; 
}

const EXPIRY_OPTIONS = [
  { label: '30 минут', value: 30 * 60 },
  { label: '1 час', value: 60 * 60 },
  { label: '1 день', value: 24 * 60 * 60 },
  { label: '7 дней', value: 7 * 24 * 60 * 60 },
  { label: 'Никогда', value: 0 },
];

const USES_OPTIONS = [
  { label: 'Без ограничений', value: 0 },
  { label: '1 использование', value: 1 },
  { label: '5 использований', value: 5 },
  { label: '10 использований', value: 10 },
  { label: '25 использований', value: 25 },
  { label: '50 использований', value: 50 },
];

const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, serverId, serverName }) => {
  const { streamerModeEnabled, censorInfo } = useWindowSettings();
  const shouldCensor = streamerModeEnabled && censorInfo;
  
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [invitedFriends, setInvitedFriends] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const [expiresIn, setExpiresIn] = useState<number>(7 * 24 * 60 * 60);
  const [maxUses, setMaxUses] = useState<number>(0);
  const [showSettings, setShowSettings] = useState(false);

  const generateInvite = useCallback(async (exp?: number, maxU?: number) => {
    setLoading(true); 
    setError('');
    const expVal = exp !== undefined ? exp : expiresIn;
    const maxVal = maxU !== undefined ? maxU : maxUses;
    try {
      const res = await axios.post('/api/invites', { 
        serverId, 
        expiresIn: expVal || null, 
        maxUses: maxVal || null 
      });
      setInviteLink(getInviteUrl(res.data.code));
    } catch (err: any) { 
      setError(err.response?.data?.message || 'Не удалось создать приглашение'); 
    } finally { 
      setLoading(false); 
    }
  }, [serverId, expiresIn, maxUses]);

  const fetchFriends = useCallback(async () => { 
    try { 
      const res = await axios.get('/api/friends');
      setFriends(res.data); 
    } catch (e) { } 
  }, []);

  useEffect(() => {
    if (isOpen) { 
      if (!inviteLink) generateInvite(); 
      fetchFriends(); 
    }
  }, [isOpen, inviteLink, generateInvite, fetchFriends]);

  const handleExpireChange = (val: number) => {
    setExpiresIn(val);
    generateInvite(val, maxUses);
  };

  const handleMaxUsesChange = (val: number) => {
    setMaxUses(val);
    generateInvite(expiresIn, val);
  };

  const handleInviteFriend = async (friendId: string) => {
    if (invitedFriends.has(friendId)) return;
    try {
      const dmRes = await axios.get(`/api/direct-messages/user/${friendId}`);
      await axios.post(`/api/direct-messages/${dmRes.data._id}/messages`, { 
        content: `Привет! Присоединяйся к моему серверу ${serverName || ''}: ${inviteLink}` 
      });
      setInvitedFriends(prev => new Set(prev).add(friendId));
    } catch (err) { }
  };

  const copyToClipboard = async () => {
    const electron = (window as any).electron;
    if (electron?.clipboard?.writeText) { 
      try { 
        electron.clipboard.writeText(inviteLink); 
        setCopied(true); 
        return; 
      } catch (e) { } 
    }
    try {
      if (navigator.clipboard) { 
        await navigator.clipboard.writeText(inviteLink); 
        setCopied(true); 
      } else { 
        const ta = document.createElement("textarea"); 
        ta.value = inviteLink; 
        ta.style.position = "fixed"; 
        ta.style.left = "-9999px"; 
        document.body.appendChild(ta); 
        ta.focus(); 
        ta.select(); 
        document.execCommand('copy'); 
        document.body.removeChild(ta); 
        setCopied(true); 
      }
    } catch (e) { }
  };

  useEffect(() => { 
    if (copied) { 
      const t = setTimeout(() => setCopied(false), 2000); 
      return () => clearTimeout(t); 
    } 
  }, [copied]);

  const filteredFriends = friends.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()));

  const getExpiryText = () => {
    if (!expiresIn) return 'Бессрочная ссылка';
    if (expiresIn === 1800) return 'Истекает через 30 минут';
    if (expiresIn === 3600) return 'Истекает через 1 час';
    if (expiresIn === 86400) return 'Истекает через 1 день';
    if (expiresIn === 604800) return 'Истекает через 7 дней';
    return `Истекает через ${Math.round(expiresIn / 3600)} ч.`;
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`Пригласить в ${serverName || 'сервер'}`}
      size="md"
      className="liquid-glass-modal invite-modal-styled"
      footer={
        <>
          <button type="button" onClick={onClose} className="zv-btn zv-btn--ghost">
            Закрыть
          </button>
          <button
            type="button"
            className="zv-btn zv-btn--primary"
            onClick={() => {
              if (shouldCensor) {
                if (window.confirm('Вы находитесь в режиме стримера. Вы уверены, что хотите скопировать реальную ссылку-приглашение в буфер обмена?')) {
                  copyToClipboard();
                }
              } else {
                copyToClipboard();
              }
            }}
          >
            {copied ? 'Скопировано!' : 'Скопировать ссылку'}
          </button>
        </>
      }
    >
      <div className="invite-modal-content">
        {error && <div className="error-message">{error}</div>}

        {/* 1. Секция ссылки-приглашения */}
        <div className="form-section">
          <label>Ссылка-приглашение на сервер</label>
          <div className="input-wrapper invite-link-input-wrapper">
            <span className="input-prefix">
              <LinkIcon size={18} />
            </span>
            <input
              type="text"
              value={shouldCensor ? 'https://zvon.cc/invite/hidden_for_streaming' : inviteLink}
              readOnly
            />
            <button
              type="button"
              className={`invite-quick-copy-btn ${copied ? 'copied' : ''}`}
              onClick={() => {
                if (shouldCensor) {
                  if (window.confirm('Вы находитесь в режиме стримера. Вы уверены, что хотите скопировать реальную ссылку-приглашение в буфер обмена?')) {
                    copyToClipboard();
                  }
                } else {
                  copyToClipboard();
                }
              }}
              title="Скопировать ссылку"
            >
              {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            </button>
          </div>
          
          <div className="invite-link-meta-row">
            <div className="invite-link-meta">
              <span>{getExpiryText()}</span>
              <span>•</span>
              <span>{maxUses > 0 ? `Лимит: ${maxUses} исп.` : 'Без лимита'}</span>
            </div>
            <button
              type="button"
              className="invite-toggle-settings-btn"
              onClick={() => setShowSettings(!showSettings)}
            >
              <SettingsIcon size={14} />
              {showSettings ? 'Скрыть настройки' : 'Настроить ссылку'}
            </button>
          </div>
        </div>

        {/* 2. Разворачиваемые настройки ссылки */}
        {showSettings && (
          <div className="invite-collapsible-settings">
            <div className="form-section">
              <label>Срок действия</label>
              <select
                className="category-select"
                value={expiresIn}
                onChange={e => handleExpireChange(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-section">
              <label>Кол-во использований</label>
              <select
                className="category-select"
                value={maxUses}
                onChange={e => handleMaxUsesChange(Number(e.target.value))}
              >
                {USES_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* 3. Прокручиваемый список друзей */}
        <div className="form-section invite-friends-section">
          <label>Отправить приглашение друзьям</label>
          <div className="input-wrapper search-wrapper">
            <span className="input-prefix">
              <SearchIcon size={18} />
            </span>
            <input
              type="text"
              placeholder="Поиск друзей..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="friends-invite-list-v3">
            {filteredFriends.length === 0 ? (
              <div className="no-friends-v3">
                {searchQuery ? 'Друзья не найдены по запросу' : 'У вас пока нет друзей в списке'}
              </div>
            ) : (
              filteredFriends.map(f => (
                <div key={f._id} className="invite-friend-row">
                  <div className="friend-info">
                    <UserAvatar user={f} size={38} className="friend-avatar-comp" />
                    <div className="friend-details">
                      <span className="friend-name">{f.username}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`invite-friend-action-btn ${invitedFriends.has(f._id) ? 'sent' : ''}`}
                    onClick={() => handleInviteFriend(f._id)}
                    disabled={invitedFriends.has(f._id) || !inviteLink}
                  >
                    {invitedFriends.has(f._id) ? (
                      <>
                        <CheckIcon size={14} /> Отправлено
                      </>
                    ) : (
                      'Отправить'
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default InviteModal;
