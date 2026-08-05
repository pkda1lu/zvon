import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import AnimatedOverlay from '../animations/AnimatedOverlay';
import { Channel, Server, Role, PermissionOverwrite } from '../types';
import { Permissions } from '../utils/permissions';
import { useDialog } from '../contexts/DialogContext';
import { CloseIcon, TrashIcon, PlusIcon, LayoutGridIcon, ShieldIcon } from './Icons';
import './ChannelSettingsModal.css';
import UserAvatar from "./UserAvatar";
import { SettingsToggle } from '../pages/settings/SettingsUI';

interface CategorySettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: Channel;
    server: Server;
    onCategoryUpdate: (updatedCategory: Channel) => void;
    onCategoryDelete: (categoryId: string) => void;
}

type Tab = 'overview' | 'permissions';

const CategorySettingsModal: React.FC<CategorySettingsModalProps> = ({
    isOpen,
    onClose,
    category,
    server,
    onCategoryUpdate,
    onCategoryDelete
}) => {
    const { confirm } = useDialog();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const isMobile = window.innerWidth <= 768;
    const [mobileViewState, setMobileViewState] = useState<'tabs' | 'content'>('tabs');
    const [name, setName] = useState(category.name);
    const [overwrites, setOverwrites] = useState<PermissionOverwrite[]>(category.permissionOverwrites || []);
    const [showAddAccessDropdown, setShowAddAccessDropdown] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOverwriteId, setSelectedOverwriteId] = useState<string | null>(null);

    const isPrivate = !!overwrites.find(o => String(o.id) === String(server._id))?.deny;

    useEffect(() => {
        setName(category.name);
        setOverwrites(category.permissionOverwrites || []);
        setActiveTab('overview');
    }, [category]);

    const categoryStateRef = useRef({ name, overwrites });
    useEffect(() => {
        categoryStateRef.current = { name, overwrites };
    }, [name, overwrites]);

    const saveField = useCallback(async (updates: Partial<{ name: string; permissionOverwrites: PermissionOverwrite[] }>) => {
        try {
            const res = await axios.put(`/api/channels/${category._id}`, updates);
            onCategoryUpdate(res.data);
        } catch (err) {
            console.error('Failed to update category field', err);
        }
    }, [category._id, onCategoryUpdate]);

    const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateNameField = (val: string) => {
        setName(val);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            saveField({ name: val });
        }, 800);
    };

    const handleCloseModal = () => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
        const st = categoryStateRef.current;
        axios.put(`/api/channels/${category._id}`, {
            name: st.name,
            permissionOverwrites: st.overwrites
        })
            .then(res => onCategoryUpdate(res.data))
            .catch(err => console.error(err))
            .finally(() => onClose());
    };

    const handleDelete = async () => {
        if (await confirm(`Вы уверены, что хотите удалить категорию "${category.name}"? Каналы из этой категории останутся, но не будут иметь категории.`)) {
            try {
                await axios.delete(`/api/channels/${category._id}`);
                onCategoryDelete(category._id);
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
            overlayClassName="settings-overlay"
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

                    <CategoryHeader>Настройки категории</CategoryHeader>
                    <NavItem id="overview" label="Обзор" icon={LayoutGridIcon} />
                    <NavItem id="permissions" label="Права доступа" icon={ShieldIcon} />

                    <div style={{ flex: isMobile ? 0 : 1 }} />
                    <Divider />
                    <div className="settings-sidebar-item danger" onClick={handleDelete} title="Удалить категорию">
                        <div className="sidebar-item-content">
                            <TrashIcon size={18} />
                            {(!isMobile || isSidebarExpanded) && <span>Удалить категорию</span>}
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
                                        <h3 className="settings-section-title" style={{ marginTop: 0 }}>Название категории</h3>
                                        <input
                                            className="settings-input"
                                            value={name}
                                            onChange={(e) => updateNameField(e.target.value)}
                                            maxLength={64}
                                            placeholder="Напишите название категории..."
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                            <span className="char-counter">{64 - name.length} символов осталось</span>
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <h3 className="settings-section-title" style={{ marginTop: 0 }}>Порядок каналов в категории</h3>
                                        <p className="settings-description" style={{ marginBottom: '16px' }}>
                                            Изменяйте порядок отображения каналов в данной категории с помощью стрелок.
                                        </p>
                                        {(() => {
                                            const categoryChannels = server.channels
                                                .filter(c => {
                                                    if (c.type === 'category') return false;
                                                    const catId = typeof c.category === 'object' ? c.category?._id : c.category;
                                                    return String(catId) === String(category._id);
                                                })
                                                .sort((a, b) => (a.position || 0) - (b.position || 0));

                                            if (categoryChannels.length === 0) {
                                                return <div className="server-settings-empty-state">В этой категории пока нет каналов.</div>;
                                            }

                                            const handleMove = async (index: number, direction: 'up' | 'down') => {
                                                const targetIndex = direction === 'up' ? index - 1 : index + 1;
                                                if (targetIndex < 0 || targetIndex >= categoryChannels.length) return;

                                                const newList = [...categoryChannels];
                                                const [moved] = newList.splice(index, 1);
                                                newList.splice(targetIndex, 0, moved);

                                                const items = newList.map((ch, idx) => ({
                                                    _id: ch._id,
                                                    position: idx,
                                                    category: category._id
                                                }));

                                                try {
                                                    await axios.put('/api/channels/reorder', {
                                                        serverId: server._id,
                                                        items
                                                    });
                                                } catch (err) {
                                                    console.error('Failed to reorder category channels', err);
                                                }
                                            };

                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {categoryChannels.map((ch, idx) => (
                                                        <div
                                                            key={ch._id}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                padding: '10px 14px',
                                                                background: 'rgba(255, 255, 255, 0.03)',
                                                                borderRadius: '12px',
                                                                border: '1px solid rgba(255, 255, 255, 0.06)'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fff', fontWeight: 600 }}>
                                                                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                                                                    {ch.type === 'voice' ? '🔊' : ch.type === 'room' ? '🧊' : '#'}
                                                                </span>
                                                                <span>{ch.name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    className="settings-btn"
                                                                    style={{ padding: '6px 10px', minWidth: 0 }}
                                                                    disabled={idx === 0}
                                                                    onClick={() => handleMove(idx, 'up')}
                                                                    title="Переместить вверх"
                                                                >
                                                                    ↑
                                                                </button>
                                                                <button
                                                                    className="settings-btn"
                                                                    style={{ padding: '6px 10px', minWidth: 0 }}
                                                                    disabled={idx === categoryChannels.length - 1}
                                                                    onClick={() => handleMove(idx, 'down')}
                                                                    title="Переместить вниз"
                                                                >
                                                                    ↓
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'permissions' && (
                                <div>
                                    <h2 className="settings-page-title">Права доступа</h2>
                                    <p className="settings-description">Настройте приватность категории и индивидуальные разрешения для ролей и участников.</p>

                                    <div className="settings-card">
                                        <div className="settings-row">
                                            <div className="settings-row-text">
                                                <h3>Приватная категория</h3>
                                                <p>Только выбранные участники и роли смогут видеть эту категорию и каналы внутри нее.</p>
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
                                                <h3 className="settings-section-title" style={{ margin: 0 }}>Исключения прав категории</h3>
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
                                                                            <h3>Просмотр категории</h3>
                                                                            <p>Разрешить {role ? 'роли' : 'участнику'} видеть данную категорию.</p>
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

export default CategorySettingsModal;
