import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl } from '../utils/avatar';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [status, setStatus] = useState(user?.status || 'offline');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(getAvatarUrl(user?.avatar) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.avatar) {
      setAvatarPreview(getAvatarUrl(user.avatar));
    }
  }, [user?.avatar]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let avatarUrl = user?.avatar || null;

      // Upload avatar if changed
      if (avatarFile) {
        try {
          const formData = new FormData();
          formData.append('avatar', avatarFile);
          const avatarResponse = await axios.post('/api/users/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          avatarUrl = avatarResponse.data.avatar;
          // Update preview with full URL
          setAvatarPreview(getAvatarUrl(avatarUrl));
        } catch (avatarError: any) {
          console.error('Avatar upload error:', avatarError);
          throw new Error(avatarError.response?.data?.message || 'Ошибка загрузки аватара');
        }
      }

      // Update profile
      try {
        const response = await axios.put('/api/users/profile', {
          username,
          status
        });

        // Update auth context
        await refreshUser();

        onClose();
      } catch (profileError: any) {
        console.error('Profile update error:', profileError);
        throw new Error(profileError.response?.data?.message || 'Ошибка обновления профиля');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка обновления профиля');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>Настройки профиля</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form">
          {error && <div className="error-message">{error}</div>}

          <div className="settings-section">
            <label>Аватар</label>
            <div className="avatar-upload">
              <div className="avatar-preview">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar preview" />
                ) : (
                  <span>{username.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <button
                type="button"
                className="upload-button"
                onClick={() => fileInputRef.current?.click()}
              >
                Изменить аватар
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div className="settings-section">
            <label htmlFor="username">Имя пользователя</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={20}
              required
            />
          </div>

          <div className="settings-section">
            <label htmlFor="status">Статус</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="online">В сети</option>
              <option value="offline">Не в сети</option>
              <option value="away">Отошёл</option>
              <option value="busy">Занят</option>
            </select>
          </div>

          <div className="settings-modal-buttons">
            <button type="button" onClick={onClose} className="cancel-button">
              Отмена
            </button>
            <button type="submit" className="save-button" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal;

