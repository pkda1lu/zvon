import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import SuccessModal from './SuccessModal';
import {
  overlayVariants,
  overlayTransition,
  modalPopVariants,
  modalPopTransition,
} from '../animations/transitions';
import { useFreezeAppBackground } from '../animations/useFreezeAppBackground';
import { getBrand } from '../utils/branding';
import './VerificationWarning.css';

interface VerificationWarningProps {
  onOpenSettings?: () => void;
}

const VerificationWarning: React.FC<VerificationWarningProps> = ({ onOpenSettings }) => {
  const { user, resendVerification, verifyRegistration, updateRegistrationEmail, updateUser } = useAuth();
  const brand = getBrand();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [updatingEmailLoading, setUpdatingEmailLoading] = useState(false);

  // Freeze the global animated bg whenever the warning modal is actually visible
  // (kept unconditional w.r.t. render path so the hook order stays stable).
  useFreezeAppBackground(!!user && !user.isVerified);

  // Always show if user is logged in but not verified
  if (!user || user.isVerified) {
    return (
      <SuccessModal 
        isOpen={showSuccess} 
        onClose={() => setShowSuccess(false)} 
        title="Почта подтверждена!" 
        message={`Ваш аккаунт успешно защищен. Теперь вам доступны все функции ${brand.name}.`}
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
      updateUser({ isVerified: true });
      setShowSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный или просроченный код');
    } finally {
      setVerifying(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedNew = newEmailInput.trim().toLowerCase();
    if (!trimmedNew || trimmedNew === user.email.toLowerCase()) {
      setIsEditingEmail(false);
      return;
    }

    setUpdatingEmailLoading(true);
    try {
      await updateRegistrationEmail(user.email, trimmedNew);
      updateUser({ email: trimmedNew });
      setIsEditingEmail(false);
      setCode('');
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при изменении почты');
    } finally {
      setUpdatingEmailLoading(false);
    }
  };

  return (
    <>
      <motion.div
        className="modal-overlay"
        style={{
          zIndex: 2500,
          background: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(15px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        variants={overlayVariants}
        initial="initial" animate="animate"
        transition={overlayTransition}
      >
        <motion.div
          className="glass-panel-base verification-modal"
          style={{
            width: '100%',
            maxWidth: '440px',
            padding: '40px',
            textAlign: 'center',
            position: 'relative',
            border: '1px solid var(--primary-neon)'
          }}
          variants={modalPopVariants}
          initial="initial" animate="animate"
          transition={modalPopTransition}
        >
          <div className="verification-icon-wrapper" style={{
            width: '70px', height: '70px', background: 'rgba(255, 166, 0, 0.15)',
            borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 25px', border: '1px solid rgba(255, 166, 0, 0.3)'
          }}>
            <span style={{ fontSize: '35px' }}>📧</span>
          </div>

          {isEditingEmail ? (
            <>
              <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 800, marginBottom: '15px' }}>Изменение почты</h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '25px', fontSize: '14px', lineHeight: '1.5' }}>
                Введите новый адрес почты для получения кода подтверждения.
              </p>

              <form onSubmit={handleUpdateEmail} style={{ marginBottom: '20px', textAlign: 'left' }}>
                <input 
                  type="email" 
                  className="auth-input-glass" 
                  placeholder="new.email@example.com"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  required
                  autoFocus
                  style={{ 
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
                    border: '1px solid rgba(255, 59, 48, 0.2)',
                    textAlign: 'center'
                  }}>
                    {error}
                  </div>
                )}

                <button 
                  type="submit" 
                  className="neon-btn" 
                  disabled={updatingEmailLoading}
                  style={{ width: '100%', padding: '14px', marginBottom: '10px' }}
                >
                  {updatingEmailLoading ? 'Сохранение...' : 'Сохранить и отправить новый код'}
                </button>

                <button 
                  type="button" 
                  onClick={() => { setIsEditingEmail(false); setError(null); }}
                  style={{ 
                    width: '100%', 
                    background: 'none', 
                    border: 'none', 
                    color: 'var(--text-dim)', 
                    fontSize: '13px', 
                    cursor: 'pointer',
                    padding: '8px'
                  }}
                >
                  Отмена
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 800, marginBottom: '15px' }}>Подтверждение почты</h2>
              
              <p style={{ color: 'var(--text-dim)', marginBottom: '30px', fontSize: '15px', lineHeight: '1.6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <span>Доступ к функциям ограничен. Введите код из письма, отправленного на</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <strong style={{ color: 'white' }}>{user.email}</strong>
                  <button 
                    type="button" 
                    onClick={() => {
                      setNewEmailInput(user.email);
                      setIsEditingEmail(true);
                      setError(null);
                    }}
                    title="Изменить почту"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.08)', 
                      border: '1px solid rgba(255, 255, 255, 0.15)', 
                      color: 'var(--primary-neon)', 
                      borderRadius: '6px',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </span>
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
              </div>
            </>
          )}
        </motion.div>
      </motion.div>

      <SuccessModal
        isOpen={showSuccess} 
        onClose={() => setShowSuccess(false)} 
        title="Почта подтверждена!" 
        message={`Ваш аккаунт успешно защищен. Теперь вам доступны все функции ${brand.name}.`}
      />
    </>
  );
};

export default VerificationWarning;
