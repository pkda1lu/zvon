import React from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { VoiceProvider } from './contexts/VoiceContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Main from './pages/Main';
import InvitePage from './pages/InvitePage';
import PrivateRoute from './components/PrivateRoute';
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

function App() {
  return (
    <AuthProvider>
      <AppearanceProvider>
        <NotificationProvider>
          <Router>
            <div className="App">
              <TitleBar />
              <ElectronHandler />
              <div className="app-content">
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/invite/:code" element={<PrivateRoute><InvitePage /></PrivateRoute>} />
                  <Route path="/*" element={<PrivateRoute><SocketProvider><VoiceProvider><Main /></VoiceProvider></SocketProvider></PrivateRoute>} />
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
