import React from 'react';
import './Settings.css';
import { 
    CloseIcon, 
    ShieldIcon, 
    PaletteIcon, 
    ChatIcon, 
    KeyboardIcon, 
    MonitorIcon, 
    PlusIcon, 
    UsersIcon,
    BotIcon,
    SpeakerIcon,
    GamepadIcon,
    MonitorIcon as AdvancedIcon,
    CheckIcon,
    LayoutGridIcon,
    SmartphoneIcon,
    MonitorIcon as AdminIcon,
    LogOutIcon,
    LockIcon,
    EyeIcon,
    GlobeIcon,
    MicIcon,
    MaximizeIcon,
    VideoIcon,
    SettingsIcon,
    DocumentIcon,
    BarChartIcon,
    PhoneIcon
} from '../../components/Icons';
import ProfileSettings from './ProfileSettings';
import ServerProfilesSettings from './ServerProfilesSettings';
import AccountSettings from './AccountSettings';
import DevicesSettings from './DevicesSettings';
import PrivacySettings from './PrivacySettings';
import AppearanceSettings from './AppearanceSettings';
import ChatSettings from './ChatSettings';
import OptimizationSettings from './OptimizationSettings';
import LanguageSettings from './LanguageSettings';
import BotsSettings from './BotsSettings';
import MiniAppsSettings from './MiniAppsSettings';
import VoiceSettings from './VoiceSettings';
import CallSettings from './CallSettings';
import KeybindsSettings from './KeybindsSettings';
import AccessibilitySettings from './AccessibilitySettings';
import ScalingSettings from './ScalingSettings';
import ActivitySettings from './ActivitySettings';
import WindowsSettings from './WindowsSettings';
import StreamerSettings from './StreamerSettings';
import OverlaySettings from './OverlaySettings';
import AdvancedSettings from './AdvancedSettings';
import ModerationSettings from './ModerationSettings';
import AdminUsersSettings from './AdminUsersSettings';
import AdminStatsSettings from './AdminStatsSettings';
import AdminInfraSettings from './AdminInfraSettings';
import AdminActionsSettings from './AdminActionsSettings';
import { useAuth } from '../../contexts/AuthContext';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';

interface SettingsLayoutProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: string;
    initialData?: any;
}

const SettingsLayout: React.FC<SettingsLayoutProps> = ({ isOpen, onClose, initialTab = 'profile', initialData }) => {
    const [activeTab, setActiveTab] = React.useState(initialTab);
    const [pendingTab, setPendingTab] = React.useState<string | null>(null);
    const [isSidebarExpanded, setIsSidebarExpanded] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

    const { user, logout } = useAuth();
    const { streamerModeEnabled, confirmSettingsAccess } = useWindowSettings();

    React.useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    React.useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
            setIsSidebarExpanded(false);
        }
    }, [isOpen, initialTab]);
    
    const isWindows = !!(window as any).electron;
    const isModerator = user?.role === 'admin' || user?.role === 'moderator';

    const touchStartRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

    if (!isOpen) return null;

    const handleTabChange = (id: string) => {
        if (isMobile) setIsSidebarExpanded(false);
        const sensitiveTabs = ['account', 'devices', 'bots', 'miniapps'];
        if (streamerModeEnabled && confirmSettingsAccess && sensitiveTabs.includes(id)) {
            setPendingTab(id);
        } else {
            setActiveTab(id);
        }
    };

    const confirmTabChange = () => {
        if (pendingTab) {
            setActiveTab(pendingTab);
            setPendingTab(null);
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'profile': return <ProfileSettings />;
            case 'server-profiles': return <ServerProfilesSettings initialServerId={initialData?.serverId} />;
            case 'account': return <AccountSettings />;
            case 'devices': return <DevicesSettings />;
            case 'privacy': return <PrivacySettings />;
            case 'appearance': return <AppearanceSettings />;
            case 'chat': return <ChatSettings />;
            case 'optimization': return <OptimizationSettings />;
            case 'language': return <LanguageSettings />;
            case 'bots': return <BotsSettings />;
            case 'miniapps': return <MiniAppsSettings />;
            case 'voice': return <VoiceSettings />;
            case 'calls': return <CallSettings />;
            case 'keybinds': return <KeybindsSettings />;
            case 'accessibility': return <AccessibilitySettings />;
            case 'scaling': return <ScalingSettings />;
            case 'activity': return <ActivitySettings />;
            case 'streamer': return <StreamerSettings />;
            case 'overlay': return <OverlaySettings />;
            case 'windows-actions': return <WindowsSettings />;
            case 'advanced': return <AdvancedSettings />;
            case 'moderation': return <ModerationSettings />;
            case 'admin-users': return <AdminUsersSettings />;
            case 'admin-stats': return <AdminStatsSettings />;
            case 'admin-infra': return <AdminInfraSettings />;
            case 'admin-actions': return <AdminActionsSettings />;
            default: return <ProfileSettings />;
        }
    };

    const NavItem = ({ id, label, icon: Icon }: any) => (
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
        return <div className="settings-sidebar-header">{children}</div>;
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

    return (
        <div className="settings-overlay" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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

                <CategoryHeader>Мой профиль</CategoryHeader>
                <NavItem id="profile" label="Общий профиль" icon={UsersIcon} />
                <NavItem id="server-profiles" label="Профили на серверах" icon={LayoutGridIcon} />

                <Divider />
                <CategoryHeader>Безопасность</CategoryHeader>
                <NavItem id="account" label="Учётная запись" icon={ShieldIcon} />
                <NavItem id="devices" label="Устройства" icon={SmartphoneIcon} />
                <NavItem id="privacy" label="Приватность" icon={EyeIcon} />

                <Divider />
                <CategoryHeader>Интерфейс</CategoryHeader>
                <NavItem id="appearance" label="Внешний вид" icon={PaletteIcon} />
                <NavItem id="chat" label="Чаты" icon={ChatIcon} />
                <NavItem id="calls" label="Звонки" icon={PhoneIcon} />
                <NavItem id="optimization" label="Оптимизация" icon={SettingsIcon} />
                <NavItem id="language" label="Язык и время" icon={GlobeIcon} />

                <Divider />
                <CategoryHeader>Приложения</CategoryHeader>
                <NavItem id="bots" label="Мои боты" icon={BotIcon} />
                <NavItem id="miniapps" label="Мои мини-приложения" icon={LayoutGridIcon} />

                <Divider />
                <CategoryHeader>Взаимодействие</CategoryHeader>
                <NavItem id="voice" label="Голос и видео" icon={MicIcon} />
                <NavItem id="keybinds" label="Горячие клавиши" icon={KeyboardIcon} />

                <Divider />
                <CategoryHeader>Специальные возможности</CategoryHeader>
                <NavItem id="accessibility" label="Экранный диктор" icon={SpeakerIcon} />
                <NavItem id="scaling" label="Масштабирование" icon={MaximizeIcon} />

                {isWindows && (
                    <>
                        <Divider />
                        <CategoryHeader>Настройки Windows</CategoryHeader>
                        <NavItem id="activity" label="Активность" icon={GamepadIcon} />
                        <NavItem id="streamer" label="Режим стримера" icon={VideoIcon} />
                        <NavItem id="overlay" label="Оверлей" icon={EyeIcon} />
                        <NavItem id="windows-actions" label="Действия" icon={MonitorIcon} />
                        <NavItem id="advanced" label="Расширенные" icon={SettingsIcon} />
                    </>
                )}

                {isModerator && (
                    <>
                        <Divider />
                        <CategoryHeader>Разработчикам</CategoryHeader>
                        <NavItem id="moderation" label="Модерация" icon={ShieldIcon} />
                        <NavItem id="admin-users" label="Пользователи и сервера" icon={UsersIcon} />
                        <NavItem id="admin-stats" label="Статистика" icon={BarChartIcon} />
                        <NavItem id="admin-infra" label="Инфраструктура" icon={GlobeIcon} />
                        <NavItem id="admin-actions" label="Действия" icon={DocumentIcon} />
                    </>
                )}
                
                <Divider />
                <div className="settings-sidebar-item logout" onClick={logout} title="Выйти из аккаунта">
                    <div className="sidebar-item-content">
                        <LogOutIcon size={18} />
                        {(!isMobile || isSidebarExpanded) && <span>Выйти из аккаунта</span>}
                    </div>
                </div>
            </div>

            <div className="settings-content-wrapper">
                <button className="settings-close-btn" onClick={onClose} title="Закрыть">
                    <CloseIcon size={20} />
                </button>
                {renderContent()}
            </div>

            {pendingTab && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal-glass">
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{ 
                                width: '60px', 
                                height: '60px', 
                                borderRadius: '50%', 
                                background: 'rgba(255, 71, 87, 0.1)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                margin: '0 auto 16px',
                                border: '1px solid var(--danger)'
                            }}>
                                <LockIcon size={30} color="var(--danger)" />
                            </div>
                            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>Режим стримера включен</h3>
                            <p className="settings-description" style={{ marginTop: '10px' }}>
                                Вы пытаетесь открыть раздел настроек, который может содержать личную информацию (почту, токены, список устройств). 
                                Вы уверены, что хотите продолжить?
                            </p>
                        </div>
                        <div className="modal-actions" style={{ justifyContent: 'stretch' }}>
                            <button className="settings-btn secondary" style={{ flex: 1 }} onClick={() => setPendingTab(null)}>Отмена</button>
                            <button className="settings-btn danger" style={{ flex: 1.2 }} onClick={confirmTabChange}>Показать настройки</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsLayout;
