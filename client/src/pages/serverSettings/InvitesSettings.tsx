import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Server, Invite } from '../../types';
import { useDialog } from '../../contexts/DialogContext';
import { CopyIcon, TrashIcon, PlusIcon } from '../../components/Icons';
import { getInviteUrl } from '../../utils/inviteLinks';

interface Props {
    server: Server;
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

const InvitesSettings: React.FC<Props> = ({ server }) => {
    const { confirm, alert } = useDialog();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [expiresIn, setExpiresIn] = useState(7 * 24 * 60 * 60);
    const [maxUses, setMaxUses] = useState(0);
    const [editingCode, setEditingCode] = useState<string | null>(null);

    const fetchInvites = async () => {
        try {
            const res = await axios.get(`/api/invites/server/${server._id}`);
            setInvites(res.data);
        } catch (err) {
            console.error('Failed to load invites', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchInvites(); }, [server._id]);

    const handleCreate = async () => {
        try {
            const res = await axios.post('/api/invites', { serverId: server._id, expiresIn: expiresIn || null, maxUses: maxUses || null });
            setInvites(prev => [res.data, ...prev]);
            setCreating(false);
        } catch (err) { await alert('Ошибка при создании приглашения'); }
    };

    const handleRevoke = async (code: string) => {
        if (!(await confirm('Аннулировать это приглашение?'))) return;
        try {
            await axios.delete(`/api/invites/${code}`);
            setInvites(prev => prev.filter(i => i.code !== code));
        } catch (err) { await alert('Ошибка при аннулировании приглашения'); }
    };

    const handleUpdate = async (code: string, updates: { expiresIn?: number | null; maxUses?: number | null }) => {
        try {
            const res = await axios.patch(`/api/invites/${code}`, updates);
            setInvites(prev => prev.map(i => i.code === code ? res.data : i));
        } catch (err) { await alert('Ошибка при изменении приглашения'); }
        setEditingCode(null);
    };

    const copyLink = (code: string) => {
        navigator.clipboard.writeText(getInviteUrl(code));
    };

    const formatExpiry = (invite: Invite) => {
        if (!invite.expiresAt) return 'Никогда не истекает';
        const d = new Date(invite.expiresAt);
        return d < new Date() ? 'Истекло' : `До ${d.toLocaleString('ru-RU')}`;
    };

    if (loading) return <div className="settings-content-inner"><p>Загрузка...</p></div>;

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Приглашения</h2>
            <p className="settings-description">Управляйте пригласительными ссылками на сервер: сроком действия, лимитом использований и аннулированием.</p>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Новое приглашение</h3>
                        <p>Создать ссылку с выбранным сроком действия и лимитом использований.</p>
                    </div>
                    <button className="settings-btn" onClick={() => setCreating(c => !c)}><PlusIcon size={14} /> Создать</button>
                </div>

                {creating && (
                    <>
                        <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />
                        <div className="settings-row">
                            <div className="settings-row-text"><h3>Срок действия</h3></div>
                            <select className="settings-input" style={{ width: '200px' }} value={expiresIn} onChange={(e) => setExpiresIn(parseInt(e.target.value))}>
                                {EXPIRY_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="settings-row">
                            <div className="settings-row-text"><h3>Лимит использований</h3></div>
                            <select className="settings-input" style={{ width: '200px' }} value={maxUses} onChange={(e) => setMaxUses(parseInt(e.target.value))}>
                                {USES_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="settings-btn-group" style={{ marginTop: '12px' }}>
                            <button className="settings-btn" onClick={handleCreate}>Создать приглашение</button>
                            <button className="settings-btn secondary" onClick={() => setCreating(false)}>Отмена</button>
                        </div>
                    </>
                )}
            </div>

            {invites.length === 0 ? (
                <div className="server-settings-empty-state">Приглашений пока нет.</div>
            ) : (
                invites.map(invite => (
                    <div key={invite.code} className="server-settings-list-row">
                        <div className="server-settings-list-row-info">
                            <strong>{getInviteUrl(invite.code)}</strong>
                            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                                {formatExpiry(invite)} · Использований: {invite.uses}{invite.maxUses ? ` / ${invite.maxUses}` : ''} · Создал: {typeof invite.creator === 'object' ? invite.creator.username : ''}
                            </span>
                            {editingCode === invite.code && (
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <select className="settings-input" defaultValue="" onChange={(e) => e.target.value && handleUpdate(invite.code, { expiresIn: parseInt(e.target.value) || null })}>
                                        <option value="" disabled>Изменить срок...</option>
                                        {EXPIRY_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                                    </select>
                                    <select className="settings-input" defaultValue="" onChange={(e) => e.target.value !== '' && handleUpdate(invite.code, { maxUses: parseInt(e.target.value) || null })}>
                                        <option value="" disabled>Изменить лимит...</option>
                                        {USES_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="server-settings-list-row-actions">
                            <button className="action-button" title="Скопировать ссылку" onClick={() => copyLink(invite.code)}><CopyIcon size={16} /></button>
                            <button className="action-button" title="Изменить" onClick={() => setEditingCode(editingCode === invite.code ? null : invite.code)}>✎</button>
                            <button className="action-button danger" title="Аннулировать" onClick={() => handleRevoke(invite.code)}><TrashIcon size={16} /></button>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

export default InvitesSettings;
