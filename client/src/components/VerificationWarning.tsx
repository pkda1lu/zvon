import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import SuccessModal from './SuccessModal';
import './VerificationWarning.css';

interface VerificationWarningProps {
  onOpenSettings?: () => void;
}

const VerificationWarning: React.FC<VerificationWarningProps> = ({ onOpenSettings }) => {
  const { user, resendVerification, verifyRegistration } = useAuth();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Always show if user is logged in but not verified
  if (!user || user.isVerified) {
    return (
      <SuccessModal 
        isOpen={showSuccess} 
        onClose={() => setShowSuccess(false)} 
        title="Почта подтверждена!" 
        message="Ваш аккаунт успешно защищен. Теперь вам доступны все функции Zvon." 
      />
    );
  }

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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Введите 6-значный код');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await verifyRegistration(user.email, code);
      setShowSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный или просроченный код');
    } finally {
      setVerifying(false);
    }
  };

  const handleChangeEmail = () => {
    if (onOpenSettings) {
      onOpenSettings();
    }
  };

  return (
    <>
      <div className="modal-overlay" style={{ 
        zIndex: 2500, 
        background: 'rgba(0,0,0,0.92)', 
        backdropFilter: 'blur(15px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div className="glass-panel-base verification-modal" style={{
          width: '100%',
          maxWidth: '440px',
          padding: '40px',
          textAlign: 'center',
          position: 'relative',
          border: '1px solid var(--primary-neon)'
        }}>
          <div className="verification-icon-wrapper" style={{
            width: '70px', height: '70px', background: 'rgba(255, 166, 0, 0.15)',
            borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 25px', border: '1px solid rgba(255, 166, 0, 0.3)'
          }}>
            <span style={{ fontSize: '35px' }}>📧</span>
          </div>

          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 800, marginBottom: '15px' }}>Подтверждение почты</h2>
          
          <p style={{ color: 'var(--text-dim)', marginBottom: '30px', fontSize: '15px', lineHeight: '1.6' }}>
            Доступ к функциям ограничен. Введите код из письма, отправленного на <strong>{user.email}</strong>.
          </p>

          <form onSubmit={handleVerify} style={{ marginBottom: '25px' }}>
            <input 
              type="text" 
              className="auth-input-glass" 
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ 
                textAlign: 'center', 
                fontSize: '24px', 
                letterSpacing: '8px', 
                marginBottom: '15px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                padding: '12px',
                borderRadius: '12px',
                width: '100%'
              }}
            />
            
            {error && (
              <div style={{ 
                background: 'rgba(255, 59, 48, 0.1)', 
                color: '#ff3b30', 
                padding: '10px', 
                borderRadius: '8px', 
                fontSize: '13px', 
                marginBottom: '15px',
                border: '1px solid rgba(255, 59, 48, 0.2)'
              }}>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              className="neon-btn" 
              disabled={verifying || code.length !== 6}
              style={{ width: '100%', padding: '15px' }}
            >
              {verifying ? 'Проверка...' : 'Подтвердить'}
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              className="resend-link-btn" 
              onClick={handleResend}
              disabled={loading || sent}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: sent ? '#23a559' : 'var(--primary-neon)', 
                fontSize: '14px', 
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {loading ? 'Отправка...' : sent ? 'Код отправлен!' : 'Отправить код еще раз'}
            </button>
            
            <button 
              className="test-action-btn"
              onClick={handleChangeEmail}
              style={{ 
                padding: '12px', 
                width: '100%', 
                height: 'auto', 
                border: '1px solid rgba(255,255,255,0.1)', 
                background: 'rgba(255,255,255,0.05)',
                color: 'white',
                borderRadius: '12px',
                marginTop: '10px'
              }}
            >
              Изменить почту
            </button>
          </div>
        </div>
      </div>
      
      <SuccessModal 
        isOpen={showSuccess} 
        onClose={() => setShowSuccess(false)} 
        title="Почта подтверждена!" 
        message="Ваш аккаунт успешно защищен. Теперь вам доступны все функции Zvon." 
      />
    </>
  );
};

export default VerificationWarning;
