import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Server, User } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { CloseIcon, PlusIcon } from './Icons';
import './UserServerProfileModal.css';

interface UserServerProfileModalProps {
    server: Server;
    user: User;
    onClose: () => void;
    onUpdate: (updatedServer: Server) => void;
}

const UserServerProfileModal: React.FC<UserServerProfileModalProps> = ({ server, user, onClose, onUpdate }) => {
    const member = server.members.find(m => m.user._id === user._id);

    const [nickname, setNickname] = useState(member?.nickname || '');
    const [bio, setBio] = useState(member?.bio || '');
    const [avatar, setAvatar] = useState(member?.avatar || null);
    const [banner, setBanner] = useState(member?.banner || null);
    const [saving, setSaving] = useState(false);

    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
        if (e.target.files && e.target.files[0]) {
            const formData = new FormData();
            formData.append('files', e.target.files[0]);

            try {
                const res = await axios.post('/api/upload-files', formData);
                const fileUrl = res.data[0].url;
                if (type === 'avatar') setAvatar(fileUrl);
                else setBanner(fileUrl);
            } catch (err) {
                console.error('Upload failed', err);
                alert('Ошибка загрузки');
            }
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await axios.put(`/api/servers/${server._id}/members/${user._id}`, {
                nickname,
                bio,
                avatar,
                banner
            });

            // Re-fetch server or use the returned member to update local state
            const updatedServerRes = await axios.get(`/api/servers/${server._id}`);
            onUpdate(updatedServerRes.data);
            onClose();
        } catch (err) {
            console.error('Save failed', err);
            alert('Не удалось сохранить изменения');
        } finally {
            setSaving(false);
        }
    };

    const resetToDefault = (type: 'avatar' | 'banner' | 'nickname' | 'bio') => {
        if (type === 'avatar') setAvatar(null);
        else if (type === 'banner') setBanner(null);
        else if (type === 'nickname') setNickname('');
        else if (type === 'bio') setBio('');
    };

    return (
        <div className="user-server-profile-overlay" onClick={onClose}>
            <div className="user-server-profile-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Профиль сервера</h3>
                    <button className="close-btn" onClick={onClose}><CloseIcon /></button>
                </div>

                <div className="modal-content">
                    <div className="profile-preview-section">
                        <div className="section-label">ПРЕДПРОСМОТР</div>
                        <div className="profile-preview-card">
                            <div
                                className="preview-banner"
                                style={{
                                    backgroundImage: banner ? `url(${getFullUrl(banner)})` : (user.banner ? `url(${getFullUrl(user.banner)})` : 'none'),
                                    backgroundColor: '#5865f2'
                                }}
                            >
                                <button className="edit-banner-btn" onClick={() => bannerInputRef.current?.click()}>
                                    Изменить баннер
                                </button>
                            </div>
                            <div className="preview-header">
                                <div className="preview-avatar-container">
                                    <div className="preview-avatar">
                                        <img src={getAvatarUrl(avatar || user.avatar)!} alt="" />
                                        <div className="avatar-edit-overlay" onClick={() => avatarInputRef.current?.click()}>
                                            <PlusIcon size={20} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="preview-info">
                                <div className="preview-name">{nickname || user.username}</div>
                                <div className="preview-username">{user.username}</div>
                                <div className="preview-divider" />
                                <div className="preview-bio-label">О СЕБЕ</div>
                                <div className="preview-bio">{bio || user.bio || 'Нет описания'}</div>
                            </div>
                        </div>
                    </div>

                    <div className="profile-edit-section">
                        <div className="input-group">
                            <label>НИКНЕЙМ СЕРВЕРА</label>
                            <div className="input-with-reset">
                                <input
                                    type="text"
                                    value={nickname}
                                    onChange={e => setNickname(e.target.value)}
                                    placeholder={user.username}
                                />
                                {nickname && <button className="reset-link" onClick={() => resetToDefault('nickname')}>Сбросить никнейм</button>}
                            </div>
                        </div>

                        <div className="input-group">
                            <label>АВАТАР СЕРВЕРА</label>
                            <div className="avatar-actions">
                                <button className="action-btn" onClick={() => avatarInputRef.current?.click()}>Изменить аватар</button>
                                {avatar && <button className="reset-link" onClick={() => resetToDefault('avatar')}>Сбросить аватар</button>}
                            </div>
                        </div>

                        <div className="input-group">
                            <label>БАННЕР СЕРВЕРА</label>
                            <div className="banner-actions">
                                <button className="action-btn" onClick={() => bannerInputRef.current?.click()}>Изменить баннер</button>
                                {banner && <button className="reset-link" onClick={() => resetToDefault('banner')}>Сбросить баннер</button>}
                            </div>
                        </div>

                        <div className="input-group">
                            <label>О СЕБЕ НА СЕРВЕРЕ</label>
                            <textarea
                                value={bio}
                                onChange={e => setBio(e.target.value)}
                                placeholder="Расскажите что-нибудь о себе в этом сообществе..."
                                maxLength={300}
                            />
                            <div className="char-count">{300 - bio.length}</div>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="cancel-btn" onClick={onClose}>Отмена</button>
                    <button className="save-btn" onClick={handleSave} disabled={saving}>
                        {saving ? 'Сохранение...' : 'Сохранить изменения'}
                    </button>
                </div>

                <input
                    type="file"
                    ref={avatarInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={e => handleFileUpload(e, 'avatar')}
                />
                <input
                    type="file"
                    ref={bannerInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={e => handleFileUpload(e, 'banner')}
                />
            </div>
        </div>
    );
};

export default UserServerProfileModal;
