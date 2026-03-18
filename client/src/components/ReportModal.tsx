import React, { useState } from 'react';
import './ReportModal.css';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { reason: string; description: string }) => void;
  username: string;
}

const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, onSubmit, username }) => {
  const [reason, setReason] = useState('harassment');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal-content" onClick={e => e.stopPropagation()}>
        <div className="report-modal-header">
          <h2>Пожаловаться на {username}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="report-modal-body">
          <div className="form-group">
            <label>Причина жалобы</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="report-select">
              <option value="harassment">Домогательства / Хейт</option>
              <option value="spam">Спам / Реклама</option>
              <option value="inappropriate_content">Неприемлемый контент</option>
              <option value="scam">Мошенничество</option>
              <option value="other">Другое</option>
            </select>
          </div>
          <div className="form-group">
            <label>Описание (необязательно)</label>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Опишите ситуацию подробнее..."
              maxLength={1000}
            />
          </div>
        </div>
        <div className="report-modal-footer">
          <button className="cancel-btn" onClick={onClose}>Отмена</button>
          <button className="submit-btn" onClick={() => onSubmit({ reason, description })}>Отправить жалобу</button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
