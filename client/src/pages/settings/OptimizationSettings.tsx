import React from 'react';
import { useAppearance } from '../../contexts/AppearanceContext';
import { SettingsToggle } from './SettingsUI';

const OptimizationSettings: React.FC = () => {
    const { 
        reduceMotion, setReduceMotion,
        performanceMode, setPerformanceMode
    } = useAppearance();

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Оптимизация</h2>
            <p className="settings-description">Настройте визуальные эффекты для повышения производительности на слабых устройствах.</p>
            
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Отключить анимации</h3>
                        <p>Убирает плавные переходы и движения интерфейса. Рекомендуется для слабых GPU.</p>
                    </div>
                    <SettingsToggle checked={reduceMotion} onChange={setReduceMotion} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Отключить блюр (Performance Mode)</h3>
                        <p>Выключает размытие заднего плана (эффект стекла). Значительно повышает FPS в приложении.</p>
                    </div>
                    <SettingsToggle checked={performanceMode} onChange={setPerformanceMode} />
                </div>
            </div>
        </div>
    );
};

export default OptimizationSettings;
