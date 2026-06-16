import React from 'react';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { SettingsToggle } from './SettingsUI';

const WindowsSettings: React.FC = () => {
    const { 
        autoStart, setAutoStart,
        minimizeToTray, setMinimizeToTray,
        closeToTray, setCloseToTray,
        startMinimized, setStartMinimized
    } = useWindowSettings();

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Действия (Windows)</h2>
            <p className="settings-description">
                Эти настройки управляют поведением окна приложения в операционной системе Windows.
            </p>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Запуск при старте системы</h3>
                        <p>Автоматически открывать ZVON при включении компьютера.</p>
                    </div>
                    <SettingsToggle checked={autoStart} onChange={setAutoStart} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Запуск свёрнутым</h3>
                        <p>При автозапуске приложение не будет появляться на экране, а сразу свернется в трей.</p>
                    </div>
                    <SettingsToggle checked={startMinimized} onChange={setStartMinimized} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Минимизация в трей</h3>
                        <p>При нажатии кнопки «Свернуть» убирать приложение с панели задач.</p>
                    </div>
                    <SettingsToggle checked={minimizeToTray} onChange={setMinimizeToTray} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Закрытие в трей</h3>
                        <p>При нажатии крестика не закрывать приложение полностью, а оставлять работать в фоне.</p>
                    </div>
                    <SettingsToggle checked={closeToTray} onChange={setCloseToTray} />
                </div>
            </div>
        </div>
    );
};

export default WindowsSettings;
