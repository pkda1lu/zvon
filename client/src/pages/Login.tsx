import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';
import './Landing.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [requiresCode, setRequiresCode] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { login, verifyLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (requiresCode) {
      if (!code || code.length !== 6) {
        setError('Пожалуйста, введите 6-значный код');
        return;
      }
      try {
        await verifyLogin(email, code);
        const searchParams = new URLSearchParams(window.location.search);
        const returnTo = searchParams.get('returnTo');
        navigate(returnTo || '/');
      } catch (err: any) {
        setError(err.response?.data?.message || 'Неверный код');
      }
      return;
    }

    if (!email) {
      setError('Пожалуйста, введите email или имя пользователя');
      return;
    }

    if (!password || password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }

    try {
      const data = await login(email.trim(), password);
      if (data.requiresCode) {
        setRequiresCode(true);
        setSuccess('Код подтверждения отправлен на вашу почту');
      } else if (data.token) {
        const searchParams = new URLSearchParams(window.location.search);
        const returnTo = searchParams.get('returnTo');
        navigate(returnTo || '/');
      }
    } catch (err: any) {
      if (err.response?.status === 403 && err.response?.data?.requiresVerification) {
        setError('Почта не подтверждена. Пожалуйста, проверьте ваш почтовый ящик.');
      } else if (err.response?.data?.errors) {
        const validationErrors = err.response.data.errors.map((e: any) => e.msg).join(', ');
        setError(validationErrors);
      } else {
        setError(err.response?.data?.message || 'Ошибка входа. Проверьте email и пароль.');
      }
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
            {requiresCode ? 'Подтверждение' : 'С возвращением!'}
          </h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: '40px', fontSize: '15px' }}>
            {requiresCode ? 'Мы отправили код на вашу почту' : 'Мы так рады видеть вас снова!'}
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

            {!requiresCode ? (
              <>
                <div>
                  <label className="auth-label-neon">EMAIL ИЛИ ИМЯ ПОЛЬЗОВАТЕЛЯ</label>
                  <input
                    type="text"
                    className="auth-input-glass"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com или username"
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
                  />
                  <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--primary-neon)', cursor: 'pointer', textAlign: 'right', fontWeight: 600 }}>Забыли пароль?</div>
                </div>
              </>
            ) : (
              <div>
                <label className="auth-label-neon">КОД ПОДТВЕРЖДЕНИЯ</label>
                <input
                  type="text"
                  className="auth-input-glass"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  required
                  style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '24px' }}
                />
                <div
                  onClick={() => setRequiresCode(false)}
                  style={{ marginTop: '10px', fontSize: '12px', color: 'var(--primary-neon)', cursor: 'pointer', textAlign: 'center', fontWeight: 600 }}
                >
                  Вернуться к вводу пароля
                </div>
              </div>
            )}

            <button type="submit" className="neon-btn" style={{ marginTop: '15px', padding: '18px' }}>
              {requiresCode ? 'Подтвердить код' : 'Войти в систему'}
            </button>
          </form>


          <p style={{ marginTop: '30px', fontSize: '14px', color: 'var(--text-dim)' }}>
            Нужна учетная запись? <Link to="/register" style={{ color: 'var(--primary-neon)', fontWeight: 800, textDecoration: 'none' }}>Зарегистрироваться</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;










