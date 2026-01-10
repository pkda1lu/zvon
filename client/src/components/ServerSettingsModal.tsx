import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Server, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { CloseIcon, TrashIcon, PlusIcon } from './Icons';
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

    const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCropModal({ isOpen: true, image: reader.result as string, type: 'icon' });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
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
        try {
            const res = await axios.patch(`/api/servers/${server._id}/roles/${roleId}`, updates);
            const updatedRoles = roles.map(r => r._id === roleId ? res.data : r);
            setRoles(updatedRoles);
            onServerUpdate({ ...server, roles: updatedRoles });
        } catch (err) { alert('Ошибка при обновлении роли'); }
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
                                <div className="role-editor">
                                    <button className="back-button" onClick={() => setEditingRole(null)}>← Все роли</button>
                                    <div className="editor-header">
                                        <h2>Редактирование: {roles.find(r => r._id === editingRole)?.name}</h2>
                                    </div>
                                    <div className="settings-input-group">
                                        <label>Название роли</label>
                                        <input
                                            className="settings-input"
                                            value={roles.find(r => r._id === editingRole)?.name || ''}
                                            onChange={(e) => handleUpdateRole(editingRole, { name: e.target.value })}
                                            disabled={roles.find(r => r._id === editingRole)?.name === '@everyone'}
                                        />
                                    </div>
                                    <div className="settings-input-group">
                                        <label>Цвет роли</label>
                                        <div className="role-color-editor">
                                            <input
                                                type="color"
                                                value={roles.find(r => r._id === editingRole)?.color || '#99aab5'}
                                                onChange={(e) => handleUpdateRole(editingRole, { color: e.target.value })}
                                            />
                                            <input
                                                className="settings-input"
                                                value={roles.find(r => r._id === editingRole)?.color || '#99aab5'}
                                                onChange={(e) => handleUpdateRole(editingRole, { color: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="permission-item">
                                        <div className="permission-info">
                                            <div className="permission-name">Показывать роль отдельно</div>
                                            <div className="permission-description">Участники с этой ролью будут отображаться в отдельной категории в списке участников.</div>
                                        </div>
                                        <label className="switch">
                                            <input type="checkbox" checked={roles.find(r => r._id === editingRole)?.hoist} onChange={(e) => handleUpdateRole(editingRole, { hoist: e.target.checked })} />
                                            <span className="slider round"></span>
                                        </label>
                                    </div>

                                    <div className="permissions-list">
                                        <h3>Права доступа</h3>
                                        {Object.entries(Permissions).map(([name, bit]) => (
                                            <div key={name} className="permission-item">
                                                <div className="permission-info">
                                                    <div className="permission-name">{name.replace(/_/g, ' ')}</div>
                                                </div>
                                                <label className="switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={hasPermission(BigInt(roles.find(r => r._id === editingRole)?.permissions || '0'), bit as bigint)}
                                                        onChange={(e) => {
                                                            const currentPerms = BigInt(roles.find(r => r._id === editingRole)?.permissions || '0');
                                                            const newPerms = e.target.checked ? currentPerms | (bit as bigint) : currentPerms & ~(bit as bigint);
                                                            handleUpdateRole(editingRole, { permissions: newPerms.toString() });
                                                        }}
                                                    />
                                                    <span className="slider round"></span>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="sidebar-item danger" style={{ marginTop: '40px' }} onClick={() => handleDeleteRole(editingRole)}>Удалить роль</button>
                                </div>
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
