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
    const { user, logout } = useAuth();
    const { streamerModeEnabled, confirmSettingsAccess } = useWindowSettings();

    React.useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);
    
    const isWindows = !!(window as any).electron;
    const isModerator = user?.role === 'admin' || user?.role === 'moderator';

    if (!isOpen) return null;

    const handleTabChange = (id: string) => {
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
        <div className={`settings-sidebar-item ${activeTab === id ? 'active' : ''}`} onClick={() => handleTabChange(id)}>
            <div className="sidebar-item-content">
                <Icon size={18} />
                <span>{label}</span>
            </div>
            {activeTab === id && <div className="active-indicator" />}
        </div>
    );

    return (
        <div className="settings-overlay">
            <div className="settings-sidebar">
                <div className="settings-sidebar-header">Мой профиль</div>
                <NavItem id="profile" label="Общий профиль" icon={UsersIcon} />
                <NavItem id="server-profiles" label="Профили на серверах" icon={LayoutGridIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Безопасность</div>
                <NavItem id="account" label="Учётная запись" icon={ShieldIcon} />
                <NavItem id="devices" label="Устройства" icon={SmartphoneIcon} />
                <NavItem id="privacy" label="Приватность" icon={EyeIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Интерфейс</div>
                <NavItem id="appearance" label="Внешний вид" icon={PaletteIcon} />
                <NavItem id="chat" label="Чаты" icon={ChatIcon} />
                <NavItem id="calls" label="Звонки" icon={PhoneIcon} />
                <NavItem id="optimization" label="Оптимизация" icon={SettingsIcon} />
                <NavItem id="language" label="Язык и время" icon={GlobeIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Приложения</div>
                <NavItem id="bots" label="Мои боты" icon={BotIcon} />
                <NavItem id="miniapps" label="Мои мини-приложения" icon={LayoutGridIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Взаимодействие</div>
                <NavItem id="voice" label="Голос и видео" icon={MicIcon} />
                <NavItem id="keybinds" label="Горячие клавиши" icon={KeyboardIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Специальные возможности</div>
                <NavItem id="accessibility" label="Экранный диктор" icon={SpeakerIcon} />
                <NavItem id="scaling" label="Масштабирование" icon={MaximizeIcon} />

                {isWindows && (
                    <>
                        <div className="settings-sidebar-divider" />
                        <div className="settings-sidebar-header">Настройки Windows</div>
                        <NavItem id="activity" label="Активность" icon={GamepadIcon} />
                        <NavItem id="streamer" label="Режим стримера" icon={VideoIcon} />
                        <NavItem id="overlay" label="Оверлей" icon={EyeIcon} />
                        <NavItem id="windows-actions" label="Действия" icon={MonitorIcon} />
                        <NavItem id="advanced" label="Расширенные" icon={SettingsIcon} />
                    </>
                )}

                {isModerator && (
                    <>
                        <div className="settings-sidebar-divider" />
                        <div className="settings-sidebar-header">Разработчикам</div>
                        <NavItem id="moderation" label="Модерация" icon={ShieldIcon} />
                        <NavItem id="admin-users" label="Пользователи и сервера" icon={UsersIcon} />
                        <NavItem id="admin-stats" label="Статистика" icon={BarChartIcon} />
                        <NavItem id="admin-infra" label="Инфраструктура" icon={GlobeIcon} />
                        <NavItem id="admin-actions" label="Действия" icon={DocumentIcon} />
                    </>
                )}
                
                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-item logout" onClick={logout}>
                    <div className="sidebar-item-content">
                        <LogOutIcon size={18} />
                        <span>Выйти из аккаунта</span>
                    </div>
                </div>
            </div>

            <div className="settings-content-wrapper">
                <button className="settings-close-btn" onClick={onClose}>
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
