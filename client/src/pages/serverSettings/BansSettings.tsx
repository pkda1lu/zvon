import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Server, ServerBan } from '../../types';
import { getAvatarUrl } from '../../utils/avatar';
import { useDialog } from '../../contexts/DialogContext';
import { TrashIcon } from '../../components/Icons';

interface Props {
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
}

const BansSettings: React.FC<Props> = ({ server, onServerUpdate }) => {
    const { confirm, alert } = useDialog();
    const [bans, setBans] = useState<ServerBan[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [reasonValue, setReasonValue] = useState('');

    const fetchBans = async () => {
        try {
            const res = await axios.get(`/api/servers/${server._id}/bans`);
            setBans(res.data);
        } catch (err) {
            console.error('Failed to load bans', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchBans(); }, [server._id]);

    const userIdOf = (b: ServerBan) => typeof b.user === 'object' ? (b.user as any)._id : b.user;

    const handleUnban = async (userId: string) => {
        if (!(await confirm('Отменить бан этого пользователя?'))) return;
        try {
            await axios.delete(`/api/servers/${server._id}/bans/${userId}`);
            setBans(prev => prev.filter(b => userIdOf(b) !== userId));
        } catch (err) { await alert('Ошибка при снятии бана'); }
    };

    const commitReason = async (userId: string) => {
        setEditingId(null);
        try {
            await axios.patch(`/api/servers/${server._id}/bans/${userId}`, { reason: reasonValue });
            setBans(prev => prev.map(b => userIdOf(b) === userId ? { ...b, reason: reasonValue } : b));
        } catch (err) { await alert('Ошибка при изменении причины'); }
    };

    const changeExpiry = async (userId: string, seconds: number | null) => {
        try {
            const expiresAt = seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;
            await axios.patch(`/api/servers/${server._id}/bans/${userId}`, { expiresAt });
            setBans(prev => prev.map(b => userIdOf(b) === userId ? { ...b, expiresAt } : b));
        } catch (err) { await alert('Ошибка при изменении срока бана'); }
    };

    if (loading) return <div className="settings-content-inner"><p>Загрузка...</p></div>;

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Заблокированные пользователи</h2>
            {bans.length === 0 ? (
                <div className="server-settings-empty-state">Забаненных пользователей нет.</div>
            ) : (
                bans.map(ban => {
                    const uid = userIdOf(ban);
                    const user = typeof ban.user === 'object' ? ban.user as any : null;
                    return (
                        <div key={uid} className="server-settings-list-row" style={{ alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div className="member-avatar-small">
                                    {user && getAvatarUrl(user.avatar) ? <img src={getAvatarUrl(user.avatar)!} alt="" /> : <span>{user?.username?.charAt(0).toUpperCase() || '?'}</span>}
                                </div>
                                <div className="server-settings-list-row-info">
                                    <strong>{user?.username || uid}</strong>
                                    {editingId === uid ? (
                                        <input
                                            className="settings-input"
                                            style={{ padding: '4px 8px', fontSize: '13px' }}
                                            value={reasonValue}
                                            autoFocus
                                            onChange={(e) => setReasonValue(e.target.value)}
                                            onBlur={() => commitReason(uid)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') commitReason(uid); }}
                                        />
                                    ) : (
                                        <span
                                            style={{ fontSize: '13px', color: 'var(--text-dim)', cursor: 'pointer' }}
                                            onClick={() => { setEditingId(uid); setReasonValue(ban.reason || ''); }}
                                        >
                                            {ban.reason || 'Без причины'} (нажмите, чтобы изменить)
                                        </span>
                                    )}
                                    <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                                        {ban.expiresAt ? `До ${new Date(ban.expiresAt).toLocaleString('ru-RU')}` : 'Навсегда'}
                                    </span>
                                </div>
                            </div>
                            <div className="server-settings-list-row-actions">
                                <select className="settings-input" defaultValue="" onChange={(e) => e.target.value !== '' && changeExpiry(uid, e.target.value === '0' ? null : parseInt(e.target.value))}>
                                    <option value="" disabled>Изменить срок...</option>
                                    <option value="0">Навсегда</option>
                                    <option value={24 * 60 * 60}>1 день</option>
                                    <option value={7 * 24 * 60 * 60}>1 неделя</option>
                                    <option value={30 * 24 * 60 * 60}>30 дней</option>
                                </select>
                                <button className="action-button danger" title="Снять бан" onClick={() => handleUnban(uid)}><TrashIcon size={16} /></button>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default BansSettings;
