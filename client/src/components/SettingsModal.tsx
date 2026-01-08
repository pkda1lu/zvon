import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { useVoice } from '../contexts/VoiceContext';
import { useAppearance, ThemeType, DensityType } from '../contexts/AppearanceContext';
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
import ImageCropper from './ImageCropper';
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
  const {
    isNoiseSuppressionEnabled, toggleNoiseSuppression,
    inputDevices, outputDevices, videoDevices,
    selectedInputDeviceId, setSelectedInputDeviceId,
    selectedOutputDeviceId, setSelectedOutputDeviceId,
    selectedVideoDeviceId, setSelectedVideoDeviceId,
    inputVolume, setInputVolume,
    outputVolume, setOutputVolume,
    refreshDevices
  } = useVoice();
  const {
    theme, setTheme,
    density, setDensity,
    messageSpacing, setMessageSpacing,
    groupSpacing, setGroupSpacing,
    fontScale, setFontScale,
    appIcon, setAppIcon
  } = useAppearance();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  // Account Form State
  const [username, setUsername] = useState(user?.username || '');
  const [status, setStatus] = useState(user?.status || 'offline');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(getAvatarUrl(user?.avatar) || null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(getAvatarUrl(user?.banner) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cropper State
  const [cropModal, setCropModal] = useState<{
    isOpen: boolean;
    image: string;
    type: 'avatar' | 'banner';
  }>({
    isOpen: false,
    image: '',
    type: 'avatar'
  });

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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropModal({
        isOpen: true,
        image: reader.result as string,
        type: 'avatar'
      });
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropModal({
        isOpen: true,
        image: reader.result as string,
        type: 'banner'
      });
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    const type = cropModal.type;
    setCropModal(prev => ({ ...prev, isOpen: false }));

    const formData = new FormData();
    formData.append(type, croppedBlob, `${type}.jpg`);

    try {
      setLoading(true);
      if (type === 'avatar') {
        const response = await axios.post('/api/users/avatar', formData);
        await refreshUser();
        setAvatarPreview(getAvatarUrl(response.data.avatar));
      } else {
        await axios.post('/api/users/banner', formData);
        await refreshUser();
        setBannerPreview(getAvatarUrl(user?.banner));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || `Ошибка загрузки ${type === 'avatar' ? 'аватара' : 'баннера'}`);
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

      {cropModal.isOpen && (
        <ImageCropper
          image={cropModal.image}
          cropShape={cropModal.type === 'avatar' ? 'round' : 'rect'}
          aspect={cropModal.type === 'avatar' ? 1 : 2.5}
          title={cropModal.type === 'avatar' ? 'Обрезка аватара' : 'Обрезка баннера'}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropModal(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );


  const renderAppearanceSettings = () => (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Внешний вид</h2>

      <div className="settings-section-block">
        <h3>Тема</h3>
        <div className="theme-selection-grid">
          <div
            className={`theme-card dark ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            <div className="theme-preview" />
            <span>Тёмная</span>
          </div>
          <div
            className={`theme-card amoled ${theme === 'amoled' ? 'active' : ''}`}
            onClick={() => setTheme('amoled')}
          >
            <div className="theme-preview" />
            <span>AMOLED</span>
          </div>
          <div
            className={`theme-card light ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
          >
            <div className="theme-preview" />
            <span>Светлая</span>
          </div>
        </div>
      </div>

      <div className="settings-section-block">
        <h3>Плотность интерфейса</h3>
        <div className="density-selection">
          <button
            className={`density-btn ${density === 'cozy' ? 'active' : ''}`}
            onClick={() => setDensity('cozy')}
          >
            Уютная
          </button>
          <button
            className={`density-btn ${density === 'compact' ? 'active' : ''}`}
            onClick={() => setDensity('compact')}
          >
            Компактная
          </button>
        </div>
      </div>

      <div className="settings-section-block">
        <h3>Размер шрифта ({Math.round(fontScale * 100)}%)</h3>
        <input
          type="range"
          min="0.8"
          max="1.5"
          step="0.05"
          value={fontScale}
          onChange={(e) => setFontScale(parseFloat(e.target.value))}
          className="settings-slider"
        />
        <div className="slider-labels">
          <span>80%</span>
          <span>100%</span>
          <span>150%</span>
        </div>
      </div>

      <div className="settings-section-block">
        <h3>Расстояние между сообщениями ({messageSpacing}px)</h3>
        <input
          type="range"
          min="0"
          max="24"
          step="1"
          value={messageSpacing}
          onChange={(e) => setMessageSpacing(parseInt(e.target.value))}
          className="settings-slider"
        />
      </div>

      <div className="settings-section-block">
        <h3>Расстояние между группами ({groupSpacing}px)</h3>
        <input
          type="range"
          min="0"
          max="48"
          step="2"
          value={groupSpacing}
          onChange={(e) => setGroupSpacing(parseInt(e.target.value))}
          className="settings-slider"
        />
      </div>

      <div className="settings-section-block">
        <h3>Иконка приложения</h3>
        <div className="app-icon-grid">
          <div
            className={`app-icon-option ${appIcon === 'default' ? 'active' : ''}`}
            onClick={() => setAppIcon('default')}
          >
            <img src="/icon.png" alt="По умолчанию" />
            <span>Стандартная</span>
          </div>
          <div
            className={`app-icon-option ${appIcon === 'icon1' ? 'active' : ''}`}
            onClick={() => setAppIcon('icon1')}
          >
            <img src="/icon1.PNG" alt="Вариант 1" />
            <span>Неон</span>
          </div>
          <div
            className={`app-icon-option ${appIcon === 'icon2' ? 'active' : ''}`}
            onClick={() => setAppIcon('icon2')}
          >
            <img src="/icon2.png" alt="Вариант 2" />
            <span>Лазурь</span>
          </div>
          <div
            className={`app-icon-option ${appIcon === 'icon3' ? 'active' : ''}`}
            onClick={() => setAppIcon('icon3')}
          >
            <img src="/icon3.png" alt="Вариант 3" />
            <span>Аметист</span>
          </div>
          <div
            className={`app-icon-option ${appIcon === 'icon4' ? 'active' : ''}`}
            onClick={() => setAppIcon('icon4')}
          >
            <img src="/icon4.png" alt="Вариант 4" />
            <span>Огонь</span>
          </div>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    if (activeTab === 'voice') {
      refreshDevices();
    }
  }, [activeTab, refreshDevices]);

  const renderVoiceSettings = () => (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Голос и видео</h2>

      <div className="settings-section-block">
        <h3>Устройства ввода и вывода</h3>

        <div className="voice-settings-grid">
          <div className="settings-form-group">
            <label>Устройство ввода (Микрофон)</label>
            <select
              value={selectedInputDeviceId}
              onChange={(e) => setSelectedInputDeviceId(e.target.value)}
              className="settings-select"
            >
              {inputDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                </option>
              ))}
              {inputDevices.length === 0 && <option value="default">По умолчанию</option>}
            </select>
          </div>

          <div className="settings-form-group">
            <label>Устройство вывода (Динамики)</label>
            <select
              value={selectedOutputDeviceId}
              onChange={(e) => setSelectedOutputDeviceId(e.target.value)}
              className="settings-select"
            >
              {outputDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Speaker ${device.deviceId.slice(0, 5)}...`}
                </option>
              ))}
              {outputDevices.length === 0 && <option value="default">По умолчанию</option>}
            </select>
          </div>
        </div>

        <div className="voice-volume-controls">
          <div className="settings-form-group">
            <div className="slider-header-row">
              <label>Громкость микрофона</label>
              <span className="slider-value">{Math.round(inputVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={inputVolume}
              onChange={(e) => setInputVolume(parseFloat(e.target.value))}
              className="settings-slider"
            />
          </div>

          <div className="settings-form-group">
            <div className="slider-header-row">
              <label>Громкость звука</label>
              <span className="slider-value">{Math.round(outputVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={outputVolume}
              onChange={(e) => setOutputVolume(parseFloat(e.target.value))}
              className="settings-slider"
            />
          </div>
        </div>
      </div>

      <div className="settings-section-block">
        <h3>Настройки видео</h3>
        <div className="settings-form-group">
          <label>Камера</label>
          <select
            value={selectedVideoDeviceId}
            onChange={(e) => setSelectedVideoDeviceId(e.target.value)}
            className="settings-select"
          >
            {videoDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
              </option>
            ))}
            {videoDevices.length === 0 && <option value="default">Не найдено</option>}
          </select>
        </div>
        {videoDevices.length > 0 && (
          <div className="camera-preview-placeholder">
            <div className="camera-preview-text">Предпросмотр камеры (Здесь будет видео)</div>
          </div>
        )}
      </div>


      <div className="settings-section-block">
        <h3>Расширенные настройки</h3>

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

        <div className="settings-form-group-checkbox disabled">
          <div className="checkbox-label">
            <span className="checkbox-title">Эхоподавление</span>
            <span className="checkbox-description">Предотвращает попадание звука из динамиков обратно в микрофон. (Всегда включено)</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={true}
              disabled
            />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="settings-form-group-checkbox disabled">
          <div className="checkbox-label">
            <span className="checkbox-title">Автоматическая регулировка усиления</span>
            <span className="checkbox-description">Автоматически выравнивает громкость вашего голоса. (Всегда включено)</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={true}
              disabled
            />
            <span className="slider round"></span>
          </label>
        </div>
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
              {activeTab === 'appearance' && renderAppearanceSettings()}
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
