import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<any>;
  loginWithToken: (token: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<any>;
  verifyLogin: (email: string, code: string) => Promise<any>;
  logout: () => void;
  loading: boolean;
  updateUser: (updatedUser: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  forgotPassword: (email: string) => Promise<any>;
  resetPassword: (email: string, code: string, password: string) => Promise<any>;
  toggle2FA: (enabled: boolean) => Promise<void>;
  resendVerification: (email: string) => Promise<any>;
  verifyRegistration: (email: string, code: string) => Promise<any>;
  requestEmailChange: (newEmail: string) => Promise<void>;
  verifyEmailChange: (code: string) => Promise<void>;
  globalUsers: Record<string, Partial<User>>;
  updateGlobalUser: (userId: string, data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

const API_URL = import.meta.env.VITE_API_URL || 'https://zvonserver.ru';
axios.defaults.baseURL = API_URL;

// Помечаем запросы из десктоп-клиента Zvon, чтобы сервер корректно называл
// устройство («Zvon Desktop · Windows»), а не определял его как Chrome.
(() => {
  const win = window as any;
  const isDesktop = !!(
    win.electron?.isElectron === true ||
    win.process?.type === 'renderer' ||
    win.navigator?.userAgent?.includes('Electron')
  );
  if (isDesktop) {
    axios.defaults.headers.common['X-Zvon-Client'] = 'desktop';
    const platform = win.electron?.platform || win.process?.platform || '';
    if (platform) axios.defaults.headers.common['X-Zvon-Platform'] = platform;
    if (win.electron?.appVersion) axios.defaults.headers.common['X-Zvon-Version'] = win.electron.appVersion;
  }
})();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [globalUsers, setGlobalUsers] = useState<Record<string, Partial<User>>>({});

  const updateGlobalUser = useCallback((userId: string, data: Partial<User>) => {
    if (!userId) return;
    setGlobalUsers(prev => ({
      ...prev,
      [userId]: { ...prev[userId], ...data, _id: userId }
    }));
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      const userData = response.data;
      setUser(userData);
      if (userData?._id) updateGlobalUser(userData._id, userData);
    } catch (error: any) {
      if (!error.response) {
        console.warn('Network error during fetchUser, keeping session');
        return;
      }
      if (error.response.status === 401 || error.response.status === 403) {
        localStorage.removeItem('token');
        setToken(null);
        delete axios.defaults.headers.common['Authorization'];
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const response = await axios.post('/api/auth/login', { email, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    if (userData?._id) updateGlobalUser(userData._id, userData);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    return response.data;
  };

  // Быстрый вход по сохранённому токену (менеджер аккаунтов). true — токен валиден.
  const loginWithToken = async (newToken: string): Promise<boolean> => {
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    try {
      const r = await axios.get('/api/auth/me');
      setToken(newToken);
      setUser(r.data);
      if (r.data?._id) updateGlobalUser(r.data._id, r.data);
      return true;
    } catch {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
      return false;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    const response = await axios.post('/api/auth/register', { username, email, password });
    return response.data;
  };

  const verifyLogin = async (email: string, code: string) => {
    const response = await axios.post('/api/auth/verify-login', { email, code });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    if (userData?._id) updateGlobalUser(userData._id, userData);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const updateUser = (updatedUser: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updatedUser } : null);
    const userId = updatedUser._id || user?._id;
    if (userId) updateGlobalUser(userId, updatedUser);
  };

  const refreshUser = async () => {
    const response = await axios.get('/api/auth/me');
    const userData = response.data;
    setUser(userData);
    if (userData?._id) updateGlobalUser(userData._id, userData);
  };

  const forgotPassword = async (email: string) => {
    const response = await axios.post('/api/auth/forgot-password', { email });
    return response.data;
  };

  const resetPassword = async (email: string, code: string, password: string) => {
    const response = await axios.post('/api/auth/reset-password', { email, code, password });
    return response.data;
  };

  const toggle2FA = async (enabled: boolean) => {
    await axios.post('/api/auth/2fa/toggle', { enabled });
    await refreshUser();
  };

  const resendVerification = async (email: string) => {
    const response = await axios.post('/api/auth/resend-verification', { email });
    return response.data;
  };

  const verifyRegistration = async (email: string, code: string) => {
    const response = await axios.post('/api/auth/verify-registration', { email, code });
    return response.data;
  };

  const requestEmailChange = async (newEmail: string) => {
    await axios.post('/api/auth/email-change/request', { newEmail });
  };

  const verifyEmailChange = async (code: string) => {
    await axios.post('/api/auth/email-change/verify', { code });
    await refreshUser();
  };

  return (
    <AuthContext.Provider value={{ 
      user, token, login, loginWithToken, register, verifyLogin, logout, loading, 
      updateUser, refreshUser, forgotPassword, resetPassword, toggle2FA, 
      resendVerification, verifyRegistration, requestEmailChange, 
      verifyEmailChange, globalUsers, updateGlobalUser 
    }}>
      {children}
    </AuthContext.Provider>
  );
};
