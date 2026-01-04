import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Server, User, Role } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { CloseIcon, TrashIcon, ShieldIcon, PlusIcon, SettingsIcon } from './Icons';
import { PERMISSIONS } from '../constants/permissions';
import './ServerSettingsModal.css';

interface ServerSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
    onServerDelete: (serverId: string) => void;
}

type SettingsTab = 'overview' | 'roles' | 'members' | 'invites' | 'bans' | 'audit_log';

const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
    isOpen,
    onClose,
    server,
    onServerUpdate,
    onServerDelete
}) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>('overview');
    const [serverName, setServerName] = useState(server.name);
    const [serverDescription, setServerDescription] = useState(server.description || '');
    const [serverIcon, setServerIcon] = useState(server.icon);
    const [serverBanner, setServerBanner] = useState(server.banner);
    const [bannerColor, setBannerColor] = useState(server.bannerColor || '#5865f2');
    const [hasChanges, setHasChanges] = useState(false);
    const [loading, setLoading] = useState(false);

    // Data for other tabs
    const [roles, setRoles] = useState<Role[]>([]);
    const [invites, setInvites] = useState<any[]>([]);
    const [bans, setBans] = useState<any[]>([]);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [members, setMembers] = useState(server.members);

    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [roleName, setRoleName] = useState('');
    const [roleColor, setRoleColor] = useState('');
    const [rolePermissions, setRolePermissions] = useState<string[]>([]);
    const [roleHasChanges, setRoleHasChanges] = useState(false);

    const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
    const [selectedMemberRoles, setSelectedMemberRoles] = useState<string[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setHasChanges(
            serverName !== server.name ||
            serverDescription !== (server.description || '') ||
            bannerColor !== (server.bannerColor || '#5865f2')
        );
    }, [serverName, serverDescription, bannerColor, server]);

    useEffect(() => {
        if (activeTab === 'roles') fetchRoles();
        if (activeTab === 'invites') fetchInvites();
        if (activeTab === 'bans') fetchBans();
        if (activeTab === 'audit_log') fetchAuditLogs();
    }, [activeTab, server._id]);

    const fetchRoles = async () => {
        try {
            const res = await axios.get(`/api/servers/${server._id}/roles`);
            setRoles(res.data);
        } catch (err) { console.error(err); }
    };

    const fetchInvites = async () => {
        try {
            const res = await axios.get(`/api/servers/${server._id}/invites`);
            setInvites(res.data);
        } catch (err) { console.error(err); }
    };

    const fetchBans = async () => {
        try {
            const res = await axios.get(`/api/servers/${server._id}/bans`);
            setBans(res.data);
        } catch (err) { console.error(err); }
    };

    const fetchAuditLogs = async () => {
        try {
            const res = await axios.get(`/api/servers/${server._id}/audit-logs`);
            setAuditLogs(res.data);
        } catch (err) { console.error(err); }
    };

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
            console.error(err);
            alert('Ошибка при сохранении настроек');
        } finally {
            setLoading(false);
        }
    };

    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('icon', file);

        try {
            const res = await axios.post(`/api/servers/${server._id}/icon`, formData);
            setServerIcon(res.data.icon);
            onServerUpdate({ ...server, icon: res.data.icon });
        } catch (err) {
            console.error(err);
            alert('Ошибка при загрузке иконки');
        }
    };

    const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('banner', file);

        try {
            const res = await axios.post(`/api/servers/${server._id}/banner`, formData);
            setServerBanner(res.data.banner);
            onServerUpdate({ ...server, banner: res.data.banner });
        } catch (err: any) {
            console.error(err);
            alert('Ошибка при загрузке баннера');
        }
    };

    const handleDeleteServer = async () => {
        if (window.confirm('Вы уверены, что хотите удалить сервер? Это действие необратимо.')) {
            try {
                await axios.delete(`/api/servers/${server._id}`);
                onServerDelete(server._id);
                onClose();
            } catch (err) {
                console.error(err);
                alert('Ошибка при удалении сервера');
            }
        }
    };

    const handleKickMember = async (userId: string) => {
        if (window.confirm('Выгнать этого участника?')) {
            try {
                await axios.delete(`/api/servers/${server._id}/members/${userId}`);
                setMembers(members.filter(m => (m.user as any)._id !== userId));
            } catch (err) { console.error(err); }
        }
    };

    const handleUnban = async (userId: string) => {
        try {
            await axios.delete(`/api/servers/${server._id}/bans/${userId}`);
            setBans(bans.filter(b => b.user._id !== userId));
        } catch (err) { console.error(err); }
    };

    const handleRevokeInvite = async (code: string) => {
        try {
            await axios.delete(`/api/servers/${server._id}/invites/${code}`);
            setInvites(invites.filter(i => i.code !== code));
        } catch (err) { console.error(err); }
    };

    const handleCreateRole = async () => {
        try {
            const res = await axios.post(`/api/servers/${server._id}/roles`, {
                name: 'Новая роль',
                color: '#99AAB5',
                permissions: []
            });
            setRoles([...roles, res.data]);
        } catch (err) { console.error(err); }
    };

    const handleMoveRole = async (roleId: string, direction: 'up' | 'down') => {
        const index = roles.findIndex(r => r._id === roleId);
        if (index === -1) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === roles.length - 1) return;

        const newRoles = [...roles];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        // Swap locally for instant feedback
        [newRoles[index], newRoles[swapIndex]] = [newRoles[swapIndex], newRoles[index]];

        // Update positions based on new array order (index 0 is highest visually, so logical position should be descending or ascending depending on sort)
        // Let's assume index 0 is top (highest position)
        newRoles.forEach((r, i) => {
            r.position = newRoles.length - 1 - i;
        });

        setRoles(newRoles);

        try {
            await axios.put(`/api/servers/${server._id}/roles/positions`, {
                roles: newRoles.map(r => ({ id: r._id, position: r.position }))
            });
        } catch (err) {
            console.error('Failed to update role positions', err);
        }
    };

    const handleUpdateMemberRoles = async (userId: string) => {
        try {
            await axios.put(`/api/servers/${server._id}/members/${userId}/roles`, {
                roles: selectedMemberRoles
            });
            setMembers(members.map(m =>
                (m.user as any)._id === userId ? { ...m, roles: roles.filter(r => selectedMemberRoles.includes(r._id)) } : m
            ));
            setEditingMemberId(null);
        } catch (err) {
            console.error(err);
            alert('Ошибка при обновлении ролей участника');
        }
    };

    const toggleMemberRole = (roleId: string) => {
        setSelectedMemberRoles(prev =>
            prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
        );
    };

    const handleUpdateRole = async () => {
        if (!editingRole) return;
        setLoading(true);
        try {
            const res = await axios.put(`/api/servers/${server._id}/roles/${editingRole._id}`, {
                name: roleName,
                color: roleColor,
                permissions: rolePermissions
            });
            setRoles(roles.map(r => r._id === res.data._id ? res.data : r));
            setEditingRole(null);
            setRoleHasChanges(false);
        } catch (err) {
            console.error(err);
            alert('Ошибка при обновлении роли');
        } finally {
            setLoading(false);
        }
    };

    const togglePermission = (permId: string) => {
        setRolePermissions(prev =>
            prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
        );
        setRoleHasChanges(true);
    };

    const startEditingRole = (role: Role) => {
        setEditingRole(role);
        setRoleName(role.name);
        setRoleColor(role.color);
        setRolePermissions(role.permissions);
        setRoleHasChanges(false);
    };

    const handleDeleteRole = async (roleId: string) => {
        if (window.confirm('Удалить эту роль?')) {
            try {
                await axios.delete(`/api/servers/${server._id}/roles/${roleId}`);
                setRoles(roles.filter(r => r._id !== roleId));
            } catch (err) { console.error(err); }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="server-settings-modal-overlay">
            <div className="server-settings-modal">
                <div className="server-settings-sidebar">
                    <div className="sidebar-header">{server.name}</div>
                    <div
                        className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        Обзор
                    </div>
                    <div
                        className={`sidebar-item ${activeTab === 'roles' ? 'active' : ''}`}
                        onClick={() => setActiveTab('roles')}
                    >
                        Роли
                    </div>

                    <div className="sidebar-header">Управление участниками</div>
                    <div
                        className={`sidebar-item ${activeTab === 'members' ? 'active' : ''}`}
                        onClick={() => setActiveTab('members')}
                    >
                        Участники
                    </div>
                    <div
                        className={`sidebar-item ${activeTab === 'invites' ? 'active' : ''}`}
                        onClick={() => setActiveTab('invites')}
                    >
                        Приглашения
                    </div>
                    <div
                        className={`sidebar-item ${activeTab === 'bans' ? 'active' : ''}`}
                        onClick={() => setActiveTab('bans')}
                    >
                        Баны
                    </div>

                    <div className="sidebar-header">Другое</div>
                    <div
                        className={`sidebar-item ${activeTab === 'audit_log' ? 'active' : ''}`}
                        onClick={() => setActiveTab('audit_log')}
                    >
                        Журнал аудита
                    </div>

                    <div style={{ flex: 1 }} />
                    <div className="sidebar-item danger" onClick={handleDeleteServer}>
                        Удалить сервер
                    </div>
                </div>

                <div className="server-settings-content">
                    <div className="close-settings-button" onClick={onClose}>
                        <div className="close-icon-wrapper">
                            <CloseIcon size={18} />
                        </div>
                        <span className="close-text">ESC</span>
                    </div>

                    {activeTab === 'overview' && (
                        <div className="settings-section">
                            <h2>Обзор сервера</h2>
                            <div className="overview-grid">
                                <div className="avatar-upload-section">
                                    <div className="server-avatar-preview" onClick={() => fileInputRef.current?.click()}>
                                        {serverIcon ? (
                                            <img src={getAvatarUrl(serverIcon)!} alt="Server Icon" />
                                        ) : (
                                            <span>{serverName.charAt(0).toUpperCase()}</span>
                                        )}
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        accept="image/*"
                                        onChange={handleIconUpload}
                                    />
                                    <div className="avatar-hint">Рекомендуемый размер: 512x512</div>
                                </div>

                                <div className="input-section">
                                    <div className="settings-input-group">
                                        <label>Название сервера</label>
                                        <input
                                            className="settings-input"
                                            value={serverName}
                                            onChange={(e) => setServerName(e.target.value)}
                                        />
                                    </div>
                                    <div className="settings-input-group">
                                        <label>Описание</label>
                                        <textarea
                                            className="settings-input"
                                            style={{ height: '100px', resize: 'none' }}
                                            value={serverDescription}
                                            onChange={(e) => setServerDescription(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="server-profile-settings-divider" />

                            <div className="banner-settings-section">
                                <div className="banner-settings-header">
                                    <h3>Баннер профиля сервера</h3>
                                    <p>Участники увидят этот баннер в мини-профиле сервера.</p>
                                </div>

                                <div className="banner-selection-grid">
                                    <div className="banner-upload-box">
                                        <div
                                            className="banner-preview-small"
                                            style={{
                                                backgroundColor: bannerColor,
                                                backgroundImage: serverBanner ? `url(${getAvatarUrl(serverBanner)})` : 'none',
                                                backgroundSize: 'cover'
                                            }}
                                            onClick={() => bannerInputRef.current?.click()}
                                        >
                                            {!serverBanner && <span>Загрузить изображение</span>}
                                        </div>
                                        <input
                                            type="file"
                                            ref={bannerInputRef}
                                            style={{ display: 'none' }}
                                            accept="image/*"
                                            onChange={handleBannerUpload}
                                        />
                                    </div>

                                    <div className="color-selection-box">
                                        <label>Цвет баннера</label>
                                        <div className="color-picker-row">
                                            <input
                                                type="color"
                                                value={bannerColor}
                                                onChange={(e) => setBannerColor(e.target.value)}
                                                className="color-input-native"
                                            />
                                            <input
                                                type="text"
                                                value={bannerColor}
                                                onChange={(e) => setBannerColor(e.target.value)}
                                                className="settings-input color-text-input"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'members' && (
                        <div className="settings-section">
                            <h2>Участники сервера ({members.length})</h2>
                            <div className="members-list-settings">
                                {members.map((member: any) => (
                                    <div key={member.user._id} className="member-row-wrapper">
                                        <div className="member-row">
                                            <div className="member-user-info">
                                                <div className="member-avatar-small">
                                                    <img src={getAvatarUrl(member.user.avatar)!} alt="" />
                                                </div>
                                                <div className="member-meta">
                                                    <span className="member-username">{member.user.username}</span>
                                                    <div className="member-roles-tags">
                                                        {member.roles?.map((role: Role) => (
                                                            <span key={role._id} className="role-tag" style={{ borderColor: role.color }}>
                                                                <span className="role-dot-mini" style={{ backgroundColor: role.color }} />
                                                                {role.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="member-actions">
                                                <button
                                                    className="action-button"
                                                    title="Управление ролями"
                                                    onClick={() => {
                                                        setEditingMemberId(editingMemberId === member.user._id ? null : member.user._id);
                                                        setSelectedMemberRoles(member.roles.map((r: any) => r._id || r));
                                                    }}
                                                >
                                                    <PlusIcon size={18} />
                                                </button>
                                                <button className="action-button danger" onClick={() => handleKickMember(member.user._id)}>
                                                    <TrashIcon size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        {editingMemberId === member.user._id && (
                                            <div className="member-role-editor">
                                                <h4>Правка ролей — {member.user.username}</h4>
                                                <div className="role-selection-list">
                                                    {roles.map(role => (
                                                        <div
                                                            key={role._id}
                                                            className={`role-select-item ${selectedMemberRoles.includes(role._id) ? 'selected' : ''}`}
                                                            onClick={() => toggleMemberRole(role._id)}
                                                        >
                                                            <div className="role-select-info">
                                                                <span className="role-dot" style={{ backgroundColor: role.color }} />
                                                                <span>{role.name}</span>
                                                            </div>
                                                            {selectedMemberRoles.includes(role._id) && <span className="checkmark">✓</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="editor-actions">
                                                    <button className="reset-button" onClick={() => setEditingMemberId(null)}>Отмена</button>
                                                    <button className="save-button" onClick={() => handleUpdateMemberRoles(member.user._id)}>
                                                        Применить
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'roles' && (
                        <div className="settings-section">
                            {!editingRole ? (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <h2 style={{ marginBottom: 0 }}>Роли</h2>
                                        <button className="save-button" onClick={handleCreateRole}>
                                            <PlusIcon size={16} /> Создать роль
                                        </button>
                                    </div>
                                    <div className="role-list">
                                        {roles.sort((a, b) => (b.position || 0) - (a.position || 0)).map((role, idx) => (
                                            <div key={role._id} className="role-item" onClick={() => startEditingRole(role)} style={{ cursor: 'pointer' }}>
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <span className="role-dot" style={{ backgroundColor: role.color }} />
                                                    <span style={{ color: '#dcddde' }}>{role.name}</span>
                                                </div>
                                                <div className="member-actions">
                                                    <div className="role-move-buttons">
                                                        <button
                                                            className="action-button small"
                                                            onClick={(e) => { e.stopPropagation(); handleMoveRole(role._id, 'up'); }}
                                                            disabled={idx === 0}
                                                        >
                                                            ▲
                                                        </button>
                                                        <button
                                                            className="action-button small"
                                                            onClick={(e) => { e.stopPropagation(); handleMoveRole(role._id, 'down'); }}
                                                            disabled={idx === roles.length - 1}
                                                        >
                                                            ▼
                                                        </button>
                                                    </div>
                                                    <button className="action-button" onClick={(e) => { e.stopPropagation(); startEditingRole(role); }}>
                                                        <SettingsIcon size={18} />
                                                    </button>
                                                    <button className="action-button danger" onClick={(e) => { e.stopPropagation(); handleDeleteRole(role._id); }}>
                                                        <TrashIcon size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="role-editor">
                                    <div className="editor-header">
                                        <button className="back-button" onClick={() => setEditingRole(null)}>
                                            ← Назад к ролям
                                        </button>
                                        <h2>Редактирование роли — {roleName}</h2>
                                    </div>

                                    <div className="editor-content">
                                        <div className="settings-input-group">
                                            <label>Название роли</label>
                                            <input
                                                className="settings-input"
                                                value={roleName}
                                                onChange={(e) => { setRoleName(e.target.value); setRoleHasChanges(true); }}
                                            />
                                        </div>

                                        <div className="settings-input-group">
                                            <label>Цвет роли</label>
                                            <div className="role-color-editor">
                                                <input
                                                    type="color"
                                                    value={roleColor}
                                                    onChange={(e) => { setRoleColor(e.target.value); setRoleHasChanges(true); }}
                                                    className="color-input-native"
                                                />
                                                <input
                                                    type="text"
                                                    className="settings-input color-text-input"
                                                    value={roleColor}
                                                    onChange={(e) => { setRoleColor(e.target.value); setRoleHasChanges(true); }}
                                                />
                                            </div>
                                        </div>

                                        <div className="permissions-list">
                                            <h3>Права доступа</h3>
                                            {PERMISSIONS.map(perm => (
                                                <div key={perm.id} className="permission-item">
                                                    <div className="permission-info">
                                                        <div className="permission-name">{perm.name}</div>
                                                        <div className="permission-description">{perm.description}</div>
                                                    </div>
                                                    <label className="switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={rolePermissions.includes(perm.id)}
                                                            onChange={() => togglePermission(perm.id)}
                                                        />
                                                        <span className="slider round"></span>
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {roleHasChanges && (
                                        <div className="save-changes-bar relative">
                                            <span className="save-changes-text">Несохраненные изменения!</span>
                                            <div className="save-changes-buttons">
                                                <button className="reset-button" onClick={() => startEditingRole(editingRole)}>Сбросить</button>
                                                <button className="save-button" onClick={handleUpdateRole} disabled={loading}>
                                                    {loading ? 'Сохранение...' : 'Сохранить'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'bans' && (
                        <div className="settings-section">
                            <h2>Бан лист ({bans.length})</h2>
                            {bans.map(ban => (
                                <div key={ban.user._id} className="member-row">
                                    <div className="member-user-info">
                                        <div className="member-avatar-small">
                                            <img src={getAvatarUrl(ban.user.avatar)!} alt="" />
                                        </div>
                                        <div>
                                            <div className="member-username">{ban.user.username}</div>
                                            <div style={{ color: '#8e9297', fontSize: '12px' }}>Причина: {ban.reason}</div>
                                        </div>
                                    </div>
                                    <button className="save-button" onClick={() => handleUnban(ban.user._id)}>Разбанить</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'invites' && (
                        <div className="settings-section">
                            <h2>Активные приглашения</h2>
                            {invites.map(invite => (
                                <div key={invite.code} className="member-row">
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 600 }}>{invite.code}</div>
                                        <div style={{ color: '#8e9297', fontSize: '12px' }}>Создал: {invite.creator.username} • Использований: {invite.uses}</div>
                                    </div>
                                    <button className="action-button danger" onClick={() => handleRevokeInvite(invite.code)}>
                                        <TrashIcon size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'audit_log' && (
                        <div className="settings-section">
                            <h2>Журнал аудита</h2>
                            <div className="audit-log-list">
                                {auditLogs.map(log => (
                                    <div key={log._id} className="log-item">
                                        <span className="log-user">{log.user.username}</span>
                                        <span className="log-action"> {log.action} {log.targetType}</span>
                                        {log.reason && <div style={{ color: '#43b581', marginTop: '4px' }}>Причина: {log.reason}</div>}
                                        <span className="log-time">{new Date(log.createdAt).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {hasChanges && (
                        <div className="save-changes-bar">
                            <span className="save-changes-text">Осторожно! У вас есть несохраненные изменения!</span>
                            <div className="save-changes-buttons">
                                <button className="reset-button" onClick={() => {
                                    setServerName(server.name);
                                    setServerDescription(server.description || '');
                                }}>Сбросить</button>
                                <button className="save-button" onClick={handleSaveOverview} disabled={loading}>
                                    {loading ? 'Сохранение...' : 'Сохранить изменения'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ServerSettingsModal;
