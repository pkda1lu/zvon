import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

export interface GestureSettings {
  enabled: boolean;
  swipeNavigation: boolean;
  swipeSensitivity: 'low' | 'medium' | 'high';
  hapticFeedback: boolean;
  swipeToOpenSidebar: boolean;
  swipeToOpenMembers: boolean;
}

interface GestureSettingsContextType {
  settings: GestureSettings;
  setSetting: <K extends keyof GestureSettings>(key: K, value: GestureSettings[K]) => void;
  updateSettings: (newSettings: Partial<GestureSettings>) => void;
}

const DEFAULT_GESTURE_SETTINGS: GestureSettings = {
  enabled: true,
  swipeNavigation: true,
  swipeSensitivity: 'medium',
  hapticFeedback: true,
  swipeToOpenSidebar: true,
  swipeToOpenMembers: true,
};

const GestureSettingsContext = createContext<GestureSettingsContextType | undefined>(undefined);

export const useGestureSettings = () => {
  const context = useContext(GestureSettingsContext);
  if (!context) {
    throw new Error('useGestureSettings must be used within a GestureSettingsProvider');
  }
  return context;
};

export const GestureSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateUser } = useAuth();

  const [settings, setSettings] = useState<GestureSettings>(() => {
    const saved = localStorage.getItem('gesture-settings');
    let localParsed: Partial<GestureSettings> = {};
    if (saved) {
      try {
        localParsed = JSON.parse(saved);
      } catch (e) {}
    }
    const backendSettings = (user?.settings?.interaction as any)?.gestures || {};

    return {
      ...DEFAULT_GESTURE_SETTINGS,
      ...localParsed,
      ...backendSettings,
    };
  });

  useEffect(() => {
    const backendSettings = (user?.settings?.interaction as any)?.gestures;
    if (backendSettings) {
      setSettings(prev => ({
        ...prev,
        ...backendSettings,
      }));
    }
  }, [user?.settings?.interaction]);

  useEffect(() => {
    localStorage.setItem('gesture-settings', JSON.stringify(settings));
  }, [settings]);

  const saveToBackend = useCallback((newSettings: GestureSettings) => {
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.put('/api/users/settings', {
          settings: {
            interaction: {
              ...(user?.settings?.interaction || {}),
              gestures: newSettings,
            },
          },
        });
        if (data?.settings) {
          updateUser({ settings: data.settings });
        }
      } catch (err) {
        console.error('Failed to save gesture settings:', err);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [user?.settings?.interaction, updateUser]);

  const setSetting = useCallback(<K extends keyof GestureSettings>(key: K, value: GestureSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveToBackend(next);
      return next;
    });
  }, [saveToBackend]);

  const updateSettings = useCallback((newSettings: Partial<GestureSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...newSettings };
      saveToBackend(next);
      return next;
    });
  }, [saveToBackend]);

  return (
    <GestureSettingsContext.Provider value={{ settings, setSetting, updateSettings }}>
      {children}
    </GestureSettingsContext.Provider>
  );
};
