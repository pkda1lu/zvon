import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { SettingsToggle } from './SettingsUI';
import { useDialog } from '../../contexts/DialogContext';
import { MailIcon, LockIcon, TrashIcon, CheckIcon, CloseIcon } from '../../components/Icons';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { motion, AnimatePresence } from 'framer-motion';

interface ConsentRecord {
    _id: string;
    purpose: string;
    documentVersion: string;
    granted: boolean;
    grantedAt: string;
    revokedAt: string | null;
}

const PURPOSE_LABELS: Record<string, string> = {
    personal_data: 'Обработка персональных данных',
    cross_border: 'Трансграничная передача',
    marketing: 'Информационные и рекламные сообщения',
};

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
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Personal data state
    const [consents, setConsents] = useState<ConsentRecord[]>([]);
    const [personalDataBusy, setPersonalDataBusy] = useState(false);
    const [personalDataMessage, setPersonalDataMessage] = useState<string | null>(null);
    const [personalDataError, setPersonalDataError] = useState<string | null>(null);

    const shouldCensor = streamerModeEnabled && censorInfo;

    const loadConsents = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/personal-data/consents');
            setConsents(Array.isArray(data) ? data : []);
        } catch {
            // Отсутствие истории согласий не повод показывать ошибку на всю страницу.
        }
    }, []);

    useEffect(() => {
        loadConsents();
    }, [loadConsents]);

    const handleExport = async () => {
        setPersonalDataBusy(true);
        setPersonalDataError(null);
        setPersonalDataMessage(null);
        try {
            const res = await axios.get('/api/personal-data/export', { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zvon-мои-данные.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            setPersonalDataMessage('Файл с вашими данными загружен.');
        } catch {
            setPersonalDataError('Не удалось сформировать выгрузку. Попробуйте позже.');
        } finally {
            setPersonalDataBusy(false);
        }
    };

    const handleRevokeMarketing = async () => {
        setPersonalDataBusy(true);
        setPersonalDataError(null);
        setPersonalDataMessage(null);
        try {
            await axios.post('/api/personal-data/consents/revoke', { purpose: 'marketing' });
            setPersonalDataMessage('Согласие на рассылку отозвано.');
            await loadConsents();
        } catch {
            setPersonalDataError('Не удалось отозвать согласие.');
        } finally {
            setPersonalDataBusy(false);
        }
    };

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
        if (!deletePassword) {
            setDeleteError('Введите пароль');
            return;
        }

        setIsDeleting(true);
        setDeleteError(null);
        try {
            await axios.post('/api/personal-data/delete-account', {
                password: deletePassword
            });
            await logout();
            window.location.href = '/';
        } catch (err: any) {
            setDeleteError(err?.response?.data?.message || 'Не удалось удалить учётную запись.');
        } finally {
            setIsDeleting(false);
        }
    };

    const hasMarketing = consents.some(c => c.purpose === 'marketing' && c.granted && !c.revokedAt);

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

            <div className="settings-card">
                <h3 className="settings-section-title" style={{ marginTop: 0 }}>Мои персональные данные</h3>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Выгрузить мои данные</h3>
                        <p>
                            Файл со сведениями, которые о вас хранятся: профиль, сессии и устройства,
                            согласия, ваши сообщения. Сообщения других пользователей в выгрузку не входят.
                        </p>
                    </div>
                    <button className="settings-btn" disabled={personalDataBusy} onClick={handleExport}>
                        Скачать
                    </button>
                </div>

                {consents.length > 0 && (
                    <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'block' }}>
                        <div className="settings-row-text">
                            <h3>Выданные согласия</h3>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-dim)' }}>
                            {consents.map(c => (
                                <div key={c._id} style={{ padding: '4px 0' }}>
                                    {PURPOSE_LABELS[c.purpose] || c.purpose}
                                    {' — редакция '}{c.documentVersion}
                                    {', '}{new Date(c.grantedAt).toLocaleDateString('ru-RU')}
                                    {c.revokedAt || !c.granted ? ' (отозвано)' : ''}
                                </div>
                            ))}
                        </div>
                        {hasMarketing && (
                            <button className="settings-btn" disabled={personalDataBusy} onClick={handleRevokeMarketing} style={{ marginTop: 12 }}>
                                Отозвать согласие на рассылку
                            </button>
                        )}
                    </div>
                )}

                {(personalDataMessage || personalDataError) && (
                    <div className="settings-row-text" style={{ marginTop: 12 }}>
                        <p style={{ color: personalDataError ? 'var(--danger)' : 'var(--text-dim)' }}>
                            {personalDataError || personalDataMessage}
                        </p>
                    </div>
                )}
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
                                <p style={{ fontSize: '13px', marginBottom: '8px' }}>Для подтверждения введите пароль от аккаунта:</p>
                                <input 
                                    type="password"
                                    className={`settings-input ${deleteError ? 'error' : ''}`}
                                    value={deletePassword}
                                    onChange={e => {
                                        setDeletePassword(e.target.value);
                                        setDeleteError(null);
                                    }}
                                    placeholder="Введите пароль..."
                                    autoComplete="current-password"
                                    autoFocus
                                />
                                {deleteError && (
                                    <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                                        {deleteError}
                                    </div>
                                )}
                            </div>
                            <div className="custom-dialog-actions">
                                <button 
                                    className="custom-dialog-button cancel" 
                                    disabled={isDeleting}
                                    onClick={() => {
                                        setShowDeleteModal(false);
                                        setDeletePassword('');
                                        setDeleteError(null);
                                    }}
                                >
                                    Отмена
                                </button>
                                <button 
                                    className="custom-dialog-button confirm" 
                                    style={{ background: 'var(--danger)' }}
                                    disabled={isDeleting || !deletePassword}
                                    onClick={handleDeleteAccountAction}
                                >
                                    {isDeleting ? 'Удаление...' : 'Удалить навсегда'}
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
