import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { GridPicker } from './SettingsUI';

const AccountSettings: React.FC = () => {
    const { user } = useAuth();
    const [selectedBadges, setSelectedBadges] = useState(user?.badges || []);

    const badgesData = [
        { id: 'developer', label: 'Разработчик', image: '/badges/developer.png' },
        { id: 'premium', label: 'Premium', image: '/badges/premium.png' },
        { id: 'gamer', label: 'Геймер', image: '/badges/gamer.png' },
        { id: 'painter', label: 'Художник', image: '/badges/painter.png' },
        { id: 'cat', label: 'Кошатник', image: '/badges/cat.png' },
        { id: 'moderate', label: 'Модератор', image: '/badges/moderate.png' }
    ];

    const toggleBadge = (id: string) => {
        const newBadges = selectedBadges.includes(id) 
            ? selectedBadges.filter(b => b !== id)
            : [...selectedBadges, id];
        setSelectedBadges(newBadges);
        // Auto-save logic would go here
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Учётная запись</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Ваши значки</h3>
                <p className="settings-description">Выберите значки, которые будут отображаться в вашем профиле.</p>
                <GridPicker 
                    items={badgesData}
                    selectedIds={selectedBadges}
                    onToggle={toggleBadge}
                    multi
                />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Уникальный никнейм</h3>
                <input className="settings-input" defaultValue={user?.username} />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Электронная почта</h3>
                <input className="settings-input" defaultValue={user?.email} readOnly style={{ opacity: 0.6 }} />
            </div>
        </div>
    );
};

export default AccountSettings;
