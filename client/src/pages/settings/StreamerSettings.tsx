import React from 'react';

const StreamerSettings: React.FC = () => {
    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Режим стримера</h2>
            <div className="settings-card">
                <p className="settings-description">Автоматическое включение, цензура, отключение звуков и уведомлений.</p>
            </div>
        </div>
    );
};

export default StreamerSettings;