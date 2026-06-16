import React from 'react';
import { useAppearance } from '../../contexts/AppearanceContext';
import { SettingsToggle } from './SettingsUI';

const OptimizationSettings: React.FC = () => {
    const { 
        reduceMotion, setReduceMotion,
        backgroundBlur, setBackgroundBlur
    } = useAppearance();

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Оптимизация</h2>
            
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Отключить анимации</h3>
                        <p>Уменьшает количество визуальных переходов для экономии ресурсов.</p>
                    </div>
                    <SettingsToggle checked={reduceMotion} onChange={setReduceMotion} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Размытие интерфейса (Blur)</h3>
                        <p>Включает эффект матового стекла. Отключение может повысить FPS.</p>
                    </div>
                    <SettingsToggle checked={backgroundBlur > 0} onChange={(val) => setBackgroundBlur(val ? 20 : 0)} />
                </div>
            </div>
        </div>
    );
};

export default OptimizationSettings;
