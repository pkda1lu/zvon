import React from 'react';
import { useGestureSettings } from '../../contexts/GestureSettingsContext';
import { SettingsToggle, ChoiceGroup } from './SettingsUI';

const GestureSettings: React.FC = () => {
    const { settings, setSetting } = useGestureSettings();

    const sensitivityOptions = [
        { value: 'low', label: 'Низкая' },
        { value: 'medium', label: 'Средняя' },
        { value: 'high', label: 'Высокая' }
    ];

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Жесты</h2>
            <p className="settings-description">
                Настройки сенсорных жестов для мобильной версии приложения.
            </p>

            {/* General Switch */}
            <div className="settings-section">
                <h3 className="settings-section-title">Главный переключатель</h3>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Включить жесты на телефоне</h3>
                            <p>Разрешить использование горизонтальных жестов пальцем для переключения интерфейса.</p>
                        </div>
                        <SettingsToggle
                            checked={settings.enabled}
                            onChange={(val) => setSetting('enabled', val)}
                        />
                    </div>
                </div>
            </div>

            {/* Additional Parameters */}
            <div className="settings-section" style={{ opacity: settings.enabled ? 1 : 0.5, pointerEvents: settings.enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <h3 className="settings-section-title">Параметры и отклик</h3>

                <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="settings-row-stacked">
                        <div className="settings-row-text" style={{ marginBottom: '10px' }}>
                            <h3>Чувствительность свайпа</h3>
                            <p>Минимальное расстояние движения пальцем для активации жеста.</p>
                        </div>
                        <ChoiceGroup
                            options={sensitivityOptions}
                            value={settings.swipeSensitivity}
                            onChange={(val: any) => setSetting('swipeSensitivity', val)}
                        />
                    </div>

                    <div className="settings-divider" style={{ margin: '0', height: '1px', background: 'var(--border-color, rgba(255, 255, 255, 0.06))' }} />

                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Виброотклик при жестах</h3>
                            <p>Воспроизводит лёгкий тактильный импульс вибрации при успешном распознавании жеста.</p>
                        </div>
                        <SettingsToggle
                            checked={settings.hapticFeedback}
                            onChange={(val) => setSetting('hapticFeedback', val)}
                        />
                    </div>
                </div>
            </div>

            <div className="settings-info-box" style={{ marginTop: '20px' }}>
                <p style={{ margin: 0 }}>
                    Жесты отключаются во время просмотра списков друзей, витрин и всплывающих модальных окон, чтобы предотвратить случайные переключения.
                </p>
            </div>
        </div>
    );
};

export default GestureSettings;
