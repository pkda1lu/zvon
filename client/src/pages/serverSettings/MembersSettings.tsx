import React, { useState } from 'react';
import axios from 'axios';
import { Server, Role } from '../../types';
import { getAvatarUrl } from '../../utils/avatar';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { Permissions, hasPermission, computePermissions } from '../../utils/permissions';
import { PlusIcon, SpeakerMutedIcon, BootIcon, HammerIcon } from '../../components/Icons';
import '../../components/UserProfileCard.css';
import UserAvatar from "../../components/UserAvatar";

interface Props {
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
}

// Показывает только самую приоритетную роль участника, остальные — под "+N" (как в попапе профиля пользователя).
// "+N" здесь не кликабелен — это просто индикатор количества, список ролей редактируется через кнопку "Роли".
const MemberRoleChips: React.FC<{ roleIds: string[]; serverRoles: Role[] }> = ({ roleIds, serverRoles }) => {
    const resolved = roleIds
        .map(rid => serverRoles.find(r => r._id === rid))
        .filter((r): r is Role => !!r)
        .sort((a, b) => (b.position || 0) - (a.position || 0));
    const topRole = resolved[0];
    const hiddenRoles = resolved.slice(1);

    if (!topRole) return null;

    return (
        <div className="roles-list">
            <div className="role-chip" style={{ borderColor: topRole.color + '44' }}>
                <div className="role-dot" style={{ backgroundColor: topRole.color }} />
                <span style={{ color: topRole.color || '#fff' }}>{topRole.name}</span>
            </div>
            {hiddenRoles.length > 0 && (
                <div className="role-chip role-chip-more" title={hiddenRoles.map(r => r.name).join(', ')}>
                    <span>+{hiddenRoles.length}</span>
                </div>
            )}
        </div>
    );
};

const MUTE_PRESETS = [
    { label: '60 секунд', seconds: 60 },
    { label: '5 минут', seconds: 5 * 60 },
    { label: '10 минут', seconds: 10 * 60 },
    { label: '1 час', seconds: 60 * 60 },
    { label: '1 день', seconds: 24 * 60 * 60 },
    { label: '1 неделя', seconds: 7 * 24 * 60 * 60 },
    { label: 'Навсегда', seconds: null as number | null },
];

const MembersSettings: React.FC<Props> = ({ server, onServerUpdate }) => {
    const { user: currentUser } = useAuth();
    const { confirm, alert } = useDialog();
    const [members, setMembers] = useState(server.members);
    const [editingMemberRoles, setEditingMemberRoles] = useState<string | null>(null);
    const [editingNickname, setEditingNickname] = useState<string | null>(null);
    const [nicknameValue, setNicknameValue] = useState('');
    const [muteModalFor, setMuteModalFor] = useState<{ userId: string; username: string; alreadyMuted: boolean } | null>(null);
    const [muteDuration, setMuteDuration] = useState<number | null>(60 * 60);
    const [banModalFor, setBanModalFor] = useState<{ userId: string; username: string } | null>(null);
    const [banReason, setBanReason] = useState('');
    const [banDuration, setBanDuration] = useState<number | null>(null);
    const [transferFor, setTransferFor] = useState<string | null>(null);

    React.useEffect(() => setMembers(server.members), [server.members]);

    const userPerms = currentUser ? computePermissions(currentUser._id, server) : 0n;
    const isOwner = (server.owner && (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner)) === currentUser?._id;
    const canKick = hasPermission(userPerms, Permissions.KICK_MEMBERS) || isOwner;
    const canBan = hasPermission(userPerms, Permissions.BAN_MEMBERS) || isOwner;
    const canModerate = hasPermission(userPerms, Permissions.MODERATE_MEMBERS) || isOwner;
    const canManageNicknames = hasPermission(userPerms, Permissions.MANAGE_NICKNAMES) || isOwner;
    const canManageRoles = hasPermission(userPerms, Permissions.MANAGE_ROLES) || isOwner;

    const roles = server.roles || [];

    const handleKick = async (userId: string) => {
        if (!(await confirm('Выгнать этого участника?'))) return;
        try {
            await axios.delete(`/api/servers/${server._id}/members/${userId}`);
            setMembers(prev => prev.filter(m => (m.user as any)._id !== userId));
        } catch (err) { await alert('Ошибка при исключении участника'); }
    };

    const handleToggleMemberRole = async (userId: string, roleId: string) => {
        const member = members.find(m => (m.user as any)._id === userId);
        if (!member) return;
        const currentRoles = member.roles || [];
        const newRoles = currentRoles.includes(roleId) ? currentRoles.filter(id => id !== roleId) : [...currentRoles, roleId];
        try {
            const res = await axios.put(`/api/servers/${server._id}/members/${userId}`, { roles: newRoles });
            const updated = members.map(m => (m.user as any)._id === userId ? { ...m, roles: res.data.roles } : m);
            setMembers(updated);
            onServerUpdate({ ...server, members: updated });
        } catch (err) { await alert('Ошибка при обновлении ролей участника'); }
    };

    const commitNickname = async (userId: string) => {
        setEditingNickname(null);
        try {
            const res = await axios.put(`/api/servers/${server._id}/members/${userId}`, { nickname: nicknameValue || null });
            const updated = members.map(m => (m.user as any)._id === userId ? { ...m, nickname: res.data.nickname } : m);
            setMembers(updated);
            onServerUpdate({ ...server, members: updated });
        } catch (err) { await alert('Ошибка при изменении никнейма'); }
    };

    const applyMute = async (userId: string, seconds: number | null) => {
        setMuteModalFor(null);
        try {
            const until = seconds ? new Date(Date.now() + seconds * 1000).toISOString() : new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
            const res = await axios.put(`/api/servers/${server._id}/members/${userId}`, { communicationDisabledUntil: until });
            const updated = members.map(m => (m.user as any)._id === userId ? { ...m, communicationDisabledUntil: res.data.communicationDisabledUntil } : m);
            setMembers(updated);
            onServerUpdate({ ...server, members: updated });
        } catch (err) { await alert('Ошибка при муте участника'); }
    };

    const clearMute = async (userId: string) => {
        setMuteModalFor(null);
        try {
            const res = await axios.put(`/api/servers/${server._id}/members/${userId}`, { communicationDisabledUntil: null });
            const updated = members.map(m => (m.user as any)._id === userId ? { ...m, communicationDisabledUntil: res.data.communicationDisabledUntil } : m);
            setMembers(updated);
            onServerUpdate({ ...server, members: updated });
        } catch (err) { await alert('Ошибка при снятии мута'); }
    };

    const submitBan = async () => {
        if (!banModalFor) return;
        try {
            await axios.post(`/api/servers/${server._id}/bans`, {
                userId: banModalFor.userId,
                reason: banReason || undefined,
                expiresAt: banDuration ? new Date(Date.now() + banDuration * 1000).toISOString() : null
            });
            setMembers(prev => prev.filter(m => (m.user as any)._id !== banModalFor.userId));
            setBanModalFor(null);
            setBanReason('');
            setBanDuration(null);
        } catch (err: any) {
            await alert(err.response?.data?.message || 'Ошибка при бане участника');
        }
    };

    const submitTransfer = async (userId: string) => {
        if (!(await confirm('Передать права владельца этому участнику? Вы потеряете статус владельца.'))) return;
        try {
            const res = await axios.patch(`/api/servers/${server._id}/owner`, { userId });
            onServerUpdate(res.data);
            setTransferFor(null);
        } catch (err) { await alert('Ошибка при передаче сервера'); }
    };

    const isMuted = (m: any) => m.communicationDisabledUntil && new Date(m.communicationDisabledUntil) > new Date();

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Участники ({members.length})</h2>
            <div className="members-list-settings">
                {members.map((member: any) => {
                    const uid = member.user._id;
                    const targetIsOwner = String(server.owner && (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner)) === String(uid);
                    return (
                        <div key={uid} className="member-row-wrapper">
                            <div className="member-row" style={{ flexWrap: 'wrap', gap: '10px' }}>
                                <div className="member-user-info" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <UserAvatar
                                      user={member.user}
                                      avatarOverride={member.avatar || undefined}
                                      size={40}
                                      className="member-avatar-small"
                                      style={{ borderRadius: '10px', overflow: 'hidden' }}
                                    />                                    <div className="member-meta">
                                        {editingNickname === uid ? (
                                            <input
                                                className="settings-input"
                                                style={{ padding: '4px 8px', fontSize: '14px' }}
                                                value={nicknameValue}
                                                autoFocus
                                                onChange={(e) => setNicknameValue(e.target.value)}
                                                onBlur={() => commitNickname(uid)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') commitNickname(uid); if (e.key === 'Escape') setEditingNickname(null); }}
                                            />
                                        ) : (
                                            <span
                                                style={{ fontWeight: 700, fontSize: '16px', cursor: canManageNicknames ? 'pointer' : 'default' }}
                                                title={canManageNicknames ? 'Изменить никнейм на сервере' : undefined}
                                                onClick={() => { if (canManageNicknames) { setEditingNickname(uid); setNicknameValue(member.nickname || ''); } }}
                                            >
                                                {member.nickname || member.user.displayName || member.user.username}
                                            </span>
                                        )}
                                        <div className="member-roles-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                                            {targetIsOwner && <div className="server-settings-role-tag" style={{ color: '#f0b232', borderColor: '#f0b23244' }}>Владелец</div>}
                                            {isMuted(member) && <div className="server-settings-role-tag" style={{ color: '#ff3b30', borderColor: '#ff3b3044' }}>Замучен</div>}
                                            <MemberRoleChips roleIds={member.roles || []} serverRoles={roles} />
                                        </div>
                                    </div>
                                </div>
                                <div className="member-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {canManageRoles && (
                                        <button className="action-button" title="Роли" onClick={() => setEditingMemberRoles(editingMemberRoles === uid ? null : uid)}><PlusIcon size={16} /></button>
                                    )}
                                    {canModerate && !targetIsOwner && (
                                        <button
                                            className="action-button"
                                            title="Мут"
                                            onClick={() => { setMuteDuration(60 * 60); setMuteModalFor({ userId: uid, username: member.nickname || member.user.username, alreadyMuted: isMuted(member) }); }}
                                        >
                                            <SpeakerMutedIcon size={16} />
                                        </button>
                                    )}
                                    {canKick && !targetIsOwner && (
                                        <button className="action-button danger" title="Кикнуть" onClick={() => handleKick(uid)}><BootIcon size={16} /></button>
                                    )}
                                    {canBan && !targetIsOwner && (
                                        <button className="action-button danger" title="Забанить" onClick={() => setBanModalFor({ userId: uid, username: member.nickname || member.user.username })}><HammerIcon size={16} /></button>
                                    )}
                                    {isOwner && !targetIsOwner && (
                                        <button className="settings-btn secondary" onClick={() => setTransferFor(uid)}>Передать сервер</button>
                                    )}
                                </div>
                            </div>
                            {editingMemberRoles === uid && (
                                <div className="member-role-editor" style={{ padding: '20px', background: 'rgba(0,0,0,0.15)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '16px', color: 'rgba(255,255,255,0.4)' }}>Управление ролями</h4>
                                    <div className="role-selection-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                                        {roles.filter(r => r.name !== '@everyone').map(role => (
                                            <div
                                                key={role._id}
                                                onClick={() => handleToggleMemberRole(uid, role._id)}
                                                style={{
                                                    padding: '10px 14px', borderRadius: '10px', background: member.roles?.includes(role._id) ? 'rgba(0,229,255,0.1)' : 'rgba(255,255,255,0.03)',
                                                    border: '1px solid', borderColor: member.roles?.includes(role._id) ? 'var(--primary-neon)' : 'rgba(255,255,255,0.1)', cursor: 'pointer',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                }}
                                            >
                                                <span style={{ color: role.color, fontWeight: 700, fontSize: '13px' }}>{role.name}</span>
                                                {member.roles?.includes(role._id) && <span style={{ color: 'var(--primary-neon)', fontWeight: 800 }}>✓</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {muteModalFor && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal-glass">
                        <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>Замутить {muteModalFor.username}?</h3>
                        <p style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-dim)' }}>Срок</p>
                        <select
                            className="settings-input"
                            style={{ marginBottom: '4px' }}
                            value={muteDuration ?? ''}
                            onChange={(e) => setMuteDuration(e.target.value ? parseInt(e.target.value) : null)}
                        >
                            {MUTE_PRESETS.map(p => (
                                <option key={p.label} value={p.seconds ?? ''}>{p.label}</option>
                            ))}
                        </select>
                        <div className="modal-actions" style={{ justifyContent: 'stretch', display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="settings-btn secondary" style={{ flex: 1 }} onClick={() => setMuteModalFor(null)}>Отмена</button>
                            {muteModalFor.alreadyMuted && (
                                <button className="settings-btn secondary" style={{ flex: 1 }} onClick={() => clearMute(muteModalFor.userId)}>Снять мут</button>
                            )}
                            <button className="settings-btn danger" style={{ flex: 1.2 }} onClick={() => applyMute(muteModalFor.userId, muteDuration)}>Замутить</button>
                        </div>
                    </div>
                </div>
            )}

            {banModalFor && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal-glass">
                        <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>Забанить {banModalFor.username}?</h3>
                        <p style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-dim)' }}>Причина (необязательно)</p>
                        <input className="settings-input" style={{ marginBottom: '16px' }} value={banReason} onChange={(e) => setBanReason(e.target.value)} maxLength={500} />
                        <p style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-dim)' }}>Срок</p>
                        <select className="settings-input" style={{ marginBottom: '4px' }} value={banDuration ?? ''} onChange={(e) => setBanDuration(e.target.value ? parseInt(e.target.value) : null)}>
                            <option value="">Навсегда</option>
                            <option value={24 * 60 * 60}>1 день</option>
                            <option value={7 * 24 * 60 * 60}>1 неделя</option>
                            <option value={30 * 24 * 60 * 60}>30 дней</option>
                        </select>
                        <div className="modal-actions" style={{ justifyContent: 'stretch', display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="settings-btn secondary" style={{ flex: 1 }} onClick={() => { setBanModalFor(null); setBanReason(''); setBanDuration(null); }}>Отмена</button>
                            <button className="settings-btn danger" style={{ flex: 1 }} onClick={submitBan}>Забанить</button>
                        </div>
                    </div>
                </div>
            )}

            {transferFor && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal-glass">
                        <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>Передать сервер?</h3>
                        <p className="settings-description" style={{ marginBottom: '20px' }}>
                            Вы потеряете права владельца сервера «{server.name}». Это действие нельзя отменить самостоятельно.
                        </p>
                        <div className="modal-actions" style={{ justifyContent: 'stretch', display: 'flex', gap: '10px' }}>
                            <button className="settings-btn secondary" style={{ flex: 1 }} onClick={() => setTransferFor(null)}>Отмена</button>
                            <button className="settings-btn danger" style={{ flex: 1 }} onClick={() => submitTransfer(transferFor)}>Передать</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MembersSettings;
