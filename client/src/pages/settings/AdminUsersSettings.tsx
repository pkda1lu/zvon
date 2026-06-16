import React from 'react';

const AdminUsersSettings: React.FC = () => {
    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Пользователи и сервера</h2>
            <div className="settings-card">
                <p className="settings-description">Все зарегистрированные пользователи и созданные сервера.</p>
            </div>
        </div>
    );
};

export default AdminUsersSettings;