import React, { useState } from 'react';
import axios from 'axios';
import { LayoutGridIcon } from './Icons';
import Modal from './Modal';
import './CreateChannelModal.css';

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  onCategoryCreated: () => void;
}

const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  onClose,
  serverId,
  onCategoryCreated
}) => {
  const [categoryName, setCategoryName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      setError('Введите название категории');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post('/api/channels', {
        name: categoryName.trim(),
        type: 'category',
        serverId: serverId
      });

      setCategoryName('');
      onCategoryCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка создания категории');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Создать категорию"
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="zv-btn zv-btn--ghost">
            Отмена
          </button>
          <button
            type="submit"
            form="create-category-form"
            className="zv-btn zv-btn--primary"
            disabled={loading || !categoryName.trim()}
          >
            {loading ? 'Создание...' : 'Создать категорию'}
          </button>
        </>
      }
    >
      <form id="create-category-form" onSubmit={handleSubmit} className="create-channel-form">
        {error && <div className="error-message">{error}</div>}

        <div className="form-section">
          <label htmlFor="category-name">Название категории</label>
          <div className="input-wrapper">
            <span className="input-prefix"><LayoutGridIcon size={20} /></span>
            <input
              type="text"
              id="category-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="например: Новые каналы"
              maxLength={32}
              required
              autoFocus
            />
          </div>
          <p className="input-hint">Категории помогают вам упорядочить текстовые, голосовые каналы и 3D-комнаты.</p>
        </div>
      </form>
    </Modal>
  );
};

export default CreateCategoryModal;
