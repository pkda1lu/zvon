import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { getAvatarUrl, getFullUrl } from '../../utils/avatar';
import { CustomSelect } from './SettingsUI';
import ImageCropper from '../../components/ImageCropper';
import SettingsPreviewContainer from '../../components/SettingsPreviewContainer';
import { PlusIcon, BotIcon, ShieldIcon, CopyIcon, TrashIcon, CheckIcon, ExternalLinkIcon, CloseIcon } from '../../components/Icons';
import { motion, AnimatePresence } from 'framer-motion';
import '../../components/ShowcaseView.css';

const BotsSettings: React.FC = () => {
    const { refreshUser } = useAuth();
    const [bots, setBots] = useState<any[]>([]);
    const [userServers, setUserServers] = useState<any[]>([]);
    const [selectedBotId, setSelectedBotId] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Edit state
    const [editName, setEditName] = useState('');
    const [editBio, setEditBio] = useState('');
    const [editPrimaryServer, setEditPrimaryServer] = useState('');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);
    
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [revealedToken, setRevealedToken] = useState(false);

    // Deletion modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Cropping State
    const [cropModal, setCropModal] = useState<{ isOpen: boolean; image: string; target: 'avatar' | 'banner' }>({
        isOpen: false,
        image: '',
        target: 'avatar'
    });

    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const { confirm, alert, prompt } = useDialog();

    const fetchBots = async () => {
        try {
            const response = await axios.get('/api/bots/my');
            setBots(response.data);
        } catch (e) { }
    };

    const fetchUserServers = async () => {
        try {
            const response = await axios.get('/api/servers/me');
            setUserServers(response.data);
        } catch (e) { }
    };

    useEffect(() => {
        fetchBots();
        fetchUserServers();
    }, []);

    useEffect(() => {
        const selectedBot = bots.find(b => b._id === selectedBotId);
        if (selectedBot) {
            setEditName(selectedBot.username || '');
            setEditBio(selectedBot.bio || '');
            setEditPrimaryServer(selectedBot.primaryServer || '');
            setAvatar(selectedBot.avatar || null);
            setBanner(selectedBot.banner || null);
            setRevealedToken(false);
        } else {
            setEditName('');
            setEditBio('');
            setEditPrimaryServer('');
            setAvatar(null);
            setBanner(null);
        }
    }, [selectedBotId, bots]);

    const saveField = useCallback(async (field: string, value: any) => {
        if (!selectedBotId) return;
        try {
            await axios.patch(`/api/bots/${selectedBotId}`, {
                [field]: value
            });
            // Update local state to avoid refetching everything
            setBots(prev => prev.map(b => b._id === selectedBotId ? { ...b, [field]: value } : b));
        } catch (e) {
            console.error(`Failed to auto-save bot ${field}`, e);
        }
    }, [selectedBotId]);

    // Auto-save logic
    useEffect(() => {
        if (!selectedBotId) return;
        const bot = bots.find(b => b._id === selectedBotId);
        if (!bot || bot.username === editName) return;
        
        const timer = setTimeout(() => {
            saveField('username', editName);
        }, 1000);
        return () => clearTimeout(timer);
    }, [editName, selectedBotId, saveField, bots]);

    useEffect(() => {
        if (!selectedBotId) return;
        const bot = bots.find(b => b._id === selectedBotId);
        if (!bot || bot.bio === editBio) return;

        const timer = setTimeout(() => {
            saveField('bio', editBio);
        }, 1000);
        return () => clearTimeout(timer);
    }, [editBio, selectedBotId, saveField, bots]);

    const handlePrimaryServerChange = (val: string) => {
        setEditPrimaryServer(val);
        saveField('primaryServer', val || null);
    };

    const createBot = async () => {
        const name = await prompt('Введите имя нового бота:', '');
        if (!name || !name.trim()) return;
        
        setLoading(true);
        try {
            const res = await axios.post('/api/bots/create', { name });
            await fetchBots();
            setSelectedBotId(res.data.bot.id);
            await alert('Бот успешно создан!');
        } catch (e) {
            await alert('Ошибка создания бота');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteBotAction = async () => {
        if (!selectedBotId) return;
        const bot = bots.find(b => b._id === selectedBotId);
        if (deleteConfirmText !== bot?.username) {
            setDeleteError('Введенное имя не совпадает');
            return;
        }

        setLoading(true);
        try {
            await axios.delete(`/api/bots/${selectedBotId}`);
            setBots(prev => prev.filter(b => b._id !== selectedBotId));
            setSelectedBotId('');
            setShowDeleteModal(false);
            setDeleteConfirmText('');
            await alert('Бот успешно удален');
        } catch (e) {
            setDeleteError('Ошибка при удалении бота');
        } finally {
            setLoading(false);
        }
    };

    const togglePublish = async () => {
        if (!selectedBotId) return;
        try {
            const res = await axios.patch(`/api/bots/${selectedBotId}/publish`);
            await alert(res.data.message);
            await fetchBots();
        } catch (e: any) {
            await alert(e.response?.data?.message || 'Ошибка публикации');
        }
    };

    const copyToken = async (token: string) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(token)
                .then(() => {
                    setCopiedToken(token);
                    setTimeout(() => setCopiedToken(null), 2000);
                })
                .catch(async err => {
                    await alert("Копирование не удалось.");
                });
        }
    };

    const regenerateToken = async () => {
        if (!selectedBotId) return;
        if (!(await confirm('Вы уверены? Старый токен перестанет работать.'))) return;
        
        try {
            const res = await axios.post(`/api/bots/${selectedBotId}/regenerate-token`);
            setBots(prev => prev.map(b => b._id === selectedBotId ? { ...b, botToken: res.data.token } : b));
            await alert('Токен успешно обновлен');
        } catch (e) {
            await alert('Ошибка при обновлении токена');
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, target: 'avatar' | 'banner') => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setCropModal({ isOpen: true, image: reader.result as string, target });
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const handleCropComplete = async (croppedBlob: Blob) => {
        const { target } = cropModal;
        if (!selectedBotId) return;
        
        const formData = new FormData();
        formData.append(target, croppedBlob, target === 'avatar' ? 'avatar.jpg' : 'banner.jpg');
        
        setLoading(true);
        try {
            const res = await axios.post(`/api/bots/${selectedBotId}/${target}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (target === 'avatar') setAvatar(res.data.avatar);
            else setBanner(res.data.banner);
            
            setBots(prev => prev.map(b => b._id === selectedBotId ? { ...b, [target]: res.data[target] } : b));
            setCropModal({ ...cropModal, isOpen: false });
        } catch (e) {
            console.error(`Failed to upload bot ${target}`, e);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAsset = async (type: 'avatar' | 'banner') => {
        if (!selectedBotId) return;
        try {
            await axios.delete(`/api/bots/${selectedBotId}/${type}`);
            if (type === 'avatar') setAvatar(null);
            else setBanner(null);
            setBots(prev => prev.map(b => b._id === selectedBotId ? { ...b, [type]: null } : b));
        } catch (e) {
            console.error(`Failed to delete bot ${type}`, e);
        }
    };

    const botOptions = bots.map(b => ({
        id: b._id,
        name: b.username,
        icon: b.avatar,
        type: 'bot' as const
    }));

    const serverOptions = [
        { id: '', name: 'Не выбран' },
        ...userServers.map(s => ({
            id: s._id,
            name: s.name,
            icon: s.icon,
            type: 'server' as const
        }))
    ];

    const selectedBot = bots.find(b => b._id === selectedBotId);

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Мои боты</h2>
                <p className="settings-description">
                    Создавайте и управляйте своими ботами для автоматизации.
                </p>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Выберите бота</h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <CustomSelect 
                                options={botOptions} 
                                value={selectedBotId} 
                                onChange={setSelectedBotId}
                                placeholder="Выберите бота для настройки..."
                            />
                        </div>
                        <button className="settings-btn" onClick={createBot} title="Создать нового бота">
                            <PlusIcon size={18} />
                            <span>Создать</span>
                        </button>
                    </div>
                </div>

                {selectedBotId && selectedBot && (
                    <>
                        {/* 1. Визуал бота */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Визуал бота</h3>
                            
                            {/* Аватар */}
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Аватар бота</h3>
                                    <p>Отображается в списках пользователей и сообщениях.</p>
                                </div>
                                <div className="settings-btn-group">
                                    <button className="settings-btn" onClick={() => avatarInputRef.current?.click()}>
                                        {avatar ? 'Изменить' : 'Установить'}
                                    </button>
                                    {avatar && (
                                        <button className="settings-btn secondary danger" onClick={() => handleDeleteAsset('avatar')}>
                                            Удалить
                                        </button>
                                    )}
                                </div>
                            </div>
                            <input type="file" ref={avatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileSelect(e, 'avatar')} />

                            <div className="settings-sidebar-divider" style={{margin: '20px 0'}} />

                            {/* Баннер */}
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Баннер бота</h3>
                                    <p>Фоновое изображение в профиле бота.</p>
                                </div>
                                <div className="settings-btn-group">
                                    <button className="settings-btn" onClick={() => bannerInputRef.current?.click()}>
                                        {banner ? 'Изменить' : 'Установить'}
                                    </button>
                                    {banner && (
                                        <button className="settings-btn secondary danger" onClick={() => handleDeleteAsset('banner')}>
                                            Удалить
                                        </button>
                                    )}
                                </div>
                            </div>
                            <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileSelect(e, 'banner')} />
                        </div>

                        {/* 2. Название бота */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Название бота</h3>
                            <input 
                                className="settings-input" 
                                value={editName} 
                                onChange={(e) => setEditName(e.target.value)} 
                                placeholder="Имя бота"
                            />
                        </div>

                        {/* 3. Описание бота */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Описание (Bio)</h3>
                            <textarea 
                                className="settings-textarea"
                                style={{ resize: 'none' }}
                                value={editBio}
                                onChange={(e) => {
                                    setEditBio(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onFocus={(e) => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                placeholder="Расскажите о том, что делает этот бот..."
                            />
                        </div>

                        {/* 4. Основной сервер */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Основной сервер</h3>
                            <CustomSelect 
                                options={serverOptions} 
                                value={editPrimaryServer} 
                                onChange={handlePrimaryServerChange}
                                placeholder="Выберите основной сервер..."
                            />
                            <p className="settings-hint" style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-dim)' }}>
                                Обычно это сервер разработчика или сервер тех-поддержки.
                            </p>
                        </div>

                        {/* 5. Управление витриной */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Публикация на витрине</h3>
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Статус: {selectedBot.isPublished ? 'Опубликован' : 'Черновик'}</h3>
                                    <p>Опубликованные боты доступны всем пользователям для добавления на свои сервера через «Витрину».</p>
                                </div>
                                <button className={`settings-btn ${selectedBot.isPublished ? 'danger-glass' : 'success-glass'}`} onClick={togglePublish}>
                                    {selectedBot.isPublished ? 'Снять с витрины' : 'Опубликовать'}
                                </button>
                            </div>
                        </div>

                        {/* 6. Токен бота */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Токен бота</h3>
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>API Access</h3>
                                    <p style={{ color: 'var(--danger)', fontWeight: 600 }}>Никому не сообщайте этот токен!</p>
                                </div>
                                <button className="settings-btn secondary" onClick={regenerateToken}>
                                    Обновить токен
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                <input 
                                    className="settings-input" 
                                    type={revealedToken ? 'text' : 'password'} 
                                    value={selectedBot.botToken} 
                                    readOnly 
                                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px' }}
                                />
                                <button className="settings-btn secondary" onClick={() => setRevealedToken(!revealedToken)}>
                                    {revealedToken ? 'Скрыть' : 'Показать'}
                                </button>
                            </div>
                        </div>

                        {/* 7. Удаление бота */}
                        <div className="settings-card" style={{ border: '1px solid rgba(255, 71, 87, 0.2)', background: 'rgba(255, 71, 87, 0.02)' }}>
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3 style={{ color: 'var(--danger)' }}>Удаление бота</h3>
                                    <p>Это действие необратимо. Бот будет удален со всех серверов и его токен перестанет работать.</p>
                                </div>
                                <button className="settings-btn settings-btn-danger" onClick={() => setShowDeleteModal(true)}>
                                    Удалить бота
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <SettingsPreviewContainer baseWidth={340} title="Предпросмотр на витрине">
                {selectedBotId && selectedBot && (
                    <div className="showcase-profile-card" style={{ width: '100%', margin: 0 }}>
                        <div 
                            className="profile-card-banner" 
                            style={{ backgroundImage: banner ? `url(${getFullUrl(banner)})` : 'none', backgroundColor: 'var(--primary-neon)' }}
                        >
                            <div className="profile-card-badge bot">Бот</div>
                        </div>
                        <div className="profile-card-content">
                            <div className="profile-card-header">
                                <div className="profile-card-avatar">
                                    {avatar ? <img src={getFullUrl(avatar)!} alt="" /> : <BotIcon size={28} color="var(--primary-neon)" />}
                                </div>
                                <div className="profile-card-main-info">
                                    <div className="profile-card-name">{editName || selectedBot.username}</div>
                                    <div className="profile-card-bio">
                                        {editBio || 'У этого бота пока нет описания.'}
                                    </div>
                                </div>
                            </div>
                            <div className="profile-card-actions">
                                <button
                                    className="report-icon-btn"
                                    title="Пожаловаться"
                                    type="button"
                                >
                                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                                        <line x1="4" y1="22" x2="4" y2="15"/>
                                    </svg>
                                </button>
                                <div className="action-button-container">
                                    <button className="profile-action-btn primary" type="button">
                                        <PlusIcon size={18} />
                                        <span>Добавить</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </SettingsPreviewContainer>

            {/* Bot Deletion Modal */}
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
                            <h3 className="custom-dialog-title" style={{ color: 'var(--danger)' }}>Удаление бота</h3>
                            <div className="custom-dialog-message" style={{ textAlign: 'left' }}>
                                <p style={{ fontWeight: 800, marginBottom: '12px' }}>Вы уверены, что хотите удалить этого бота?</p>
                                <ul style={{ paddingLeft: '20px', marginBottom: '16px', color: 'var(--text-dim)' }}>
                                    <li>Бот будет удален навсегда</li>
                                    <li>Токен станет недействительным</li>
                                    <li>Бот покинет все сервера</li>
                                </ul>
                                <p style={{ fontSize: '13px', marginBottom: '8px' }}>Для подтверждения введите имя бота <strong>{selectedBot?.username}</strong>:</p>
                                <input 
                                    className={`settings-input ${deleteError ? 'error' : ''}`}
                                    value={deleteConfirmText}
                                    onChange={e => {
                                        setDeleteConfirmText(e.target.value);
                                        setDeleteError(null);
                                    }}
                                    placeholder="Введите имя бота..."
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
                                    onClick={handleDeleteBotAction}
                                >
                                    Удалить навсегда
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {cropModal.isOpen && (
                <ImageCropper
                    image={cropModal.image}
                    cropShape="rect"
                    aspect={cropModal.target === 'avatar' ? 1 : 1920 / 640}
                    title={cropModal.target === 'avatar' ? 'Обрезка аватара' : 'Обрезка баннера'}
                    onCropComplete={handleCropComplete}
                    onCancel={() => setCropModal({ ...cropModal, isOpen: false })}
                />
            )}
        </div>
    );
};

export default BotsSettings;
