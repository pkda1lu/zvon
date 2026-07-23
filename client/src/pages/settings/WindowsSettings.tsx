import React from 'react';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { SettingsToggle } from './SettingsUI';
import { getBrand } from '../../utils/branding';

const WindowsSettings: React.FC = () => {
    const {
        autoStart, setAutoStart,
        minimizeToTray, setMinimizeToTray,
        closeToTray, setCloseToTray,
        startMinimized, setStartMinimized
    } = useWindowSettings();
    const brand = getBrand();

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Действия</h2>
            <p className="settings-description">
                Управляйте поведением окна приложения {brand.name.toUpperCase()} в операционной системе.
            </p>

            <div className="settings-section-title">Системные</div>
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Запуск при старте системы</h3>
                        <p>Автоматически открывать {brand.name.toUpperCase()} при включении компьютера.</p>
                    </div>
                    <SettingsToggle checked={autoStart} onChange={setAutoStart} />
                </div>
                <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Запуск свёрнутым</h3>
                        <p>При автозапуске приложение сразу свернется в трей.</p>
                    </div>
                    <SettingsToggle checked={startMinimized} onChange={setStartMinimized} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Минимизация в трей</h3>
                        <p>Убирать приложение с панели задач при сворачивании.</p>
                    </div>
                    <SettingsToggle checked={minimizeToTray} onChange={setMinimizeToTray} />
                </div>
                <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Закрытие в трей</h3>
                        <p>Оставлять приложение работать в фоне при закрытии окна.</p>
                    </div>
                    <SettingsToggle checked={closeToTray} onChange={setCloseToTray} />
                </div>
            </div>
        </div>
    );
};

export default WindowsSettings;
