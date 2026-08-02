import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import AnimatedOverlay from '../animations/AnimatedOverlay';
import { Channel, Server, Role, PermissionOverwrite } from '../types';
import { Permissions } from '../utils/permissions';
import { useDialog } from '../contexts/DialogContext';
import { CloseIcon, TrashIcon, PlusIcon } from './Icons';
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

    const NavItem = ({ id, label }: { id: Tab; label: string }) => (
        <div className={`settings-sidebar-item ${activeTab === id ? 'active' : ''}`} onClick={() => { setActiveTab(id); if (isMobile) setMobileViewState('content'); }}>
            <div className="sidebar-item-content">
                <span>{label}</span>
            </div>
            {activeTab === id && <div className="active-indicator" />}
        </div>
    );

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
            <>
                {(!isMobile || mobileViewState === 'tabs') && (
                    <div className="settings-sidebar">
                        <div className="settings-sidebar-header">📁 {category.name}</div>

                        <div className="settings-sidebar-header settings-sidebar-category">Настройки категории</div>
                        <NavItem id="overview" label="Обзор" />
                        <NavItem id="permissions" label="Права доступа" />

                        <div style={{ flex: 1 }} />
                        <div className="settings-sidebar-divider" />
                        <div className="settings-sidebar-item danger" onClick={handleDelete}>
                            <div className="sidebar-item-content">
                                <TrashIcon size={18} />
                                <span>Удалить категорию</span>
                            </div>
                        </div>
                        {isMobile && <div className="settings-sidebar-item" onClick={handleCloseModal}>Закрыть</div>}
                    </div>
                )}

                {(!isMobile || mobileViewState === 'content') && (
                    <div className="settings-content-wrapper">
                        {isMobile ? (
                            <div className="mobile-settings-header">
                                <button className="back-button" onClick={() => setMobileViewState('tabs')}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                </button>
                                <span style={{ fontWeight: 800, fontSize: '18px' }}>
                                    {activeTab === 'overview' && 'Обзор'}
                                    {activeTab === 'permissions' && 'Права доступа'}
                                </span>
                            </div>
                        ) : (
                            <button className="settings-close-btn" onClick={handleCloseModal}>
                                <CloseIcon size={20} />
                            </button>
                        )}

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
                )}
            </>
        </AnimatedOverlay>
    );
};

export default CategorySettingsModal;
