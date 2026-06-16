import React from 'react';

const AdminStatsSettings: React.FC = () => {
    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Статистика</h2>
            <div className="settings-card">
                <p className="settings-description">Количество пользователей, серверов, сообщений с графиками.</p>
            </div>
        </div>
    );
};

export default AdminStatsSettings;