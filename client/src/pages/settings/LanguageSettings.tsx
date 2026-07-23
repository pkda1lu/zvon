import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChoiceGroup } from './SettingsUI';
import { getBrand } from '../../utils/branding';

const LanguageSettings: React.FC = () => {
    const { language, setLanguage, timeFormat, setTimeFormat } = useLanguage();
    const brand = getBrand();

    const langOptions = [
        { value: 'ru', label: 'Русский' }
    ];

    const timeOptions = [
        { value: '24h', label: '24-часовой' },
        { value: '12h', label: '12-часовой' }
    ];

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Язык и время</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Язык интерфейса</h3>
                <p className="settings-description">Выберите язык, на котором будет отображаться интерфейс {brand.name.toUpperCase()}.</p>
                <ChoiceGroup 
                    options={langOptions}
                    value={language}
                    onChange={(val) => setLanguage(val as any)}
                />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Формат времени</h3>
                <p className="settings-description">Настройте отображение времени в чатах и профилях.</p>
                <ChoiceGroup 
                    options={timeOptions}
                    value={timeFormat}
                    onChange={(val) => setTimeFormat(val as any)}
                />
            </div>
        </div>
    );
};

export default LanguageSettings;
