import React, { useState, useRef } from 'react';
import axios from 'axios';
import Modal from './Modal';
import { useNotifications } from '../contexts/NotificationContext';
import { getFullUrl } from '../utils/avatar';
import './ReportModal.css';

interface ProblemReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UploadedAttachment {
  url: string;
  type: string;
  filename: string;
  size: number;
}

const CATEGORIES = [
  { id: 'bug', title: 'Ошибка / Баг' },
  { id: 'voice', title: 'Голос / Звонки' },
  { id: 'performance', title: 'Производительность' },
  { id: 'ui', title: 'Интерфейс' },
  { id: 'payment', title: 'Оплата' },
  { id: 'other', title: 'Другое' },
];

const ProblemReportModal: React.FC<ProblemReportModalProps> = ({ isOpen, onClose }) => {
  const { addNotification } = useNotifications();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('bug');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSubject(''); setCategory('bug'); setDescription(''); setSteps('');
    setAttachments([]); setUploading(false); setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting || uploading) return;
    reset();
    onClose();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (attachments.length + files.length > 10) {
      addNotification({ title: 'Слишком много файлов', content: 'Можно прикрепить не более 10 файлов.', type: 'warning' });
      return;
    }
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    setUploading(true);
    try {
      const res = await axios.post('/api/upload-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded: UploadedAttachment[] = (res.data || []).map((a: any) => ({
        url: a.url, type: a.type, filename: a.filename, size: a.size,
      }));
      setAttachments(prev => [...prev, ...uploaded]);
    } catch {
      addNotification({ title: 'Не удалось загрузить', content: 'Ошибка при загрузке файлов.', type: 'error' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (url: string) => {
    setAttachments(prev => prev.filter(a => a.url !== url));
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) {
      addNotification({ title: 'Заполните поля', content: 'Укажите заголовок и описание проблемы.', type: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      await axios.post('/api/moderation/problem-report', {
        subject: subject.trim(),
        category,
        description: description.trim(),
        steps: steps.trim(),
        attachments,
      });
      addNotification({ title: 'Жалоба отправлена', content: 'Спасибо! Модераторы рассмотрят вашу проблему.', type: 'success' });
      reset();
      onClose();
    } catch (err: any) {
      addNotification({
        title: 'Не удалось отправить',
        content: err?.response?.data?.message || 'Попробуйте позже.',
        type: 'error',
      });
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Сообщить о проблеме"
      size="lg"
      footer={
        <>
          <button className="zv-btn zv-btn--ghost" onClick={handleClose} disabled={submitting || uploading}>Отмена</button>
          <button className="zv-btn zv-btn--primary" onClick={handleSubmit} disabled={submitting || uploading}>
            {submitting ? 'Отправка…' : 'Отправить'}
          </button>
        </>
      }
    >
      <div className="report-modal-body">
        <div className="form-group">
          <label>Заголовок</label>
          <input
            type="text"
            className="problem-report-input"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Коротко опишите проблему"
            maxLength={200}
          />
        </div>

        <div className="form-group">
          <label>Категория</label>
          <div className="reason-grid problem-category-grid">
            {CATEGORIES.map(opt => (
              <div
                key={opt.id}
                className={`reason-option ${category === opt.id ? 'selected' : ''}`}
                onClick={() => setCategory(opt.id)}
              >
                <div className="reason-text">
                  <span className="reason-title">{opt.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Описание проблемы</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Что произошло? Что вы ожидали увидеть?"
            maxLength={4000}
          />
        </div>

        <div className="form-group">
          <label>Шаги воспроизведения (необязательно)</label>
          <textarea
            value={steps}
            onChange={e => setSteps(e.target.value)}
            placeholder="1. Открыл…&#10;2. Нажал…&#10;3. Появилась ошибка…"
            maxLength={2000}
          />
        </div>

        <div className="form-group">
          <label>Скриншоты и видео (необязательно)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFiles}
          />
          <button
            type="button"
            className="zv-btn zv-btn--ghost problem-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || attachments.length >= 10}
          >
            {uploading ? 'Загрузка…' : 'Прикрепить файлы'}
          </button>

          {attachments.length > 0 && (
            <div className="problem-attachments">
              {attachments.map(a => (
                <div key={a.url} className="problem-attachment">
                  {a.type?.startsWith('image') ? (
                    <img src={getFullUrl(a.url) || a.url} alt={a.filename} />
                  ) : a.type?.startsWith('video') ? (
                    <video src={getFullUrl(a.url) || a.url} muted />
                  ) : (
                    <span className="problem-attachment-file">{a.filename}</span>
                  )}
                  <button
                    type="button"
                    className="problem-attachment-remove"
                    onClick={() => removeAttachment(a.url)}
                    aria-label="Удалить"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ProblemReportModal;
