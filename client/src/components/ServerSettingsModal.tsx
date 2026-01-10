import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Server, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { CloseIcon, TrashIcon, PlusIcon, ChevronUpIcon, ChevronDownIcon } from './Icons';
import ImageCropper from './ImageCropper';
import { Permissions, hasPermission, computePermissions } from '../utils/permissions';
import { useAuth } from '../contexts/AuthContext';
import './ServerSettingsModal.css';

interface ServerSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
    onServerDelete: (serverId: string) => void;
}

type SettingsTab = 'overview' | 'roles' | 'members';

const PermissionMetadata: Record<string, { label: string; description: string; category: string }> = {
    ADMINISTRATOR: { category: 'ОСНОВНЫЕ ПРАВА', label: 'Администратор', description: 'Предоставляет все права доступа, а также позволяет обходить ограничения в каналах. Это опасное право.' },
    MANAGE_GUILD: { category: 'ОСНОВНЫЕ ПРАВА', label: 'Управление сервером', description: 'Позволяет менять название сервера, иконку, баннер и регион.' },
    MANAGE_ROLES: { category: 'ОСНОВНЫЕ ПРАВА', label: 'Управление ролями', description: 'Позволяет создавать новые роли и редактировать роли ниже этой.' },
    MANAGE_CHANNELS: { category: 'ОСНОВНЫЕ ПРАВА', label: 'Управление каналами', description: 'Позволяет создавать, редактировать и удалять каналы.' },
    VIEW_AUDIT_LOG: { category: 'ОСНОВНЫЕ ПРАВА', label: 'Просмотр журнала аудита', description: 'Позволяет видеть историю изменений на сервере.' },

    KICK_MEMBERS: { category: 'УПРАВЛЕНИЕ УЧАСТНИКАМИ', label: 'Исключать участников', description: 'Позволяет выгонять пользователей с сервера.' },
    BAN_MEMBERS: { category: 'УПРАВЛЕНИЕ УЧАСТНИКАМИ', label: 'Банить участников', description: 'Позволяет навсегда блокировать доступ пользователей к серверу.' },
    CREATE_INSTANT_INVITE: { category: 'УПРАВЛЕНИЕ УЧАСТНИКАМИ', label: 'Создание приглашения', description: 'Позволяет создавать ссылки для приглашения новых людей.' },
    CHANGE_NICKNAME: { category: 'УПРАВЛЕНИЕ УЧАСТНИКАМИ', label: 'Изменение никнейма', description: 'Позволяет пользователю менять свой никнейм на этом сервере.' },
    MANAGE_NICKNAMES: { category: 'УПРАВЛЕНИЕ УЧАСТНИКАМИ', label: 'Управление никнеймами', description: 'Позволяет менять никнеймы других участников.' },

    VIEW_CHANNEL: { category: 'ТЕКСТОВЫЕ КАНАЛЫ', label: 'Просмотр каналов', description: 'Позволяет видеть список каналов и читать сообщения.' },
    SEND_MESSAGES: { category: 'ТЕКСТОВЫЕ КАНАЛЫ', label: 'Отправка сообщений', description: 'Позволяет отправлять текстовые сообщения в каналы.' },
    MANAGE_MESSAGES: { category: 'ТЕКСТОВЫЕ КАНАЛЫ', label: 'Управление сообщениями', description: 'Позволяет удалять и закреплять сообщения других пользователей.' },
    EMBED_LINKS: { category: 'ТЕКСТОВЫЕ КАНАЛЫ', label: 'Встраивание ссылок', description: 'Ссылки в сообщениях будут преобразовываться в предпросмотр.' },
    ATTACH_FILES: { category: 'ТЕКСТОВЫЕ КАНАЛЫ', label: 'Отправка файлов', description: 'Позволяет загружать и отправлять файлы и изображения.' },
    READ_MESSAGE_HISTORY: { category: 'ТЕКСТОВЫЕ КАНАЛЫ', label: 'Чтение истории сообщений', description: 'Позволяет видеть сообщения, отправленные до входа в канал.' },
    MENTION_EVERYONE: { category: 'ТЕКСТОВЫЕ КАНАЛЫ', label: 'Упоминание @everyone', description: 'Позволяет использовать теги @everyone и @here для уведомления всех.' },
    ADD_REACTIONS: { category: 'ТЕКСТОВЫЕ КАНАЛЫ', label: 'Добавление реакций', description: 'Позволяет ставить эмодзи-реакции на сообщения.' },

    CONNECT: { category: 'ГОЛОСОВЫЕ КАНАЛЫ', label: 'Подключение', description: 'Позволяет заходить в голосовые каналы.' },
    SPEAK: { category: 'ГОЛОСОВЫЕ КАНАЛЫ', label: 'Говорить', description: 'Позволяет говорить в голосовых каналах.' },
    STREAM: { category: 'ГОЛОСОВЫЕ КАНАЛЫ', label: 'Видеостриминг', description: 'Позволяет транслировать экран или включать камеру.' },
    MUTE_MEMBERS: { category: 'ГОЛОСОВЫЕ КАНАЛЫ', label: 'Отключать микрофон участников', description: 'Позволяет выключать микрофон другим людям в голосовом канале.' },
    DEAFEN_MEMBERS: { category: 'ГОЛОСОВЫЕ КАНАЛЫ', label: 'Отключать звук участникам', description: 'Позволяет выключать звук (наушники) другим людям.' },
    MOVE_MEMBERS: { category: 'ГОЛОСОВЫЕ КАНАЛЫ', label: 'Перемещать участников', description: 'Позволяет перетаскивать людей между голосовыми каналами.' },
};

const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
    isOpen,
    onClose,
    server,
    onServerUpdate,
    onServerDelete
}) => {
    const { user: currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<SettingsTab>('overview');
    const [serverName, setServerName] = useState(server.name);
    const [serverDescription, setServerDescription] = useState(server.description || '');
    const [serverIcon, setServerIcon] = useState(server.icon);
    const [serverBanner, setServerBanner] = useState(server.banner);
    const [bannerColor, setBannerColor] = useState(server.bannerColor || '#5865f2');
    const [hasChanges, setHasChanges] = useState(false);
    const [loading, setLoading] = useState(false);

    const [editingRole, setEditingRole] = useState<string | null>(null); // Role ID
    const [roles, setRoles] = useState(server.roles || []);
    const [members, setMembers] = useState(server.members);
    const [editingMemberRoles, setEditingMemberRoles] = useState<string | null>(null); // User ID

    const userPerms = currentUser ? computePermissions(currentUser._id, server) : 0n;
    const canManageRoles = hasPermission(userPerms, Permissions.MANAGE_ROLES) || String(server.owner === 'object' ? (server.owner as any)._id : server.owner) === currentUser?._id;

    const [cropModal, setCropModal] = useState<{
        isOpen: boolean;
        image: string;
        type: 'icon' | 'banner';
    }>({ isOpen: false, image: '', type: 'icon' });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setHasChanges(
            serverName !== server.name ||
            serverDescription !== (server.description || '') ||
            bannerColor !== (server.bannerColor || '#5865f2')
        );
    }, [serverName, serverDescription, bannerColor, server.name, server.description, server.bannerColor]);

    useEffect(() => {
        setMembers(server.members);
    }, [server.members]);

    useEffect(() => {
        setRoles(server.roles || []);
    }, [server.roles]);

    // Sync editingRole if it was a placeholder or if it's not found by ID but found by name (@everyone)
    useEffect(() => {
        if (editingRole && activeTab === 'roles' && roles.length > 0) {
            const currentRole = roles.find(r => String(r._id) === String(editingRole));
            if (!currentRole) {
                const everyone = roles.find(r => r.name === '@everyone');
                if (everyone) {
                    // Robust check: if it's a placeholder OR if we were likely editing @everyone
                    const isLikelyEveryone = editingRole === 'everyone' ||
                        editingRole === '0' ||
                        String(editingRole).length < 5 ||
                        everyone.name === '@everyone'; // Always try to recover @everyone if current is lost

                    if (isLikelyEveryone) {
                        setEditingRole(everyone._id);
                    }
                }
            }
        }
    }, [roles, editingRole, activeTab]);

    const handleSaveOverview = async () => {
        setLoading(true);
        try {
            const res = await axios.put(`/api/servers/${server._id}`, {
                name: serverName,
                description: serverDescription,
                bannerColor: bannerColor
            });
            onServerUpdate(res.data);
            setHasChanges(false);
        } catch (err) {
            alert('Ошибка при сохранении настроек');
        } finally {
            setLoading(false);
        }
    };

    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type === 'image/gif') {
            const formData = new FormData();
            formData.append('icon', file);
            try {
                setLoading(true);
                const res = await axios.post(`/api/servers/${server._id}/icon`, formData);
                setServerIcon(res.data.icon);
                onServerUpdate({ ...server, icon: res.data.icon });
            } catch (err) {
                alert('Ошибка при загрузке иконки');
            } finally {
                setLoading(false);
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = () => setCropModal({ isOpen: true, image: reader.result as string, type: 'icon' });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type === 'image/gif') {
            const formData = new FormData();
            formData.append('banner', file);
            try {
                setLoading(true);
                const res = await axios.post(`/api/servers/${server._id}/banner`, formData);
                setServerBanner(res.data.banner);
                onServerUpdate({ ...server, banner: res.data.banner });
            } catch (err) {
                alert('Ошибка при загрузке баннера');
            } finally {
                setLoading(false);
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = () => setCropModal({ isOpen: true, image: reader.result as string, type: 'banner' });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleCropComplete = async (croppedBlob: Blob) => {
        const type = cropModal.type;
        setCropModal(prev => ({ ...prev, isOpen: false }));
        const formData = new FormData();
        formData.append(type === 'icon' ? 'icon' : 'banner', croppedBlob, `${type}.jpg`);

        try {
            setLoading(true);
            const endpoint = `/api/servers/${server._id}/${type === 'icon' ? 'icon' : 'banner'}`;
            const res = await axios.post(endpoint, formData);
            if (type === 'icon') {
                setServerIcon(res.data.icon);
                onServerUpdate({ ...server, icon: res.data.icon });
            } else {
                setServerBanner(res.data.banner);
                onServerUpdate({ ...server, banner: res.data.banner });
            }
        } catch (err) {
            alert(`Ошибка при загрузке ${type === 'icon' ? 'иконки' : 'баннера'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteServer = async () => {
        if (window.confirm('Вы уверены, что хотите удалить сервер? Это действие необратимо.')) {
            try {
                await axios.delete(`/api/servers/${server._id}`);
                onServerDelete(server._id);
                onClose();
            } catch (err) {
                alert('Ошибка при удалении сервера');
            }
        }
    };

    const handleKickMember = async (userId: string) => {
        if (window.confirm('Выгнать этого участника?')) {
            try {
                await axios.delete(`/api/servers/${server._id}/members/${userId}`);
                setMembers(members.filter(m => (m.user as any)._id !== userId));
            } catch (err) { }
        }
    };

    const handleCreateRole = async () => {
        try {
            const res = await axios.post(`/api/servers/${server._id}/roles`, { name: 'New Role' });
            const newRole = res.data;
            setRoles([...roles, newRole]);
            onServerUpdate({ ...server, roles: [...roles, newRole] });
            setEditingRole(newRole._id);
        } catch (err) { alert('Ошибка при создании роли'); }
    };

    const handleUpdateRole = async (roleId: string | null, updates: any) => {
        if (!roleId) return;

        // Resolve roleId if it's a placeholder (like 'everyone' or '0') or if the backend renamed it
        let resolvedId = roleId;
        const currentRole = roles.find(r => String(r._id) === String(roleId) || (r.name === '@everyone' && (roleId === 'everyone' || roleId === '0' || String(roleId).length < 5)));

        if (!currentRole && (roleId === 'everyone' || roleId === '0' || String(roleId).length < 5)) {
            const everyone = roles.find(r => r.name === '@everyone');
            if (everyone) resolvedId = everyone._id;
        } else if (currentRole) {
            resolvedId = currentRole._id;
        }

        try {
            const res = await axios.patch(`/api/servers/${server._id}/roles/${resolvedId}`, updates);
            const updatedRole = res.data;

            if (!updatedRole) return;

            // Use functional update to avoid race conditions
            setRoles(currentRoles => {
                const newRoles = currentRoles.map(r =>
                    (String(r._id) === String(resolvedId) || (r.name === '@everyone' && updatedRole.name === '@everyone'))
                        ? updatedRole
                        : r
                );

                // Immediately notify parent
                onServerUpdate({ ...server, roles: newRoles });
                return newRoles;
            });

            // Keep current editing context if ID changed
            if (updatedRole._id && String(resolvedId) !== String(updatedRole._id)) {
                setEditingRole(updatedRole._id);
            }
        } catch (err) {
            console.error('Role update error:', err);
        }
    };

    const handleDeleteRole = async (roleId: string | null) => {
        if (!roleId) return;
        if (!window.confirm('Удалить эту роль?')) return;
        try {
            await axios.delete(`/api/servers/${server._id}/roles/${roleId}`);
            const updatedRoles = roles.filter(r => r._id !== roleId);
            setRoles(updatedRoles);
            onServerUpdate({ ...server, roles: updatedRoles });
            if (editingRole === roleId) setEditingRole(null);
        } catch (err) { alert('Ошибка при удалении роли'); }
    };

    const handleToggleMemberRole = async (userId: string, roleId: string) => {
        const member = members.find(m => (m.user as any)._id === userId);
        if (!member) return;

        const currentRoles = member.roles || [];
        const newRoles = currentRoles.includes(roleId)
            ? currentRoles.filter(id => id !== roleId)
            : [...currentRoles, roleId];

        try {
            const res = await axios.put(`/api/servers/${server._id}/members/${userId}`, { roles: newRoles });
            const updatedMembers = members.map(m => (m.user as any)._id === userId ? { ...m, roles: res.data.roles } : m);
            setMembers(updatedMembers);
            onServerUpdate({ ...server, members: updatedMembers });
        } catch (err) { alert('Ошибка при обновлении ролей участника'); }
    };

    const handleMoveRole = async (roleId: string, direction: 'up' | 'down') => {
        const sortedRoles = [...roles].sort((a, b) => b.position - a.position);
        const currentIndex = sortedRoles.findIndex(r => r._id === roleId);
        if (currentIndex === -1) return;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= sortedRoles.length) return;

        const targetRole = sortedRoles[targetIndex];

        // Swap positions
        const tempPos = sortedRoles[currentIndex].position;
        // If positions are same, adjust slightly? Or just swap ranks.
        // Better: Set specific logical positions 0, 1, 2...
        // Let's rely on swapping their current position values.

        const updates = [
            { id: roleId, position: targetRole.position },
            { id: targetRole._id, position: sortedRoles[currentIndex].position }
        ];

        // Optimistic update
        const newRoles = roles.map(r => {
            if (r._id === roleId) return { ...r, position: targetRole.position };
            if (r._id === targetRole._id) return { ...r, position: sortedRoles[currentIndex].position };
            return r;
        });
        setRoles(newRoles);

        try {
            await axios.patch(`/api/servers/${server._id}/roles/positions`, { roles: updates });
            onServerUpdate({ ...server, roles: newRoles });
        } catch (err) {
            // Revert
            setRoles(roles);
            alert('Не удалось переместить роль (возможно, недостаточно прав)');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="server-settings-modal-overlay">
            <div className="server-settings-modal">
                <div className="server-settings-sidebar">
                    <div className="sidebar-header">{server.name}</div>
                    <div className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => { setActiveTab('overview'); setEditingRole(null); }}>Обзор</div>
                    <div className={`sidebar-item ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => { setActiveTab('roles'); setEditingRole(null); }}>Роли</div>
                    <div className="sidebar-header">Управление</div>
                    <div className={`sidebar-item ${activeTab === 'members' ? 'active' : ''}`} onClick={() => { setActiveTab('members'); setEditingRole(null); }}>Участники</div>
                    <div style={{ flex: 1 }} />
                    <div className="sidebar-item danger" onClick={handleDeleteServer}>Удалить сервер</div>
                </div>

                <div className="server-settings-content">
                    <div className="close-settings-button" onClick={onClose}>
                        <div className="close-icon-wrapper"><CloseIcon size={18} /></div>
                        <span className="close-text">ESC</span>
                    </div>

                    {activeTab === 'overview' && (
                        <div className="settings-section">
                            <h2>Обзор сервера</h2>
                            <div className="overview-grid">
                                <div className="avatar-upload-section">
                                    <div className="server-avatar-preview" onClick={() => fileInputRef.current?.click()}>
                                        {getAvatarUrl(serverIcon) ? <img src={getAvatarUrl(serverIcon)!} alt="" /> : <span>{serverName.charAt(0).toUpperCase()}</span>}
                                        <div className="avatar-hint">СМЕНИТЬ ИКОНКУ</div>
                                    </div>
                                    <input type="file" ref={fileInputRef} onChange={handleIconUpload} style={{ display: 'none' }} accept="image/*" />
                                </div>
                                <div className="input-section">
                                    <div className="settings-input-group">
                                        <label>Название сервера</label>
                                        <input className="settings-input" value={serverName} onChange={(e) => setServerName(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            <div className="server-profile-settings-divider" />

                            <div className="banner-settings-section">
                                <h3>Баннер сервера</h3>
                                <p>Это изображение будет отображаться в верхней части списка каналов.</p>
                                <div className="banner-selection-grid">
                                    <div
                                        className="banner-preview-small"
                                        onClick={() => bannerInputRef.current?.click()}
                                        style={serverBanner ? { backgroundImage: `url(${getAvatarUrl(serverBanner)})`, border: 'none' } : {}}
                                    >
                                        {!serverBanner && 'Загрузить баннер'}
                                    </div>
                                    <input type="file" ref={bannerInputRef} onChange={handleBannerUpload} style={{ display: 'none' }} accept="image/*" />

                                    <div className="color-selection-box">
                                        <label>Цвет баннера (если нет изображения)</label>
                                        <div className="color-picker-row">
                                            <input type="color" className="color-input-native" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} />
                                            <input type="text" className="settings-input color-text-input" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {hasChanges && (
                                <div className="save-changes-bar">
                                    <span className="save-changes-text">Осторожно! У вас есть несохраненные изменения!</span>
                                    <div className="save-changes-buttons">
                                        <button className="reset-button" onClick={() => {
                                            setServerName(server.name);
                                            setBannerColor(server.bannerColor || '#5865f2');
                                        }}>Сбросить</button>
                                        <button className="save-button" onClick={handleSaveOverview} disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить изменения'}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'roles' && (
                        <div className="settings-section roles-tab">
                            {editingRole ? (
                                (() => {
                                    // Enhanced lookup: find by ID or fallback to @everyone by name/context
                                    let currentRole = roles.find(r => String(r._id) === String(editingRole));

                                    // Fallback for @everyone
                                    if (!currentRole) {
                                        const everyone = roles.find(r => r.name === '@everyone');
                                        if (everyone && (editingRole === 'everyone' || editingRole === '0' || String(editingRole).length < 5)) {
                                            currentRole = everyone;
                                        }
                                    }

                                    // Final attempt: if it's @everyone, just find it
                                    if (!currentRole && roles.length > 0) {
                                        const everyone = roles.find(r => r.name === '@everyone');
                                        // If we were editing something and it's gone, check if it was @everyone
                                        if (everyone && (editingRole === everyone._id || String(editingRole).includes('everyone'))) {
                                            currentRole = everyone;
                                        }
                                    }

                                    if (!currentRole) return (
                                        <div className="role-editor-container">
                                            <button className="back-button-compact" onClick={() => setEditingRole(null)}>
                                                <CloseIcon size={16} />
                                                <span>Назад</span>
                                            </button>
                                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                Загрузка настроек роли...
                                            </div>
                                        </div>
                                    );

                                    return (
                                        <div className="role-editor-container">
                                            <div className="role-editor-header">
                                                <button className="back-button-compact" onClick={() => setEditingRole(null)}>
                                                    <CloseIcon size={16} />
                                                    <span>Все роли</span>
                                                </button>
                                                <div className="editor-title">
                                                    <h2>{currentRole.name}</h2>
                                                    <span className="editor-subtitle">Редактирование роли</span>
                                                </div>
                                            </div>

                                            <div className="role-editor-scrollable">
                                                <div className="settings-input-group">
                                                    <label>Название роли</label>
                                                    <input
                                                        className="settings-input"
                                                        value={currentRole.name || ''}
                                                        onChange={(e) => handleUpdateRole(editingRole, { name: e.target.value })}
                                                        disabled={currentRole.name === '@everyone'}
                                                    />
                                                </div>

                                                <div className="settings-input-group">
                                                    <label>Цвет роли</label>
                                                    <div className="role-color-editor">
                                                        <input
                                                            type="color"
                                                            value={currentRole.color || '#99aab5'}
                                                            onChange={(e) => handleUpdateRole(editingRole, { color: e.target.value })}
                                                        />
                                                        <input
                                                            className="settings-input"
                                                            value={currentRole.color || '#99aab5'}
                                                            onChange={(e) => handleUpdateRole(editingRole, { color: e.target.value })}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="permission-item">
                                                    <div className="permission-info">
                                                        <div className="permission-name">Показывать роль отдельно от остальных участников</div>
                                                        <div className="permission-description">Участники с этой ролью будут отображаться в отдельной категории в списке участников.</div>
                                                    </div>
                                                    <label className="switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={currentRole.hoist || false}
                                                            onChange={(e) => handleUpdateRole(editingRole, { hoist: e.target.checked })}
                                                        />
                                                        <span className="slider round"></span>
                                                    </label>
                                                </div>

                                                <div className="permissions-group-container">
                                                    {Array.from(new Set(Object.values(PermissionMetadata).map(m => m.category))).map(category => (
                                                        <div key={category} className="permission-category-wrapper">
                                                            <div className="permissions-divider">{category}</div>
                                                            <div className="permissions-list">
                                                                {Object.entries(PermissionMetadata)
                                                                    .filter(([_, data]) => data.category === category)
                                                                    .map(([key, data]) => {
                                                                        const bit = (Permissions as any)[key];
                                                                        const hasPerm = hasPermission(BigInt(currentRole.permissions || '0'), bit);
                                                                        return (
                                                                            <div key={key} className="permission-item">
                                                                                <div className="permission-info">
                                                                                    <div className="permission-name">{data.label}</div>
                                                                                    <div className="permission-description">{data.description}</div>
                                                                                </div>
                                                                                <label className="switch">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={hasPerm}
                                                                                        onChange={(e) => {
                                                                                            const currentPerms = BigInt(currentRole.permissions || '0');
                                                                                            const newPerms = e.target.checked ? currentPerms | bit : currentPerms & ~BigInt(bit);
                                                                                            handleUpdateRole(editingRole!, { permissions: newPerms.toString() });
                                                                                        }}
                                                                                    />
                                                                                    <span className="slider round"></span>
                                                                                </label>
                                                                            </div>
                                                                        );
                                                                    })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {currentRole.name !== '@everyone' && (
                                                    <div className="role-editor-footer">
                                                        <button className="delete-role-btn" onClick={() => handleDeleteRole(editingRole!)}>
                                                            <TrashIcon size={16} />
                                                            Удалить роль
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                <>
                                    <div className="roles-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <h2>Роли сервера</h2>
                                        <button className="save-button" onClick={handleCreateRole}><PlusIcon size={16} /> Создать роль</button>
                                    </div>
                                    <div className="role-list">
                                        {[...roles].sort((a, b) => b.position - a.position).map(role => (
                                            <div key={role._id} className="role-item" onClick={() => setEditingRole(role._id)} style={{ cursor: 'pointer' }}>
                                                <div className="role-name-container">
                                                    <div className="role-dot" style={{ backgroundColor: role.color }} />
                                                    <span style={{ color: role.color }}>{role.name}</span>
                                                </div>
                                                <div className="role-actions">
                                                    <div className="role-reorder-buttons" style={{ display: 'flex', flexDirection: 'column', marginRight: '8px' }}>
                                                        <button
                                                            className="action-button small"
                                                            onClick={(e: any) => { e.stopPropagation(); handleMoveRole(role._id, 'up'); }}
                                                            disabled={role.position >= roles.reduce((max, r) => Math.max(max, r.position), 0)}
                                                        >
                                                            <ChevronUpIcon size={12} />
                                                        </button>
                                                        <button
                                                            className="action-button small"
                                                            onClick={(e: any) => { e.stopPropagation(); handleMoveRole(role._id, 'down'); }}
                                                            disabled={role.position <= 0}
                                                        >
                                                            <ChevronDownIcon size={12} />
                                                        </button>
                                                    </div>
                                                    <button className="action-button danger" onClick={(e: any) => { e.stopPropagation(); handleDeleteRole(role._id); }}>
                                                        <TrashIcon size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'members' && (
                        <div className="settings-section">
                            <h2>Участники ({members.length})</h2>
                            <div className="members-list-settings">
                                {members.map((member: any) => (
                                    <div key={member.user._id} className="member-row-wrapper">
                                        <div className="member-row">
                                            <div className="member-user-info">
                                                <div className="member-avatar-small">
                                                    {getAvatarUrl(member.user.avatar) ? <img src={getAvatarUrl(member.user.avatar)!} alt="" /> : <span>{member.user.username.charAt(0).toUpperCase()}</span>}
                                                </div>
                                                <div className="member-meta">
                                                    <span className="member-username">{member.nickname || member.user.username} {member.nickname && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({member.user.username})</span>}</span>
                                                    <div className="member-roles-tags">
                                                        {(member.roles || []).map((rid: string) => {
                                                            const r = roles.find(ro => ro._id === rid);
                                                            if (!r) return null;
                                                            return (
                                                                <div key={rid} className="role-tag" style={{ borderColor: r.color }}>
                                                                    <div className="role-dot-mini" style={{ backgroundColor: r.color }} />
                                                                    {r.name}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="member-actions">
                                                <button className="action-button" onClick={() => setEditingMemberRoles(editingMemberRoles === member.user._id ? null : member.user._id)}>
                                                    <PlusIcon size={18} />
                                                </button>
                                                <button className="action-button danger" onClick={() => handleKickMember(member.user._id)}><TrashIcon size={18} /></button>
                                            </div>
                                        </div>
                                        {editingMemberRoles === member.user._id && (
                                            <div className="member-role-editor">
                                                <h4>Правка ролей</h4>
                                                <div className="role-selection-list">
                                                    {roles.filter(r => r.name !== '@everyone').map(role => (
                                                        <div
                                                            key={role._id}
                                                            className={`role-select-item ${member.roles?.includes(role._id) ? 'selected' : ''}`}
                                                            onClick={() => handleToggleMemberRole(member.user._id, role._id)}
                                                        >
                                                            <div className="role-select-info">
                                                                <div className="role-dot-mini" style={{ backgroundColor: role.color }} />
                                                                {role.name}
                                                            </div>
                                                            {member.roles?.includes(role._id) && <span className="checkmark">✓</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {cropModal.isOpen && <ImageCropper image={cropModal.image} onCropComplete={handleCropComplete} onCancel={() => setCropModal(prev => ({ ...prev, isOpen: false }))} aspect={cropModal.type === 'icon' ? 1 : 16 / 9} />}
        </div>
    );
};

export default ServerSettingsModal;
