import React from 'react';
import './SuccessModal.css';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, title, message }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay success-overlay" style={{ zIndex: 6000 }}>
      <div className="glass-panel-base success-modal-content" onClick={e => e.stopPropagation()}>
        <div className="success-checkmark-wrapper">
          <div className="success-checkmark">
            <div className="check-icon">
              <span className="icon-line line-tip"></span>
              <span className="icon-line line-long"></span>
              <div className="icon-circle"></div>
              <div className="icon-fix"></div>
            </div>
          </div>
        </div>
        
        <h2 className="success-title">{title}</h2>
        <p className="success-message">{message}</p>
        
        <button className="neon-btn success-btn" onClick={onClose}>
          Продолжить
        </button>
      </div>
    </div>
  );
};

export default SuccessModal;
