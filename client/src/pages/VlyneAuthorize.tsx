import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import { VLYNE_ID_LOGO } from '../components/VlyneIdNav';
import './VlyneAuthorize.css';

/**
 * Экран согласия Vlyne ID.
 *
 * Сюда приводит редирект с /oauth/authorize. Страницу рисует клиент, а не
 * сервер, по двум причинам: вход должен выглядеть частью Vlyne, и здесь уже
 * есть вошедший пользователь — токен сессии Zvon лежит в этом же браузере,
 * так что «войти в другое приложение» не требует вводить пароль заново.
 *
 * Повторный вход проходит без единого нажатия: если согласие уже выдано,
 * сервер отвечает autoApprove, и страница сразу уводит обратно в приложение.
 */

type ScopeDetail = { scope: string; title: string; description: string };

type RequestInfo = {
  requestId: string;
  authenticated: boolean;
  autoApprove: boolean;
  scopes: string[];
  scopeDetails: ScopeDetail[];
  offlineAccess: boolean;
  client: {
    clientId: string;
    name: string;
    description: string;
    logo: string | null;
    homepageUrl: string;
    privacyPolicyUrl: string;
    firstParty: boolean;
  };
  user: { id: string; username: string; email: string; avatar: string | null } | null;
};

const VlyneAuthorize: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();

  const requestId = params.get('request') || '';
  // prompt=consent — приложение требует переспросить, даже если согласие есть.
  const forceConsent = params.get('prompt') === 'consent';

  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Решение отправляется ровно один раз: автоподтверждение и нажатие кнопки
  // могут совпасть по времени, а второй запрос уже получит «код выдан».
  const decided = useRef(false);

  const leave = (url: string) => {
    setLeaving(true);
    // replace, а не assign: кнопка «назад» не должна возвращать на
    // отработавший запрос, он уже недействителен.
    window.location.replace(url);
  };

  const decide = useCallback(async (approve: boolean) => {
    if (decided.current) return;
    decided.current = true;
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/vlyne-id/requests/${requestId}/decision`, { approve });
      leave(data.redirectTo);
    } catch (e: any) {
      decided.current = false;
      setBusy(false);
      setError(e?.response?.data?.message || 'Не удалось завершить вход. Попробуйте ещё раз.');
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId) {
      setError('Ссылка на вход неполная: не указан запрос. Начните вход из приложения заново.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get<RequestInfo>(`/api/vlyne-id/requests/${requestId}`);
        if (cancelled) return;
        setInfo(data);

        if (!data.authenticated) {
          // Гостя уводим на вход, запомнив, куда вернуться. Экран согласия он
          // увидит уже вошедшим — и запрос не потеряется.
          const back = `/vlyne/authorize?request=${encodeURIComponent(requestId)}`;
          navigate(`/login?returnTo=${encodeURIComponent(back)}`, { replace: true });
          return;
        }

        if (data.autoApprove && !forceConsent) decide(true);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.response?.data?.message || 'Запрос на вход не найден или устарел.');
      }
    })();

    return () => { cancelled = true; };
    // token в зависимостях: после возврата со страницы входа запрос надо
    // перечитать — теперь он придёт с авторизацией и, возможно, autoApprove.
  }, [requestId, token, forceConsent, decide, navigate]);

  const switchAccount = () => {
    logout();
    const back = `/vlyne/authorize?request=${encodeURIComponent(requestId)}`;
    navigate(`/login?returnTo=${encodeURIComponent(back)}`, { replace: true });
  };

  if (error) {
    return (
      <div className="vid-wrapper">
        <div className="vid-bg"><span className="vid-blob" /><span className="vid-blob" /></div>
        <motion.div className="vid-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="vid-brand">Vlyne ID</div>
          <h1 className="vid-title">Вход не удался</h1>
          <p className="vid-error">{error}</p>
          <button className="vid-btn vid-btn-ghost" onClick={() => navigate('/')}>На главную</button>
        </motion.div>
      </div>
    );
  }

  if (!info || leaving || (info.autoApprove && !forceConsent)) {
    return (
      <div className="vid-wrapper">
        <div className="vid-bg"><span className="vid-blob" /><span className="vid-blob" /></div>
        <motion.div className="vid-card vid-card-slim" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="vid-brand">Vlyne ID</div>
          <div className="vid-spinner" />
          <p className="vid-muted">
            {info?.client ? `Входим в ${info.client.name}…` : 'Проверяем запрос…'}
          </p>
        </motion.div>
      </div>
    );
  }

  const account = info.user || (user ? { username: user.username, email: (user as any).email, avatar: user.avatar } : null);

  return (
    <div className="vid-wrapper">
      <div className="vid-bg"><span className="vid-blob" /><span className="vid-blob" /></div>

      <motion.div
        className="vid-card"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="vid-brand">Vlyne ID</div>

        <div className="vid-apps">
          <div className="vid-app">
            {info.client.logo
              ? <img src={info.client.logo} alt="" className="vid-app-logo" />
              : <div className="vid-app-logo vid-app-logo-fallback">{info.client.name.charAt(0)}</div>}
            <span className="vid-app-name">{info.client.name}</span>
          </div>
          <div className="vid-link-dots"><span /><span /><span /></div>
          <div className="vid-app">
            <img className="vid-app-logo vid-app-logo-vlyne" src={VLYNE_ID_LOGO} alt="" />
            <span className="vid-app-name">Vlyne ID</span>
          </div>
        </div>

        <h1 className="vid-title">
          {info.client.name} запрашивает доступ к вашему аккаунту
        </h1>
        {info.client.description && <p className="vid-muted vid-desc">{info.client.description}</p>}

        {account && (
          <div className="vid-account">
            <img className="vid-account-avatar" src={getAvatarUrl(account.avatar) || undefined} alt="" />
            <div className="vid-account-text">
              <div className="vid-account-name">{account.username}</div>
              {account.email && <div className="vid-account-email">{account.email}</div>}
            </div>
            <button className="vid-switch" onClick={switchAccount} disabled={busy}>Сменить</button>
          </div>
        )}

        <div className="vid-scopes">
          <div className="vid-scopes-title">Приложение получит:</div>
          {info.scopeDetails.map((s) => (
            <div className="vid-scope" key={s.scope}>
              <span className="vid-scope-dot" />
              <div>
                <div className="vid-scope-name">{s.title}</div>
                <div className="vid-scope-desc">{s.description}</div>
              </div>
            </div>
          ))}
          {info.offlineAccess && (
            <div className="vid-scope">
              <span className="vid-scope-dot" />
              <div>
                <div className="vid-scope-name">Оставаться в системе</div>
                <div className="vid-scope-desc">Не спрашивать вход заново при каждом запуске</div>
              </div>
            </div>
          )}
        </div>

        <p className="vid-note">
          Пароль приложению не передаётся. Отключить доступ можно в настройках аккаунта
          в любой момент.
        </p>

        <div className="vid-actions">
          <button className="vid-btn vid-btn-ghost" onClick={() => decide(false)} disabled={busy}>
            Отмена
          </button>
          <button className="vid-btn vid-btn-primary" onClick={() => decide(true)} disabled={busy}>
            {busy ? 'Подождите…' : 'Разрешить'}
          </button>
        </div>

        {(info.client.homepageUrl || info.client.privacyPolicyUrl) && (
          <div className="vid-links">
            {info.client.homepageUrl && (
              <a href={info.client.homepageUrl} target="_blank" rel="noreferrer noopener">Сайт приложения</a>
            )}
            {info.client.privacyPolicyUrl && (
              <a href={info.client.privacyPolicyUrl} target="_blank" rel="noreferrer noopener">Политика конфиденциальности</a>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default VlyneAuthorize;
