import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { HashtagIcon, SpeakerIcon, CubeIcon, LayoutGridIcon } from './Icons';
import Modal from './Modal';
import { useAuth } from '../contexts/AuthContext';
import { Channel } from '../types';
import './CreateChannelModal.css';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  categories?: Channel[];
  initialCategoryId?: string;
  initialType?: 'text' | 'voice' | 'room' | 'category';
  onChannelCreated: () => void;
}

const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  onClose,
  serverId,
  categories = [],
  initialCategoryId,
  initialType,
  onChannelCreated
}) => {
  const { user } = useAuth();
  // 3D-комнаты пока в разработке — создавать их могут только модераторы/админы Zvon.
  const isZvonMod = user?.role === 'admin' || user?.role === 'moderator';

  // Главный выбор: 'channel' (Канал) или 'category' (Категория)
  const [entityType, setEntityType] = useState<'channel' | 'category'>('channel');
  // Тип канала: 'text' | 'voice' | 'room'
  const [channelType, setChannelType] = useState<'text' | 'voice' | 'room'>('text');
  const [channelName, setChannelName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialType === 'category') {
        setEntityType('category');
      } else {
        setEntityType('channel');
        if (initialType === 'voice' || initialType === 'room' || initialType === 'text') {
          setChannelType(initialType);
        } else {
          setChannelType('text');
        }
      }
      setSelectedCategoryId(initialCategoryId || '');
      setChannelName('');
      setError('');
    }
  }, [isOpen, initialType, initialCategoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) {
      setError(entityType === 'category' ? 'Введите название категории' : 'Введите название канала');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (entityType === 'category') {
        await axios.post('/api/channels', {
          name: channelName.trim(),
          type: 'category',
          serverId: serverId
        });
      } else {
        await axios.post('/api/channels', {
          name: channelName.trim(),
          type: channelType,
          serverId: serverId,
          category: selectedCategoryId || undefined
        });
      }

      setChannelName('');
      onChannelCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || (entityType === 'category' ? 'Ошибка создания категории' : 'Ошибка создания канала'));
    } finally {
      setLoading(false);
    }
  };

  const modalTitle = entityType === 'category' ? 'Создать категорию' : 'Создать канал';

  const namePlaceholder = entityType === 'category'
    ? 'например: Важное'
    : channelType === 'text'
    ? 'например: общий'
    : channelType === 'voice'
    ? 'например: общий голосовой'
    : 'например: 3D-холл';

  const nameLabel = entityType === 'category'
    ? 'Название категории'
    : channelType === 'text'
    ? 'Название текстового канала'
    : channelType === 'voice'
    ? 'Название голосового канала'
    : 'Название 3D-комнаты';

  const hint = entityType === 'category'
    ? 'Категории помогают упорядочить текстовые, голосовые каналы и 3D-комнаты на сервере.'
    : channelType === 'text'
    ? 'Текстовые каналы используются для обмена сообщениями, файлами и изображениями.'
    : channelType === 'voice'
    ? 'Голосовые каналы используются для общения в реальном времени.'
    : '3D-комната — голосовой канал с 3D-сценой: аватарки участников можно перетаскивать по пространству. Функция в разработке и может работать нестабильно.';

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="md"
      className="liquid-glass-modal"
      footer={
        <>
          <button type="button" onClick={onClose} className="zv-btn zv-btn--ghost">
            Отмена
          </button>
          <button
            type="submit"
            form="create-channel-form"
            className="zv-btn zv-btn--primary"
            disabled={loading || !channelName.trim()}
          >
            {loading ? 'Создание...' : (entityType === 'category' ? 'Создать категорию' : 'Создать канал')}
          </button>
        </>
      }
    >
      <form id="create-channel-form" onSubmit={handleSubmit} className="create-channel-form">
        {error && <div className="error-message">{error}</div>}

        {/* 1. Выбор: Канал или Категория */}
        <div className="form-section">
          <label>Что вы хотите создать?</label>
          <div className="main-entity-selector">
            <button
              type="button"
              className={`entity-tab-button ${entityType === 'channel' ? 'active' : ''}`}
              onClick={() => setEntityType('channel')}
            >
              <HashtagIcon size={20} />
              <span>Канал</span>
            </button>
            <button
              type="button"
              className={`entity-tab-button ${entityType === 'category' ? 'active' : ''}`}
              onClick={() => setEntityType('category')}
            >
              <LayoutGridIcon size={20} />
              <span>Категория</span>
            </button>
          </div>
        </div>

        {/* 2. Если выбран Канал -> Выбор типа канала */}
        {entityType === 'channel' && (
          <div className="form-section">
            <label htmlFor="channel-type">Тип канала</label>
            <div className="channel-type-selector">
              <button
                type="button"
                className={`type-button ${channelType === 'text' ? 'active' : ''}`}
                onClick={() => setChannelType('text')}
              >
                <span className="type-icon"><HashtagIcon size={24} /></span>
                <span>Текстовый</span>
              </button>
              <button
                type="button"
                className={`type-button ${channelType === 'voice' ? 'active' : ''}`}
                onClick={() => setChannelType('voice')}
              >
                <span className="type-icon"><SpeakerIcon size={24} /></span>
                <span>Голосовой</span>
              </button>
              {isZvonMod && (
                <button
                  type="button"
                  className={`type-button ${channelType === 'room' ? 'active' : ''}`}
                  onClick={() => setChannelType('room')}
                  style={{ position: 'relative' }}
                >
                  <span className="type-icon"><CubeIcon size={24} /></span>
                  <span>3D-комната</span>
                  <span className="channel-type-wip-badge">в разработке</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. Название */}
        <div className="form-section">
          <label htmlFor="channel-name">{nameLabel}</label>
          <div className="input-wrapper">
            {entityType === 'category' ? (
              <span className="input-prefix"><LayoutGridIcon size={20} /></span>
            ) : channelType === 'text' ? (
              <span className="input-prefix"><HashtagIcon size={20} /></span>
            ) : channelType === 'voice' ? (
              <span className="input-prefix"><SpeakerIcon size={20} /></span>
            ) : (
              <span className="input-prefix"><CubeIcon size={20} /></span>
            )}
            <input
              type="text"
              id="channel-name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder={namePlaceholder}
              maxLength={32}
              required
              autoFocus
            />
          </div>
        </div>

        {/* 4. Если выбран Канал -> Выбор категории для привязки */}
        {entityType === 'channel' && (
          <div className="form-section">
            <label htmlFor="channel-category">Привязать к категории</label>
            <select
              id="channel-category"
              className="category-select"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
            >
              <option value="">Никуда (без категории)</option>
              {categories.map(cat => (
                <option key={cat._id} value={cat._id}>{cat.name}</option>
              ))}
            </select>
          </div>
        )}

        <p className="input-hint">{hint}</p>
      </form>
    </Modal>
  );
};

export default CreateChannelModal;
