import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './VerificationWarning.css';

interface VerificationWarningProps {
  onOpenSettings?: () => void;
}

const VerificationWarning: React.FC<VerificationWarningProps> = ({ onOpenSettings }) => {
  const { user, resendVerification } = useAuth();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if user is not verified and we haven't shown the modal in this session
    if (user && !user.isVerified && !sessionStorage.getItem('verification_modal_shown')) {
      setIsOpen(true);
      sessionStorage.setItem('verification_modal_shown', 'true');
    }
  }, [user]);

  if (!user || user.isVerified || !isOpen) return null;

  const handleResend = async () => {
    setLoading(true);
    setError(null);
    try {
      await resendVerification(user.email);
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при отправке письма');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleChangeEmail = () => {
    handleClose();
    if (onOpenSettings) {
      onOpenSettings();
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 4000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)' }} onClick={handleClose}>
      <div className="glass-panel-base verification-modal" onClick={e => e.stopPropagation()} style={{
        width: '100%',
        maxWidth: '440px',
        padding: '40px',
        textAlign: 'center',
        position: 'relative'
      }}>
        <div className="modal-close-icon" onClick={handleClose} style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          cursor: 'pointer',
          color: 'var(--text-dim)',
          fontSize: '20px'
        }}>✕</div>

        <div className="verification-icon-wrapper" style={{
          width: '70px', height: '70px', background: 'rgba(255, 166, 0, 0.15)',
          borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 25px', border: '1px solid rgba(255, 166, 0, 0.3)'
        }}>
          <span style={{ fontSize: '35px' }}>📧</span>
        </div>

        <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 800, marginBottom: '15px' }}>Подтвердите почту</h2>
        
        <p style={{ color: 'var(--text-dim)', marginBottom: '30px', fontSize: '15px', lineHeight: '1.6' }}>
          Ваша почта <strong>{user.email}</strong> ещё не подтверждена. Подтвердите её, чтобы защитить свой аккаунт и получить доступ ко всем функциям.
        </p>

        {error && (
          <div style={{ 
            background: 'rgba(255, 59, 48, 0.1)', 
            color: '#ff3b30', 
            padding: '10px', 
            borderRadius: '8px', 
            fontSize: '13px', 
            marginBottom: '20px',
            border: '1px solid rgba(255, 59, 48, 0.2)'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            className={`neon-btn ${sent ? 'success' : ''}`} 
            onClick={handleResend}
            disabled={loading || sent}
            style={{ padding: '15px', width: '100%', background: sent ? '#23a559' : '' }}
          >
            {loading ? 'Отправка...' : sent ? 'Код отправлен!' : 'Отправить код еще раз'}
          </button>
          
          <button 
            className="test-action-btn"
            onClick={handleChangeEmail}
            style={{ 
              padding: '15px', 
              width: '100%', 
              height: 'auto', 
              border: '1px solid rgba(255,255,255,0.1)', 
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              fontWeight: 600,
              borderRadius: '12px'
            }}
          >
            Изменить почту
          </button>
          
          <button 
            onClick={handleClose}
            style={{ 
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '13px',
              marginTop: '10px',
              cursor: 'pointer'
            }}
          >
            Напомнить позже
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerificationWarning;
