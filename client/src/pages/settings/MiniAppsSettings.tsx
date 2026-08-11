import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { getAvatarUrl, getFullUrl } from '../../utils/avatar';
import { CustomSelect, ChoiceGroup } from './SettingsUI';
import ImageCropper from '../../components/ImageCropper';
import SettingsPreviewContainer from '../../components/SettingsPreviewContainer';
import { PlusIcon, LayoutGridIcon, MonitorIcon, TrashIcon, CheckIcon, ExternalLinkIcon, CloseIcon } from '../../components/Icons';
import { motion, AnimatePresence } from 'framer-motion';
import '../../components/ShowcaseView.css';

const MiniAppsSettings: React.FC = () => {
    const { refreshUser } = useAuth();
    const [miniapps, setMiniapps] = useState<any[]>([]);
    const [selectedAppId, setSelectedAppId] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Edit state
    const [editName, setEditName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editActivityType, setEditActivityType] = useState<'playing' | 'listening' | 'watching' | 'using'>('playing');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);

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

    const fetchApps = async () => {
        try {
            const response = await axios.get('/api/miniapps/my');
            setMiniapps(response.data);
        } catch (e) { }
    };

    useEffect(() => {
        fetchApps();
    }, []);

    useEffect(() => {
        const selectedApp = miniapps.find(a => a._id === selectedAppId);
        if (selectedApp) {
            setEditName(selectedApp.name || '');
            setEditUrl(selectedApp.url || '');
            setEditDesc(selectedApp.description || '');
            setEditActivityType(selectedApp.activityType || 'playing');
            setAvatar(selectedApp.avatar || null);
            setBanner(selectedApp.banner || null);
        } else {
            setEditName('');
            setEditUrl('');
            setEditDesc('');
            setEditActivityType('playing');
            setAvatar(null);
            setBanner(null);
        }
    }, [selectedAppId, miniapps]);

    const saveField = useCallback(async (field: string, value: any) => {
        if (!selectedAppId) return;
        try {
            const res = await axios.patch(`/api/miniapps/${selectedAppId}`, {
                [field]: value
            });
            // Сервер возвращает актуальный объект (включая moderationStatus, который мог
            // смениться на pending при правке названия/домена) — мерджим его целиком.
            const updated = res.data?.miniApp;
            setMiniapps(prev => prev.map(a => a._id === selectedAppId
                ? (updated ? { ...a, ...updated } : { ...a, [field]: value })
                : a));
        } catch (e) {
            console.error(`Failed to auto-save mini-app ${field}`, e);
        }
    }, [selectedAppId]);

    // Auto-save logic
    useEffect(() => {
        if (!selectedAppId) return;
        const app = miniapps.find(a => a._id === selectedAppId);
        if (!app || app.name === editName) return;
        
        const timer = setTimeout(() => {
            saveField('name', editName);
        }, 1000);
        return () => clearTimeout(timer);
    }, [editName, selectedAppId, saveField, miniapps]);

    useEffect(() => {
        if (!selectedAppId) return;
        const app = miniapps.find(a => a._id === selectedAppId);
        if (!app || app.url === editUrl) return;

        const timer = setTimeout(() => {
            saveField('url', editUrl);
        }, 1000);
        return () => clearTimeout(timer);
    }, [editUrl, selectedAppId, saveField, miniapps]);

    useEffect(() => {
        if (!selectedAppId) return;
        const app = miniapps.find(a => a._id === selectedAppId);
        if (!app || app.description === editDesc) return;

        const timer = setTimeout(() => {
            saveField('description', editDesc);
        }, 1000);
        return () => clearTimeout(timer);
    }, [editDesc, selectedAppId, saveField, miniapps]);

    useEffect(() => {
        if (!selectedAppId) return;
        const app = miniapps.find(a => a._id === selectedAppId);
        if (!app || (app.activityType || 'playing') === editActivityType) return;

        saveField('activityType', editActivityType);
    }, [editActivityType, selectedAppId, saveField, miniapps]);

    const createApp = async () => {
        const name = await prompt('Введите название мини-приложения:', '');
        if (!name || !name.trim()) return;
        
        const url = await prompt('Введите URL мини-приложения (https://...):', 'https://');
        if (!url || !url.trim() || url === 'https://') return;

        setLoading(true);
        try {
            const res = await axios.post('/api/miniapps/create', { name, url });
            await fetchApps();
            setSelectedAppId(res.data.miniApp._id);
            await alert('Мини-приложение успешно создано!');
        } catch (e) {
            await alert('Ошибка создания мини-приложения');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAppAction = async () => {
        if (!selectedAppId) return;
        const app = miniapps.find(a => a._id === selectedAppId);
        if (deleteConfirmText !== app?.name) {
            setDeleteError('Введенное название не совпадает');
            return;
        }

        setLoading(true);
        try {
            await axios.delete(`/api/miniapps/${selectedAppId}`);
            setMiniapps(prev => prev.filter(a => a._id !== selectedAppId));
            setSelectedAppId('');
            setShowDeleteModal(false);
            setDeleteConfirmText('');
            await alert('Мини-приложение успешно удалено');
        } catch (e) {
            setDeleteError('Ошибка при удалении мини-приложения');
        } finally {
            setLoading(false);
        }
    };

    const togglePublish = async () => {
        if (!selectedAppId) return;
        try {
            const res = await axios.patch(`/api/miniapps/${selectedAppId}/publish`);
            await alert(res.data.message);
            await fetchApps();
        } catch (e) {
            await alert('Ошибка публикации');
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
        if (!selectedAppId) return;
        
        const formData = new FormData();
        formData.append(target, croppedBlob, target === 'avatar' ? 'avatar.jpg' : 'banner.jpg');
        
        setLoading(true);
        try {
            const res = await axios.post(`/api/miniapps/${selectedAppId}/${target}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (target === 'avatar') setAvatar(res.data.avatar);
            else setBanner(res.data.banner);
            
            setMiniapps(prev => prev.map(a => a._id === selectedAppId ? { ...a, [target]: res.data[target] } : a));
            setCropModal({ ...cropModal, isOpen: false });
        } catch (e) {
            console.error(`Failed to upload mini-app ${target}`, e);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAsset = async (type: 'avatar' | 'banner') => {
        if (!selectedAppId) return;
        try {
            await axios.delete(`/api/miniapps/${selectedAppId}/${type}`);
            if (type === 'avatar') setAvatar(null);
            else setBanner(null);
            setMiniapps(prev => prev.map(a => a._id === selectedAppId ? { ...a, [type]: null } : a));
        } catch (e) {
            console.error(`Failed to delete mini-app ${type}`, e);
        }
    };

    const appOptions = miniapps.map(a => ({
        id: a._id,
        name: a.name,
        icon: a.avatar,
        type: 'app' as const
    }));

    const selectedApp = miniapps.find(a => a._id === selectedAppId);

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Мои мини-приложения</h2>
                <p className="settings-description">
                    Создавайте и управляйте своими мини-приложениями.
                </p>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Выберите мини-приложение</h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <CustomSelect 
                                options={appOptions} 
                                value={selectedAppId} 
                                onChange={setSelectedAppId}
                                placeholder="Выберите мини-приложение для настройки..."
                            />
                        </div>
                        <button className="settings-btn" onClick={createApp} title="Создать новое мини-приложение">
                            <PlusIcon size={18} />
                            <span>Создать</span>
                        </button>
                    </div>
                </div>

                {selectedAppId && selectedApp && (
                    <>
                        {/* 1. Визуал мини-приложения */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Визуал мини-приложения</h3>
                            
                            {/* Аватар */}
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Аватар мини-приложения</h3>
                                    <p>Отображается на витрине и в меню мини-приложений.</p>
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
                                    <h3>Баннер мини-приложения</h3>
                                    <p>Фоновое изображение карточки мини-приложения на витрине.</p>
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

                        {/* 2. Название */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Название мини-приложения</h3>
                            <input 
                                className="settings-input" 
                                value={editName} 
                                onChange={(e) => setEditName(e.target.value)} 
                                placeholder="Название"
                            />
                        </div>

                        {/* 3. Описание */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Описание</h3>
                            <textarea 
                                className="settings-textarea"
                                style={{ resize: 'none' }}
                                value={editDesc}
                                onChange={(e) => {
                                    setEditDesc(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onFocus={(e) => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                placeholder="О чем ваше мини-приложение?"
                            />
                        </div>

                        {/* 3.5. Статус активности пользователей */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Статус активности</h3>
                            <p className="settings-description" style={{ marginBottom: '12px' }}>
                                Выберите, какой текст статуса будет отображаться в профиле пользователей, когда они находятся в вашем мини-приложении:
                            </p>
                            <ChoiceGroup 
                                options={[
                                    { value: 'playing', label: 'Играет в' },
                                    { value: 'listening', label: 'Слушает в' },
                                    { value: 'watching', label: 'Смотрит в' },
                                    { value: 'using', label: 'Использует' }
                                ]}
                                value={editActivityType}
                                onChange={(val) => setEditActivityType(val as any)}
                            />
                        </div>

                        {/* 4. Публикация */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Публикация на витрине</h3>
                            {(() => {
                                const isPending = !selectedApp.isPublished && selectedApp.moderationStatus === 'pending';
                                const isRejected = !selectedApp.isPublished && selectedApp.moderationStatus === 'rejected';
                                const isBlocked = !!selectedApp.isBlocked;
                                const statusLabel = isBlocked ? 'Заблокировано модерацией'
                                    : selectedApp.isPublished ? 'Опубликовано'
                                    : isPending ? 'На рассмотрении'
                                    : isRejected ? 'Отклонено модерацией'
                                    : 'Черновик';
                                const statusColor = isBlocked || isRejected ? 'var(--danger)'
                                    : selectedApp.isPublished ? 'var(--success, #2ecc71)'
                                    : isPending ? '#f0b232'
                                    : undefined;
                                return (
                                    <div className="settings-row">
                                        <div className="settings-row-text">
                                            <h3>Статус: <span style={{ color: statusColor }}>{statusLabel}</span></h3>
                                            {isPending ? (
                                                <p>Приложение проверяется модератором. После одобрения оно появится на витрине.</p>
                                            ) : isRejected ? (
                                                <p>Заявка отклонена{selectedApp.moderationReason ? `: ${selectedApp.moderationReason}` : ''}. Вы можете отправить её повторно.</p>
                                            ) : isBlocked ? (
                                                <p>Приложение снято с витрины модерацией{selectedApp.blockReason ? `: ${selectedApp.blockReason}` : ''}.</p>
                                            ) : (
                                                <p>Опубликованные мини-приложения доступны всем пользователям в меню «Витрина».</p>
                                            )}
                                        </div>
                                        {!isBlocked && (
                                            <button
                                                className={`settings-btn ${selectedApp.isPublished || isPending ? 'danger-glass' : 'success-glass'}`}
                                                onClick={togglePublish}
                                            >
                                                {selectedApp.isPublished ? 'Снять с витрины'
                                                    : isPending ? 'Отозвать заявку'
                                                    : 'Отправить на модерацию'}
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* 5. URL мини-приложения */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>URL мини-приложения</h3>
                            <input 
                                className="settings-input" 
                                value={editUrl} 
                                onChange={(e) => setEditUrl(e.target.value)} 
                                placeholder="https://..."
                            />
                            <p className="settings-hint" style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-dim)' }}>
                                Ссылка на веб-сайт вашего мини-приложения. Именно этот URL будет загружаться во фрейме при запуске.
                            </p>
                        </div>

                        {/* 6. Удаление */}
                        <div className="settings-card" style={{ border: '1px solid rgba(255, 71, 87, 0.2)', background: 'rgba(255, 71, 87, 0.02)' }}>
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3 style={{ color: 'var(--danger)' }}>Удаление мини-приложения</h3>
                                    <p>Это действие необратимо. Мини-приложение будет удалено навсегда для всех пользователей.</p>
                                </div>
                                <button className="settings-btn settings-btn-danger" onClick={() => setShowDeleteModal(true)}>
                                    Удалить мини-приложение
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <SettingsPreviewContainer baseWidth={340} title="Предпросмотр на витрине">
                {selectedAppId && selectedApp && (
                    <div className="showcase-profile-card" style={{ width: '100%', margin: 0 }}>
                        <div 
                            className="profile-card-banner" 
                            style={{ backgroundImage: banner ? `url(${getFullUrl(banner)})` : 'none', backgroundColor: 'var(--secondary-neon)' }}
                        >
                            <div className="profile-card-badge app">Приложение</div>
                        </div>
                        <div className="profile-card-content">
                            <div className="profile-card-header">
                                <div className="profile-card-avatar">
                                    {avatar ? <img src={getFullUrl(avatar)!} alt="" /> : <LayoutGridIcon size={28} color="var(--secondary-neon)" />}
                                </div>
                                <div className="profile-card-main-info">
                                    <div className="profile-card-name">{editName || selectedApp.name}</div>
                                    <div className="profile-card-bio">
                                        {editDesc || 'У этого приложения пока нет описания.'}
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
                                <button className="profile-action-btn secondary" type="button">
                                    <MonitorIcon size={18} />
                                    <span>Открыть</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </SettingsPreviewContainer>

            {/* App Deletion Modal */}
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
                            <h3 className="custom-dialog-title" style={{ color: 'var(--danger)' }}>Удаление мини-приложения</h3>
                            <div className="custom-dialog-message" style={{ textAlign: 'left' }}>
                                <p style={{ fontWeight: 800, marginBottom: '12px' }}>Вы уверены, что хотите удалить это мини-приложение?</p>
                                <ul style={{ paddingLeft: '20px', marginBottom: '16px', color: 'var(--text-dim)' }}>
                                    <li>Мини-приложение будет удалено навсегда</li>
                                    <li>Все данные мини-приложения будут стерты</li>
                                    <li>Пользователи больше не смогут его запустить</li>
                                </ul>
                                <p style={{ fontSize: '13px', marginBottom: '8px' }}>Для подтверждения введите название мини-приложения <strong>{selectedApp?.name}</strong>:</p>
                                <input 
                                    className={`settings-input ${deleteError ? 'error' : ''}`}
                                    value={deleteConfirmText}
                                    onChange={e => {
                                        setDeleteConfirmText(e.target.value);
                                        setDeleteError(null);
                                    }}
                                    placeholder="Введите название мини-приложения..."
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
                                    onClick={handleDeleteAppAction}
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

export default MiniAppsSettings;
