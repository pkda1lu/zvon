import React from 'react';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { ChoiceGroup } from './SettingsUI';

const LanguageSettings: React.FC = () => {
    // Note: Assuming there's a context for language, if not we use window settings or simulate
    const { timeFormat, setTimeFormat } = useWindowSettings();
    const [lang, setLang] = React.useState('ru');

    const langOptions = [
        { value: 'ru', label: 'Русский' },
        { value: 'en', label: 'English' },
        { value: 'ua', label: 'Українська' }
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
                <ChoiceGroup 
                    options={langOptions}
                    value={lang}
                    onChange={setLang}
                />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Формат времени</h3>
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
