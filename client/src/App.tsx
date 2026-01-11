import React from 'react';
import { HashRouter, BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Login from './pages/Login';
import Register from './pages/Register';
import InvitePage from './pages/InvitePage';
import Home from './Home';
import { AppearanceProvider } from './contexts/AppearanceContext';
import './App.css';
import { useEffect } from 'react';
import TitleBar from './components/TitleBar';

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

const AppBackground: React.FC = () => {
  const location = useLocation();
  const currentPath = (location.pathname + (location.hash || '')).toLowerCase();

  // Checking for login, register, and invite. 
  // We use direct check to make it robust across all routing types.
  const isAuthPage = currentPath.includes('login') ||
    currentPath.includes('register') ||
    currentPath.includes('invite');

  return (
    <div
      id="global-liquid-bg"
      style={{
        position: 'fixed',
        inset: '-10%', // Oversized for liquidFloat animation
        width: '120vw',
        height: '120vh',
        zIndex: 0,
        backgroundColor: '#020205',
        overflow: 'hidden',
        animation: 'liquidFloat 60s ease-in-out infinite',
        pointerEvents: 'none'
      }}
    >
      {/* Base Liquid Gradient - Always active for "life" */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(-45deg, #020204, #15082e, #0a1f38, #2e081c, #020204)',
        backgroundSize: '300% 300%',
        animation: 'gradientMove 30s ease infinite',
        opacity: isAuthPage ? 0.4 : 1, // More subtle when bg.png is active
        transition: 'opacity 0.5s ease'
      }} />

      {/* Auth Background Image Layer */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: isAuthPage ? 'url("/redesign-assets/bg.png")' : 'none',
        backgroundPosition: 'center center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        opacity: isAuthPage ? 1 : 0,
        transition: 'opacity 0.6s ease',
        transform: isAuthPage ? 'scale(1.05)' : 'scale(1)', // Subtle scale shift
      }} />

      {/* Decorative spheres - Always present and moving */}
      <div style={{
        position: 'absolute',
        top: '15%', left: '10%',
        width: '300px', height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 229, 255, 0.15), transparent 70%)',
        filter: 'blur(60px)',
        animation: 'float 15s infinite ease-in-out'
      }}></div>
      <div style={{
        position: 'absolute',
        bottom: '20%', right: '15%',
        width: '400px', height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(161, 85, 255, 0.1), transparent 70%)',
        filter: 'blur(80px)',
        animation: 'float 22s infinite ease-in-out reverse'
      }}></div>
    </div>
  );
};

function App() {
  const isElectron = !!(window as any).electron;
  const Router = isElectron ? HashRouter : BrowserRouter;

  return (
    <AuthProvider>
      <AppearanceProvider>
        <NotificationProvider>
          <Router>
            <div className="App" style={{ position: 'relative' }}>
              <AppBackground />
              <TitleBar />
              <ElectronHandler />
              <div className="app-content" style={{ position: 'relative', zIndex: 1 }}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/invite/:code" element={<InvitePage />} />
                  <Route path="/" element={<Home />} />
                  <Route path="/*" element={<Home />} />
                </Routes>
              </div>
            </div>
          </Router>
        </NotificationProvider>
      </AppearanceProvider>
    </AuthProvider>
  );
}

export default App;
