import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CloseIcon, SearchIcon } from './Icons';
import { User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import './InviteModal.css';

interface InviteModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverId: string;
    serverName?: string;
}

const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, serverId, serverName }) => {
    const [inviteLink, setInviteLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [friends, setFriends] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [invitedFriends, setInvitedFriends] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');

    const generateInvite = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await axios.post('/api/invites', { serverId });
            let baseUrl: string;
            if (window.location.protocol === 'file:') {
                const serverUrl = import.meta.env.VITE_SERVER_URL || 'https://zvonserver.ru';
                baseUrl = serverUrl.replace(/\/$/, '');
            } else {
                baseUrl = `${window.location.protocol}//${window.location.host}`;
            }
            const link = `${baseUrl}/invite/${response.data.code}`;
            setInviteLink(link);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Не удалось создать приглашение');
        } finally {
            setLoading(false);
        }
    }, [serverId]);

    const fetchFriends = useCallback(async () => {
        try {
            const response = await axios.get('/api/friends');
            setFriends(response.data);
        } catch (error) {
            console.error('Error fetching friends:', error);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            if (!inviteLink) generateInvite();
            fetchFriends();
        }
    }, [isOpen, inviteLink, generateInvite, fetchFriends]);

    const handleInviteFriend = async (friendId: string) => {
        if (invitedFriends.has(friendId)) return;

        try {
            // Get or create DM
            const dmRes = await axios.get(`/api/direct-messages/user/${friendId}`);
            const dmId = dmRes.data._id;

            // Send invite message
            const message = `Привет! Присоединяйся к моему серверу ${serverName || ''}: ${inviteLink}`;
            await axios.post(`/api/direct-messages/${dmId}/messages`, { content: message });

            setInvitedFriends(prev => new Set(prev).add(friendId));
        } catch (err) {
            console.error('Failed to send invite DM:', err);
        }
    };

    const copyToClipboard = async () => {
        // @ts-ignore
        const electron = window.electron;
        if (electron && electron.clipboard && typeof electron.clipboard.writeText === 'function') {
            try {
                electron.clipboard.writeText(inviteLink);
                setCopied(true);
                return;
            } catch (err) {
                console.warn('Native Electron clipboard failed:', err);
            }
        }

        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(inviteLink);
                setCopied(true);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = inviteLink;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setCopied(true);
            }
        } catch (err) {
            console.error('Clipboard failed:', err);
        }
    };

    useEffect(() => {
        if (copied) {
            const timer = setTimeout(() => setCopied(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [copied]);

    if (!isOpen) return null;

    const filteredFriends = friends.filter(f =>
        f.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content invite-modal-v2" onClick={e => e.stopPropagation()}>
                <div className="invite-header">
                    <div className="header-title">
                        <h3>Пригласить друзей в {serverName || 'на сервер'}</h3>
                    </div>
                    <button className="close-btn" onClick={onClose}><CloseIcon /></button>
                </div>

                <div className="invite-body">
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="Поиск друзей"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <SearchIcon size={18} />
                    </div>

                    <div className="friends-invite-list">
                        {filteredFriends.length === 0 ? (
                            <div className="no-friends">Друзья не найдены</div>
                        ) : (
                            filteredFriends.map(friend => (
                                <div key={friend._id} className="invite-friend-item">
                                    <div className="friend-info">
                                        <div className="friend-avatar">
                                            {getAvatarUrl(friend.avatar) ? (
                                                <img src={getAvatarUrl(friend.avatar)!} alt="" />
                                            ) : (
                                                <div className="avatar-placeholder">{friend.username[0]}</div>
                                            )}
                                        </div>
                                        <span className="friend-name">{friend.username}</span>
                                    </div>
                                    <button
                                        className={`invite-btn ${invitedFriends.has(friend._id) ? 'sent' : ''}`}
                                        onClick={() => handleInviteFriend(friend._id)}
                                        disabled={invitedFriends.has(friend._id) || !inviteLink}
                                    >
                                        {invitedFriends.has(friend._id) ? 'Отправлено' : 'Пригласить'}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="invite-footer">
                    <p className="footer-label">ИЛИ ОТПРАВЬТЕ ССЫЛКУ-ПРИГЛАШЕНИЕ ДРУГУ</p>
                    <div className="link-copy-container">
                        <input type="text" value={inviteLink} readOnly />
                        <button
                            className={`copy-btn ${copied ? 'success' : ''}`}
                            onClick={copyToClipboard}
                        >
                            {copied ? 'Скопировано' : 'Копировать'}
                        </button>
                    </div>
                    <p className="link-expiry">Срок действия вашей ссылки-приглашения истечет через 7 дней.</p>
                    {error && <div className="invite-error">{error}</div>}
                </div>
            </div>
        </div>
    );
};

export default InviteModal;
