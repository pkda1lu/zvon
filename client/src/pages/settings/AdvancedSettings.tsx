import React from 'react';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { SettingsToggle } from './SettingsUI';

const AdvancedSettings: React.FC = () => {
    const { 
        hardwareAcceleration, setHardwareAcceleration 
    } = useWindowSettings();

    const handleHwAccelChange = (val: boolean) => {
        setHardwareAcceleration(val);
        // Hint for restart
        if (confirm('Для применения изменений аппаратного ускорения требуется перезапуск приложения. Перезапустить сейчас?')) {
            // @ts-ignore
            if (window.electron && window.electron.ipc) {
                // @ts-ignore
                window.electron.ipc.send('restart-app');
            }
        }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Расширенные настройки</h2>
            <p className="settings-description">
                Настройки для опытных пользователей и оптимизация производительности.
            </p>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Аппаратное ускорение</h3>
                        <p>Использовать графический процессор (GPU) для ускорения отрисовки интерфейса. Отключите, если у вас возникают проблемы с отображением или производительностью.</p>
                    </div>
                    <SettingsToggle checked={hardwareAcceleration} onChange={handleHwAccelChange} />
                </div>
                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(240, 178, 50, 0.1)', border: '1px solid rgba(240, 178, 50, 0.2)', borderRadius: '8px', fontSize: '12px', color: '#f0b232' }}>
                    ⚠️ Внимание: Изменение этой настройки потребует перезапуска ZVON.
                </div>
            </div>
        </div>
    );
};

export default AdvancedSettings;
