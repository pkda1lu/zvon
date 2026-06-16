import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import ProfilePreview from '../../components/ProfilePreview';

const ProfileSettings: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [primaryServer, setPrimaryServer] = useState(user?.primaryServer || '');
    
    const status = user?.status || 'offline';
    const isStreaming = user?.activity?.type === 'streaming';

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    // Sync state with user data if it changes externally
    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || '');
            setBio(user.bio || '');
            setPrimaryServer(user.primaryServer || '');
        }
    }, [user]);

    // Auto-save logic
    const saveField = useCallback(async (field: string, value: any) => {
        try {
            await axios.put('/api/users/profile', { [field]: value });
            // refreshUser(); // Optional: might be too frequent if called on every keystroke
        } catch (e) {
            console.error(`Failed to auto-save ${field}`, e);
        }
    }, []);

    // Debounce saves
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

    useEffect(() => {
        if (!user) return;
        if (primaryServer !== (user.primaryServer || '')) saveField('primaryServer', primaryServer);
    }, [primaryServer, user, saveField]);

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

    const userServers = user?.servers || [];

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Мой профиль</h2>
                
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
                    <select 
                        className="settings-select" 
                        style={{width: '100%'}}
                        value={primaryServer}
                        onChange={(e) => setPrimaryServer(e.target.value)}
                    >
                        <option value="">Не выбран</option>
                        {userServers.map(server => {
                            const sId = typeof server === 'string' ? server : (server as any)._id;
                            const sName = typeof server === 'string' ? `ID: ${sId}` : (server as any).name;
                            return (
                                <option key={sId} value={sId}>{sName}</option>
                            );
                        })}
                    </select>
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Статус</h3>
                    {isStreaming && (
                        <div className="streaming-status-row">
                            <span className="status-dot status-streaming" />
                            <span style={{ color: '#fff' }}>В эфире</span>
                        </div>
                    )}
                    <div className="status-selector" style={{ marginTop: isStreaming ? 16 : 0, opacity: isStreaming ? 0.5 : 1 }}>
                        <div className={`status-option ${status === 'online' ? 'active' : ''} ${isStreaming ? 'disabled' : ''}`} onClick={() => handleStatusChange('online')}>
                            <span className="status-dot status-online" /> В сети
                        </div>
                        <div className={`status-option ${status === 'away' ? 'active' : ''} ${isStreaming ? 'disabled' : ''}`} onClick={() => handleStatusChange('away')}>
                            <span className="status-dot status-away" /> Отошёл
                        </div>
                        <div className={`status-option ${status === 'busy' ? 'active' : ''} ${isStreaming ? 'disabled' : ''}`} onClick={() => handleStatusChange('busy')}>
                            <span className="status-dot status-busy" /> Занят
                        </div>
                        <div className={`status-option ${status === 'offline' ? 'active' : ''} ${isStreaming ? 'disabled' : ''}`} onClick={() => handleStatusChange('offline')}>
                            <span className="status-dot status-offline" /> Невидимый
                        </div>
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
                <h3 className="settings-section-title" style={{marginTop: 0}}>Предпросмотр (Нажми на аватар)</h3>
                {user && <ProfilePreview user={{...user, displayName, bio}} type="compact" />}
            </div>
        </div>
    );
};

export default ProfileSettings;
