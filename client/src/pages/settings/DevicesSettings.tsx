import React from 'react';

const DevicesSettings: React.FC = () => {
    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Устройства</h2>
            <div className="settings-card">
                <p className="settings-description">Текущее устройство и остальные устройства (сессии).</p>
            </div>
        </div>
    );
};

export default DevicesSettings;