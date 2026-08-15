import React, { Suspense } from 'react';
import { HashRouter, BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Login from './pages/Login';
import Register from './pages/Register';
import InvitePage from './pages/InvitePage';
import Home from './Home';

// Публичные страницы (маркетинг/контент) — не входная точка приложения, грузятся
// лениво, чтобы не утяжелять основной чанк.
const Docs = React.lazy(() => import('./pages/Docs'));
const Policy = React.lazy(() => import('./pages/Policy'));
const Consent = React.lazy(() => import('./pages/Consent'));
const Security = React.lazy(() => import('./pages/Security'));
const Servers = React.lazy(() => import('./pages/Servers'));
const About = React.lazy(() => import('./pages/About'));
const Download = React.lazy(() => import('./pages/Download'));
import { AppearanceProvider } from './contexts/AppearanceContext';
import './App.css';
import { useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Landing3D from './components/Landing3D';
const Overlay = React.lazy(() => import('./pages/Overlay'));
import UpdateNotifier from './components/UpdateNotifier';
import ScreenReaderHandler from './components/ScreenReaderHandler';

const ElectronHandler: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // @ts-ignore
    const electron = window.electron;
    if (electron && electron.ipc) {
      const handleLink = (url: string) => {
        try {
          const parsedUrl = new URL(url.replace('zvon://', 'http://localhost/'));
          const pathParts = parsedUrl.pathname.split('/').filter(p => !!p);
          if (pathParts[0] === 'invite' && pathParts[1]) navigate(`/invite/${pathParts[1]}`);
        } catch (err) { }
      };
      const removeListener = electron.ipc.on('deep-link', (_event: any, url: string) => handleLink(url));
      electron.ipc.invoke('get-pending-deep-link').then((url: string | null) => { if (url) handleLink(url); });
      return () => { if (removeListener) removeListener(); };
    }
  }, [navigate]);

  return null;
};

import { useLocation } from 'react-router-dom';
import { useAppearance } from './contexts/AppearanceContext';
import { useAuth } from './contexts/AuthContext';

// Блокируем боковые кнопки мыши 4/5 (назад/вперёд), когда пользователь
// авторизован и находится в самом приложении — чтобы случайно не «выйти»
// историей на страницу авторизации. На публичных страницах (лендинг, логин,
// докс и т.п.) навигация кнопками мыши работает как обычно.
const PUBLIC_ROUTE_PREFIXES = ['/login', '/register', '/docs', '/policy', '/consent', '/security', '/servers', '/about', '/download', '/invite'];

const MouseNavGuard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const isApp = !PUBLIC_ROUTE_PREFIXES.some(p => location.pathname.startsWith(p));
    if (!user || !isApp) return;

    const block = (e: MouseEvent) => {
      // button 3 — «назад» (физическая кнопка 4), button 4 — «вперёд» (кнопка 5)
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('mousedown', block, true);
    window.addEventListener('mouseup', block, true);
    window.addEventListener('auxclick', block, true);
    return () => {
      window.removeEventListener('mousedown', block, true);
      window.removeEventListener('mouseup', block, true);
      window.removeEventListener('auxclick', block, true);
    };
  }, [user, location.pathname]);

  return null;
};

// Сколько ждать без действий пользователя, прежде чем гасить декоративные
// анимации. Достаточно долго, чтобы пауза не срабатывала во время чтения
// переписки, и достаточно коротко, чтобы отошедший от компьютера человек не
// грел процессор.
const IDLE_AFTER_MS = 15000;

/**
 * Ставит декоративные анимации на паузу, когда смотреть на них некому: окно
 * свёрнуто, потеряло фокус ИЛИ пользователь ничего не делает дольше
 * IDLE_AFTER_MS. Вешает класс .app-idle на <html>, дальше всё делает CSS
 * (animation-play-state: paused) — см. App.css и panel-hero.css.
 *
 * Зачем: в типичном экране одновременно анимируется два десятка декоративных
 * слоёв — полноэкранный фон плюс по несколько «блобов» и орбов в каждой панели
 * (сайдбар, список участников, чат, контакты). Даже полностью композитируемые
 * transform-анимации — это непрерывная работа 60 раз в секунду, которая не даёт
 * машине уйти в простой. Дискорд в простое статичен, поэтому и держит 1-2%.
 */
const useIdleAnimationPause = () => {
  useEffect(() => {
    const root = document.documentElement;
    let lastInput = Date.now();
    let idle = false;

    const apply = (next: boolean) => {
      if (next === idle) return;
      idle = next;
      root.classList.toggle('app-idle', next);
    };

    // Окно вне поля зрения — гасим немедленно, не дожидаясь таймаута.
    const windowHidden = () => document.hidden || !document.hasFocus();
    const evaluate = () => apply(windowHidden() || Date.now() - lastInput >= IDLE_AFTER_MS);

    // Обработчик ввода должен быть максимально дешёвым: он срабатывает на
    // каждое движение мыши, поэтому в общем случае это одна запись в переменную.
    const onInput = () => {
      lastInput = Date.now();
      if (idle && !windowHidden()) apply(false);
    };

    const inputEvents = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    inputEvents.forEach(e => window.addEventListener(e, onInput, { passive: true }));

    document.addEventListener('visibilitychange', evaluate);
    window.addEventListener('focus', onInput);
    window.addEventListener('blur', evaluate);

    // Одна редкая проверка вместо пересоздания таймера на каждое движение мыши.
    const poll = window.setInterval(evaluate, 5000);
    evaluate();

    return () => {
      inputEvents.forEach(e => window.removeEventListener(e, onInput));
      document.removeEventListener('visibilitychange', evaluate);
      window.removeEventListener('focus', onInput);
      window.removeEventListener('blur', evaluate);
      window.clearInterval(poll);
      root.classList.remove('app-idle');
    };
  }, []);
};

const AppBackground: React.FC = () => {
  const location = useLocation();
  const {
    theme,
    performanceMode,
    customBackground,
    backgroundDim,
    backgroundBlur
  } = useAppearance();
  const currentPath = (location.pathname + (location.hash || '')).toLowerCase();

  // Checking for login, register, and invite.
  // We use direct check to make it robust across all routing types.
  const isAuthPage = currentPath.includes('login') ||
    currentPath.includes('register') ||
    currentPath.includes('invite');

  const isOverlay = currentPath.includes('/overlay');
  if (isOverlay) return null;

  const isAmoled = theme === 'amoled';

  // Раскладка и анимации живут в App.css (#global-liquid-bg) — инлайн остаётся
  // только то, что зависит от пользовательских настроек.
  return (
    <div
      id="global-liquid-bg"
      className={performanceMode ? 'perf-mode' : undefined}
      style={{ backgroundColor: isAmoled ? '#000000' : '#020205' }}
    >
      <div
        className={`bg-gradient${isAmoled ? ' amoled' : ''}`}
        style={{ opacity: isAuthPage ? 0.4 : 1 }}
      />

      {customBackground && !performanceMode && (
        <div
          className="bg-custom"
          style={{
            backgroundImage: `url(${customBackground})`,
            filter: `blur(${backgroundBlur}px)`,
          }}
        />
      )}

      {customBackground && !performanceMode && (
        <div
          className="bg-custom-dim"
          style={{ backgroundColor: `rgba(0, 0, 0, ${backgroundDim / 100})` }}
        />
      )}

      {/* Auth Background — живая 3D-сцена с планетой (в стиле лендинга) */}
      {isAuthPage && !performanceMode && (
        <Landing3D className="auth-bg-3d" />
      )}

      {!performanceMode && !customBackground && (
        <>
          <div className="bg-orb bg-orb-cyan" />
          <div className="bg-orb bg-orb-violet" />
        </>
      )}
    </div>
  );
};

import { ChatSettingsProvider } from './contexts/ChatSettingsContext';
import { WindowSettingsProvider } from './contexts/WindowSettingsContext';
import { GestureSettingsProvider } from './contexts/GestureSettingsContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { DialogProvider } from './contexts/DialogContext';
import { AnimatePresence, motion } from 'framer-motion';
import { pagePushVariants, iosSpring } from './animations/transitions';
import MotionPreferences from './animations/MotionPreferences';

// Fallback на время загрузки лениво-подгружаемого чанка страницы.
const RouteFallback: React.FC = () => (
  <div className="invite-page-loading" style={{ position: 'absolute', inset: 0 }}>
    <div className="loading-spinner-rings">
      <div></div><div></div><div></div><div></div>
    </div>
  </div>
);

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    variants={pagePushVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={iosSpring}
    style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
  >
    {children}
  </motion.div>
);

const AnimatedRoutes: React.FC = () => {
  const location = useLocation();
  // Group all "/" and "/*" hits under a single Home key so internal navigation
  // inside Main doesn't trigger a full page exit/enter.
  const isHome =
    !['/login', '/register', '/docs', '/policy'].some(p => location.pathname.startsWith(p))
    && !location.pathname.startsWith('/invite');
  const routeKey = isHome ? '__home__' : location.pathname;

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%' }}>
      <AnimatePresence mode="wait" initial={false}>
        <Suspense fallback={<RouteFallback />}>
        <Routes location={location} key={routeKey}>
          <Route path="/login"   element={<PageShell><Login /></PageShell>} />
          <Route path="/register" element={<PageShell><Register /></PageShell>} />
          <Route path="/invite/:code" element={<PageShell><InvitePage /></PageShell>} />
          <Route path="/docs"    element={<PageShell><Docs /></PageShell>} />
          <Route path="/policy"  element={<PageShell><Policy /></PageShell>} />
          <Route path="/consent" element={<PageShell><Consent /></PageShell>} />
          <Route path="/security" element={<PageShell><Security /></PageShell>} />
          <Route path="/servers" element={<PageShell><Servers /></PageShell>} />
          <Route path="/about"   element={<PageShell><About /></PageShell>} />
          <Route path="/download" element={<PageShell><Download /></PageShell>} />
          <Route path="/"        element={<PageShell><Home /></PageShell>} />
          <Route path="/*"       element={<PageShell><Home /></PageShell>} />
        </Routes>
        </Suspense>
      </AnimatePresence>
    </div>
  );
};

function App() {
  const isElectron = !!(window as any).electron;
  const Router = isElectron ? HashRouter : BrowserRouter;

  useIdleAnimationPause();

  return (
    <Router>
      <Routes>
        <Route path="/overlay" element={<Suspense fallback={<RouteFallback />}><Overlay /></Suspense>} />
        <Route path="*" element={
          <DialogProvider>
            <AuthProvider>
              <AppearanceProvider>
                <MotionPreferences>
                  <LanguageProvider>
                    <ChatSettingsProvider>
                      <WindowSettingsProvider>
                        <GestureSettingsProvider>
                          <NotificationProvider>
                          <div className="App" style={{ position: 'relative' }}>
                            <AppBackground />
                            <ScreenReaderHandler />
                            <TitleBar />
                            <ElectronHandler />
                            <MouseNavGuard />
                            <UpdateNotifier />
                            <div className="app-content" style={{ position: 'relative', zIndex: 1 }}>
                              <AnimatedRoutes />
                            </div>
                          </div>
                        </NotificationProvider>
                      </GestureSettingsProvider>
                    </WindowSettingsProvider>
                  </ChatSettingsProvider>
                </LanguageProvider>
                </MotionPreferences>
              </AppearanceProvider>
            </AuthProvider>
          </DialogProvider>
        } />
      </Routes>
    </Router>
  );
}

export default App;
