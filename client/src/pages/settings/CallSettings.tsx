import React, { useState, useEffect } from 'react';
import { useCallSettings } from '../../contexts/CallSettingsContext';
import { SettingsToggle, ChoiceGroup } from './SettingsUI';

const CallSettings: React.FC = () => {
  const { settings, setSetting } = useCallSettings();

  return (
    <div className="settings-content-inner">
        <h2 className="settings-page-title">Звонки</h2>
        <div className="settings-card">
            <h3 className="settings-section-title" style={{marginTop: 0}}>Вид отображения участников</h3>
            <ChoiceGroup
                className="full-width"
                options={[
                    { value: 'sidebar', label: 'Боковая панель' },
                    { value: 'strip', label: 'Нижняя полоса' },
                ]}
                value={settings.layout === 'grid' ? 'sidebar' : settings.layout}
                onChange={(v) => setSetting('layout', v)}
            />
        </div>
        <div className="settings-card">
            <div className="settings-row">
                <div className="settings-row-text">
                    <h3>Выключать микрофон при выключении звука</h3>
                    <p>Когда вы выключаете звук (оглохли), ваш микрофон также будет выключен.</p>
                </div>
                <SettingsToggle 
                    checked={settings.muteOnDeafen} 
                    onChange={(v) => setSetting('muteOnDeafen', v)} 
                />
            </div>
        </div>
    </div>
  );
};

export default CallSettings;
