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
    <div className="landing-container">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      <nav className="landing-nav">
        <div className="nav-logo" onClick={() => navigate('/')}>
          <img src="/icon.png" alt="Zvon" />
          <span>Zvon</span>
        </div>
        <div className="nav-links">
          {/* Optional links or empty */}
        </div>
        <div className="nav-actions">
          {/* No actions needed on login page except maybe Register */}
          <button className="btn-login" onClick={() => navigate('/register')}>
            Регистрация
          </button>
        </div>
      </nav>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 80px)', width: '100%', zIndex: 5, padding: '20px' }}>
        <div className="auth-box" style={{ background: 'rgba(30,31,34,0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h1 style={{ color: '#fff' }}>С возвращением!</h1>
          <p className="auth-subtitle">Мы так рады видеть вас снова!</p>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="email">ЭЛЕКТРОННАЯ ПОЧТА</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">ПАРОЛЬ</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="auth-button">
              Войти
            </button>
          </form>

          <p className="auth-link">
            Нужна учетная запись? <Link to="/register">Зарегистрироваться</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;










