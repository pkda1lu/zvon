import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';

interface CallSettings {
  layout: 'grid' | 'sidebar' | 'strip';
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
    const savedSettings = user?.settings?.interaction?.voice;
    return {
      layout: savedSettings?.layout || 'grid',
      muteOnDeafen: savedSettings?.muteOnDeafen ?? true,
    };
  });

  useEffect(() => {
    if (user?.settings?.interaction?.voice) {
      setSettings(user.settings.interaction.voice);
    }
  }, [user?.settings?.interaction?.voice]);

  const setSetting = useCallback((key: keyof CallSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    // Debounced save to backend
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.put('/api/users/settings', {
          settings: {
            interaction: {
              voice: newSettings,
            },
          },
        });
        updateUser({ settings: data.settings });
      } catch (err) {
        console.error('Failed to save voice settings:', err);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [settings, updateUser]);

  return (
    <CallSettingsContext.Provider value={{ settings, setSetting }}>
      {children}
    </CallSettingsContext.Provider>
  );
};
