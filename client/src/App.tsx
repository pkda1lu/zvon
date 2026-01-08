import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

      // Handle Activity
      const updateActivity = (activity: any) => {
        console.log('Activity changed:', activity);
        if (electron.ipc) {
          // We might need access to current socket here. 
          // But ElectronHandler is inside Router, outside SocketProvider maybe?
          // Let's check App structure.
        }
      };

      const removeActivityListener = electron.onActivityChanged?.((activity: any) => {
        // We'll handle this in a separate component or hook to have access to socket
      });

      return () => {
        if (removeListener) removeListener();
        if (removeActivityListener) removeActivityListener();
      };
    }
  }, [navigate]);

  return null;
};

import TitleBar from './components/TitleBar';

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
              </div>
            </div>
          </Router>
        </NotificationProvider>
      </AppearanceProvider>
    </AuthProvider>
  );
}

export default App;










