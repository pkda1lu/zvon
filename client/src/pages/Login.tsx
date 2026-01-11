import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';
import './Landing.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Валидация на клиенте
    if (!email || !email.includes('@')) {
      setError('Пожалуйста, введите корректный email адрес');
      return;
    }

    if (!password || password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    try {
      await login(email.trim(), password);
      const searchParams = new URLSearchParams(window.location.search);
      const returnTo = searchParams.get('returnTo');
      navigate(returnTo || '/');
    } catch (err: any) {
      // Обработка ошибок валидации
      if (err.response?.data?.errors) {
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

          <h1 style={{ marginTop: '20px', fontSize: '32px', fontWeight: 800, marginBottom: '10px', color: 'white' }}>С возвращением!</h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: '40px', fontSize: '15px' }}>Мы так рады видеть вас снова!</p>

          <form onSubmit={handleSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {error && (
              <div style={{
                background: 'rgba(255, 59, 48, 0.1)', border: '1px solid rgba(255, 59, 48, 0.3)',
                color: '#ff3b30', padding: '12px', borderRadius: '12px', fontSize: '13px', textAlign: 'center'
              }}>
                {error}
              </div>
            )}

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
              />
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--primary-neon)', cursor: 'pointer', textAlign: 'right', fontWeight: 600 }}>Забыли пароль?</div>
            </div>

            <button type="submit" className="neon-btn" style={{ marginTop: '15px', padding: '18px' }}>
              Войти в систему
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










