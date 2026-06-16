import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import ProfilePreview from '../../components/ProfilePreview';
import { CustomSelect } from './SettingsUI';

const ServerProfilesSettings: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const [selectedServerId, setSelectedServerId] = useState('');
    const [nickname, setNickname] = useState('');
    const [bio, setBio] = useState('');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [banner, setBanner] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const userServers = (user?.servers || []) as any[];

    useEffect(() => {
        if (selectedServerId) {
            fetchServerProfile();
        } else {
            setNickname('');
            setBio('');
            setAvatar(null);
            setBanner(null);
        }
    }, [selectedServerId]);

    const fetchServerProfile = async () => {
        setLoading(true);
        try {
            const server = userServers.find(s => s._id === selectedServerId);
            if (server && server.members) {
                const member = server.members.find((m: any) => (m.user?._id || m.user) === user?._id);
                if (member) {
                    setNickname(member.nickname || '');
                    setBio(member.bio || '');
                    setAvatar(member.avatar || null);
                    setBanner(member.banner || null);
                }
            } else {
                const res = await axios.get(`/api/servers/${selectedServerId}/members/${user?._id}`);
                const member = res.data;
                setNickname(member.nickname || '');
                setBio(member.bio || '');
                setAvatar(member.avatar || null);
                setBanner(member.banner || null);
            }
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
        } catch (e) {
            console.error(`Failed to auto-save server ${field}`, e);
        }
    }, [selectedServerId, user?._id]);

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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
        const file = event.target.files?.[0];
        if (!file || !selectedServerId) return;
        const formData = new FormData();
        formData.append(type, file);
        try {
            const res = await axios.post(`/api/servers/${selectedServerId}/members/${user?._id}/${type}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (type === 'avatar') setAvatar(res.data.avatar);
            else setBanner(res.data.banner);
            await refreshUser();
        } catch (e) {
            console.error(`Failed to upload server ${type}`, e);
        }
    };

    const selectedServer = userServers.find(s => s._id === selectedServerId);
    const currentMember = selectedServer?.members?.find((m: any) => (m.user?._id || m.user) === user?._id);

    const serverOptions = userServers.map(s => ({
        id: s._id,
        name: s.name,
        icon: s.icon
    }));

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
                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Никнейм на сервере</h3>
                            <input 
                                className="settings-input" 
                                value={nickname} 
                                onChange={(e) => setNickname(e.target.value)} 
                                placeholder={user?.username}
                            />
                        </div>

                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>О себе на сервере</h3>
                            <textarea 
                                className="settings-textarea"
                                value={bio}
                                onChange={(e) => {
                                    setBio(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                placeholder="Расскажите о себе на этом сервере..."
                            />
                        </div>

                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Аватар сервера</h3>
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <p>Уникальный аватар для этого сервера.</p>
                                </div>
                                <button className="settings-btn" onClick={() => fileInputRef.current?.click()}>
                                    {avatar ? 'Изменить' : 'Установить'}
                                </button>
                            </div>
                            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, 'avatar')} />
                        </div>

                        <div className="settings-card">
                            <h3 className="settings-section-title" style={{marginTop: 0}}>Баннер сервера</h3>
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <p>Уникальный баннер для этого сервера.</p>
                                </div>
                                <button className="settings-btn" onClick={() => bannerInputRef.current?.click()}>
                                    {banner ? 'Изменить' : 'Установить'}
                                </button>
                            </div>
                            <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, 'banner')} />
                        </div>
                    </>
                )}
            </div>

            <div className="settings-preview-column">
                <h3 className="settings-section-title" style={{marginTop: 0}}>
                    {selectedServer ? `Предпросмотр: ${selectedServer.name}` : 'Предпросмотр'}
                </h3>
                {user && selectedServerId && (
                    <ProfilePreview 
                        user={user} 
                        memberData={{ nickname, bio, avatar, banner, roles: currentMember?.roles }} 
                        server={selectedServer}
                        type="server-compact" 
                    />
                )}
            </div>
        </div>
    );
};

export default ServerProfilesSettings;
