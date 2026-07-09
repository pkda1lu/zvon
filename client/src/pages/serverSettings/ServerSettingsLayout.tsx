import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedOverlay from '../../animations/AnimatedOverlay';
import { Server } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Permissions, hasPermission, computePermissions } from '../../utils/permissions';
import {
    CloseIcon, UsersIcon, ShieldIcon, GamepadIcon, GlobeIcon, DocumentIcon,
    LockIcon, EyeIcon, LayoutGridIcon, SmileIcon, MedalIcon, BarChartIcon, TrashIcon
} from '../../components/Icons';
import '../settings/Settings.css';

import ServerProfileSettings from './ServerProfileSettings';
import ServerTagSettings from './ServerTagSettings';
import EngagementSettings from './EngagementSettings';
import ServerEmojisSettings from './ServerEmojisSettings';
import MembersSettings from './MembersSettings';
import RolesSettings from './RolesSettings';
import InvitesSettings from './InvitesSettings';
import PrivacySettings from './PrivacySettings';
import BansSettings from './BansSettings';
import ServerStatsSettings from './ServerStatsSettings';
import ServerAuditLogSettings from './ServerAuditLogSettings';

type ServerSettingsTab =
    | 'profile' | 'tag'
    | 'engagement' | 'emojis'
    | 'members' | 'roles' | 'invites'
    | 'privacy' | 'bans'
    | 'stats' | 'audit';

interface ServerSettingsLayoutProps {
    isOpen: boolean;
    onClose: () => void;
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
    onServerDelete: (serverId: string) => void;
}

const ServerSettingsLayout: React.FC<ServerSettingsLayoutProps> = ({ isOpen, onClose, server, onServerUpdate, onServerDelete }) => {
    const { user: currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ServerSettingsTab>('profile');
    const isMobile = window.innerWidth <= 768;
    const [mobileViewState, setMobileViewState] = useState<'tabs' | 'content'>('tabs');
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteNameInput, setDeleteNameInput] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    if (!isOpen) return null;

    const userPerms = currentUser ? computePermissions(currentUser._id, server) : 0n;
    const isOwner = (server.owner && (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner)) === currentUser?._id;
    const canManageRoles = hasPermission(userPerms, Permissions.MANAGE_ROLES) || isOwner;
    const canViewAuditLog = hasPermission(userPerms, Permissions.VIEW_AUDIT_LOG) || isOwner;
    const canBanMembers = hasPermission(userPerms, Permissions.BAN_MEMBERS) || isOwner;
    const canManageGuild = hasPermission(userPerms, Permissions.MANAGE_GUILD) || isOwner;

    const handleTabChange = (id: ServerSettingsTab) => {
        setActiveTab(id);
        if (isMobile) setMobileViewState('content');
    };

    const handleDeleteServer = async () => {
        if (deleteNameInput !== server.name) {
            setDeleteError('Введённое название не совпадает');
            return;
        }
        setDeleting(true);
        try {
            await axios.delete(`/api/servers/${server._id}`);
            onServerDelete(server._id);
            onClose();
        } catch (err) {
            setDeleteError('Ошибка при удалении сервера');
        } finally {
            setDeleting(false);
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'profile': return <ServerProfileSettings server={server} onServerUpdate={onServerUpdate} />;
            case 'tag': return <ServerTagSettings server={server} onServerUpdate={onServerUpdate} />;
            case 'engagement': return <EngagementSettings server={server} onServerUpdate={onServerUpdate} />;
            case 'emojis': return <ServerEmojisSettings server={server} onServerUpdate={onServerUpdate} />;
            case 'members': return <MembersSettings server={server} onServerUpdate={onServerUpdate} />;
            case 'roles': return <RolesSettings server={server} onServerUpdate={onServerUpdate} />;
            case 'invites': return <InvitesSettings server={server} />;
            case 'privacy': return <PrivacySettings server={server} onServerUpdate={onServerUpdate} />;
            case 'bans': return <BansSettings server={server} onServerUpdate={onServerUpdate} />;
            case 'stats': return <ServerStatsSettings server={server} />;
            case 'audit': return <ServerAuditLogSettings server={server} />;
            default: return <ServerProfileSettings server={server} onServerUpdate={onServerUpdate} />;
        }
    };

    const tabTitles: Record<ServerSettingsTab, string> = {
        profile: 'Профиль', tag: 'Значок',
        engagement: 'Вовлечённость', emojis: 'Эмодзи',
        members: 'Участники', roles: 'Роли', invites: 'Приглашения',
        privacy: 'Приватность', bans: 'Баны',
        stats: 'Статистика', audit: 'Действия'
    };

    const NavItem = ({ id, label, icon: Icon }: { id: ServerSettingsTab; label: string; icon: any }) => (
        <div className={`settings-sidebar-item ${activeTab === id ? 'active' : ''}`} onClick={() => handleTabChange(id)}>
            <div className="sidebar-item-content">
                <Icon size={18} />
                <span>{label}</span>
            </div>
            {activeTab === id && <div className="active-indicator" />}
        </div>
    );

    return (
        <AnimatedOverlay
            isOpen={isOpen}
            onClose={onClose}
            overlayClassName="settings-overlay"
            contentClassName="server-settings-passthrough server-settings-layout-content"
            variant="fade"
        >
            <>
                {(!isMobile || mobileViewState === 'tabs') && (
                    <div className="settings-sidebar">
                        <div className="settings-sidebar-header">{server.name}</div>

                        <div className="settings-sidebar-header settings-sidebar-category">Сервер</div>
                        <NavItem id="profile" label="Профиль" icon={LayoutGridIcon} />
                        <NavItem id="tag" label="Значок" icon={MedalIcon} />

                        <div className="settings-sidebar-divider" />
                        <div className="settings-sidebar-header settings-sidebar-category">Активность</div>
                        <NavItem id="engagement" label="Вовлечённость" icon={GamepadIcon} />
                        <NavItem id="emojis" label="Эмодзи" icon={SmileIcon} />

                        <div className="settings-sidebar-divider" />
                        <div className="settings-sidebar-header settings-sidebar-category">Пользователи</div>
                        <NavItem id="members" label="Участники" icon={UsersIcon} />
                        {canManageRoles && <NavItem id="roles" label="Роли" icon={ShieldIcon} />}
                        {canManageGuild && <NavItem id="invites" label="Приглашения" icon={GlobeIcon} />}

                        <div className="settings-sidebar-divider" />
                        <div className="settings-sidebar-header settings-sidebar-category">Безопасность</div>
                        {canManageGuild && <NavItem id="privacy" label="Приватность" icon={EyeIcon} />}
                        {canBanMembers && <NavItem id="bans" label="Баны" icon={LockIcon} />}

                        {canViewAuditLog && (
                            <>
                                <div className="settings-sidebar-divider" />
                                <div className="settings-sidebar-header settings-sidebar-category">Аналитика</div>
                                <NavItem id="stats" label="Статистика" icon={BarChartIcon} />
                                <NavItem id="audit" label="Действия" icon={DocumentIcon} />
                            </>
                        )}

                        <div style={{ flex: 1 }} />
                        {isOwner && (
                            <>
                                <div className="settings-sidebar-divider" />
                                <div className="settings-sidebar-item danger" onClick={() => setDeleteConfirmOpen(true)}>
                                    <div className="sidebar-item-content">
                                        <TrashIcon size={18} />
                                        <span>Удалить сервер</span>
                                    </div>
                                </div>
                            </>
                        )}
                        {isMobile && <div className="settings-sidebar-item" onClick={onClose}>Закрыть</div>}
                    </div>
                )}

                {(!isMobile || mobileViewState === 'content') && (
                    <div className="settings-content-wrapper">
                        {isMobile ? (
                            <div className="mobile-settings-header">
                                <button className="back-button" onClick={() => setMobileViewState('tabs')}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                </button>
                                <span style={{ fontWeight: 800, fontSize: '18px' }}>{tabTitles[activeTab]}</span>
                            </div>
                        ) : (
                            <button className="settings-close-btn" onClick={onClose}>
                                <CloseIcon size={20} />
                            </button>
                        )}
                        {renderContent()}
                    </div>
                )}
            </>

            <AnimatePresence>
                {deleteConfirmOpen && (
                    <motion.div
                        className="custom-dialog-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ zIndex: 6000 }}
                    >
                        <motion.div
                            className="custom-dialog-container"
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            style={{ maxWidth: '440px' }}
                        >
                            <h3 className="custom-dialog-title" style={{ color: 'var(--danger)' }}>Удаление сервера</h3>
                            <div className="custom-dialog-message" style={{ textAlign: 'left' }}>
                                <p style={{ fontWeight: 800, marginBottom: '12px' }}>Вы уверены, что хотите удалить сервер «{server.name}»?</p>
                                <ul style={{ paddingLeft: '20px', marginBottom: '16px', color: 'var(--text-dim)' }}>
                                    <li>Сервер восстановить невозможно</li>
                                    <li>Все каналы и сообщения будут удалены</li>
                                    <li>Все участники, роли и приглашения будут удалены</li>
                                </ul>
                                <p style={{ fontSize: '13px', marginBottom: '8px' }}>Для подтверждения введите название сервера <strong>{server.name}</strong>:</p>
                                <input
                                    className={`settings-input ${deleteError ? 'error' : ''}`}
                                    value={deleteNameInput}
                                    onChange={(e) => { setDeleteNameInput(e.target.value); setDeleteError(null); }}
                                    placeholder="Введите название сервера..."
                                    autoFocus
                                />
                                {deleteError && (
                                    <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                                        {deleteError}
                                    </div>
                                )}
                            </div>
                            <div className="custom-dialog-actions">
                                <button className="custom-dialog-button cancel" onClick={() => { setDeleteConfirmOpen(false); setDeleteNameInput(''); setDeleteError(null); }}>
                                    Отмена
                                </button>
                                <button
                                    className="custom-dialog-button confirm"
                                    style={{ background: 'var(--danger)' }}
                                    disabled={deleting}
                                    onClick={handleDeleteServer}
                                >
                                    Удалить навсегда
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </AnimatedOverlay>
    );
};

export default ServerSettingsLayout;
