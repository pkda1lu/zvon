import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import './Auth.css';
import './Landing.css';

// ===== Менеджер сохранённых аккаунтов (только аккаунты, вошедшие через эту страницу) =====
type SavedAccount = { id: string; username: string; avatar?: string; token: string };
const ACCS_KEY = 'savedAccounts';
const loadAccounts = (): SavedAccount[] => {
  try { const v = JSON.parse(localStorage.getItem(ACCS_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
};
const saveAccounts = (list: SavedAccount[]) => localStorage.setItem(ACCS_KEY, JSON.stringify(list.slice(0, 8)));
const upsertAccount = (acc: SavedAccount): SavedAccount[] => {
  const list = [acc, ...loadAccounts().filter(a => a.id !== acc.id)].slice(0, 8);
  saveAccounts(list);
  return list;
};

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [actualEmail, setActualEmail] = useState(''); // Store the real email from server response
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'login' | 'mfa' | 'forgot' | 'reset'>('login');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const { login, loginWithToken, verifyLogin, forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<SavedAccount[]>(loadAccounts());
  const [accOpen, setAccOpen] = useState(false);

  const rememberAccount = (data: any) => {
    const u = data?.user;
    if (!u || !data?.token) return;
    setAccounts(upsertAccount({ id: String(u.id || u._id), username: u.username, avatar: u.avatar, token: data.token }));
  };

  const goAfterAuth = () => {
    const sp = new URLSearchParams(window.location.search);
    navigate(sp.get('returnTo') || '/');
  };

  const quickLogin = async (acc: SavedAccount) => {
    setError(''); setSuccess('');
    const ok = await loginWithToken(acc.token);
    if (ok) { goAfterAuth(); return; }
    // Токен истёк — убираем из списка и предлагаем войти паролем.
    const list = loadAccounts().filter(a => a.id !== acc.id);
    saveAccounts(list); setAccounts(list);
    setEmail(acc.username);
    setError('Сессия этого аккаунта истекла — войдите паролем.');
  };

  const forgetAccount = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const list = loadAccounts().filter(a => a.id !== id);
    saveAccounts(list); setAccounts(list);
  };

  const handleModeChange = (newMode: 'login' | 'mfa' | 'forgot' | 'reset') => {
    setMode(newMode);
    setError('');
    setSuccess('');
    setCode('');
    setPassword('');
    // Start timer if going to a mode that needs a code
    if (newMode === 'mfa' || newMode === 'reset') {
      setResendTimer(60);
    } else {
      setResendTimer(0);
    }
  };

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleResendCode = async () => {
    if (resendTimer > 0) return;
    
    setError('');
    setSuccess('');
    
    try {
      if (mode === 'mfa') {
        await login(email, password); // This will trigger a new 2FA code
        setSuccess('Новый код подтверждения отправлен');
      } else if (mode === 'reset' || mode === 'forgot') {
        await forgotPassword(email);
        setSuccess('Новый код сброса пароля отправлен');
      }
      setResendTimer(60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка отправки кода');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'mfa') {
      if (!code || code.length !== 6) {
        setError('Пожалуйста, введите 6-значный код');
        return;
      }
      try {
        const data = await verifyLogin(actualEmail || email, code);
        rememberAccount(data);
        goAfterAuth();
      } catch (err: any) {
        setError(err.response?.data?.message || 'Неверный код');
      }
      return;
    }

    if (mode === 'forgot') {
      if (!email) {
        setError('Пожалуйста, введите email');
        return;
      }
      try {
        await forgotPassword(email.trim());
        setSuccess('Код для сброса пароля отправлен на вашу почту');
        handleModeChange('reset');
      } catch (err: any) {
        setError(err.response?.data?.message || 'Ошибка отправки кода');
      }
      return;
    }

    if (mode === 'reset') {
      if (!code || code.length !== 6) {
        setError('Пожалуйста, введите 6-значный код');
        return;
      }
      if (!password || password.length < 8) {
        setError('Новый пароль должен содержать минимум 8 символов');
        return;
      }
      try {
        await resetPassword(email, code, password);
        setSuccess('Пароль успешно изменен. Теперь вы можете войти.');
        handleModeChange('login');
      } catch (err: any) {
        setError(err.response?.data?.message || 'Ошибка смены пароля');
      }
      return;
    }

    // Default Login mode
    if (!email) {
      setError('Пожалуйста, введите email или имя пользователя');
      return;
    }

    if (!password) {
      setError('Пожалуйста, введите пароль');
      return;
    }

    try {
      const data = await login(email.trim(), password);
      if (data.requires2FA) {
        setActualEmail(data.email); // Use email from server response
        handleModeChange('mfa');
        setSuccess('Код подтверждения отправлен на вашу почту');
      } else if (data.token) {
        rememberAccount(data);
        goAfterAuth();
      }
    } catch (err: any) {
      if (err.response?.data?.errors) {
        const validationErrors = err.response.data.errors.map((e: any) => e.msg).join(', ');
        setError(validationErrors);
      } else {
        const detail = err.response?.data?.details || err.response?.data?.message;
        setError(detail ? `Ошибка входа: ${detail}` : 'Ошибка входа. Проверьте email и пароль.');
      }
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'mfa': return 'Подтверждение';
      case 'forgot': return 'Восстановление';
      case 'reset': return 'Новый пароль';
      default: return 'С возвращением!';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'mfa': return 'Мы отправили код на вашу почту';
      case 'forgot': return 'Введите email для получения кода';
      case 'reset': return 'Введите код из письма и новый пароль';
      default: return 'Мы так рады видеть вас снова!';
    }
  };

  return (
    <div className="preview-container">
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', position: 'relative', zIndex: 5 }}>
        <div className="glass-panel-base" style={{ width: '100%', maxWidth: '450px', padding: '50px', textAlign: 'center', marginTop: '20px' }}>
          {/* Top floating icon */}
          <div style={{
            position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)',
            width: '100px', height: '100px', background: 'var(--primary-neon)',
            borderRadius: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 20px 40px rgba(0, 229, 255, 0.3)'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </div>

          <h1 style={{ marginTop: '20px', fontSize: '32px', fontWeight: 800, marginBottom: '10px', color: 'white' }}>
            {getTitle()}
          </h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: '40px', fontSize: '15px' }}>
            {getSubtitle()}
          </p>

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

            {mode === 'login' && accounts.length > 0 && (
              <div className="saved-accounts">
                <button type="button" className={`sa-trigger ${accOpen ? 'open' : ''}`} onClick={() => setAccOpen(o => !o)}>
                  <span className="sa-trigger-faces">
                    {accounts.slice(0, 3).map((a) => (
                      getAvatarUrl(a.avatar)
                        ? <img key={a.id} className="sa-face" src={getAvatarUrl(a.avatar)!} alt="" />
                        : <span key={a.id} className="sa-face sa-avatar-fallback">{(a.username || '?')[0].toUpperCase()}</span>
                    ))}
                  </span>
                  <span className="sa-trigger-text">Быстрый вход <b>({accounts.length})</b></span>
                  <svg className="sa-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                <AnimatePresence initial={false}>
                  {accOpen && (
                    <motion.div
                      className="sa-list"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="sa-list-inner">
                        {accounts.map((acc) => (
                          <div key={acc.id} className="saved-account-row" onClick={() => quickLogin(acc)} title={`Войти как ${acc.username}`}>
                            {getAvatarUrl(acc.avatar)
                              ? <img className="sa-avatar" src={getAvatarUrl(acc.avatar)!} alt="" />
                              : <span className="sa-avatar sa-avatar-fallback">{(acc.username || '?')[0].toUpperCase()}</span>}
                            <span className="sa-name">{acc.username}</span>
                            <button className="sa-remove" onClick={(e) => forgetAccount(e, acc.id)} title="Убрать из списка" aria-label="Убрать">✕</button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="sa-divider"><span>или войдите вручную</span></div>
              </div>
            )}

            {mode === 'login' && (
              <>
                <div>
                  <label className="auth-label-neon">EMAIL ИЛИ ИМЯ ПОЛЬЗОВАТЕЛЯ</label>
                  <input
                    type="text"
                    className="auth-input-glass"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com или username"
                    autoComplete="username"
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
                    autoComplete="current-password"
                    required
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <span
                      onClick={() => handleModeChange('forgot')}
                      style={{ fontSize: '12px', color: '#ffffff', cursor: 'pointer', fontWeight: 600, display: 'inline-block', padding: '4px' }}
                    >
                      Забыли пароль?
                    </span>
                  </div>
                </div>
              </>
            )}

            {mode === 'forgot' && (
              <div>
                <label className="auth-label-neon">EMAIL</label>
                <input
                  type="email"
                  className="auth-input-glass"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  required
                />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                  <span
                    onClick={() => handleModeChange('login')}
                    style={{ fontSize: '12px', color: '#ffffff', cursor: 'pointer', fontWeight: 600, display: 'inline-block', padding: '4px' }}
                  >
                    Вернуться к входу
                  </span>
                </div>
              </div>
            )}

            {(mode === 'mfa' || mode === 'reset') && (
              <div>
                <label className="auth-label-neon">КОД ПОДТВЕРЖДЕНИЯ</label>
                <input
                  type="text"
                  className="auth-input-glass"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  required
                  style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '24px' }}
                />
                {mode === 'reset' && (
                  <div style={{ marginTop: '24px' }}>
                    <label className="auth-label-neon">НОВЫЙ ПАРОЛЬ</label>
                    <input
                      type="password"
                      className="auth-input-glass"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                )}
                <div style={{ textAlign: 'center', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <span
                    onClick={handleResendCode}
                    style={{ 
                      fontSize: '13px', 
                      color: resendTimer > 0 ? 'var(--text-dim)' : 'var(--primary-neon)', 
                      cursor: resendTimer > 0 ? 'default' : 'pointer',
                      fontWeight: 700,
                      textDecoration: resendTimer > 0 ? 'none' : 'underline'
                    }}
                  >
                    {resendTimer > 0 ? `Отправить код повторно через ${resendTimer}с` : 'Отправить код повторно'}
                  </span>
                  
                  <span
                    onClick={() => handleModeChange('login')}
                    style={{ fontSize: '12px', color: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Вернуться к входу
                  </span>
                </div>
              </div>
            )}

            <button type="submit" className="neon-btn" style={{ marginTop: '15px', padding: '18px' }}>
              {mode === 'login' ? 'Войти в систему' :
                mode === 'mfa' ? 'Подтвердить код' :
                  mode === 'forgot' ? 'Получить код' : 'Сбросить пароль'}
            </button>
          </form>

          <p style={{ marginTop: '30px', fontSize: '14px', color: 'var(--text-dim)' }}>
            Нужна учетная запись? <Link to="/register" style={{ color: '#ffffff', fontWeight: 800, textDecoration: 'underline' }}>Зарегистрироваться</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;










