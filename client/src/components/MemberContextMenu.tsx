import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { User, Server } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useVoice } from '../contexts/VoiceContext';
import axios from 'axios';
import { Permissions, hasPermission, computePermissions } from '../utils/permissions';
import './MemberContextMenu.css';
import InputModal from './InputModal';

interface MemberContextMenuProps {
    user: User;
    server: Server;
    x: number;
    y: number;
    onClose: () => void;
    onMention?: (username: string) => void;
    onOpenProfile?: (userId: string) => void;
}

const MemberContextMenu: React.FC<MemberContextMenuProps> = ({
    user: targetUser,
    server,
    x,
    y,
    onClose,
    onMention,
    onOpenProfile
}) => {
    const { user: currentUser } = useAuth();
    const { socket } = useSocket();
    const { userVolumes, setUserVolume, localMutes, toggleLocalMute } = useVoice();
    const [isFriend, setIsFriend] = useState(false);
    const [friendshipId, setFriendshipId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    const [showInputModal, setShowInputModal] = useState(false);
    const [inputModalConfig, setInputModalConfig] = useState<{
        title: string;
        label?: string;
        initialValue?: string;
        type?: 'text' | 'number';
        onSubmit: (val: string) => void;
    }>({ title: '', onSubmit: () => { } });

    const currentVolume = userVolumes.get(targetUser._id) ?? 1;
    const isLocalMuted = localMutes.has(targetUser._id);
    const isSelf = currentUser?._id === targetUser._id;
    const userPerms = currentUser ? computePermissions(currentUser._id, server) : 0n;
    const canManageRoles = hasPermission(userPerms, Permissions.MANAGE_ROLES);
    const canKick = hasPermission(userPerms, Permissions.KICK_MEMBERS);
    const canManageNicknames = hasPermission(userPerms, Permissions.MANAGE_NICKNAMES);
    const canChangeNickname = hasPermission(userPerms, Permissions.CHANGE_NICKNAME);
    const isOwner = (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner) === currentUser?._id;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showInputModal) return;
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, showInputModal]);

    useEffect(() => {
        const checkFriendship = async () => {
            try {
                const res = await axios.get('/api/friends');
                const friend = res.data.find((f: any) => f._id === targetUser._id);
                if (friend) {
                    setIsFriend(true);
                    setFriendshipId(friend.friendshipId);
                }
            } catch (err) { }
        };
        checkFriendship();
        if (currentUser?.notes) {
            const userNote = currentUser.notes[targetUser._id];
            if (userNote) setNote(userNote);
        }
    }, [targetUser._id, currentUser]);

    const handleAction = async (action: string) => {
        try {
            switch (action) {
                case 'profile':
                    if (onOpenProfile) onOpenProfile(targetUser._id);
                    break;
                case 'mention':
                    if (onMention) onMention(targetUser.username);
                    break;
                case 'message':
                    const dmRes = await axios.get(`/api/direct-messages/user/${targetUser._id}`);
                    window.dispatchEvent(new CustomEvent('start-dm', { detail: { dm: dmRes.data } }));
                    break;
                case 'call':
                    const dmCallRes = await axios.get(`/api/direct-messages/user/${targetUser._id}`);
                    window.dispatchEvent(new CustomEvent('start-call', { detail: { user: targetUser, dmId: dmCallRes.data._id } }));
                    break;
                case 'add-friend':
                    await axios.post('/api/friends/request', { userId: targetUser._id });
                    break;
                case 'remove-friend':
                    if (friendshipId) await axios.delete(`/api/friends/${friendshipId}`);
                    setIsFriend(false);
                    break;
                case 'block':
                    await axios.post('/api/users/block', { userId: targetUser._id });
                    onClose();
                    break;
                case 'update-note':
                    setInputModalConfig({
                        title: 'Заметка',
                        label: 'Заметка для ' + targetUser.username,
                        initialValue: note,
                        onSubmit: async (val) => {
                            try {
                                await axios.post('/api/users/note', { userId: targetUser._id, note: val });
                                setNote(val);
                            } catch (err) { }
                        }
                    });
                    setShowInputModal(true);
                    return;
                case 'kick':
                    if (window.confirm(`Выгнать ${targetUser.username}?`)) {
                        await axios.delete(`/api/servers/${server._id}/members/${targetUser._id}`);
                    }
                    break;
                case 'nickname':
                    const m = server.members.find(m => (m.user._id || m.user) === targetUser._id);
                    setInputModalConfig({
                        title: 'Изменить никнейм',
                        label: 'Никнейм',
                        initialValue: (m as any)?.nickname || '',
                        onSubmit: async (val) => {
                            try {
                                await axios.put(`/api/servers/${server._id}/members/${targetUser._id}`, { nickname: val });
                            } catch (err) { }
                        }
                    });
                    setShowInputModal(true);
                    return;
                case 'toggle-role':
                    // Handled separately now
                    return;
                case 'server-profile':
                    window.dispatchEvent(new CustomEvent('open-server-profile-settings', { detail: { serverId: server._id } }));
                    break;
            }
        } catch (err) {
            alert('Действие не удалось.');
        }
        onClose();
    };

    const adjustedX = Math.min(x, window.innerWidth - 220);
    const adjustedY = Math.min(y, window.innerHeight - 300);

    if (showInputModal) {
        return ReactDOM.createPortal(
            <InputModal
                isOpen={showInputModal}
                title={inputModalConfig.title}
                label={inputModalConfig.label}
                initialValue={inputModalConfig.initialValue}
                type={inputModalConfig.type}
                onClose={() => { setShowInputModal(false); onClose(); }}
                onSubmit={inputModalConfig.onSubmit}
            />,
            document.body
        );
    }

    return ReactDOM.createPortal(
        <div className="member-context-menu" ref={menuRef} style={{ top: adjustedY, left: adjustedX }}>
            <div className="menu-group">
                <div className="menu-item" onClick={() => handleAction('profile')}>Профиль</div>
                {isSelf && <div className="menu-item" onClick={() => handleAction('server-profile')}>Настроить профиль на сервере</div>}
                {!isSelf && (
                    <>
                        <div className="menu-item" onClick={() => handleAction('mention')}>Упомянуть</div>
                        <div className="menu-item" onClick={() => handleAction('message')}>Написать сообщение</div>
                        <div className="menu-item" onClick={() => handleAction('call')}>Позвонить</div>
                    </>
                )}
            </div>
            <div className="menu-separator" />
            <div className="menu-group">
                <div className="menu-item" onClick={() => handleAction('update-note')}>
                    {note ? 'Изменить заметку' : 'Добавить заметку'}
                </div>
            </div>
            <div className="menu-separator" />
            <div className="menu-separator" />
            <div className="menu-group">
                {(isSelf ? canChangeNickname : canManageNicknames) && (
                    <div className="menu-item" onClick={() => handleAction('nickname')}>Изменить никнейм</div>
                )}
                {canManageRoles && !isSelf && (
                    <div className="menu-item has-submenu">
                        Роли
                        <div className="context-submenu">
                            {(server.roles || []).filter(r => r.name !== '@everyone').map(role => {
                                const m = server.members.find(me => (me.user._id || me.user) === targetUser._id);
                                const hasRole = (m?.roles || []).includes(role._id);
                                return (
                                    <div
                                        key={role._id}
                                        className="menu-item check-item"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const newRoles = hasRole
                                                ? (m?.roles || []).filter(rid => rid !== role._id)
                                                : [...(m?.roles || []), role._id];
                                            try {
                                                await axios.put(`/api/servers/${server._id}/members/${targetUser._id}`, { roles: newRoles });
                                            } catch (err) { }
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div className="role-dot-mini" style={{ backgroundColor: role.color, width: '8px', height: '8px', borderRadius: '50%' }} />
                                            {role.name}
                                        </div>
                                        {hasRole && '✓'}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {!isSelf && (isFriend ? <div className="menu-item destructive" onClick={() => handleAction('remove-friend')}>Удалить из друзей</div> : <div className="menu-item" onClick={() => handleAction('add-friend')}>Добавить в друзья</div>)}
                {!isSelf && <div className="menu-item destructive" onClick={() => handleAction('block')}>Заблокировать</div>}
            </div>
            {!isSelf && (
                <>
                    <div className="menu-separator" />
                    <div className="menu-group">
                        <div className="menu-label">Громкость пользователя</div>
                        <div className="volume-slider-container">
                            <input type="range" min="0" max="2" step="0.01" value={currentVolume} onChange={(e) => setUserVolume(targetUser._id, parseFloat(e.target.value))} className="menu-volume-slider" onClick={(e) => e.stopPropagation()} />
                        </div>
                        <div className="menu-item check-item" onClick={(e) => { e.stopPropagation(); toggleLocalMute(targetUser._id); }}>
                            <span>Заглушить (для себя)</span>
                            <div className={`checkbox ${isLocalMuted ? 'checked' : ''}`}>{isLocalMuted && '✓'}</div>
                        </div>
                    </div>
                </>
            )}
            {!isSelf && canKick && (
                <>
                    <div className="menu-separator" />
                    <div className="menu-group">
                        <div className="menu-item destructive" onClick={() => handleAction('kick')}>Выгнать</div>
                    </div>
                </>
            )}
        </div>,
        document.body
    );
};

export default MemberContextMenu;
