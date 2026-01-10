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

    const [selectedOverwriteId, setSelectedOverwriteId] = useState<string | null>(overwrites.length > 0 ? overwrites[0].id : null);

    const activeOverwrite = overwrites.find(o => o.id === selectedOverwriteId);

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
                            <div className="settings-input-group" style={{ marginTop: '20px' }}>
                                <label>Тема канала</label>
                                <textarea
                                    className="settings-input"
                                    style={{ height: '100px', resize: 'none' }}
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="Расскажите всем, для чего этот канал"
                                />
                            </div>
                            <div className="save-changes-bar relative">
                                <span className="save-changes-text">У вас есть несохраненные изменения!</span>
                                <div className="save-changes-buttons">
                                    <button className="reset-button" onClick={() => { setName(channel.name); setTopic(channel.topic || ''); }}>Сбросить</button>
                                    <button className="save-button" onClick={handleSave} disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'permissions' && (
                        <div className="settings-section" style={{ maxWidth: 'none' }}>
                            <h2>Права доступа</h2>
                            <div className="permissions-layout">
                                <div className="overwrites-sidebar">
                                    <div className="sidebar-header" style={{ margin: '0 0 8px 0', padding: '0' }}>РОЛИ / УЧАСТНИКИ</div>
                                    {overwrites.map(ow => {
                                        const role = server.roles.find(r => r._id === ow.id);
                                        const roleName = role ? role.name : 'Unknown';
                                        return (
                                            <div
                                                key={ow.id}
                                                className={`overwrite-tab ${selectedOverwriteId === ow.id ? 'active' : ''}`}
                                                onClick={() => setSelectedOverwriteId(ow.id)}
                                            >
                                                <span style={{ color: role?.color }}>{roleName}</span>
                                                <button className="action-button small" onClick={(e) => { e.stopPropagation(); removeOverwrite(ow.id); if (selectedOverwriteId === ow.id) setSelectedOverwriteId(null); }}><CloseIcon size={12} /></button>
                                            </div>
                                        );
                                    })}
                                    <button className="add-role-btn" style={{ marginTop: '12px', background: 'none', border: '1px dashed var(--border-divider)', color: 'var(--text-muted)', padding: '8px', cursor: 'pointer', borderRadius: '4px' }} onClick={() => {
                                        const role = server.roles.find(r => !overwrites.find(o => o.id === r._id));
                                        if (role) {
                                            updateOverwrite(role._id, 'role', 0n, 0n);
                                            setSelectedOverwriteId(role._id);
                                        }
                                    }}>
                                        + Добавить роль
                                    </button>
                                </div>

                                <div className="permissions-editor">
                                    {activeOverwrite ? (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                                <h3>{server.roles.find(r => r._id === activeOverwrite.id)?.name || 'Настройки'}</h3>
                                            </div>

                                            {Object.entries(Permissions).map(([pName, bit]) => {
                                                const allow = BigInt(activeOverwrite.allow);
                                                const deny = BigInt(activeOverwrite.deny);
                                                const isAllowed = (allow & (bit as bigint)) !== 0n;
                                                const isDenied = (deny & (bit as bigint)) !== 0n;
                                                const isNeutral = !isAllowed && !isDenied;

                                                return (
                                                    <div key={pName} className="permission-item">
                                                        <div className="permission-info">
                                                            <div className="permission-name">{pName.replace(/_/g, ' ')}</div>
                                                        </div>
                                                        <div className="permission-grid-3">
                                                            <div
                                                                className={`perm-button deny ${isDenied ? 'active' : ''}`}
                                                                onClick={() => updateOverwrite(activeOverwrite.id, activeOverwrite.type, allow & ~(bit as bigint), deny | (bit as bigint))}
                                                            >✖</div>
                                                            <div
                                                                className={`perm-button neutral ${isNeutral ? 'active' : ''}`}
                                                                onClick={() => updateOverwrite(activeOverwrite.id, activeOverwrite.type, allow & ~(bit as bigint), deny & ~(bit as bigint))}
                                                            >/</div>
                                                            <div
                                                                className={`perm-button allow ${isAllowed ? 'active' : ''}`}
                                                                onClick={() => updateOverwrite(activeOverwrite.id, activeOverwrite.type, allow | (bit as bigint), deny & ~(bit as bigint))}
                                                            >✔</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'center', color: 'var(--text-muted)', height: '100%' }}>
                                            Выберите роль или участника для настройки прав
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="save-changes-bar relative">
                                <span className="save-changes-text">Не забудьте сохранить изменения!</span>
                                <div className="save-changes-buttons">
                                    <button className="reset-button" onClick={() => setOverwrites(channel.permissionOverwrites || [])}>Сбросить</button>
                                    <button className="save-button" onClick={handleSave} disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChannelSettingsModal;
