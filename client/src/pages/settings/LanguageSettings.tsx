import React from 'react';

const LanguageSettings: React.FC = () => {
    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Язык и время</h2>
            <div className="settings-card">
                <p className="settings-description">Переключение языка интерфейса, смена формата времени (12 или 24 часа).</p>
            </div>
        </div>
    );
};

export default LanguageSettings;