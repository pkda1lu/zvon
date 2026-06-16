import React from 'react';

const AppearanceSettings: React.FC = () => {
    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Внешний вид</h2>
            <div className="settings-card">
                <p className="settings-description">Управление темой, значком приложения и масштабом.</p>
            </div>
        </div>
    );
};

export default AppearanceSettings;