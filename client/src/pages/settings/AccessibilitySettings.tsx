import React from 'react';
import { useAppearance } from '../../contexts/AppearanceContext';
import { SettingsToggle } from './SettingsUI';

const AccessibilitySettings: React.FC = () => {
    const { 
        screenReader, setScreenReader
    } = useAppearance();

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Специальные возможности</h2>
            <p className="settings-description">Настройте приложение для максимального удобства использования.</p>

            <div className="settings-section">
                <h3 className="settings-section-title">Зрение</h3>
                
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Экранный диктор по интерфейсу</h3>
                            <p>Включает озвучивание элементов интерфейса при их выборе или наведении.</p>
                        </div>
                        <SettingsToggle 
                            checked={screenReader} 
                            onChange={setScreenReader} 
                        />
                    </div>
                </div>
            </div>

            <div className="settings-info-box">
                <p>Экранный диктор озвучивает названия кнопок, каналов и сообщения при их фокусировке. Это помогает ориентироваться в приложении без использования зрения.</p>
            </div>
        </div>
    );
};

export default AccessibilitySettings;