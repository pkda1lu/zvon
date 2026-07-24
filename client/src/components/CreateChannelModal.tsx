import React, { useState } from 'react';
import axios from 'axios';
import { HashtagIcon, SpeakerIcon, CubeIcon } from './Icons';
import Modal from './Modal';
import { useAuth } from '../contexts/AuthContext';
import './CreateChannelModal.css';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  onChannelCreated: () => void;
}

const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  onClose,
  serverId,
  onChannelCreated
}) => {
  const { user } = useAuth();
  // 3D-комнаты пока в разработке — создавать их могут только модераторы/админы Zvon.
  const isZvonMod = user?.role === 'admin' || user?.role === 'moderator';

  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<'text' | 'voice' | 'room'>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) {
      setError('Введите название канала');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post('/api/channels', {
        name: channelName.trim(),
        type: channelType,
        serverId: serverId
      });

      setChannelName('');
      setChannelType('text');
      onChannelCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка создания канала');
    } finally {
      setLoading(false);
    }
  };

  const namePlaceholder = channelType === 'text' ? 'например: общий' : channelType === 'voice' ? 'например: общий голосовой' : 'например: 3D-холл';
  const nameLabel = channelType === 'text' ? 'Название текстового канала' : channelType === 'voice' ? 'Название голосового канала' : 'Название 3D-комнаты';
  const hint = channelType === 'text'
    ? 'Текстовые каналы используются для обмена сообщениями, файлами и изображениями.'
    : channelType === 'voice'
    ? 'Голосовые каналы используются для общения в реальном времени.'
    : '3D-комната — голосовой канал с 3D-сценой: аватарки участников можно перетаскивать по пространству. Функция в разработке и может работать нестабильно.';

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Создать канал"
      size="md"
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
            {loading ? 'Создание...' : 'Создать канал'}
          </button>
        </>
      }
    >
      <form id="create-channel-form" onSubmit={handleSubmit} className="create-channel-form">
        {error && <div className="error-message">{error}</div>}

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

        <div className="form-section">
          <label htmlFor="channel-name">{nameLabel}</label>
          <div className="input-wrapper">
            {channelType === 'text' && <span className="input-prefix"><HashtagIcon size={20} /></span>}
            {channelType === 'voice' && <span className="input-prefix"><SpeakerIcon size={20} /></span>}
            {channelType === 'room' && <span className="input-prefix"><CubeIcon size={20} /></span>}
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
          <p className="input-hint">{hint}</p>
        </div>
      </form>
    </Modal>
  );
};

export default CreateChannelModal;
