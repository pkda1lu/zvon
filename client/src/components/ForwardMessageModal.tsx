import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Socket } from 'socket.io-client';
import { DirectMessage, Server, User, Message } from '../types';
import { SearchIcon, HashtagIcon, CheckIcon } from './Icons';
import UserAvatar from './UserAvatar';
import Modal from './Modal';
import './ForwardMessageModal.css';

interface ForwardTarget {
    key: string;
    label: string;
    sub?: string;
    dmId?: string;
    channelId?: string;
    avatarUser?: { username: string; avatar?: string | null } | null;
    isChannel?: boolean;
}

interface ForwardMessageModalProps {
    isOpen: boolean;
    onClose: () => void;
    message: Message | null;
    servers: Server[];
    currentUser: User;
    socket: Socket | null;
}

const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({ isOpen, onClose, message, servers, currentUser, socket }) => {
    const [dms, setDms] = useState<DirectMessage[]>([]);
    const [query, setQuery] = useState('');
    const [sentKeys, setSentKeys] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setSentKeys(new Set());
        axios.get('/api/direct-messages').then(res => setDms(res.data)).catch(() => { });
    }, [isOpen]);

    const targets = useMemo<ForwardTarget[]>(() => {
        const list: ForwardTarget[] = [];

        dms.forEach(dm => {
            const isGroup = dm.participants.length > 2 || !!dm.name;
            const others = dm.participants.filter(p => p._id !== currentUser._id);
            const other = others[0];
            const label = dm.name || (isGroup ? others.map(p => p.username).join(', ') : other?.username) || 'Чат';
            list.push({
                key: `dm-${dm._id}`,
                label,
                sub: isGroup ? `${dm.participants.length} участников` : 'Личные сообщения',
                dmId: dm._id,
                avatarUser: isGroup ? null : other,
            });
        });

        servers.forEach(server => {
            (server.channels || []).forEach((ch: any) => {
                if (ch.type && ch.type !== 'text') return;
                list.push({
                    key: `ch-${ch._id}`,
                    label: ch.name,
                    sub: server.name,
                    channelId: ch._id,
                    isChannel: true,
                });
            });
        });

        return list;
    }, [dms, servers, currentUser._id]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return targets;
        return targets.filter(t => t.label.toLowerCase().includes(q) || (t.sub || '').toLowerCase().includes(q));
    }, [targets, query]);

    const handleForward = (target: ForwardTarget) => {
        if (!message || !socket || sentKeys.has(target.key)) return;
        socket.emit('send-message', {
            forwardOf: message._id,
            dmId: target.dmId || null,
            channelId: target.channelId || null,
        });
        setSentKeys(prev => new Set(prev).add(target.key));
    };

    const preview = message?.content || (message?.attachments?.length ? 'Вложение' : (message?.poll ? 'Опрос' : ''));

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Переслать сообщение"
            size="md"
            className="liquid-glass-modal forward-modal-styled"
            footer={
                <button type="button" onClick={onClose} className="zv-btn zv-btn--ghost">
                    Закрыть
                </button>
            }
        >
            <div className="forward-modal-content">
                {/* 1. Превью пересылаемого сообщения */}
                {preview && (
                    <div className="forward-preview">
                        <span className="forward-preview__author">{message?.author?.username}</span>
                        <span className="forward-preview__text">{preview}</span>
                    </div>
                )}

                {/* 2. Поиск чата / канала */}
                <div className="input-wrapper forward-search-wrapper">
                    <span className="input-prefix">
                        <SearchIcon size={18} />
                    </span>
                    <input
                        type="text"
                        placeholder="Поиск чата или канала..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* 3. Список чатов / каналов */}
                <div className="forward-list custom-scrollbar">
                    {filtered.length === 0 ? (
                        <div className="forward-empty">Ничего не найдено</div>
                    ) : filtered.map(t => (
                        <div key={t.key} className="forward-item">
                            <div className="forward-item__icon">
                                {t.isChannel ? (
                                    <div className="forward-item__hash"><HashtagIcon size={18} /></div>
                                ) : (
                                    <UserAvatar user={t.avatarUser} size={38} className="forward-avatar-comp" />
                                )}
                            </div>
                            <div className="forward-item__info">
                                <span className="forward-item__name">{t.label}</span>
                                {t.sub && <span className="forward-item__sub">{t.sub}</span>}
                            </div>
                            <button
                                type="button"
                                className={`forward-item__btn ${sentKeys.has(t.key) ? 'sent' : ''}`}
                                onClick={() => handleForward(t)}
                                disabled={sentKeys.has(t.key)}
                            >
                                {sentKeys.has(t.key) ? (
                                    <>
                                        <CheckIcon size={14} /> Отправлено
                                    </>
                                ) : (
                                    'Переслать'
                                )}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

export default ForwardMessageModal;

