import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  updateUser: (user: Partial<User>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

const API_URL = import.meta.env.VITE_API_URL || 'https://zvonserver.ru';

axios.defaults.baseURL = API_URL;
// Remove explicit Content-Type headers to allow Axios to set them automatically based on data type (e.g., for FormData)
// axios.defaults.headers.common['Content-Type'] = 'application/json';
// axios.defaults.headers.post['Content-Type'] = 'application/json';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem('token');
      setToken(null);
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (updatedUser: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updatedUser } : (updatedUser as User));
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post('/api/auth/login', { email, password }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const { token: newToken, user: newUser } = response.data;
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
      // Пробрасываем ошибку дальше для обработки в компоненте
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    const response = await axios.post('/api/auth/register', { username, email, password });
    const { token: newToken, user: newUser } = response.data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  const refreshUser = async () => {
    await fetchUser();
  };


  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

