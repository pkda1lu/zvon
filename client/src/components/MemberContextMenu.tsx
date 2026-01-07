import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { User, Server, Role } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useSocket } from '../contexts/SocketContext';
import { useVoice } from '../contexts/VoiceContext';
import axios from 'axios';
import './MemberContextMenu.css';

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
    const { hasPermission } = usePermissions(currentUser!, server);
    const [isFriend, setIsFriend] = useState(false);
    const [friendshipId, setFriendshipId] = useState<string | null>(null);
    const [roles, setRoles] = useState<Role[]>([]);
    const [showRolesSubmenu, setShowRolesSubmenu] = useState(false);
    const [note, setNote] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    const currentVolume = userVolumes.get(targetUser._id) ?? 1;
    const isLocalMuted = localMutes.has(targetUser._id);

    const isSelf = currentUser?._id === targetUser._id;
    const canManageRoles = hasPermission('MANAGE_ROLES');
    const canKick = hasPermission('KICK_MEMBERS');
    const canBan = hasPermission('BAN_MEMBERS');
    const canManageNicknames = hasPermission('MANAGE_NICKNAMES');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        // Check friendship status
        const checkFriendship = async () => {
            try {
                const res = await axios.get('/api/friends');
                const friends = res.data;
                const friend = friends.find((f: any) => f._id === targetUser._id);
                if (friend) {
                    setIsFriend(true);
                    setFriendshipId(friend.friendshipId);
                }
            } catch (err) {
                console.error(err);
            }
        };

        // Fetch server roles
        const fetchServerRoles = async () => {
            try {
                const res = await axios.get(`/api/servers/${server._id}/roles`);
                setRoles(res.data.sort((a: Role, b: Role) => (b.position || 0) - (a.position || 0)));
            } catch (err) {
                console.error(err);
            }
        };

        checkFriendship();
        fetchServerRoles();

        // Load note if available
        if (currentUser?.notes) {
            const userNote = currentUser.notes[targetUser._id];
            if (userNote) {
                setNote(userNote);
            }
        }
    }, [targetUser._id, server._id, currentUser]);

    const handleAction = async (action: string, data?: any) => {
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
                    // This is handled by Main usually, but we need to trigger it.
                    // For now, let's just use window.location or similar if needed, 
                    // but better to pass a callback.
                    window.dispatchEvent(new CustomEvent('start-dm', { detail: { dm: dmRes.data } }));
                    break;
                case 'call':
                    const dmCallRes = await axios.get(`/api/direct-messages/user/${targetUser._id}`);
                    window.dispatchEvent(new CustomEvent('start-call', {
                        detail: { user: targetUser, dmId: dmCallRes.data._id }
                    }));
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
                    const newNote = prompt('Введите заметку:', note);
                    if (newNote !== null) {
                        await axios.post('/api/users/note', { userId: targetUser._id, note: newNote });
                        setNote(newNote);
                    }
                    break;
                case 'kick':
                    await axios.delete(`/api/servers/${server._id}/members/${targetUser._id}`);
                    break;
                case 'ban':
                    await axios.post(`/api/servers/${server._id}/bans`, { userId: targetUser._id });
                    break;
                case 'nickname':
                    // Just prompt for now or open a small modal
                    const newNick = prompt('Введите новый никнейм:', '');
                    if (newNick !== null) {
                        await axios.put(`/api/servers/${server._id}/members/${targetUser._id}`, { nickname: newNick });
                    }
                    break;
                case 'toggle-role':
                    const member = server.members.find(m => m.user._id === targetUser._id);
                    if (member) {
                        const currentRoles = member.roles.map((r: any) => r._id || r);
                        let newRoles;
                        if (currentRoles.includes(data.roleId)) {
                            newRoles = currentRoles.filter((id: string) => id !== data.roleId);
                        } else {
                            newRoles = [...currentRoles, data.roleId];
                        }
                        await axios.put(`/api/servers/${server._id}/members/${targetUser._id}/roles`, { roles: newRoles });
                    }
                    break;
                case 'timeout':
                    const duration = prompt('Длительность тайм-аута (в минутах):', '60');
                    if (duration) {
                        const until = new Date(Date.now() + parseInt(duration) * 60000);
                        // We need an endpoint for this. I'll add it to servers.js
                        await axios.put(`/api/servers/${server._id}/members/${targetUser._id}/timeout`, { until });
                    }
                    break;
                case 'server-profile':
                    window.dispatchEvent(new CustomEvent('open-server-profile-settings', {
                        detail: { serverId: server._id }
                    }));
                    break;
            }
        } catch (err) {
            console.error(err);
            alert('Действие не удалось. Проверьте права и иерархию.');
        }
        if (action !== 'toggle-role' && action !== 'roles-submenu') onClose();
    };

    const targetMember = server.members.find(m => m.user._id === targetUser._id);
    const targetRoles = targetMember?.roles.map((r: any) => r._id || r) || [];

    // Ensure menu stays within viewport
    const adjustedX = Math.min(x, window.innerWidth - 220);
    const adjustedY = Math.min(y, window.innerHeight - 400);

    return ReactDOM.createPortal(
        <div
            className="member-context-menu"
            ref={menuRef}
            style={{ top: adjustedY, left: adjustedX }}
        >
            <div className="menu-group">
                <div className="menu-item" onClick={() => handleAction('profile')}>Профиль</div>
                {isSelf && (
                    <div className="menu-item" onClick={() => handleAction('server-profile')}>Настроить профиль сервера</div>
                )}
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
                    {note && <span className="note-preview">{note.substring(0, 15)}...</span>}
                </div>
                <div className="menu-item disabled">Добавить никнейм друга</div>
            </div>

            <div className="menu-separator" />

            <div className="menu-group">
                {(isSelf || canManageNicknames) && (
                    <div className="menu-item" onClick={() => handleAction('nickname')}>Изменить никнейм</div>
                )}
                <div className="menu-item has-submenu" onMouseEnter={() => setShowRolesSubmenu(false)}>
                    Приложения
                    <span className="submenu-arrow">›</span>
                </div>
                <div className="menu-item has-submenu">
                    Пригласить на сервер
                    <span className="submenu-arrow">›</span>
                </div>
                {!isSelf && (
                    isFriend ? (
                        <div className="menu-item destructive" onClick={() => handleAction('remove-friend')}>Удалить из друзей</div>
                    ) : (
                        <div className="menu-item" onClick={() => handleAction('add-friend')}>Добавить в друзья</div>
                    )
                )}
                <div className="menu-item">Игнорировать</div>
                {!isSelf && <div className="menu-item destructive" onClick={() => handleAction('block')}>Заблокировать</div>}
            </div>

            {!isSelf && (
                <>
                    <div className="menu-separator" />
                    <div className="menu-group">
                        <div className="menu-label">Громкость пользователя</div>
                        <div className="volume-slider-container">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={currentVolume}
                                onChange={(e) => setUserVolume(targetUser._id, parseFloat(e.target.value))}
                                className="menu-volume-slider"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="menu-item check-item" onClick={(e) => { e.stopPropagation(); toggleLocalMute(targetUser._id); }}>
                            <span>Заглушить (для себя)</span>
                            <div className={`checkbox ${isLocalMuted ? 'checked' : ''}`}>
                                {isLocalMuted && '✓'}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {!isSelf && (canKick || canBan || canManageRoles) && (
                <>
                    <div className="menu-separator" />
                    <div className="menu-group">
                        <div className="menu-item">Открыть с доступом модератора</div>
                        {canKick && <div className="menu-item destructive" onClick={() => handleAction('timeout')}>Отправить в тайм-аут</div>}
                        {canKick && <div className="menu-item destructive" onClick={() => handleAction('kick')}>Выгнать {targetUser.username}</div>}
                        {canBan && <div className="menu-item destructive" onClick={() => handleAction('ban')}>Забанить {targetUser.username}</div>}

                        {canManageRoles && (
                            <div
                                className="menu-item has-submenu"
                                onMouseEnter={() => setShowRolesSubmenu(true)}
                                onMouseLeave={() => setShowRolesSubmenu(false)}
                            >
                                Роли
                                <span className="submenu-arrow">›</span>
                                {showRolesSubmenu && (
                                    <div className="submenu roles-submenu">
                                        {roles.filter(r => r.name !== '@everyone').map(role => (
                                            <div
                                                key={role._id}
                                                className="menu-item role-item"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAction('toggle-role', { roleId: role._id });
                                                }}
                                            >
                                                <div className="role-checkbox">
                                                    {targetRoles.includes(role._id) && <span className="checked">✓</span>}
                                                </div>
                                                <span style={{ color: role.color }}>{role.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>,
        document.body
    );
};

export default MemberContextMenu;
