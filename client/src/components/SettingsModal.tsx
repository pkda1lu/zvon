import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { useVoice } from '../contexts/VoiceContext';
import {
  CloseIcon,
  UsersIcon,
  ShieldIcon,
  MonitorIcon,
  PaletteIcon,
  SpeakerIcon,
  ChatIcon,
  KeyboardIcon,
  VideoIcon,
  SettingsIcon,
  LogOutIcon,
  SmartphoneIcon,
  EllipsisIcon,
  CameraIcon
} from './Icons';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab =
  | 'account'
  | 'privacy'
  | 'devices'
  | 'appearance'
  | 'voice'
  | 'chat'
  | 'keybinds'
  | 'windows'
  | 'streamer'
  | 'advanced'
  | 'activity';

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, refreshUser, logout } = useAuth();
  const { isNoiseSuppressionEnabled, toggleNoiseSuppression } = useVoice();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  // Account Form State
  const [username, setUsername] = useState(user?.username || '');
  const [status, setStatus] = useState(user?.status || 'offline');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(getAvatarUrl(user?.avatar) || null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(getAvatarUrl(user?.banner) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setStatus(user.status);
      setBio(user.bio || '');
      setAvatarPreview(getAvatarUrl(user.avatar));
      setBannerPreview(getAvatarUrl(user.banner));
    }
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      setLoading(true);
      const response = await axios.post('/api/users/avatar', formData);
      await refreshUser();
      setAvatarPreview(getAvatarUrl(response.data.avatar));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка загрузки аватара');
    } finally {
      setLoading(false);
    }
  };

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('banner', file);

    try {
      setLoading(true);
      await axios.post('/api/users/banner', formData);
      await refreshUser();
      setBannerPreview(getAvatarUrl(user?.banner)); // This might need a refresh logic
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка загрузки баннера');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAccount = async () => {
    setLoading(true);
    setError('');
    try {
      await axios.put('/api/users/profile', { username, bio, status });
      await refreshUser();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка сохранения профиля');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const renderAccountSettings = () => (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Моя учётная запись</h2>

      <div className="user-settings-account-card">
        <div
          className="account-banner"
          style={{ background: bannerPreview ? `url(${getFullUrl(user?.banner || '')}) center/cover` : '#5865f2' }}
        >
          <button className="change-banner-button" onClick={() => bannerInputRef.current?.click()}>
            Изменить баннер
          </button>
          <div className="account-avatar-wrapper" onClick={() => fileInputRef.current?.click()}>
            <img src={avatarPreview || ''} alt="" />
          </div>
        </div>

        <div className="account-info-banner">
          <div className="account-details">
            <h3>{user?.username}</h3>
            <p>Статус: {status === 'online' ? 'В сети' : 'Не в сети'}</p>
          </div>
          <button className="edit-profile-button" onClick={() => fileInputRef.current?.click()}>
            Изменить профиль
          </button>
        </div>
      </div>

      <div className="settings-form-group">
        <label>Имя пользователя</label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
      </div>

      <div className="settings-form-group">
        <label>О себе</label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="Расскажите о себе..."
          rows={3}
        />
      </div>

      <div className="settings-form-group">
        <label>Статус</label>
        <select value={status} onChange={e => setStatus(e.target.value as any)}>
          <option value="online">В сети</option>
          <option value="away">Отошёл</option>
          <option value="busy">Занят</option>
          <option value="offline">Невидимый</option>
        </select>
      </div>

      <button
        className="save-button"
        onClick={handleSaveAccount}
        disabled={loading}
      >
        {loading ? 'Сохранение...' : 'Сохранить изменения'}
      </button>

      <input type="file" ref={fileInputRef} hidden onChange={handleAvatarChange} accept="image/*" />
      <input type="file" ref={bannerInputRef} hidden onChange={handleBannerChange} accept="image/*" />
    </div>
  );



  const renderVoiceSettings = () => (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Голос и видео</h2>

      <div className="settings-section-block">
        <h3>Обработка голоса</h3>
        <div className="settings-form-group-checkbox">
          <div className="checkbox-label">
            <span className="checkbox-title">Шумоподавление (RNNoise)</span>
            <span className="checkbox-description">Убирает фоновый шум из вашего микрофона с помощью нейросети.</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={isNoiseSuppressionEnabled}
              onChange={toggleNoiseSuppression}
            />
            <span className="slider round"></span>
          </label>
        </div>
      </div>

      <div className="settings-section-block">
        <h3>Другие настройки (скоро)</h3>
        <p className="description-text">Эхоподавление и автоматическая регулировка усиления пока управляются автоматически.</p>
      </div>
    </div>
  );

  const renderPlaceholder = (title: string, icon: React.ReactNode) => (
    <div className="settings-section-content">
      <h2 className="settings-section-title">{title}</h2>
      <div className="placeholder-settings">
        {icon}
        <p>Этот раздел настроек находится в разработке и будет доступен в ближайшем обновлении.</p>
      </div>
    </div>
  );


  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-container" onClick={e => e.stopPropagation()}>

        {/* Sidebar */}
        <div className="settings-sidebar">
          <div className="settings-sidebar-content">

            <div className="sidebar-header">Настройки пользователя</div>
            <div
              className={`sidebar-item ${activeTab === 'account' ? 'active' : ''}`}
              onClick={() => setActiveTab('account')}
            >
              <UsersIcon size={18} /> Моя учётная запись
            </div>
            <div
              className={`sidebar-item ${activeTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveTab('privacy')}
            >
              <ShieldIcon size={18} /> Данные и конфиденциальность
            </div>
            <div
              className={`sidebar-item ${activeTab === 'devices' ? 'active' : ''}`}
              onClick={() => setActiveTab('devices')}
            >
              <SmartphoneIcon size={18} /> Устройства
            </div>

            <div className="sidebar-separator" />

            <div className="sidebar-header">Настройки приложения</div>
            <div
              className={`sidebar-item ${activeTab === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              <PaletteIcon size={18} /> Внешний вид
            </div>
            <div
              className={`sidebar-item ${activeTab === 'voice' ? 'active' : ''}`}
              onClick={() => setActiveTab('voice')}
            >
              <SpeakerIcon size={18} /> Голос и видео
            </div>
            <div
              className={`sidebar-item ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <ChatIcon size={18} /> Чат
            </div>
            <div
              className={`sidebar-item ${activeTab === 'keybinds' ? 'active' : ''}`}
              onClick={() => setActiveTab('keybinds')}
            >
              <KeyboardIcon size={18} /> Горячие клавиши
            </div>
            <div
              className={`sidebar-item ${activeTab === 'windows' ? 'active' : ''}`}
              onClick={() => setActiveTab('windows')}
            >
              <MonitorIcon size={18} /> Настройки Windows
            </div>
            <div
              className={`sidebar-item ${activeTab === 'streamer' ? 'active' : ''}`}
              onClick={() => setActiveTab('streamer')}
            >
              <CameraIcon size={18} /> Режим стримера
            </div>
            <div
              className={`sidebar-item ${activeTab === 'advanced' ? 'active' : ''}`}
              onClick={() => setActiveTab('advanced')}
            >
              <EllipsisIcon size={18} /> Расширенные
            </div>

            <div className="sidebar-separator" />

            <div className="sidebar-header">Настройки активности</div>
            <div
              className={`sidebar-item ${activeTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              <ShieldIcon size={18} /> Конфиденциальность активности
            </div>

            <div className="sidebar-separator" />

            <div className="sidebar-item logout" onClick={() => { logout(); onClose(); }}>
              <LogOutIcon size={18} /> Выйти
            </div>

          </div>
        </div>

        {/* Main Content */}
        <div className="settings-main">
          <div className="settings-content-wrapper">
            <div className="settings-content-inner">
              {activeTab === 'account' && renderAccountSettings()}
              {activeTab === 'privacy' && renderPlaceholder('Данные и конфиденциальность', <ShieldIcon size={80} />)}
              {activeTab === 'devices' && renderPlaceholder('Устройства', <SmartphoneIcon size={80} />)}
              {activeTab === 'appearance' && renderPlaceholder('Внешний вид', <PaletteIcon size={80} />)}
              {activeTab === 'voice' && renderVoiceSettings()}
              {activeTab === 'chat' && renderPlaceholder('Чат', <ChatIcon size={80} />)}

              {activeTab === 'keybinds' && renderPlaceholder('Горячие клавиши', <KeyboardIcon size={80} />)}
              {activeTab === 'windows' && renderPlaceholder('Настройки Windows', <MonitorIcon size={80} />)}
              {activeTab === 'streamer' && renderPlaceholder('Режим стримера', <CameraIcon size={80} />)}
              {activeTab === 'advanced' && renderPlaceholder('Расширенные', <EllipsisIcon size={80} />)}
              {activeTab === 'activity' && renderPlaceholder('Конфиденциальность активности', <ShieldIcon size={80} />)}
            </div>
          </div>

          <div className="close-settings-button" onClick={onClose}>
            <div className="close-circle"><CloseIcon size={20} /></div>
            <div className="close-text">Esc</div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
