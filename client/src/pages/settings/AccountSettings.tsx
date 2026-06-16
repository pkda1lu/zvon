import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import axios from 'axios';

const AccountSettings: React.FC = () => {
    const { user, refreshUser, logout } = useAuth();
    const { alert, confirm, prompt } = useDialog();
    const [username, setUsername] = useState(user?.username || '');
    const [email, setEmail] = useState(user?.email || '');
    const [saving, setSaving] = useState(false);

    const handleSaveBasic = async () => {
        setSaving(true);
        try {
            await axios.put('/api/users/profile', { username });
            await refreshUser();
            await alert('Данные обновлены');
        } catch (e: any) {
            await alert(e.response?.data?.message || 'Ошибка обновления');
        }
        setSaving(false);
    };

    const handleChangePassword = async () => {
        const confirmed = await confirm('Вы уверены, что хотите изменить пароль? На вашу почту будет отправлен код подтверждения.');
        if (!confirmed) return;
        try {
            await axios.post('/api/auth/password-reset/request');
            await alert('Код для смены пароля отправлен на почту');
            // Here would be a prompt for the code and new password
        } catch (e: any) {
            await alert('Ошибка при запросе смены пароля');
        }
    };

    const handleToggle2FA = async () => {
        try {
            await axios.post('/api/auth/2fa/toggle', { enabled: !user?.is2FAEnabled });
            await refreshUser();
            await alert(`2FA ${!user?.is2FAEnabled ? 'включена' : 'выключена'}`);
        } catch (e: any) {
            await alert('Ошибка переключения 2FA');
        }
    };

    const handleDeleteAccount = async () => {
        const confirmed = await confirm('ВНИМАНИЕ! Это действие необратимо. Вы уверены, что хотите ПОЛНОСТЬЮ удалить свой аккаунт?');
        if (!confirmed) return;
        
        const secondConfirm = await prompt('Введите ваш никнейм для подтверждения удаления:');
        if (secondConfirm !== user?.username) {
            await alert('Никнейм введен неверно');
            return;
        }

        try {
            await axios.delete('/api/users/me');
            await alert('Ваш аккаунт был удален. Прощайте!');
            logout();
        } catch (e: any) {
            await alert('Ошибка при удалении аккаунта');
        }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Учётная запись</h2>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Уникальный никнейм</h3>
                <div className="settings-description">Это ваш логин для входа. Его можно изменить.</div>
                <input 
                    className="settings-input" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                />
                <button 
                    className="settings-btn" 
                    style={{marginTop: 16}}
                    onClick={handleSaveBasic}
                    disabled={saving}
                >
                    Изменить никнейм
                </button>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Электронная почта</h3>
                <div className="settings-description">Используется для восстановления и безопасности.</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input className="settings-input" value={email} readOnly style={{ opacity: 0.7 }} />
                    <button className="settings-btn" onClick={() => alert('Функция смены почты временно недоступна')}>Изменить</button>
                </div>
            </div>

            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Пароль и безопасность</h3>
                <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                    <button className="settings-btn" onClick={handleChangePassword}>Изменить пароль</button>
                </div>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Двухфакторная аутентификация (2FA)</h3>
                        <p>Отправлять код на почту при каждом входе в аккаунт.</p>
                    </div>
                    <button 
                        className={`settings-btn ${user?.is2FAEnabled ? 'settings-btn-danger' : ''}`}
                        onClick={handleToggle2FA}
                    >
                        {user?.is2FAEnabled ? 'Выключить 2FA' : 'Включить 2FA'}
                    </button>
                </div>
            </div>

            <div className="settings-card" style={{ border: '1px solid var(--set-danger)' }}>
                <h3 className="settings-section-title" style={{marginTop: 0, color: 'var(--set-danger)'}}>Удаление аккаунта</h3>
                <div className="settings-description">Это действие приведет к полной и безвозвратной очистке всех ваших данных.</div>
                <button className="settings-btn settings-btn-danger" onClick={handleDeleteAccount}>Удалить аккаунт</button>
            </div>
        </div>
    );
};

export default AccountSettings;
