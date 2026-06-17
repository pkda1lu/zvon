import React from 'react';
import { useAppearance } from '../../contexts/AppearanceContext';
import { RangeSlider } from './SettingsUI';

const ScalingSettings: React.FC = () => {
    const { interfaceScale, setInterfaceScale } = useAppearance();

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Масштабирование</h2>
            <p className="settings-description">Настройте масштаб интерфейса для удобства чтения и использования.</p>
            
            <div className="settings-section">
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Масштаб интерфейса</h3>
                            <p>Изменяет размер шрифтов и элементов управления во всем приложении.</p>
                        </div>
                        <RangeSlider 
                            value={interfaceScale} 
                            min={0.8} 
                            max={1.5} 
                            step={0.05} 
                            unit="x" 
                            onChange={setInterfaceScale} 
                        />
                    </div>
                </div>
            </div>

            <div className="settings-info-box">
                <p>Масштабирование интерфейса может повлиять на отображение некоторых элементов. Если интерфейс выглядит некорректно, попробуйте вернуть масштаб 1.0x.</p>
            </div>
        </div>
    );
};

export default ScalingSettings;
