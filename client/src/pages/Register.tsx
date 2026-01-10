import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';
import './Landing.css';

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await register(username, email, password);
      const searchParams = new URLSearchParams(window.location.search);
      const returnTo = searchParams.get('returnTo');
      navigate(returnTo || '/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка регистрации');
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
        </div>
        <div className="nav-actions">
          <button className="btn-login" onClick={() => navigate('/login')}>
            Войти
          </button>
        </div>
      </nav>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 80px)', width: '100%', zIndex: 5, padding: '20px' }}>
        <div className="auth-box" style={{ background: 'rgba(30,31,34,0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h1 style={{ color: '#fff' }}>Создать учетную запись</h1>
          <p className="auth-subtitle">Присоединяйтесь к миллионам пользователей!</p>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="username">ИМЯ ПОЛЬЗОВАТЕЛЯ</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
              />
            </div>

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
                minLength={6}
              />
            </div>

            <button type="submit" className="auth-button">
              Зарегистрироваться
            </button>
          </form>

          <p className="auth-link">
            Уже есть учетная запись? <Link to="/login">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;










