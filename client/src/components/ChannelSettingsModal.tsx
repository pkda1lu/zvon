import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Channel, Server, Role, PermissionOverwrite } from '../types';
import { Permissions, hasPermission } from '../utils/permissions';
import { getAvatarUrl } from '../utils/avatar';
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
    const [showAddAccessDropdown, setShowAddAccessDropdown] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

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
                            <h2 className="settings-title">Обзор</h2>

                            <div className="settings-input-group">
                                <label>Название канала</label>
                                <div className="input-wrapper-with-icon">
                                    <input
                                        className="settings-input"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        maxLength={100}
                                    />
                                    <span className="input-emoji-icon">😊</span>
                                </div>
                            </div>

                            <div className="settings-divider" />

                            <div className="settings-input-group">
                                <label>Тема канала</label>
                                <div className="textarea-container">
                                    <div className="textarea-toolbar">
                                        <button title="Bold">B</button>
                                        <button title="Italic">I</button>
                                        <button title="Strike">S</button>
                                        <div className="toolbar-separator" />
                                        <button title="Spoiler">👁</button>
                                    </div>
                                    <textarea
                                        className="settings-textarea"
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        placeholder="Расскажите участникам, как пользоваться этим каналом!"
                                        maxLength={1024}
                                    />
                                    <div className="textarea-footer">
                                        <span className="char-counter">{1024 - topic.length}</span>
                                        <span className="textarea-emoji-icon">😊</span>
                                    </div>
                                </div>
                            </div>

                            <div className="settings-divider" />

                            <div className="settings-input-group">
                                <label>Медленный режим</label>
                                <div className="slow-mode-container">
                                    <div className="slow-mode-slider-wrapper">
                                        <input type="range" min="0" max="10" step="1" className="slow-mode-slider" defaultValue="0" />
                                        <div className="slow-mode-labels">
                                            <span>Выкл</span>
                                            <span>6ч</span>
                                        </div>
                                    </div>
                                    <p className="settings-help-text">
                                        Участники не смогут отправлять больше одного сообщения в течение этого периода времени, кроме случаев, когда у них есть права управления каналом или сообщениями.
                                    </p>
                                </div>
                            </div>

                            {(name !== channel.name || topic !== (channel.topic || '')) && (
                                <div className="save-changes-bar slide-up">
                                    <span className="save-changes-text">У вас есть несохраненные изменения!</span>
                                    <div className="save-changes-buttons">
                                        <button className="reset-button" onClick={() => { setName(channel.name); setTopic(channel.topic || ''); }}>Сбросить</button>
                                        <button className="save-button" onClick={handleSave} disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'permissions' && (
                        <div className="settings-section" style={{ maxWidth: '800px' }}>
                            <h2 className="settings-title">Права канала</h2>
                            <p className="settings-subtitle">Используйте права, чтобы настроить возможности пользователей на этом канале.</p>

                            <div className="private-channel-card">
                                <div className="private-header">
                                    <div className="private-title-group">
                                        <div className="private-icon-lock">🔒</div>
                                        <div className="private-text-group">
                                            <div className="private-title">Приватный канал</div>
                                            <div className="private-description">Если сделать канал приватным, только выбранные вами участники и роли смогут просматривать его.</div>
                                        </div>
                                    </div>
                                    <div
                                        className={`toggle-switch ${overwrites.find(o => String(o.id) === String(server._id))?.deny ? 'active' : ''}`}
                                        onClick={() => {
                                            const everyoneId = String(server._id);
                                            const existing = overwrites.find(o => String(o.id) === everyoneId);
                                            const isPrivate = !!existing?.deny;

                                            if (!isPrivate) {
                                                // Make private: deny VIEW_CHANNEL for @everyone
                                                updateOverwrite(everyoneId, 'role', 0n, Permissions.VIEW_CHANNEL);
                                            } else {
                                                // Make public: remove deny for @everyone
                                                removeOverwrite(everyoneId);
                                            }
                                        }}
                                    >
                                        <div className="toggle-knob" />
                                    </div>
                                </div>

                                <div className="access-divider" />

                                <div className="access-section">
                                    <div className="access-header">
                                        <span className="access-label">Кто может получать доступ к этому каналу?</span>
                                        <div className="add-access-container">
                                            <button className="add-access-btn" onClick={() => setShowAddAccessDropdown(!showAddAccessDropdown)}>
                                                Добавить участников или роли
                                            </button>

                                            {showAddAccessDropdown && (
                                                <div className="add-access-dropdown">
                                                    <div className="search-input-wrapper">
                                                        <input
                                                            type="text"
                                                            placeholder="Поиск ролей или участников"
                                                            autoFocus
                                                            value={searchTerm}
                                                            onChange={(e) => setSearchTerm(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="dropdown-list">
                                                        <div className="dropdown-section-title">Роли</div>
                                                        {server.roles
                                                            .filter(r =>
                                                                r.name !== '@everyone' &&
                                                                !overwrites.find(o => String(o.id) === String(r._id)) &&
                                                                r.name.toLowerCase().includes(searchTerm.toLowerCase())
                                                            )
                                                            .map(role => (
                                                                <div key={role._id} className="dropdown-item" onClick={() => {
                                                                    updateOverwrite(String(role._id), 'role', Permissions.VIEW_CHANNEL, 0n);
                                                                    setShowAddAccessDropdown(false);
                                                                    setSearchTerm('');
                                                                }}>
                                                                    <div className="role-shield-icon small" style={{ background: role.color }}>🛡️</div>
                                                                    <span>{role.name}</span>
                                                                </div>
                                                            ))
                                                        }

                                                        <div className="dropdown-section-title">Участники</div>
                                                        {server.members
                                                            .filter(m => {
                                                                const userId = String(m.user._id || m.user);
                                                                const username = m.user.username || '';
                                                                return !overwrites.find(o => String(o.id) === userId) &&
                                                                    username.toLowerCase().includes(searchTerm.toLowerCase());
                                                            })
                                                            .map(member => {
                                                                const userId = String(member.user._id || member.user);
                                                                return (
                                                                    <div key={userId} className="dropdown-item" onClick={() => {
                                                                        updateOverwrite(userId, 'member', Permissions.VIEW_CHANNEL, 0n);
                                                                        setShowAddAccessDropdown(false);
                                                                        setSearchTerm('');
                                                                    }}>
                                                                        <div className="member-avatar-mini">
                                                                            {member.user.avatar ? <img src={getAvatarUrl(member.user.avatar)!} alt="" /> : <span>{member.user.username?.charAt(0)}</span>}
                                                                        </div>
                                                                        <span>{member.user.username}</span>
                                                                    </div>
                                                                );
                                                            })
                                                        }
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="roles-access-list">
                                        <div className="access-list-header">Роли и участники</div>
                                        {overwrites.filter(o => String(o.id) !== String(server._id)).map(ow => {
                                            const role = server.roles.find(r => String(r._id) === String(ow.id));
                                            const member = !role ? server.members.find(m => String(m.user._id || m.user) === String(ow.id)) : null;

                                            if (!role && !member) return null;

                                            const name = role ? role.name : member?.user.username;
                                            const color = role ? role.color : '#b5bac1';
                                            const isAdmin = role ? (BigInt(role.permissions) & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR : false;

                                            return (
                                                <div key={ow.id} className="role-access-item">
                                                    <div className="role-access-left">
                                                        {role ? (
                                                            <div className="role-shield-icon" style={{ background: color }}>🛡️</div>
                                                        ) : (
                                                            <div className="member-avatar-mini">
                                                                {member?.user.avatar ? <img src={getAvatarUrl(member.user.avatar)!} alt="" /> : <span>{name?.charAt(0)}</span>}
                                                            </div>
                                                        )}
                                                        <span className="role-access-name">{name}</span>
                                                    </div>
                                                    <div className="role-access-right">
                                                        <span className="role-type-badge">{isAdmin ? 'Администратор' : (role ? 'Роль' : 'Участник')}</span>
                                                        <button className="remove-role-access" onClick={() => removeOverwrite(ow.id)}>✕</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {(name !== channel.name || topic !== (channel.topic || '') || JSON.stringify(overwrites) !== JSON.stringify(channel.permissionOverwrites)) && (
                                <div className="save-changes-bar slide-up">
                                    <span className="save-changes-text">Не забудьте сохранить изменения!</span>
                                    <div className="save-changes-buttons">
                                        <button className="reset-button" onClick={() => setOverwrites(channel.permissionOverwrites || [])}>Сбросить</button>
                                        <button className="save-button" onClick={handleSave} disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChannelSettingsModal;
