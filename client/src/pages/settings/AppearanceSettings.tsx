import React from 'react';
import { useAppearance } from '../../contexts/AppearanceContext';
import { ChoiceGroup, SettingsToggle } from './SettingsUI';

const AppearanceSettings: React.FC = () => {
    const { 
        theme, setTheme, 
        scale, setScale,
        performanceMode, setPerformanceMode 
    } = useAppearance();

    const themeOptions = [
        { value: 'dark', label: 'Тёмная' },
        { value: 'light', label: 'Светлая' },
        { value: 'system', label: 'Системная' },
        { value: 'midnight', label: 'Полночь' }
    ];

    const scaleOptions = [
        { value: '0.8', label: '80%' },
        { value: '1', label: '100%' },
        { value: '1.1', label: '110%' },
        { value: '1.25', label: '125%' }
    ];

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Внешний вид</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Тема оформления</h3>
                <ChoiceGroup 
                    options={themeOptions}
                    value={theme}
                    onChange={(val) => setTheme(val as any)}
                />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Масштаб интерфейса</h3>
                <ChoiceGroup 
                    options={scaleOptions}
                    value={scale.toString()}
                    onChange={(val) => setScale(parseFloat(val))}
                />
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Режим производительности</h3>
                        <p>Отключает сложные анимации и размытие для ускорения работы.</p>
                    </div>
                    <SettingsToggle 
                        checked={performanceMode}
                        onChange={setPerformanceMode}
                    />
                </div>
            </div>
        </div>
    );
};

export default AppearanceSettings;
