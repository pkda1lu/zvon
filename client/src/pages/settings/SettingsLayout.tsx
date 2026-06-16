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
    MonitorIcon as AdvancedIcon,
    CheckIcon,
    LayoutGridIcon,
    SmartphoneIcon,
    MonitorIcon as AdminIcon,
    LogOutIcon,
    LockIcon
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
import KeybindsSettings from './KeybindsSettings';
import AccessibilitySettings from './AccessibilitySettings';
import ScalingSettings from './ScalingSettings';
import WindowsSettings from './WindowsSettings';
import StreamerSettings from './StreamerSettings';
import AdvancedSettings from './AdvancedSettings';
import ModerationSettings from './ModerationSettings';
import AdminUsersSettings from './AdminUsersSettings';
import AdminStatsSettings from './AdminStatsSettings';
import AdminActionsSettings from './AdminActionsSettings';
import { useAuth } from '../../contexts/AuthContext';

interface SettingsLayoutProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: string;
    initialData?: any;
}

const SettingsLayout: React.FC<SettingsLayoutProps> = ({ isOpen, onClose, initialTab = 'profile', initialData }) => {
    const [activeTab, setActiveTab] = React.useState(initialTab);
    const { user } = useAuth();

    React.useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);
    
    const isWindows = !!(window as any).electron;
    const isModerator = user?.role === 'admin' || user?.role === 'moderator';

    if (!isOpen) return null;

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
            case 'keybinds': return <KeybindsSettings />;
            case 'accessibility': return <AccessibilitySettings />;
            case 'scaling': return <ScalingSettings />;
            case 'windows-actions': return <WindowsSettings />;
            case 'streamer': return <StreamerSettings />;
            case 'advanced': return <AdvancedSettings />;
            case 'moderation': return <ModerationSettings />;
            case 'admin-users': return <AdminUsersSettings />;
            case 'admin-stats': return <AdminStatsSettings />;
            case 'admin-actions': return <AdminActionsSettings />;
            default: return <ProfileSettings />;
        }
    };

    const NavItem = ({ id, label, icon: Icon }: any) => (
        <div className={`settings-sidebar-item ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
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
                <NavItem id="profile" label="Общий профиль" icon={LayoutGridIcon} />
                <NavItem id="server-profiles" label="Профили на серверах" icon={UsersIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Безопасность</div>
                <NavItem id="account" label="Учётная запись" icon={ShieldIcon} />
                <NavItem id="devices" label="Устройства" icon={SmartphoneIcon} />
                <NavItem id="privacy" label="Приватность" icon={LockIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Интерфейс</div>
                <NavItem id="appearance" label="Внешний вид" icon={PaletteIcon} />
                <NavItem id="chat" label="Чаты" icon={ChatIcon} />
                <NavItem id="optimization" label="Оптимизация" icon={AdvancedIcon} />
                <NavItem id="language" label="Язык и время" icon={LayoutGridIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Приложения</div>
                <NavItem id="bots" label="Мои боты" icon={BotIcon} />
                <NavItem id="miniapps" label="Мои мини-приложения" icon={PlusIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Взаимодействие</div>
                <NavItem id="voice" label="Голос и видео" icon={SpeakerIcon} />
                <NavItem id="keybinds" label="Горячие клавиши" icon={KeyboardIcon} />

                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-header">Специальные возможности</div>
                <NavItem id="accessibility" label="Экранный диктор" icon={SpeakerIcon} />
                <NavItem id="scaling" label="Масштабирование" icon={LayoutGridIcon} />

                {isWindows && (
                    <>
                        <div className="settings-sidebar-divider" />
                        <div className="settings-sidebar-header">Настройки Windows</div>
                        <NavItem id="windows-actions" label="Действия" icon={MonitorIcon} />
                        <NavItem id="streamer" label="Режим стримера" icon={MonitorIcon} />
                        <NavItem id="advanced" label="Расширенные" icon={AdvancedIcon} />
                    </>
                )}

                {isModerator && (
                    <>
                        <div className="settings-sidebar-divider" />
                        <div className="settings-sidebar-header">Разработчикам</div>
                        <NavItem id="moderation" label="Модерация" icon={ShieldIcon} />
                        <NavItem id="admin-users" label="Пользователи и сервера" icon={UsersIcon} />
                        <NavItem id="admin-stats" label="Статистика" icon={LayoutGridIcon} />
                        <NavItem id="admin-actions" label="Действия" icon={LayoutGridIcon} />
                    </>
                )}
                
                <div className="settings-sidebar-divider" />
                <div className="settings-sidebar-item logout" onClick={onClose}>
                    <div className="sidebar-item-content">
                        <LogOutIcon size={18} />
                        <span>Выйти из настроек</span>
                    </div>
                </div>
            </div>

            <div className="settings-content-wrapper">
                <button className="settings-close-btn" onClick={onClose}>
                    <CloseIcon size={20} />
                </button>
                {renderContent()}
            </div>
        </div>
    );
};

export default SettingsLayout;
