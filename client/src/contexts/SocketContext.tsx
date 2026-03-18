import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';


interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://zvonserver.ru';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, logout } = useAuth();
  const { addNotification } = useNotifications();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (token) {
      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'], // Prefer websocket for performance
        reconnection: true,
        reconnectionAttempts: 5
      });
      newSocket.on('connect', () => {
        console.log('Successfully connected to Socket.io at', SOCKET_URL);
        setConnected(true);
      });
      newSocket.on('disconnect', () => setConnected(false));
      newSocket.on('connect_error', (err) => {
        console.warn('Socket connection error to', SOCKET_URL, err);
        setConnected(false);
      });

      newSocket.on('notification', (data: any) => {
        addNotification({
          title: 'Модерация',
          content: data.message,
          type: data.type === 'moderation_violation' ? 'warning' : 'info'
        });
      });

      newSocket.on('account-banned', (data: any) => {
        addNotification({
          title: 'Блокировка аккаунта',
          content: data.message,
          type: 'error'
        });
        // Optionally logout or enforce UI refresh
        setTimeout(() => logout(), 5000);
      });

      setSocket(newSocket);

      return () => { newSocket.close(); };
    }
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
