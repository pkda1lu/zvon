import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import ProfilePreview from '../../components/ProfilePreview';
import SettingsPreviewContainer from '../../components/SettingsPreviewContainer';
import { CustomSelect } from './SettingsUI';
import ImageCropper from '../../components/ImageCropper';

interface ServerProfilesSettingsProps {
    initialServerId?: string;
}

const ServerProfilesSettings: React.FC<ServerProfilesSettingsProps> = ({ initialServerId }) => {
    const { user, refreshUser } = useAuth();
    const [selectedServerId, setSelectedServerId] = useState(initialServerId || '');
    const [nickname, setNickname] = useState('');
    const [bio, setBio] = useState('');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);
    const [bannerColor, setBannerColor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Cropping State
    const [cropModal, setCropModal] = useState<{ isOpen: boolean; image: string; target: 'avatar' | 'banner' }>({
        isOpen: false,
        image: '',
        target: 'avatar'
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialServerId) {
            setSelectedServerId(initialServerId);
        }
    }, [initialServerId]);

    const userServers = (user?.servers || []) as any[];

    useEffect(() => {
        if (selectedServerId) {
            fetchServerProfile();
        } else {
            setNickname('');
            setBio('');
            setAvatar(null);
            setBanner(null);
            setBannerColor(null);
        }
    }, [selectedServerId]);

    const fetchServerProfile = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/servers/${selectedServerId}/members/${user?._id}`);
            const member = res.data;
            setNickname(member.nickname || '');
            setBio(member.bio || '');
            setAvatar(member.avatar || null);
            setBanner(member.banner || null);
            setBannerColor(member.bannerColor || null);
        } catch (e) {
            console.error("Failed to fetch server profile", e);
        }
        setLoading(false);
    };

    const saveField = useCallback(async (field: string, value: any) => {
        if (!selectedServerId) return;
        try {
            await axios.put(`/api/servers/${selectedServerId}/members/${user?._id}`, {
                [field]: value
            });
            await refreshUser();
        } catch (e) {
            console.error(`Failed to auto-save server ${field}`, e);
        }
    }, [selectedServerId, user?._id, refreshUser]);

    useEffect(() => {
        if (!selectedServerId) return;
        const timer = setTimeout(() => {
            saveField('nickname', nickname || null);
        }, 1000);
        return () => clearTimeout(timer);
    }, [nickname, selectedServerId, saveField]);

    useEffect(() => {
        if (!selectedServerId) return;
        const timer = setTimeout(() => {
            saveField('bio', bio || null);
        }, 1000);
        return () => clearTimeout(timer);
    }, [bio, selectedServerId, saveField]);

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
        if (!selectedServerId) return;
        
        const formData = new FormData();
        formData.append(target, croppedBlob, target === 'avatar' ? 'avatar.jpg' : 'banner.jpg');
        
        try {
            const res = await axios.post(`/api/servers/${selectedServerId}/members/${user?._id}/${target}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (target === 'avatar') setAvatar(res.data.avatar);
            else setBanner(res.data.banner);
            await refreshUser();
            setCropModal({ ...cropModal, isOpen: false });
        } catch (e) {
            console.error(`Failed to upload server ${target}`, e);
        }
    };

    const handleDeleteAsset = async (type: 'avatar' | 'banner') => {
        if (!selectedServerId) return;
        try {
            await axios.delete(`/api/servers/${selectedServerId}/members/${user?._id}/${type}`);
            if (type === 'avatar') setAvatar(null);
            else setBanner(null);
            await refreshUser();
        } catch (e) {
            console.error(`Failed to delete server ${type}`, e);
        }
    };

    const selectedServer = userServers.find(s => s._id === selectedServerId);
    const currentMember = selectedServer?.members?.find((m: any) => (m.user?._id || m.user) === user?._id);

    const serverOptions = userServers.map(s => ({
        id: s._id,
        name: s.name,
        icon: s.icon,
        type: 'server' as const
    }));

    const bannerColors = ['#5865f2', '#ed4245', '#3ba55d', '#faa61a', '#eb459e', '#7289da', '#23272a', '#000000'];

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Профили на серверах</h2>
                
                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Выберите сервер</h3>
                    <CustomSelect 
                        options={serverOptions} 
                        value={selectedServerId} 
                        onChange={setSelectedServerId}
                        placeholder="Выберите сервер для настройки..."
                    />
                </div>

                {selectedServerId && (
                    <>
                        {/* 1. Визуал профиля */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Визуал на сервере</h3>
                            
                            {/* Аватар на сервере */}
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Аватар на сервере</h3>
                                    <p>Рекомендуемый размер: 512x512. Поддерживается GIF.</p>
                                </div>
                                <div className="settings-btn-group">
                                    <button className="settings-btn" onClick={() => fileInputRef.current?.click()}>
                                        {avatar ? 'Изменить' : 'Установить'}
                                    </button>
                                    {avatar && (
                                        <button className="settings-btn secondary danger" onClick={() => handleDeleteAsset('avatar')}>
                                            Удалить
                                        </button>
                                    )}
                                </div>
                            </div>
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileSelect(e, 'avatar')} />

                            <div className="settings-sidebar-divider" style={{margin: '20px 0'}} />

                            {/* Баннер на сервере */}
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Баннер на сервере</h3>
                                    <p>Рекомендуемый размер: 1920x640. Поддерживается GIF.</p>
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

                            {!banner && (
                                <div className="banner-color-picker" style={{marginTop: '15px'}}>
                                    <p style={{fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px'}}>Или выберите цвет:</p>
                                    <div className="color-swatches">
                                        <div 
                                            className={`color-swatch ${!bannerColor ? 'active' : ''}`} 
                                            style={{ backgroundColor: 'transparent', border: '1px dashed #555', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                                            onClick={() => {
                                                setBannerColor(null);
                                                saveField('bannerColor', null);
                                            }}
                                        >
                                            <div style={{ width: '1px', height: '100%', backgroundColor: '#555', transform: 'rotate(45deg)' }} />
                                        </div>
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
                                            value={bannerColor || '#5865f2'} 
                                            onChange={(e) => {
                                                setBannerColor(e.target.value);
                                                saveField('bannerColor', e.target.value);
                                            }} 
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. Никнейм на сервере */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Никнейм на сервере</h3>
                            <input 
                                className="settings-input" 
                                value={nickname} 
                                onChange={(e) => setNickname(e.target.value)} 
                                placeholder={user?.username}
                            />
                        </div>

                        {/* 3. О себе на сервере */}
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>О себе на сервере</h3>
                            <textarea 
                                className="settings-textarea"
                                style={{ resize: 'none' }}
                                value={bio}
                                onChange={(e) => {
                                    setBio(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onFocus={(e) => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                placeholder="Расскажите о себе на этом сервере..."
                            />
                        </div>
                    </>
                )}
            </div>

            <SettingsPreviewContainer 
                baseWidth={320} 
                title={selectedServer ? `Предпросмотр: ${selectedServer.name}` : 'Предпросмотр'}
            >
                {user && selectedServerId && (
                    <ProfilePreview 
                        user={user} 
                        memberData={{ 
                            nickname: nickname || undefined, 
                            bio: bio || undefined, 
                            avatar: avatar || undefined, 
                            banner: banner || undefined, 
                            bannerColor: bannerColor || undefined, 
                            roles: currentMember?.roles 
                        }} 
                        server={selectedServer}
                        type="server-compact" 
                    />
                )}
            </SettingsPreviewContainer>

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

export default ServerProfilesSettings;
