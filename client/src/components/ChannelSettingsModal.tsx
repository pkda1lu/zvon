import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Channel, Server, Role, PermissionOverwrite } from '../types';
import { Permissions, hasPermission } from '../utils/permissions';
import { CloseIcon, TrashIcon, PlusIcon } from './Icons';
import './ChannelSettingsModal.css';

interface ChannelSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    channel: Channel;
    server: Server;
    onChannelUpdate: (updatedChannel: Channel) => void;
    onChannelDelete: (channelId: string) => void;
}

type Tab = 'overview' | 'permissions';

const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
    isOpen,
    onClose,
    channel,
    server,
    onChannelUpdate,
    onChannelDelete
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [name, setName] = useState(channel.name);
    const [topic, setTopic] = useState(channel.topic || '');
    const [overwrites, setOverwrites] = useState<PermissionOverwrite[]>(channel.permissionOverwrites || []);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setName(channel.name);
        setTopic(channel.topic || '');
        setOverwrites(channel.permissionOverwrites || []);
    }, [channel]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await axios.put(`/api/channels/${channel._id}`, {
                name,
                topic,
                permissionOverwrites: overwrites
            });
            onChannelUpdate(res.data);
            alert('Изменения сохранены');
        } catch (err) {
            alert('Ошибка при сохранении');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Удалить этот канал? ЭТО ДЕЙСТВИЕ НЕОБРАТИМО.')) {
            try {
                await axios.delete(`/api/channels/${channel._id}`);
                onChannelDelete(channel._id);
                onClose();
            } catch (err) {
                alert('Ошибка при удалении');
            }
        }
    };

    const updateOverwrite = (id: string, type: 'role' | 'member', allow: bigint, deny: bigint) => {
        const index = overwrites.findIndex(o => o.id === id);
        const newOverwrites = [...overwrites];
        if (index === -1) {
            newOverwrites.push({ id, type, allow: allow.toString(), deny: deny.toString() });
        } else {
            newOverwrites[index] = { id, type, allow: allow.toString(), deny: deny.toString() };
        }
        setOverwrites(newOverwrites);
    };

    const removeOverwrite = (id: string) => {
        setOverwrites(overwrites.filter(o => o.id !== id));
    };

    if (!isOpen) return null;

    return (
        <div className="channel-settings-modal-overlay">
            <div className="channel-settings-modal">
                <div className="channel-settings-sidebar">
                    <div className="sidebar-header">{channel.name}</div>
                    <div className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Обзор</div>
                    <div className={`sidebar-item ${activeTab === 'permissions' ? 'active' : ''}`} onClick={() => setActiveTab('permissions')}>Права доступа</div>
                    <div style={{ flex: 1 }} />
                    <div className="sidebar-item danger" onClick={handleDelete}>Удалить канал</div>
                </div>

                <div className="channel-settings-content">
                    <div className="close-settings-button" onClick={onClose}>
                        <div className="close-icon-wrapper"><CloseIcon size={18} /></div>
                        <span className="close-text">ESC</span>
                    </div>

                    {activeTab === 'overview' && (
                        <div className="settings-section">
                            <h2>Обзор канала</h2>
                            <div className="settings-input-group">
                                <label>Название канала</label>
                                <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)} />
                            </div>
                            <div className="settings-input-group">
                                <label>Тема канала</label>
                                <textarea
                                    className="settings-input"
                                    style={{ height: '100px', resize: 'none' }}
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="Расскажите всем, для чего этот канал"
                                />
                            </div>
                            <button className="save-button" onClick={handleSave} disabled={loading} style={{ marginTop: '20px' }}>
                                {loading ? 'Сохранение...' : 'Сохранить изменения'}
                            </button>
                        </div>
                    )}

                    {activeTab === 'permissions' && (
                        <div className="settings-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h2>Исключения прав доступа</h2>
                                <div className="add-overwrite-dropdown">
                                    {/* Simplified for now: just show @everyone and roles */}
                                    <button className="save-button" onClick={() => {
                                        const everyoneRole = server.roles.find(r => r.name === '@everyone');
                                        if (everyoneRole && !overwrites.find(o => o.id === everyoneRole._id)) {
                                            updateOverwrite(everyoneRole._id, 'role', 0n, 0n);
                                        } else {
                                            alert('Исключение для этой роли уже существует');
                                        }
                                    }}>
                                        <PlusIcon size={16} /> Добавить роль
                                    </button>
                                </div>
                            </div>

                            <div className="overwrites-list">
                                {overwrites.map(overwrite => {
                                    const role = server.roles.find(r => r._id === overwrite.id);
                                    const name = role ? role.name : 'Unknown';
                                    const allow = BigInt(overwrite.allow);
                                    const deny = BigInt(overwrite.deny);

                                    return (
                                        <div key={overwrite.id} className="overwrite-item-container" style={{ marginBottom: '32px', padding: '16px', border: '1px solid var(--border-divider)', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                <h3 style={{ margin: 0, color: role?.color || 'inherit' }}>{name}</h3>
                                                <button className="action-button danger" onClick={() => removeOverwrite(overwrite.id)}><TrashIcon size={18} /></button>
                                            </div>

                                            {Object.entries(Permissions).map(([pName, bit]) => {
                                                const isAllowed = (allow & (bit as bigint)) !== 0n;
                                                const isDenied = (deny & (bit as bigint)) !== 0n;
                                                const isNeutral = !isAllowed && !isDenied;

                                                return (
                                                    <div key={pName} className="permission-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-divider)' }}>
                                                        <span>{pName.replace(/_/g, ' ')}</span>
                                                        <div className="permission-grid-3">
                                                            <div
                                                                className={`perm-button deny ${isDenied ? 'active' : ''}`}
                                                                onClick={() => {
                                                                    const nAllow = allow & ~(bit as bigint);
                                                                    const nDeny = deny | (bit as bigint);
                                                                    updateOverwrite(overwrite.id, overwrite.type, nAllow, nDeny);
                                                                }}
                                                            >✖</div>
                                                            <div
                                                                className={`perm-button neutral ${isNeutral ? 'active' : ''}`}
                                                                onClick={() => {
                                                                    const nAllow = allow & ~(bit as bigint);
                                                                    const nDeny = deny & ~(bit as bigint);
                                                                    updateOverwrite(overwrite.id, overwrite.type, nAllow, nDeny);
                                                                }}
                                                            >/</div>
                                                            <div
                                                                className={`perm-button allow ${isAllowed ? 'active' : ''}`}
                                                                onClick={() => {
                                                                    const nAllow = allow | (bit as bigint);
                                                                    const nDeny = deny & ~(bit as bigint);
                                                                    updateOverwrite(overwrite.id, overwrite.type, nAllow, nDeny);
                                                                }}
                                                            >✔</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                            <button className="save-button" onClick={handleSave} disabled={loading} style={{ marginTop: '20px' }}>
                                {loading ? 'Сохранение...' : 'Сохранить изменения'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChannelSettingsModal;
