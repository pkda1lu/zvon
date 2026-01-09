import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Server, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { CloseIcon, TrashIcon } from './Icons';
import ImageCropper from './ImageCropper';
import './ServerSettingsModal.css';

interface ServerSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
    onServerDelete: (serverId: string) => void;
}

type SettingsTab = 'overview' | 'members';

const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
    isOpen,
    onClose,
    server,
    onServerUpdate,
    onServerDelete
}) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>('overview');
    const [serverName, setServerName] = useState(server.name);
    const [serverDescription, setServerDescription] = useState(server.description || '');
    const [serverIcon, setServerIcon] = useState(server.icon);
    const [serverBanner, setServerBanner] = useState(server.banner);
    const [bannerColor, setBannerColor] = useState(server.bannerColor || '#5865f2');
    const [hasChanges, setHasChanges] = useState(false);
    const [loading, setLoading] = useState(false);

    const [cropModal, setCropModal] = useState<{
        isOpen: boolean;
        image: string;
        type: 'icon' | 'banner';
    }>({ isOpen: false, image: '', type: 'icon' });

    const [members, setMembers] = useState(server.members);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setHasChanges(
            serverName !== server.name ||
            serverDescription !== (server.description || '') ||
            bannerColor !== (server.bannerColor || '#5865f2')
        );
    }, [serverName, serverDescription, bannerColor, server.name, server.description, server.bannerColor]);

    useEffect(() => {
        setMembers(server.members);
    }, [server.members]);

    const handleSaveOverview = async () => {
        setLoading(true);
        try {
            const res = await axios.put(`/api/servers/${server._id}`, {
                name: serverName,
                description: serverDescription,
                bannerColor: bannerColor
            });
            onServerUpdate(res.data);
            setHasChanges(false);
        } catch (err) {
            alert('Ошибка при сохранении настроек');
        } finally {
            setLoading(false);
        }
    };

    const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCropModal({ isOpen: true, image: reader.result as string, type: 'icon' });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCropModal({ isOpen: true, image: reader.result as string, type: 'banner' });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleCropComplete = async (croppedBlob: Blob) => {
        const type = cropModal.type;
        setCropModal(prev => ({ ...prev, isOpen: false }));
        const formData = new FormData();
        formData.append(type === 'icon' ? 'icon' : 'banner', croppedBlob, `${type}.jpg`);

        try {
            setLoading(true);
            const endpoint = `/api/servers/${server._id}/${type === 'icon' ? 'icon' : 'banner'}`;
            const res = await axios.post(endpoint, formData);
            if (type === 'icon') {
                setServerIcon(res.data.icon);
                onServerUpdate({ ...server, icon: res.data.icon });
            } else {
                setServerBanner(res.data.banner);
                onServerUpdate({ ...server, banner: res.data.banner });
            }
        } catch (err) {
            alert(`Ошибка при загрузке ${type === 'icon' ? 'иконки' : 'баннера'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteServer = async () => {
        if (window.confirm('Вы уверены, что хотите удалить сервер? Это действие необратимо.')) {
            try {
                await axios.delete(`/api/servers/${server._id}`);
                onServerDelete(server._id);
                onClose();
            } catch (err) {
                alert('Ошибка при удалении сервера');
            }
        }
    };

    const handleKickMember = async (userId: string) => {
        if (window.confirm('Выгнать этого участника?')) {
            try {
                await axios.delete(`/api/servers/${server._id}/members/${userId}`);
                setMembers(members.filter(m => (m.user as any)._id !== userId));
            } catch (err) { }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="server-settings-modal-overlay">
            <div className="server-settings-modal">
                <div className="server-settings-sidebar">
                    <div className="sidebar-header">{server.name}</div>
                    <div className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Обзор</div>
                    <div className="sidebar-header">Управление</div>
                    <div className={`sidebar-item ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>Участники</div>
                    <div style={{ flex: 1 }} />
                    <div className="sidebar-item danger" onClick={handleDeleteServer}>Удалить сервер</div>
                </div>

                <div className="server-settings-content">
                    <div className="close-settings-button" onClick={onClose}>
                        <div className="close-icon-wrapper"><CloseIcon size={18} /></div>
                        <span className="close-text">ESC</span>
                    </div>

                    {activeTab === 'overview' && (
                        <div className="settings-section">
                            <h2>Обзор сервера</h2>
                            <div className="overview-grid">
                                <div className="avatar-upload-section">
                                    <div className="server-avatar-preview" onClick={() => fileInputRef.current?.click()}>
                                        {serverIcon ? (
                                            <img src={getAvatarUrl(serverIcon)!} alt="" />
                                        ) : (
                                            <span>{serverName.charAt(0).toUpperCase()}</span>
                                        )}
                                    </div>
                                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleIconUpload} />
                                </div>
                                <div className="input-section">
                                    <div className="settings-input-group">
                                        <label>Название сервера</label>
                                        <input className="settings-input" value={serverName} onChange={(e) => setServerName(e.target.value)} />
                                    </div>
                                    <div className="settings-input-group">
                                        <label>Описание</label>
                                        <textarea className="settings-input" style={{ height: '100px', resize: 'none' }} value={serverDescription} onChange={(e) => setServerDescription(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            <div className="banner-settings-section">
                                <h3>Баннер сервера</h3>
                                <div className="banner-selection-grid">
                                    <div className="banner-upload-box">
                                        <div className="banner-preview-small" style={{ backgroundColor: bannerColor, backgroundImage: serverBanner ? `url(${getAvatarUrl(serverBanner)})` : 'none', backgroundSize: 'cover' }} onClick={() => bannerInputRef.current?.click()}>
                                            {!serverBanner && <span>Загрузить баннер</span>}
                                        </div>
                                        <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleBannerUpload} />
                                    </div>
                                    <div className="color-selection-box">
                                        <label>Цвет баннера</label>
                                        <div className="color-picker-row">
                                            <input type="color" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} className="color-input-native" />
                                            <input type="text" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} className="settings-input color-text-input" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {hasChanges && (
                                <div className="save-changes-bar visible">
                                    <span>У вас есть несохраненные изменения!</span>
                                    <div className="save-changes-buttons">
                                        <button className="reset-button" onClick={() => { setServerName(server.name); setServerDescription(server.description || ''); setBannerColor(server.bannerColor || '#5865f2'); }}>Сбросить</button>
                                        <button className="save-button" onClick={handleSaveOverview} disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'members' && (
                        <div className="settings-section">
                            <h2>Участники ({members.length})</h2>
                            <div className="members-list-settings">
                                {members.map((member: any) => (
                                    <div key={member.user._id} className="member-row">
                                        <div className="member-user-info">
                                            <div className="member-avatar-small">
                                                {getAvatarUrl(member.user.avatar) ? <img src={getAvatarUrl(member.user.avatar)!} alt="" /> : <span>{member.user.username.charAt(0).toUpperCase()}</span>}
                                            </div>
                                            <span className="member-username">{member.user.username}</span>
                                        </div>
                                        <button className="action-button danger" onClick={() => handleKickMember(member.user._id)}><TrashIcon size={18} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {cropModal.isOpen && <ImageCropper image={cropModal.image} onCropComplete={handleCropComplete} onCancel={() => setCropModal(prev => ({ ...prev, isOpen: false }))} aspect={cropModal.type === 'icon' ? 1 : 16 / 9} />}
        </div>
    );
};

export default ServerSettingsModal;
