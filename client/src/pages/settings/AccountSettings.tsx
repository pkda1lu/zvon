import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { SettingsToggle } from './SettingsUI';
import { useDialog } from '../../contexts/DialogContext';
import { MailIcon, LockIcon, TrashIcon, CheckIcon, CloseIcon } from '../../components/Icons';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { motion, AnimatePresence } from 'framer-motion';

const AccountSettings: React.FC = () => {
    const { user, refreshUser, logout } = useAuth();
    const { alert, confirm, prompt } = useDialog();
    const { streamerModeEnabled, censorInfo } = useWindowSettings();
    
    const [username, setUsername] = useState(user?.username || '');
    const [isSavingUsername, setIsSavingUsername] = useState(false);
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [isCheckingUsername, setIsCheckingUsername] = useState(false);
    
    const [isEmailLoading, setIsEmailLoading] = useState(false);
    const [isPasswordLoading, setIsPasswordLoading] = useState(false);
    
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const shouldCensor = streamerModeEnabled && censorInfo;

    // Check username availability as user types
    useEffect(() => {
        if (username === user?.username || username.length < 3) {
            setUsernameError(null);
            return;
        }

        const timer = setTimeout(async () => {
            setIsCheckingUsername(true);
            try {
                const res = await axios.get(`/api/users/check-username/${username}`);
                if (!res.data.available) {
                    setUsernameError('Этот никнейм уже занят');
                } else {
                    setUsernameError(null);
                }
            } catch (err) {
                console.error("Username check failed", err);
            } finally {
                setIsCheckingUsername(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [username, user?.username]);

    const handleSaveUsername = async () => {
        if (username === user?.username) return;
        if (username.length < 3) return alert('Никнейм должен быть не короче 3 символов');
        if (usernameError) return alert(usernameError);
        
        setIsSavingUsername(true);
        try {
            await axios.put('/api/users/profile', { username });
            await refreshUser();
            alert('Никнейм успешно изменен');
        } catch (err: any) {
            alert(err.response?.data?.message || 'Ошибка при сохранении никнейма');
        } finally {
            setIsSavingUsername(false);
        }
    };

    const handleEmailChange = async () => {
        const newEmail = await prompt('Введите новый адрес электронной почты:', user?.email);
        if (!newEmail || newEmail === user?.email) return;

        setIsEmailLoading(true);
        try {
            await axios.post('/api/auth/email-change/request', { newEmail });
            const code = await prompt('Введите код подтверждения, отправленный на новую почту:');
            if (!code) return;

            await axios.post('/api/auth/email-change/verify', { code });
            await refreshUser();
            alert('Email успешно изменен');
        } catch (err: any) {
            alert(err.response?.data?.message || 'Ошибка при смене email');
        } finally {
            setIsEmailLoading(false);
        }
    };

    const handlePasswordChange = async () => {
        setIsPasswordLoading(true);
        try {
            // Using forgot-password as requested
            await axios.post('/api/auth/forgot-password', { email: user?.email });
            const code = await prompt('Код подтверждения отправлен на вашу почту. Введите его:');
            if (!code) return;

            const newPassword = await prompt('Введите новый пароль (минимум 8 символов):');
            if (!newPassword) return;
            if (newPassword.length < 8) return alert('Пароль слишком короткий');

            // Using reset-password which corresponds to forgot-password flow
            await axios.post('/api/auth/reset-password', { email: user?.email, code, password: newPassword });
            alert('Пароль успешно изменен. Теперь вы можете войти с новым паролем.');
            // Note: reset-password usually doesn't update the current session token, 
            // but the user can continue or we can force relogin.
        } catch (err: any) {
            alert(err.response?.data?.message || 'Ошибка при смене пароля');
        } finally {
            setIsPasswordLoading(false);
        }
    };

    const handleToggle2FA = async (val: boolean) => {
        try {
            await axios.post('/api/auth/toggle-2fa');
            await refreshUser();
        } catch (err) {
            alert('Не удалось изменить настройки 2FA');
        }
    };

    const handleDeleteAccountAction = async () => {
        if (deleteConfirmText !== user?.username) {
            setDeleteError('Введенный никнейм не совпадает');
            return;
        }

        try {
            await axios.delete('/api/users/me');
            await logout();
            window.location.href = '/';
        } catch (err) {
            setDeleteError('Ошибка при удалении аккаунта');
        }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Учётная запись</h2>
            
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Уникальный никнейм</h3>
                        <p>Ваш уникальный идентификатор. По нему можно войти в аккаунт и найти вас в списке друзей.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', position: 'relative' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input 
                            className={`settings-input ${usernameError ? 'error' : ''}`} 
                            value={shouldCensor ? 'user_hidden' : username} 
                            onChange={e => setUsername(e.target.value)}
                            placeholder="Введите никнейм..."
                            style={{ borderColor: usernameError ? 'var(--danger)' : undefined }}
                            disabled={shouldCensor}
                        />
                        {isCheckingUsername && (
                            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '12px' }}>
                                Проверка...
                            </div>
                        )}
                    </div>
                    <button 
                        className="settings-btn" 
                        onClick={handleSaveUsername}
                        disabled={isSavingUsername || username === user?.username || !!usernameError || isCheckingUsername}
                    >
                        {isSavingUsername ? '...' : <CheckIcon size={20} />}
                    </button>
                </div>
                {usernameError && <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>{usernameError}</div>}
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Электронная почта</h3>
                        <p>{shouldCensor ? 'email_hidden@hidden.com' : user?.email}</p>
                    </div>
                    <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }} onClick={handleEmailChange} disabled={isEmailLoading || shouldCensor}>
                        Изменить
                    </button>
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Пароль</h3>
                        <p>Обновите пароль для повышения безопасности аккаунта.</p>
                    </div>
                    <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }} onClick={handlePasswordChange} disabled={isPasswordLoading}>
                        Сменить пароль
                    </button>
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Двухфакторная аутентификация (2FA)</h3>
                        <p>Дополнительная защита аккаунта кодом, который приходит на почту при каждом входе.</p>
                    </div>
                    <SettingsToggle checked={user?.is2FAEnabled || false} onChange={handleToggle2FA} />
                </div>
            </div>

            <div className="settings-card" style={{ border: '1px solid rgba(255, 71, 87, 0.2)', background: 'rgba(255, 71, 87, 0.02)' }}>
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3 style={{ color: 'var(--danger)' }}>Удаление аккаунта</h3>
                        <p>Удаление аккаунта необратимо. Все ваши данные будут стерты без возможности восстановления.</p>
                    </div>
                    <button className="settings-btn settings-btn-danger" onClick={() => setShowDeleteModal(true)}>
                        Удалить аккаунт
                    </button>
                </div>
            </div>

            {/* Custom Account Deletion Modal */}
            <AnimatePresence>
                {showDeleteModal && (
                    <motion.div 
                        className="custom-dialog-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ zIndex: 20000 }}
                    >
                        <motion.div 
                            className="custom-dialog-container"
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            style={{ maxWidth: '440px' }}
                        >
                            <h3 className="custom-dialog-title" style={{ color: 'var(--danger)' }}>Удаление аккаунта</h3>
                            <div className="custom-dialog-message" style={{ textAlign: 'left' }}>
                                <p style={{ fontWeight: 800, marginBottom: '12px' }}>Вы уверены, что хотите удалить свой аккаунт?</p>
                                <ul style={{ paddingLeft: '20px', marginBottom: '16px', color: 'var(--text-dim)' }}>
                                    <li>Аккаунт восстановить невозможно</li>
                                    <li>Ваш уникальный никнейм освободится</li>
                                    <li>Все сообщения, сервера и друзья будут удалены</li>
                                </ul>
                                <p style={{ fontSize: '13px', marginBottom: '8px' }}>Для подтверждения введите ваш никнейм <strong>{user?.username}</strong>:</p>
                                <input 
                                    className={`settings-input ${deleteError ? 'error' : ''}`}
                                    value={deleteConfirmText}
                                    onChange={e => {
                                        setDeleteConfirmText(e.target.value);
                                        setDeleteError(null);
                                    }}
                                    placeholder="Введите никнейм..."
                                    autoFocus
                                />
                                {deleteError && (
                                    <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                                        {deleteError}
                                    </div>
                                )}
                            </div>
                            <div className="custom-dialog-actions">
                                <button className="custom-dialog-button cancel" onClick={() => setShowDeleteModal(false)}>
                                    Отмена
                                </button>
                                <button 
                                    className="custom-dialog-button confirm" 
                                    style={{ background: 'var(--danger)' }}
                                    onClick={handleDeleteAccountAction}
                                >
                                    Удалить навсегда
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AccountSettings;
