import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { VoiceProvider } from './contexts/VoiceContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Main from './pages/Main';
import InvitePage from './pages/InvitePage';
import PrivateRoute from './components/PrivateRoute';
import './App.css';

import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const ElectronHandler: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // @ts-ignore
    const electron = window.electron;
    if (electron && electron.ipc) {
      console.log('Setting up deep-link listener');

      const handleLink = (url: string) => {
        console.log('Processing deep link:', url);
        try {
          // url format: zvon://something...
          // For invites: zvon://invite/CODE
          const parsedUrl = new URL(url.replace('zvon://', 'http://localhost/'));
          const pathParts = parsedUrl.pathname.split('/').filter(p => !!p);

          if (pathParts[0] === 'invite' && pathParts[1]) {
            console.log('Navigating to invite:', pathParts[1]);
            navigate(`/invite/${pathParts[1]}`);
          }
        } catch (err) {
          console.error('Error parsing deep link:', err);
        }
      };

      // Listen for future links
      const removeListener = electron.ipc.on('deep-link', (_event: any, url: string) => {
        handleLink(url);
      });

      // Check for pending link on startup
      electron.ipc.invoke('get-pending-deep-link').then((url: string | null) => {
        if (url) {
          console.log('Retrieved pending deep link on startup:', url);
          handleLink(url);
        }
      });

      return () => {
        if (removeListener) removeListener();
      };
    }
  }, [navigate]);

  return null;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <ElectronHandler />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/invite/:code"
            element={
              <PrivateRoute>
                <InvitePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <SocketProvider>
                  <VoiceProvider>
                    <Main />
                  </VoiceProvider>
                </SocketProvider>
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;










