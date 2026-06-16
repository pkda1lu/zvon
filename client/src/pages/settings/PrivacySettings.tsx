import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { ChoiceGroup } from './SettingsUI';

const PrivacySettings: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const settings = user?.settings || {
        whoCanDM: 'everyone',
        whoCanFindInSearch: 'everyone',
        whoCanSeeFullProfile: 'everyone'
    };

    const updateSetting = async (key: string, value: string) => {
        try {
            await axios.put('/api/users/settings', {
                settings: { ...settings, [key]: value }
            });
            await refreshUser();
        } catch (e) {
            console.error("Failed to update privacy setting", e);
        }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Приватность</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Кто может писать вам (ЛС)</h3>
                <ChoiceGroup 
                    options={[
                        { value: 'everyone', label: 'Все' },
                        { value: 'server_members', label: 'Участники серверов' },
                        { value: 'friends', label: 'Друзья' },
                        { value: 'nobody', label: 'Никто' }
                    ]}
                    value={settings.whoCanDM}
                    onChange={(val) => updateSetting('whoCanDM', val)}
                />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Кто может найти ваш профиль в поиске</h3>
                <ChoiceGroup 
                    options={[
                        { value: 'everyone', label: 'Все' },
                        { value: 'friends_of_friends', label: 'Друзья друзей' },
                        { value: 'nobody', label: 'Никто' }
                    ]}
                    value={settings.whoCanFindInSearch}
                    onChange={(val) => updateSetting('whoCanFindInSearch', val)}
                />
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Кому отображается полный профиль</h3>
                <p className="settings-description">Неполный профиль скрывает активность, установленные приложения, основной сервер и время последнего входа.</p>
                <ChoiceGroup 
                    options={[
                        { value: 'everyone', label: 'Все' },
                        { value: 'friends', label: 'Друзья' },
                        { value: 'small_servers', label: 'Малые серверы' },
                        { value: 'nobody', label: 'Никто' }
                    ]}
                    value={settings.whoCanSeeFullProfile}
                    onChange={(val) => updateSetting('whoCanSeeFullProfile', val)}
                />
            </div>
        </div>
    );
};

export default PrivacySettings;
