import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import AnimatedOverlay from '../animations/AnimatedOverlay';
import { Channel, Server, Role, PermissionOverwrite } from '../types';
import { Permissions, hasPermission } from '../utils/permissions';
import { getAvatarUrl } from '../utils/avatar';
import { useDialog } from '../contexts/DialogContext';
import { CloseIcon, TrashIcon, PlusIcon, LayoutGridIcon, ShieldIcon } from './Icons';
import './ChannelSettingsModal.css';
import UserAvatar from "./UserAvatar";
import { SettingsToggle, RangeSlider } from '../pages/settings/SettingsUI';

interface ChannelSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    channel: Channel;
    server: Server;
    onChannelUpdate: (updatedChannel: Channel) => void;
    onChannelDelete: (channelId: string) => void;
}

type Tab = 'overview' | 'permissions';

const COOLDOWN_UNITS = [
    { value: 1, label: 'секунд' },
    { value: 60, label: 'минут' },
    { value: 3600, label: 'часов' },
];

const decomposeSlowMode = (seconds: number): { amount: number; unit: number } => {
    if (!seconds) return { amount: 10, unit: 1 };
    for (const u of [...COOLDOWN_UNITS].reverse()) {
        if (seconds % u.value === 0 && seconds / u.value >= 1) return { amount: seconds / u.value, unit: u.value };
    }
    return { amount: seconds, unit: 1 };
};

const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
    isOpen,
    onClose,
    channel,
    server,
    onChannelUpdate,
    onChannelDelete
}) => {
    const { confirm } = useDialog();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const isMobile = window.innerWidth <= 768;
    const [mobileViewState, setMobileViewState] = useState<'tabs' | 'content'>('tabs');
    const [name, setName] = useState(channel.name);
    const [topic, setTopic] = useState(channel.topic || '');
    const [overwrites, setOverwrites] = useState<PermissionOverwrite[]>(channel.permissionOverwrites || []);
    const [loading, setLoading] = useState(false);
    const [showAddAccessDropdown, setShowAddAccessDropdown] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOverwriteId, setSelectedOverwriteId] = useState<string | null>(null);

    const [bitrate, setBitrate] = useState(64);
    const [userLimit, setUserLimit] = useState(0);

    const initialSlow = (channel as any).slowMode || 0;
    const initialDecomposed = decomposeSlowMode(initialSlow);
    const [slowModeEnabled, setSlowModeEnabled] = useState(initialSlow > 0);
    const [slowAmount, setSlowAmount] = useState(initialDecomposed.amount);
    const [slowUnit, setSlowUnit] = useState(initialDecomposed.unit);

    const isPrivate = !!overwrites.find(o => String(o.id) === String(server._id))?.deny;
    const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

    useEffect(() => {
        setName(channel.name);
        setTopic(channel.topic || '');
        setOverwrites(channel.permissionOverwrites || []);
        const s = (channel as any).slowMode || 0;
        setSlowModeEnabled(s > 0);
        const d = decomposeSlowMode(s);
        setSlowAmount(d.amount);
        setSlowUnit(d.unit);

        if (channel.type === 'voice') {
            setBitrate(((channel as any).bitrate || 64000) / 1000);
            setUserLimit((channel as any).userLimit || 0);
        }
        setActiveTab('overview');
    }, [channel]);

    const channelStateRef = useRef({ name, topic, overwrites, slowModeEnabled, slowAmount, slowUnit, bitrate, userLimit });
    useEffect(() => {
        channelStateRef.current = { name, topic, overwrites, slowModeEnabled, slowAmount, slowUnit, bitrate, userLimit };
    }, [name, topic, overwrites, slowModeEnabled, slowAmount, slowUnit, bitrate, userLimit]);

    const saveField = useCallback(async (updates: Partial<{ name: string; topic: string; permissionOverwrites: PermissionOverwrite[]; slowMode: number; bitrate: number; userLimit: number; category?: string | null }>) => {
        try {
            const res = await axios.put(`/api/channels/${channel._id}`, updates);
            onChannelUpdate(res.data);
        } catch (err) {
            console.error('Failed to update channel field', err);
        }
    }, [channel._id, onChannelUpdate]);

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateNameField = (val: string) => {
        setName(val);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            saveField({ name: val });
        }, 800);
    };

    const updateTopicField = (val: string) => {
        setTopic(val);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            saveField({ topic: val });
        }, 800);
    };

    const handleCloseModal = () => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
        const st = channelStateRef.current;
        const payload: any = {
            name: st.name,
            topic: st.topic,
            permissionOverwrites: st.overwrites
        };
        if (channel.type === 'voice') {
            payload.bitrate = st.bitrate * 1000;
            payload.userLimit = st.userLimit;
        } else {
            payload.slowMode = st.slowModeEnabled ? (Math.max(1, st.slowAmount) * st.slowUnit) : 0;
        }
        axios.put(`/api/channels/${channel._id}`, payload)
            .then(res => onChannelUpdate(res.data))
            .catch(err => console.error(err))
            .finally(() => onClose());
    };

    const handleDelete = async () => {
        if (await confirm(`Вы уверены, что хотите удалить ${channel.type === 'voice' ? 'голосовой' : 'текстовый'} канал "${channel.name}"? Это действие невозможно отменить.`)) {
            try {
                await axios.delete(`/api/channels/${channel._id}`);
                onChannelDelete(channel._id);
                onClose();
            } catch (err) {
                console.error(err);
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
        setSelectedOverwriteId(id);
        saveField({ permissionOverwrites: newOverwrites });
    };

    const removeOverwrite = (id: string) => {
        const newOverwrites = overwrites.filter(o => o.id !== id);
        setOverwrites(newOverwrites);
        if (selectedOverwriteId === id) setSelectedOverwriteId(null);
        saveField({ permissionOverwrites: newOverwrites });
    };

    const handleSlowToggle = (enabled: boolean) => {
        setSlowModeEnabled(enabled);
        const sec = enabled ? (Math.max(1, slowAmount) * slowUnit) : 0;
        saveField({ slowMode: sec });
    };

    const handleSlowAmountChange = (amt: number) => {
        const safeAmt = Math.max(1, amt || 1);
        setSlowAmount(safeAmt);
        if (slowModeEnabled) {
            saveField({ slowMode: safeAmt * slowUnit });
        }
    };

    const handleSlowUnitChange = (u: number) => {
        setSlowUnit(u);
        if (slowModeEnabled) {
            saveField({ slowMode: Math.max(1, slowAmount) * u });
        }
    };

    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

    const handleTabChange = (t: Tab) => {
        setActiveTab(t);
        if (isMobile) setIsSidebarExpanded(false);
    };

    const NavItem = ({ id, label, icon: Icon }: { id: Tab; label: string; icon: any }) => (
        <div className={`settings-sidebar-item ${activeTab === id ? 'active' : ''}`} onClick={() => handleTabChange(id)} title={label}>
            <div className="sidebar-item-content">
                <Icon size={18} />
                {(!isMobile || isSidebarExpanded) && <span>{label}</span>}
            </div>
            {activeTab === id && (!isMobile || isSidebarExpanded) && <div className="active-indicator" />}
        </div>
    );

    const CategoryHeader = ({ children }: { children: React.ReactNode }) => {
        if (isMobile && !isSidebarExpanded) return null;
        return <div className="settings-sidebar-header settings-sidebar-category">{children}</div>;
    };

    const Divider = () => {
        if (isMobile && !isSidebarExpanded) return <div className="settings-sidebar-divider-collapsed" />;
        return <div className="settings-sidebar-divider" />;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!isMobile) return;
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    };
    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!isMobile || !touchStartRef.current) return;
        const start = touchStartRef.current;
        touchStartRef.current = null;
        const end = e.changedTouches[0];
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        const dt = Date.now() - start.t;
        if (dt > 600) return;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

        if (dx > 50 && !isSidebarExpanded) {
            setIsSidebarExpanded(true);
        } else if (dx < -50 && isSidebarExpanded) {
            setIsSidebarExpanded(false);
        }
    };

    const customAccessList = overwrites.filter(o => String(o.id) !== String(server._id));
    const selectedOverwrite = customAccessList.find(o => String(o.id) === String(selectedOverwriteId)) || customAccessList[0] || null;

    return (
        <AnimatedOverlay
            isOpen={isOpen}
            onClose={handleCloseModal}
            overlayClassName="settings-overlay server-settings-overlay"
            contentClassName="server-settings-passthrough server-settings-layout-content"
            variant="fade"
        >
            <div style={{ display: 'flex', width: '100%', height: '100%' }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                <div className={`settings-sidebar ${isMobile ? 'mobile-collapsed' : ''} ${isSidebarExpanded ? 'mobile-expanded' : ''}`}>
                    {isMobile && (
                        <button
                            className="settings-sidebar-toggle-btn"
                            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                            title={isSidebarExpanded ? "Свернуть меню" : "Раскрыть меню"}
                        >
                            {isSidebarExpanded ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="3" y1="12" x2="21" y2="12" />
                                    <line x1="3" y1="6" x2="21" y2="6" />
                                    <line x1="3" y1="18" x2="21" y2="18" />
                                </svg>
                            )}
                        </button>
                    )}

                    <CategoryHeader>Настройки</CategoryHeader>
                    <NavItem id="overview" label="Обзор" icon={LayoutGridIcon} />
                    <NavItem id="permissions" label="Права доступа" icon={ShieldIcon} />

                    <div style={{ flex: isMobile ? 0 : 1 }} />
                    <Divider />
                    <div className="settings-sidebar-item danger" onClick={handleDelete} title="Удалить канал">
                        <div className="sidebar-item-content">
                            <TrashIcon size={18} />
                            {(!isMobile || isSidebarExpanded) && <span>Удалить канал</span>}
                        </div>
                    </div>
                </div>

                <div className="settings-content-wrapper">
                    <button className="settings-close-btn" onClick={handleCloseModal} title="Закрыть">
                        <CloseIcon size={20} />
                    </button>

                        <div className={`settings-content-inner ${activeTab === 'permissions' ? 'full-width-layout' : ''}`}>
                        {activeTab === 'overview' && (
                            <div className="settings-section">
                                <h2 className="settings-page-title">Обзор</h2>

                                <div className="settings-card">
                                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Название канала</h3>
                                    <input
                                        className="settings-input"
                                        value={name}
                                        onChange={(e) => updateNameField(e.target.value)}
                                        maxLength={64}
                                        placeholder="Напишите название..."
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                        <span className="char-counter">{64 - name.length} символов осталось</span>
                                    </div>
                                </div>

                                <div className="settings-card">
                                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Категория</h3>
                                    <select
                                        className="settings-input"
                                        style={{ width: '100%', cursor: 'pointer' }}
                                        value={channel.category ? (typeof channel.category === 'object' ? channel.category._id : channel.category) : ''}
                                        onChange={(e) => {
                                            const newCatId = e.target.value || null;
                                            saveField({ category: newCatId as any });
                                        }}
                                    >
                                        <option value="">Без категории</option>
                                        {server.channels
                                            .filter(c => c.type === 'category')
                                            .map(cat => (
                                                <option key={cat._id} value={cat._id}>
                                                    {cat.name}
                                                </option>
                                            ))
                                        }
                                    </select>
                                </div>

                                {channel.type === 'text' && (
                                    <>
                                        <div className="settings-card">
                                            <h3 className="settings-section-title" style={{ marginTop: 0 }}>Описание канала</h3>
                                            <textarea
                                                className="settings-textarea"
                                                value={topic}
                                                onChange={(e) => updateTopicField(e.target.value)}
                                                placeholder="Расскажите всем, о чем этот канал..."
                                                maxLength={1024}
                                                style={{ minHeight: '120px' }}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                                <span className="char-counter">{1024 - topic.length} символов осталось</span>
                                            </div>
                                        </div>

                                        <div className="settings-card">
                                            <div className="settings-row">
                                                <div className="settings-row-text">
                                                    <h3>Медленный режим</h3>
                                                    <p>Таймер для кулдауна между сообщениями пользователя в данном текстовом канале.</p>
                                                </div>
                                                <SettingsToggle checked={slowModeEnabled} onChange={handleSlowToggle} />
                                            </div>
                                            {slowModeEnabled && (
                                                <>
                                                    <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />
                                                    <div style={{ display: 'flex', gap: '10px', maxWidth: '320px' }}>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            className="settings-input"
                                                            style={{ flex: 1 }}
                                                            value={slowAmount}
                                                            onChange={(e) => handleSlowAmountChange(parseInt(e.target.value))}
                                                        />
                                                        <select
                                                            className="settings-input"
                                                            style={{ flex: 1 }}
                                                            value={slowUnit}
                                                            onChange={(e) => handleSlowUnitChange(parseInt(e.target.value))}
                                                        >
                                                            {COOLDOWN_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                                        </select>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}

                                {channel.type === 'voice' && (
                                    <>
                                        <div className="settings-card">
                                            <div className="settings-row" style={{ marginBottom: 16 }}>
                                                <div className="settings-row-text">
                                                    <h3>Битрейт — {bitrate} kbps</h3>
                                                    <p>Более высокий битрейт улучшает качество звука, но требует больше трафика.</p>
                                                </div>
                                            </div>
                                            <RangeSlider
                                                min={8}
                                                max={96}
                                                step={8}
                                                value={bitrate}
                                                onChange={(val) => { setBitrate(val); saveField({ bitrate: val * 1000 }); }}
                                                unit=" kbps"
                                            />
                                        </div>

                                        <div className="settings-card">
                                            <div className="settings-row" style={{ marginBottom: 16 }}>
                                                <div className="settings-row-text">
                                                    <h3>Лимит пользователей — {userLimit === 0 ? 'Без лимита' : userLimit}</h3>
                                                    <p>Ограничьте количество пользователей, которые могут одновременно находиться в канале.</p>
                                                </div>
                                            </div>
                                            <RangeSlider
                                                min={0}
                                                max={99}
                                                step={1}
                                                value={userLimit}
                                                onChange={(val) => { setUserLimit(val); saveField({ userLimit: val }); }}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'permissions' && (
                            <div>
                                <h2 className="settings-page-title">Права доступа</h2>
                                <p className="settings-description">Настройте приватность канала и индивидуальные разрешения для ролей и участников.</p>

                                <div className="settings-card">
                                    <div className="settings-row">
                                        <div className="settings-row-text">
                                            <h3>Приватный канал</h3>
                                            <p>Только выбранные участники и роли смогут видеть этот канал.</p>
                                        </div>
                                        <SettingsToggle
                                            checked={isPrivate}
                                            onChange={(checked) => {
                                                const everyoneId = String(server._id);
                                                if (checked) {
                                                    updateOverwrite(everyoneId, 'role', 0n, Permissions.VIEW_CHANNEL);
                                                } else {
                                                    removeOverwrite(everyoneId);
                                                }
                                            }}
                                        />
                                    </div>
                                </div>

                                {isPrivate && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <h3 className="settings-section-title" style={{ margin: 0 }}>Исключения прав канала</h3>
                                            <div style={{ position: 'relative' }}>
                                                <button className="settings-btn" onClick={() => setShowAddAccessDropdown(!showAddAccessDropdown)}>
                                                    <PlusIcon size={16} /> Добавить роль/участника
                                                </button>

                                                {showAddAccessDropdown && (
                                                    <div className="add-access-dropdown">
                                                        <div className="search-input-wrapper">
                                                            <input
                                                                type="text"
                                                                placeholder="Поиск..."
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
                                                                        <div className="server-role-dot" style={{ backgroundColor: role.color, color: role.color }} />
                                                                        <span>{role.name}</span>
                                                                    </div>
                                                                ))
                                                            }

                                                            <div className="dropdown-section-title">Участники</div>
                                                            {server.members
                                                                .filter(m => {
                                                                    if (!m) return false;
                                                                    const mUser = typeof m.user === 'object' ? m.user : null;
                                                                    const userId = String(mUser?._id || m.user);
                                                                    const username = mUser?.username || '';
                                                                    return !overwrites.find(o => String(o.id) === userId) &&
                                                                        username.toLowerCase().includes(searchTerm.toLowerCase());
                                                                })
                                                                .map(member => {
                                                                    const mUser = typeof member.user === 'object' ? member.user : null;
                                                                    const userId = String(mUser?._id || member.user);
                                                                    if (!mUser) return null;

                                                                    return (
                                                                        <div key={userId} className="dropdown-item" onClick={() => {
                                                                            updateOverwrite(userId, 'member', Permissions.VIEW_CHANNEL, 0n);
                                                                            setShowAddAccessDropdown(false);
                                                                            setSearchTerm('');
                                                                        }}>
                                                                            <UserAvatar
                                                                              user={mUser}
                                                                              avatarOverride={member.avatar || undefined}
                                                                              size={24}
                                                                              className="member-avatar-mini"
                                                                            />
                                                                            <span>{member.nickname || mUser.displayName || mUser.username}</span>
                                                                        </div>
                                                                    );
                                                                })
                                                            }
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="roles-layout">
                                            <div className="roles-list-column">
                                                {customAccessList.map((ow) => {
                                                    const role = server.roles.find(r => String(r._id) === String(ow.id));
                                                    const member = !role ? server.members.find(m => {
                                                        if (!m) return false;
                                                        const mId = typeof m.user === 'object' ? m.user?._id : m.user;
                                                        return String(mId) === String(ow.id);
                                                    }) : null;
                                                    if (!role && !member) return null;

                                                    const memberUser = typeof member?.user === 'object' ? member.user : null;
                                                    const displayName = role ? role.name : member?.nickname || memberUser?.displayName || memberUser?.username || 'Участник';
                                                    const color = role ? role.color : '#b5bac1';
                                                    const isSelected = selectedOverwrite && String(selectedOverwrite.id) === String(ow.id);

                                                    return (
                                                        <div
                                                            key={ow.id}
                                                            className={`server-role-row ${isSelected ? 'active' : ''}`}
                                                            onClick={() => setSelectedOverwriteId(ow.id)}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                                                                {role ? (
                                                                    <div className="server-role-dot" style={{ backgroundColor: color, color: color }} />
                                                                ) : memberUser ? (
                                                                    <UserAvatar
                                                                        user={memberUser}
                                                                        avatarOverride={member?.avatar || undefined}
                                                                        size={20}
                                                                    />
                                                                ) : (
                                                                    <div className="server-role-dot" style={{ backgroundColor: '#b5bac1' }} />
                                                                )}
                                                                <span style={{ color: role ? color : '#fff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {displayName}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {customAccessList.length === 0 && (
                                                    <div className="server-settings-empty-state">Нет ни одной роли или участника с персональным доступом.</div>
                                                )}
                                            </div>

                                            <div className="roles-detail-column">
                                                {selectedOverwrite ? (() => {
                                                    const role = server.roles.find(r => String(r._id) === String(selectedOverwrite.id));
                                                    const member = !role ? server.members.find(m => {
                                                        if (!m) return false;
                                                        const mId = typeof m.user === 'object' ? m.user?._id : m.user;
                                                        return String(mId) === String(selectedOverwrite.id);
                                                    }) : null;
                                                    const memberUser = typeof member?.user === 'object' ? member.user : null;
                                                    const displayName = role ? role.name : member?.nickname || memberUser?.displayName || memberUser?.username || 'Участник';
                                                    const color = role ? role.color : '#b5bac1';
                                                    const isAdmin = role ? (BigInt(role.permissions) & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR : false;

                                                    return (
                                                        <div className="server-role-editor" key={selectedOverwrite.id}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    {role ? (
                                                                        <div className="server-role-dot" style={{ backgroundColor: color, width: 14, height: 14 }} />
                                                                    ) : memberUser ? (
                                                                        <UserAvatar user={memberUser} avatarOverride={member?.avatar || undefined} size={28} />
                                                                    ) : (
                                                                        <div className="server-role-dot" style={{ backgroundColor: '#b5bac1', width: 14, height: 14 }} />
                                                                    )}
                                                                    <h3 className="settings-page-title" style={{ marginBottom: 0, fontSize: '20px' }}>{displayName}</h3>
                                                                    <span className="role-type-badge">{isAdmin ? 'Администратор' : (role ? 'Роль' : 'Участник')}</span>
                                                                </div>
                                                                <button className="settings-btn danger" onClick={() => removeOverwrite(selectedOverwrite.id)}>
                                                                    <TrashIcon size={16} /> Удалить доступ
                                                                </button>
                                                            </div>

                                                            <div className="settings-card" style={{ background: 'rgba(0,0,0,0.15)' }}>
                                                                <div className="settings-row">
                                                                    <div className="settings-row-text">
                                                                        <h3>Просмотр канала</h3>
                                                                        <p>Разрешить {role ? 'роли' : 'участнику'} видеть данный канал и его историю сообщений.</p>
                                                                    </div>
                                                                    <SettingsToggle
                                                                        checked={true}
                                                                        onChange={(checked) => {
                                                                            if (!checked) removeOverwrite(selectedOverwrite.id);
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })() : (
                                                    <div className="server-settings-empty-state">Выберите роль или участника слева для просмотра разрешений.</div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AnimatedOverlay>
    );
};

export default ChannelSettingsModal;
