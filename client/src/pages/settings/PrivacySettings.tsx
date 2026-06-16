import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

const PrivacySettings: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const settings = user?.settings || {
        whoCanDM: 'everyone',
        whoCanFindInSearch: 'everyone',
        whoCanSeeFullProfile: 'everyone'
    };

    const [saving, setSaving] = useState(false);

    const updateSetting = async (key: string, value: string) => {
        setSaving(true);
        try {
            await axios.put('/api/users/settings', {
                settings: { ...settings, [key]: value }
            });
            await refreshUser();
        } catch (e) {
            console.error("Failed to update privacy setting", e);
        }
        setSaving(false);
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Приватность</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Кто может писать вам (ЛС)</h3>
                <select 
                    className="settings-select" 
                    style={{width: '100%'}}
                    value={settings.whoCanDM}
                    onChange={(e) => updateSetting('whoCanDM', e.target.value)}
                    disabled={saving}
                >
                    <option value="everyone">Все пользователи</option>
                    <option value="server_members">Только участники общих серверов</option>
                    <option value="friends">Только друзья</option>
                    <option value="nobody">Никто</option>
                </select>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Кто может найти ваш профиль в поиске</h3>
                <select 
                    className="settings-select" 
                    style={{width: '100%'}}
                    value={settings.whoCanFindInSearch}
                    onChange={(e) => updateSetting('whoCanFindInSearch', e.target.value)}
                    disabled={saving}
                >
                    <option value="everyone">Все</option>
                    <option value="friends_of_friends">Друзья друзей</option>
                    <option value="nobody">Никто</option>
                </select>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Кому отображается полный профиль</h3>
                <p className="settings-description">Неполный профиль скрывает активность, установленные приложения, основной сервер и время последнего входа.</p>
                <select 
                    className="settings-select" 
                    style={{width: '100%'}}
                    value={settings.whoCanSeeFullProfile}
                    onChange={(e) => updateSetting('whoCanSeeFullProfile', e.target.value)}
                    disabled={saving}
                >
                    <option value="everyone">Все пользователи</option>
                    <option value="friends">Только друзья</option>
                    <option value="small_servers">Участники небольших серверов (до 50 чел.)</option>
                    <option value="nobody">Никто</option>
                </select>
            </div>
        </div>
    );
};

export default PrivacySettings;
