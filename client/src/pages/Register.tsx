import React, { useState } from 'react';
import { getIconBrand } from '../utils/branding';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';
import './Landing.css';

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [updatingEmailLoading, setUpdatingEmailLoading] = useState(false);
  const { register, resendVerification, verifyRegistration, updateRegistrationEmail } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleResendVerification = async () => {
    if (resendTimer > 0) return;
    setError('');
    setSuccess('');
    try {
      await resendVerification(email);
      setSuccess('Новый код подтверждения отправлен на почту');
      setResendTimer(60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка отправки кода');
    }
  };

  const handleUpdateEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const trimmedNew = newEmailInput.trim().toLowerCase();
    if (!trimmedNew) return;
    if (trimmedNew === email.trim().toLowerCase()) {
      setIsEditingEmail(false);
      return;
    }

    setUpdatingEmailLoading(true);
    try {
      const res = await updateRegistrationEmail(email, trimmedNew);
      setEmail(trimmedNew);
      setIsEditingEmail(false);
      setSuccess(res.message || 'Почта успешно изменена. Новый код отправлен на вашу почту.');
      setResendTimer(60);
      setVerificationCode('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при изменении почты');
    } finally {
      setUpdatingEmailLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await verifyRegistration(email, verificationCode);
      const searchParams = new URLSearchParams(window.location.search);
      const returnTo = searchParams.get('returnTo');
      navigate(returnTo || '/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный код');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Local validation before submitting
      const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        specialOrDigit: /[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
      };

      if (!requirements.length || !requirements.uppercase || !requirements.specialOrDigit) {
        setError('Пароль должен содержать минимум 8 символов, хотя бы одну заглавную букву и цифру или спецсимвол');
        return;
      }

      const data = await register(username, email, password);
      if (data.requiresVerification) {
        setRequiresVerification(true);
        setSuccess('Код подтверждения отправлен на вашу почту.');
        setResendTimer(60);
      } else if (data.token) {
        const searchParams = new URLSearchParams(window.location.search);
        const returnTo = searchParams.get('returnTo');
        navigate(returnTo || '/');
      }
    } catch (err: any) {
      if (err.response?.data?.errors) {
        setError(err.response.data.errors[0].msg);
      } else {
        setError(err.response?.data?.message || 'Ошибка регистрации');
      }
    }
  };

  if (requiresVerification) {
    return (
      <div className="preview-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', position: 'relative', zIndex: 5, padding: '20px' }}>
          <div className="glass-panel-base" style={{ width: '100%', maxWidth: '480px', padding: '50px', textAlign: 'center' }}>
            <div style={{
              position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)',
              width: '100px', height: '100px', background: 'var(--primary-neon)',
              borderRadius: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(0, 229, 255, 0.3)'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>

            {isEditingEmail ? (
              <>
                <h1 style={{ marginTop: '20px', fontSize: '32px', fontWeight: 800, marginBottom: '10px', color: 'white' }}>Изменение почты</h1>
                <p style={{ color: 'var(--text-dim)', marginBottom: '30px', fontSize: '15px' }}>Укажите новый адрес для получения кода подтверждения</p>

                <form onSubmit={handleUpdateEmailSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {error && (
                    <div style={{
                      background: 'rgba(255, 59, 48, 0.1)', border: '1px solid rgba(255, 59, 48, 0.3)',
                      color: '#ff3b30', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center'
                    }}>
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="auth-label-neon">НОВЫЙ ЭЛЕКТРОННЫЙ АДРЕС</label>
                    <input
                      type="email"
                      className="auth-input-glass"
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      placeholder="new.email@example.com"
                      required
                      autoFocus
                    />
                  </div>

                  <button type="submit" className="neon-btn" disabled={updatingEmailLoading} style={{ padding: '16px' }}>
                    {updatingEmailLoading ? 'Сохранение...' : 'Сохранить и отправить новый код'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setIsEditingEmail(false); setError(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
                  >
                    Отмена
                  </button>
                </form>
              </>
            ) : (
              <>
                <h1 style={{ marginTop: '20px', fontSize: '32px', fontWeight: 800, marginBottom: '10px', color: 'white' }}>Подтвердите почту</h1>
                <p style={{ color: 'var(--text-dim)', marginBottom: '30px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span>Мы отправили 6-значный код на</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <strong style={{ color: 'white' }}>{email}</strong>
                    <button 
                      type="button" 
                      onClick={() => {
                        setNewEmailInput(email);
                        setIsEditingEmail(true);
                        setError('');
                        setSuccess('');
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

                <form onSubmit={handleVerifyCode} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {error && (
                    <div style={{
                      background: 'rgba(255, 59, 48, 0.1)', border: '1px solid rgba(255, 59, 48, 0.3)',
                      color: '#ff3b30', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center'
                    }}>
                      {error}
                    </div>
                  )}
                  {success && (
                    <div style={{
                      background: 'rgba(0, 255, 127, 0.1)', border: '1px solid rgba(0, 255, 127, 0.3)',
                      color: '#00ff7f', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center'
                    }}>
                      {success}
                    </div>
                  )}

                  <div>
                    <label className="auth-label-neon">КОД ИЗ ПИСЬМА</label>
                    <input
                      type="text"
                      className="auth-input-glass"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="123456"
                      required
                      maxLength={6}
                      autoFocus
                      style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }}
                    />
                  </div>

                  <button type="submit" className="neon-btn" style={{ padding: '18px' }}>
                    Завершить регистрацию
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                    <button 
                      type="button" 
                      onClick={() => {
                        setRequiresVerification(false);
                        setIsEditingEmail(false);
                        setError('');
                        setSuccess('');
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '13px', cursor: 'pointer' }}
                    >
                      Вернуться назад
                    </button>
                  </div>

                  <button 
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendTimer > 0}
                    style={{
                      background: 'none', border: 'none', color: resendTimer > 0 ? 'var(--text-dim)' : 'var(--primary-neon)',
                      fontSize: '12px', cursor: resendTimer > 0 ? 'default' : 'pointer', fontWeight: 600
                    }}
                  >
                    {resendTimer > 0 ? `Отправить повторно через ${resendTimer}с` : 'Отправить код повторно'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-container">
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', position: 'relative', zIndex: 5, padding: '20px' }}>
        <div className="glass-panel-base" style={{ width: '100%', maxWidth: '480px', padding: '50px', textAlign: 'center', marginTop: '20px' }}>
          {/* Top floating icon */}
          <div style={{
            position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)',
            width: '100px', height: '100px', background: 'var(--primary-neon)',
            borderRadius: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 20px 40px rgba(0, 229, 255, 0.3)'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <polyline points="16 11 18 13 22 9" />
            </svg>
          </div>

          <h1 style={{ marginTop: '20px', fontSize: '32px', fontWeight: 800, marginBottom: '10px', color: 'white' }}>Создать аккаунт</h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: '40px', fontSize: '15px' }}>Присоединяйтесь к экосистеме {getIconBrand().name}.</p>

          <form onSubmit={handleSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {error && (
              <div style={{
                background: 'rgba(255, 59, 48, 0.1)', border: '1px solid rgba(255, 59, 48, 0.3)',
                color: '#ff3b30', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center'
              }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{
                background: 'rgba(0, 255, 127, 0.1)', border: '1px solid rgba(0, 255, 127, 0.3)',
                color: '#00ff7f', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center'
              }}>
                {success}
              </div>
            )}

            <div>
              <label className="auth-label-neon">ИМЯ ПОЛЬЗОВАТЕЛЯ</label>
              <input
                type="text"
                className="auth-input-glass"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="CyberNaut"
                required
                minLength={3}
                maxLength={20}
              />
            </div>

            <div>
              <label className="auth-label-neon">ЭЛЕКТРОННАЯ ПОЧТА</label>
              <input
                type="email"
                className="auth-input-glass"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="auth-label-neon">ПАРОЛЬ</label>
              <input
                type="password"
                className="auth-input-glass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '8px' }}>
                Минимум 8 символов, заглавная буква и цифра или спецсимвол
              </p>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.4', margin: '5px 0' }}>
              Продолжая, вы соглашаетесь с нашими <span style={{ color: '#ffffff', cursor: 'pointer', textDecoration: 'underline' }}>Условиями обслуживания</span> и <span style={{ color: '#ffffff', cursor: 'pointer', textDecoration: 'underline' }}>Политикой конфиденциальности</span>.
            </p>

            <button type="submit" className="neon-btn" style={{ padding: '18px' }}>
              Инициировать регистрацию
            </button>
          </form>

          <p style={{ marginTop: '30px', fontSize: '14px', color: 'var(--text-dim)' }}>
            Уже есть аккаунт? <Link to="/login" style={{ color: '#ffffff', fontWeight: 800, textDecoration: 'underline' }}>Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;










