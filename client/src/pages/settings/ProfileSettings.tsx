import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import ProfilePreview from '../../components/ProfilePreview';
import { ChoiceGroup, CustomSelect } from './SettingsUI';

const ProfileSettings: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [primaryServer, setPrimaryServer] = useState(user?.primaryServer || '');
    
    const status = user?.status || 'offline';
    const isStreaming = user?.activity?.type === 'streaming';

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || '');
            setBio(user.bio || '');
            const pId = typeof user.primaryServer === 'string' ? user.primaryServer : user.primaryServer?._id;
            setPrimaryServer(pId || '');
        }
    }, [user]);

    const saveField = useCallback(async (field: string, value: any) => {
        try {
            await axios.put('/api/users/profile', { [field]: value });
        } catch (e) {
            console.error(`Failed to auto-save ${field}`, e);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        const timer = setTimeout(() => {
            if (displayName !== (user.displayName || '')) saveField('displayName', displayName);
        }, 1000);
        return () => clearTimeout(timer);
    }, [displayName, user, saveField]);

    useEffect(() => {
        if (!user) return;
        const timer = setTimeout(() => {
            if (bio !== (user.bio || '')) saveField('bio', bio);
        }, 1000);
        return () => clearTimeout(timer);
    }, [bio, user, saveField]);

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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
        const file = event.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append(type, file);
        try {
            await axios.post(`/api/users/${type}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            await refreshUser();
        } catch (e) {
            console.error(`Failed to upload ${type}`, e);
        }
    };

    const userServers = (user?.servers || []) as any[];
    const serverOptions = userServers.map(s => ({
        id: typeof s === 'string' ? s : s._id,
        name: typeof s === 'string' ? s : s.name,
        icon: typeof s === 'string' ? undefined : s.icon
    }));

    const statusOptions = [
        { value: 'online', label: 'В сети', color: '#23a559', icon: <div className="status-dot status-online" style={{margin:0}} /> },
        { value: 'away', label: 'Отошёл', color: '#f0b232', icon: <div className="status-dot status-away" style={{margin:0}} /> },
        { value: 'busy', label: 'Занят', color: '#f23f42', icon: <div className="status-dot status-busy" style={{margin:0}} /> },
        { value: 'offline', label: 'Невидимый', color: '#80848e', icon: <div className="status-dot status-offline" style={{margin:0}} /> },
    ];

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Общий профиль</h2>
                
                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Отображаемое имя</h3>
                    <input 
                        className="settings-input" 
                        value={displayName} 
                        onChange={(e) => setDisplayName(e.target.value)} 
                        placeholder="Как вас будут видеть другие"
                    />
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>О себе</h3>
                    <textarea 
                        className="settings-textarea"
                        value={bio}
                        onChange={(e) => {
                            setBio(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        placeholder="Расскажите о себе..."
                    />
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Основной сервер</h3>
                    <CustomSelect 
                        options={serverOptions} 
                        value={primaryServer} 
                        onChange={handlePrimaryServerChange}
                        placeholder="Выберите основной сервер..."
                    />
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Статус</h3>
                    {isStreaming && (
                        <div className="streaming-status-row">
                            <span className="status-dot status-streaming" />
                            <span style={{ color: '#fff', fontWeight: 600 }}>В эфире</span>
                        </div>
                    )}
                    <div style={{ opacity: isStreaming ? 0.5 : 1, pointerEvents: isStreaming ? 'none' : 'auto' }}>
                        <ChoiceGroup 
                            options={statusOptions} 
                            value={status} 
                            onChange={handleStatusChange} 
                        />
                    </div>
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Аватар</h3>
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <p>Рекомендуемый размер: 512x512.</p>
                        </div>
                        <button className="settings-btn" onClick={() => fileInputRef.current?.click()}>
                            {user?.avatar ? 'Изменить' : 'Установить'}
                        </button>
                    </div>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, 'avatar')} />
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Баннер</h3>
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <p>Рекомендуемый размер: 1920x480.</p>
                        </div>
                        <button className="settings-btn" onClick={() => bannerInputRef.current?.click()}>
                            {user?.banner ? 'Изменить' : 'Установить'}
                        </button>
                    </div>
                    <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, 'banner')} />
                </div>
            </div>

            <div className="settings-preview-column">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Предпросмотр</h3>
                {user && <ProfilePreview user={{...user, displayName, bio}} type="compact" />}
            </div>
        </div>
    );
};

export default ProfileSettings;
