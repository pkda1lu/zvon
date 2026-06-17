import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import ProfilePreview from '../../components/ProfilePreview';
import { ChoiceGroup, CustomSelect, GridPicker } from './SettingsUI';
import ImageCropper from '../../components/ImageCropper';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';

const AVAILABLE_BADGES = [
    { id: 'dev', label: 'Разработчик', image: './badges/developer.png' },
    { id: 'premium', label: 'Премиум', image: './badges/premium.png' },
    { id: 'moderator', label: 'Модератор', image: './badges/moderate.png' },
    { id: 'artist', label: 'Художник', image: './badges/painter.png' },
    { id: 'gamer', label: 'Геймер', image: './badges/gamer.png' },
    { id: 'meow', label: 'Котик', image: './badges/cat.png' },
    { id: 'staff', label: 'Персонал', image: './badges/personal%20stuff.png' },
    { id: 'bug_hunter', label: 'Охотник за багами', image: './badges/Bug.png' }
];

const ProfileSettings: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const { streamerModeEnabled, censorInfo } = useWindowSettings();
    const shouldCensor = streamerModeEnabled && censorInfo;

    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [primaryServer, setPrimaryServer] = useState(user?.primaryServer || '');
    const [bannerColor, setBannerColor] = useState(user?.bannerColor || '#5865f2');
    const [selectedBadges, setSelectedBadges] = useState<string[]>(user?.badges || []);

    // Cropping State
    const [cropModal, setCropModal] = useState<{ isOpen: boolean; image: string; target: 'avatar' | 'banner' }>({
        isOpen: false,
        image: '',
        target: 'avatar'
    });
    
    const status = user?.status || 'offline';
    const isStreaming = user?.activity?.type === 'streaming';

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    // Сбрасываем поля из user ТОЛЬКО при смене пользователя (логин/переключение
    // аккаунта), а не на каждое обновление объекта user — иначе обновления
    // (сокеты, фоновые сохранения) затирали то, что пользователь печатает прямо сейчас.
    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || '');
            setBio(user.bio || '');
            setBannerColor(user.bannerColor || '#5865f2');
            setSelectedBadges(user.badges || []);
            const pId = typeof user.primaryServer === 'string' ? user.primaryServer : user.primaryServer?._id;
            setPrimaryServer(pId || '');
        }
    }, [user?._id]);

    const saveField = useCallback(async (field: string, value: any) => {
        try {
            await axios.put('/api/users/profile', { [field]: value });
            if (field === 'bannerColor' || field === 'badges') await refreshUser();
        } catch (e) {
            console.error(`Failed to auto-save ${field}`, e);
        }
    }, [refreshUser]);

    // Держим актуальные user/saveField в ref, чтобы дебаунс-эффекты ниже не
    // перезапускались (и не порождали лишние запросы) при обновлении user.
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);
    const saveFieldRef = useRef(saveField);
    useEffect(() => { saveFieldRef.current = saveField; }, [saveField]);

    // Запрос только после паузы в наборе (1с), и только если значение реально
    // отличается от сохранённого на сервере.
    useEffect(() => {
        const timer = setTimeout(() => {
            if (userRef.current && displayName !== (userRef.current.displayName || '')) {
                saveFieldRef.current('displayName', displayName);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [displayName]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (userRef.current && bio !== (userRef.current.bio || '')) {
                saveFieldRef.current('bio', bio);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [bio]);

    const handlePrimaryServerChange = (sId: string) => {
        setPrimaryServer(sId);
        saveField('primaryServer', sId || null);
    };

    const handleStatusChange = async (newStatus: string) => {
        if (isStreaming) return;
        try {
            await axios.put('/api/users/status', { status: newStatus });
            await refreshUser();
        } catch (e) {
            console.error("Failed to set status", e);
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
        const formData = new FormData();
        formData.append(target, croppedBlob, target === 'avatar' ? 'avatar.jpg' : 'banner.jpg');
        
        try {
            await axios.post(`/api/users/${target}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            await refreshUser();
            setCropModal({ ...cropModal, isOpen: false });
        } catch (e) {
            console.error(`Failed to upload ${target}`, e);
        }
    };

    const handleDeleteAsset = async (type: 'avatar' | 'banner') => {
        try {
            await axios.delete(`/api/users/${type}`);
            await refreshUser();
        } catch (e) {
            console.error(`Failed to delete ${type}`, e);
        }
    };

    const handleBadgeToggle = (badgeId: string) => {
        // Single select constraint
        const newBadges = selectedBadges.includes(badgeId) ? [] : [badgeId];
        setSelectedBadges(newBadges);
        saveField('badges', newBadges);
    };

    const userServers = (user?.servers || []) as any[];
    const serverOptions = [
        { id: '', name: 'Не выбран' },
        ...userServers.map(s => ({
            id: typeof s === 'string' ? s : s._id,
            name: typeof s === 'string' ? s : s.name,
            icon: typeof s === 'string' ? undefined : s.icon,
            type: 'server' as const
        }))
    ];

    const statusOptions = [
        { value: 'online', label: 'В сети', color: '#23a559', icon: <div className="status-dot status-online" style={{margin:0}} /> },
        { value: 'away', label: 'Отошёл', color: '#f0b232', icon: <div className="status-dot status-away" style={{margin:0}} /> },
        { value: 'busy', label: 'Занят', color: '#f23f42', icon: <div className="status-dot status-busy" style={{margin:0}} /> },
        { value: 'offline', label: 'Невидимый', color: '#80848e', icon: <div className="status-dot status-offline" style={{margin:0}} /> },
    ];

    const bannerColors = ['#5865f2', '#ed4245', '#3ba55d', '#faa61a', '#eb459e', '#7289da', '#23272a', '#000000'];

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Общий профиль</h2>
                
                {/* 1. Визуал профиля (ОБЪЕДИНЕНО) */}
                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Визуал профиля</h3>
                    
                    {/* Аватар */}
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Аватар</h3>
                            <p>Рекомендуемый размер: 512x512. Поддерживается GIF.</p>
                        </div>
                        <div className="settings-btn-group">
                            <button className="settings-btn" onClick={() => fileInputRef.current?.click()}>
                                {user?.avatar ? 'Изменить' : 'Установить'}
                            </button>
                            {user?.avatar && (
                                <button className="settings-btn secondary danger" onClick={() => handleDeleteAsset('avatar')}>
                                    Удалить
                                </button>
                            )}
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileSelect(e, 'avatar')} />

                    <div className="settings-sidebar-divider" style={{margin: '20px 0'}} />

                    {/* Баннер */}
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Баннер</h3>
                            <p>Рекомендуемый размер: 1920x640. Поддерживается GIF.</p>
                        </div>
                        <div className="settings-btn-group">
                            <button className="settings-btn" onClick={() => bannerInputRef.current?.click()}>
                                {user?.banner ? 'Изменить' : 'Установить'}
                            </button>
                            {user?.banner && (
                                <button className="settings-btn secondary danger" onClick={() => handleDeleteAsset('banner')}>
                                    Удалить
                                </button>
                            )}
                        </div>
                    </div>
                    <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileSelect(e, 'banner')} />
                    
                    {/* Цвет баннера (ТОЛЬКО ЕСЛИ НЕТ ИЗОБРАЖЕНИЯ) */}
                    {!user?.banner && (
                        <div className="banner-color-picker" style={{marginTop: '15px'}}>
                            <p style={{fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px'}}>Или выберите цвет:</p>
                            <div className="color-swatches">
                                {bannerColors.map(c => (
                                    <div 
                                        key={c} 
                                        className={`color-swatch ${bannerColor === c ? 'active' : ''}`} 
                                        style={{ backgroundColor: c }} 
                                        onClick={() => {
                                            setBannerColor(c);
                                            saveField('bannerColor', c);
                                        }}
                                    />
                                ))}
                                <input 
                                    type="color" 
                                    className="color-input-custom" 
                                    value={bannerColor} 
                                    onChange={(e) => {
                                        setBannerColor(e.target.value);
                                        saveField('bannerColor', e.target.value);
                                    }} 
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Отображаемый никнейм */}
                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Отображаемый никнейм</h3>
                    <input 
                        className="settings-input" 
                        value={displayName} 
                        onChange={(e) => setDisplayName(e.target.value)} 
                        placeholder="Как вас будут видеть другие"
                    />
                </div>

                {/* 3. О себе */}
                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>О себе</h3>
                    <textarea 
                        className="settings-textarea"
                        style={{ resize: 'none' }}
                        value={shouldCensor ? 'Скрыто в режиме стримера' : bio}
                        onChange={(e) => {
                            if (shouldCensor) return;
                            setBio(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onFocus={(e) => {
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        placeholder="Расскажите о себе..."
                        disabled={shouldCensor}
                    />
                </div>

                {/* 4. Статус */}
                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Статус</h3>
                    <div className="status-selection-container">
                        <div style={{ opacity: isStreaming ? 0.5 : 1, pointerEvents: isStreaming ? 'none' : 'auto', width: '100%' }}>
                            <ChoiceGroup 
                                options={statusOptions} 
                                value={status} 
                                onChange={handleStatusChange}
                                className="full-width" 
                            />
                        </div>
                        {isStreaming && (
                            <div className="streaming-status-info-row">
                                <div className="streaming-status-content">
                                    <span className="status-dot status-streaming" />
                                    <span style={{ color: '#fff', fontWeight: 600 }}>В эфире</span>
                                </div>
                                <div className="streaming-status-details">
                                    Вы сейчас проводите трансляцию. Смена статуса недоступна.
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 5. Значки (SINGLE SELECT) */}
                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Значки профиля</h3>
                    <GridPicker 
                        items={AVAILABLE_BADGES} 
                        selectedIds={selectedBadges} 
                        onToggle={handleBadgeToggle}
                        multi={false}
                    />
                </div>

                {/* 6. Основной сервер */}
                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Основной сервер</h3>
                    <div style={{ opacity: shouldCensor ? 0.5 : 1, pointerEvents: shouldCensor ? 'none' : 'auto' }}>
                        <CustomSelect 
                            options={serverOptions} 
                            value={primaryServer} 
                            onChange={handlePrimaryServerChange}
                            placeholder={shouldCensor ? 'Скрыто в режиме стримера' : "Выберите основной сервер..."}
                        />
                    </div>
                </div>
            </div>

            <div className="settings-preview-column">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Предпросмотр</h3>
                {user && <ProfilePreview user={{...user, displayName, bio, bannerColor, badges: selectedBadges}} type="compact" />}
            </div>

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

export default ProfileSettings;
