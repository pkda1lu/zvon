import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import ProfilePreview from '../../components/ProfilePreview';
import SettingsPreviewContainer from '../../components/SettingsPreviewContainer';
import { CustomSelect } from './SettingsUI';
import ImageCropper from '../../components/ImageCropper';
import { getFullUrl } from '../../utils/avatar';

interface ServerProfilesSettingsProps {
    initialServerId?: string;
    targetUserId?: string;
    targetUser?: any;
}

const ServerProfilesSettings: React.FC<ServerProfilesSettingsProps> = ({ initialServerId, targetUserId, targetUser }) => {
    const { user, refreshUser } = useAuth();
    const [selectedServerId, setSelectedServerId] = useState(initialServerId || '');
    const [fetchedServer, setFetchedServer] = useState<any>(null);
    const [nickname, setNickname] = useState('');
    const [bio, setBio] = useState('');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);
    const [bannerColor, setBannerColor] = useState<string | null>(null);
    const [joinedAt, setJoinedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const isEditingOther = Boolean(targetUserId && user?._id && targetUserId !== user._id);
    const effectiveUserId = (isEditingOther ? targetUserId : user?._id) || '';

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
        if (selectedServerId && effectiveUserId) {
            fetchServerProfile();
        } else {
            setNickname('');
            setBio('');
            setAvatar(null);
            setBanner(null);
            setBannerColor(null);
            setJoinedAt(null);
        }
    }, [selectedServerId, effectiveUserId]);

    const fetchServerProfile = async () => {
        if (!selectedServerId || !effectiveUserId) return;
        setLoading(true);
        try {
            const [memberRes, serverRes] = await Promise.all([
                axios.get(`/api/servers/${selectedServerId}/members/${effectiveUserId}`),
                axios.get(`/api/servers/${selectedServerId}`).catch(() => null)
            ]);
            const member = memberRes.data;
            if (serverRes?.data) {
                setFetchedServer(serverRes.data);
            }
            setNickname(member.nickname || '');
            setBio(member.bio || '');
            setAvatar(member.avatar || null);
            setBanner(member.banner || null);
            setBannerColor(member.bannerColor || null);
            setJoinedAt(member.joinedAt || null);
        } catch (e) {
            console.error("Failed to fetch server profile", e);
        }
        setLoading(false);
    };

    const saveField = useCallback(async (field: string, value: any) => {
        if (!selectedServerId || !effectiveUserId) return;
        try {
            await axios.put(`/api/servers/${selectedServerId}/members/${effectiveUserId}`, {
                [field]: value
            });
            if (!isEditingOther) {
                await refreshUser();
            }
        } catch (e) {
            console.error(`Failed to auto-save server ${field}`, e);
        }
    }, [selectedServerId, effectiveUserId, isEditingOther, refreshUser]);

    useEffect(() => {
        if (!selectedServerId || loading) return;
        const timer = setTimeout(() => {
            saveField('nickname', nickname || null);
        }, 1000);
        return () => clearTimeout(timer);
    }, [nickname, selectedServerId, saveField, loading]);

    useEffect(() => {
        if (!selectedServerId || loading) return;
        const timer = setTimeout(() => {
            saveField('bio', bio || null);
        }, 1000);
        return () => clearTimeout(timer);
    }, [bio, selectedServerId, saveField, loading]);

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
        if (!selectedServerId || !effectiveUserId) return;
        
        const formData = new FormData();
        formData.append(target, croppedBlob, target === 'avatar' ? 'avatar.jpg' : 'banner.jpg');
        
        try {
            const res = await axios.post(`/api/servers/${selectedServerId}/members/${effectiveUserId}/${target}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (target === 'avatar') setAvatar(res.data.avatar);
            else setBanner(res.data.banner);
            if (!isEditingOther) {
                await refreshUser();
            }
            setCropModal({ ...cropModal, isOpen: false });
        } catch (e) {
            console.error(`Failed to upload server ${target}`, e);
        }
    };

    const handleDeleteAsset = async (type: 'avatar' | 'banner') => {
        if (!selectedServerId || !effectiveUserId) return;
        try {
            await axios.delete(`/api/servers/${selectedServerId}/members/${effectiveUserId}/${type}`);
            if (type === 'avatar') setAvatar(null);
            else setBanner(null);
            if (!isEditingOther) {
                await refreshUser();
            }
        } catch (e) {
            console.error(`Failed to delete server ${type}`, e);
        }
    };

    const selectedServer = userServers.find(s => s._id === selectedServerId) || fetchedServer;
    const currentMember = selectedServer?.members?.find((m: any) => String(m.user?._id || m.user) === String(effectiveUserId));
    const effectiveJoinedAt = joinedAt || currentMember?.joinedAt;

    const basePreviewUser = isEditingOther
        ? (targetUser || (typeof currentMember?.user === 'object' ? currentMember.user : null) || { _id: effectiveUserId, username: nickname || 'Пользователь' })
        : user;

    const previewUser = basePreviewUser ? {
        ...basePreviewUser,
        createdAt: basePreviewUser.createdAt || (effectiveUserId && effectiveUserId.length === 24 ? new Date(parseInt(effectiveUserId.substring(0, 8), 16) * 1000).toISOString() : undefined)
    } : null;

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
                <h2 className="settings-page-title">
                    {isEditingOther ? `Профиль на сервере: ${previewUser?.displayName || previewUser?.username || 'Участник'}` : 'Профили на серверах'}
                </h2>
                {isEditingOther && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '-8px', marginBottom: '16px' }}>
                        Вы редактируете профиль пользователя @{previewUser?.username} на сервере <strong>{selectedServer?.name}</strong>.
                    </p>
                )}
                
                {isEditingOther ? (
                    <div className="settings-card">
                        <h3 className="settings-section-title" style={{ marginTop: 0 }}>Сервер</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {selectedServer?.icon ? (
                                <img src={getFullUrl(selectedServer.icon) || undefined} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                            ) : (
                                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 600 }}>
                                    {selectedServer?.name?.charAt(0) || 'S'}
                                </div>
                            )}
                            <span style={{ fontWeight: 600 }}>{selectedServer?.name}</span>
                        </div>
                    </div>
                ) : (
                    <div className="settings-card">
                        <h3 className="settings-section-title" style={{ marginTop: 0 }}>Выберите сервер</h3>
                        <CustomSelect 
                            options={serverOptions} 
                            value={selectedServerId} 
                            onChange={setSelectedServerId}
                            placeholder="Выберите сервер для настройки..."
                        />
                    </div>
                )}

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
                                placeholder={previewUser?.username || user?.username}
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
                {previewUser && selectedServerId && (
                    <ProfilePreview 
                        user={previewUser} 
                        memberData={{ 
                            nickname: nickname || undefined, 
                            bio: bio || undefined, 
                            avatar: avatar || undefined, 
                            banner: banner || undefined, 
                            bannerColor: bannerColor || undefined, 
                            roles: currentMember?.roles,
                            joinedAt: effectiveJoinedAt || undefined
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
