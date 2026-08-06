import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

interface CallSettings {
  layout: 'sidebar' | 'strip';
  muteOnDeafen: boolean;
}

interface CallSettingsContextType {
  settings: CallSettings;
  setSetting: (key: keyof CallSettings, value: any) => void;
}

const CallSettingsContext = createContext<CallSettingsContextType | undefined>(undefined);

export const useCallSettings = () => {
  const context = useContext(CallSettingsContext);
  if (!context) {
    throw new Error('useCallSettings must be used within a CallSettingsProvider');
  }
  return context;
};

export const CallSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateUser } = useAuth();
  const [settings, setSettings] = useState<CallSettings>(() => {
    const savedSettings = (user?.settings?.interaction as any)?.call;
    const rawLayout = savedSettings?.layout;
    return {
      layout: rawLayout === 'strip' ? 'strip' : 'sidebar',
      muteOnDeafen: savedSettings?.muteOnDeafen ?? true,
    };
  });

  useEffect(() => {
    const callSettings = (user?.settings?.interaction as any)?.call;
    if (callSettings) {
      setSettings({
        ...callSettings,
        layout: callSettings.layout === 'strip' ? 'strip' : 'sidebar',
      });
    }
  }, [user?.settings?.interaction]);

  const setSetting = useCallback((key: keyof CallSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    // Debounced save to backend
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.put('/api/users/settings', {
          settings: {
            interaction: {
              ...(user?.settings?.interaction || {}),
              call: newSettings,
            },
          },
        });
        updateUser({ settings: data.settings });
      } catch (err) {
        console.error('Failed to save call settings:', err);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [settings, updateUser, user?.settings?.interaction]);

  return (
    <CallSettingsContext.Provider value={{ settings, setSetting }}>
      {children}
    </CallSettingsContext.Provider>
  );
};
