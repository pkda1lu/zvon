import React from 'react';

const AdminActionsSettings: React.FC = () => {
    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Действия (Логи)</h2>
            <div className="settings-card">
                <p className="settings-description">Последние действия за час, 12 часов, 24 часа, 7 дней с фильтрами.</p>
            </div>
        </div>
    );
};

export default AdminActionsSettings;