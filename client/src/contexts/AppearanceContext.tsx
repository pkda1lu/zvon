import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeType = 'dark' | 'light' | 'amoled';
export type DensityType = 'cozy' | 'compact';
export type AppIconType = 'default' | 'icon1' | 'icon2' | 'icon3' | 'icon4';

interface AppearanceSettings {
    theme: ThemeType;
    density: DensityType;
    messageSpacing: number; // 0 to 24px
    groupSpacing: number; // 0 to 48px
    fontScale: number; // 0.8 to 1.5
    appIcon: AppIconType;
}

interface AppearanceContextType extends AppearanceSettings {
    setTheme: (theme: ThemeType) => void;
    setDensity: (density: DensityType) => void;
    setMessageSpacing: (spacing: number) => void;
    setGroupSpacing: (spacing: number) => void;
    setFontScale: (scale: number) => void;
    setAppIcon: (icon: AppIconType) => void;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<AppearanceSettings>(() => {
        const saved = localStorage.getItem('appearance-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Ensure appIcon exists for backward compatibility
            return { ...parsed, appIcon: parsed.appIcon || 'default' };
        }
        return {
            theme: 'dark',
            density: 'cozy',
            messageSpacing: 2,
            groupSpacing: 16,
            fontScale: 1.0,
            appIcon: 'default',
        };
    });

    useEffect(() => {
        localStorage.setItem('appearance-settings', JSON.stringify(settings));
        applySettings(settings);

        // Apply icon
        const electron = (window as any).electron;
        if (electron && electron.ipc) {
            electron.ipc.send('change-icon', settings.appIcon);
        }
    }, [settings]);

    const applySettings = (s: AppearanceSettings) => {
        const root = document.documentElement;

        // Theme Colors
        if (s.theme === 'dark') {
            root.style.setProperty('--bg-primary', '#36393f');
            root.style.setProperty('--bg-secondary', '#2f3136');
            root.style.setProperty('--bg-tertiary', '#202225');
            root.style.setProperty('--bg-floating', '#18191c');
            root.style.setProperty('--text-primary', '#ffffff');
            root.style.setProperty('--text-secondary', '#b9bbbe');
            root.style.setProperty('--text-muted', '#72767d');
            root.style.setProperty('--header-primary', '#ffffff');
            root.style.setProperty('--channel-hover', 'rgba(79, 84, 92, 0.32)');
            root.style.setProperty('--message-hover', 'rgba(4, 4, 5, 0.07)');
            root.style.setProperty('--border-subtle', 'rgba(255, 255, 255, 0.05)');
            root.style.setProperty('--border-divider', 'rgba(0, 0, 0, 0.2)');
            root.style.setProperty('--slider-track', '#4f545c');
        } else if (s.theme === 'amoled') {
            root.style.setProperty('--bg-primary', '#000000');
            root.style.setProperty('--bg-secondary', '#000000');
            root.style.setProperty('--bg-tertiary', '#000000');
            root.style.setProperty('--bg-floating', '#000000');
            root.style.setProperty('--text-primary', '#ffffff');
            root.style.setProperty('--text-secondary', '#b9bbbe');
            root.style.setProperty('--text-muted', '#72767d');
            root.style.setProperty('--header-primary', '#ffffff');
            root.style.setProperty('--channel-hover', 'rgba(255, 255, 255, 0.1)');
            root.style.setProperty('--message-hover', 'rgba(255, 255, 255, 0.05)');
            root.style.setProperty('--border-subtle', 'rgba(255, 255, 255, 0.1)');
            root.style.setProperty('--border-divider', 'rgba(255, 255, 255, 0.12)');
            root.style.setProperty('--slider-track', '#202225');
        } else if (s.theme === 'light') {
            root.style.setProperty('--bg-primary', '#ffffff');
            root.style.setProperty('--bg-secondary', '#f2f3f5');
            root.style.setProperty('--bg-tertiary', '#e3e5e8');
            root.style.setProperty('--bg-floating', '#ffffff');
            root.style.setProperty('--text-primary', '#060607');
            root.style.setProperty('--text-secondary', '#4f5660');
            root.style.setProperty('--text-muted', '#5e6772');
            root.style.setProperty('--header-primary', '#060607');
            root.style.setProperty('--channel-hover', 'rgba(116, 127, 141, 0.08)');
            root.style.setProperty('--message-hover', 'rgba(116, 127, 141, 0.04)');
            root.style.setProperty('--border-subtle', 'rgba(0, 0, 0, 0.08)');
            root.style.setProperty('--border-divider', 'rgba(0, 0, 0, 0.1)');
            root.style.setProperty('--slider-track', '#e3e5e8');
        }

        // Spacing
        root.style.setProperty('--message-spacing', `${s.messageSpacing}px`);
        root.style.setProperty('--group-spacing', `${s.groupSpacing}px`);

        // Scale
        root.style.setProperty('--font-scale', s.fontScale.toString());
        root.style.setProperty('--base-font-size', `${16 * s.fontScale}px`);

        // Density modifiers
        if (s.density === 'compact') {
            root.style.setProperty('--message-padding-v', '2px');
            root.style.setProperty('--message-margin-v', '0px');
        } else {
            root.style.setProperty('--message-padding-v', '8px');
            root.style.setProperty('--message-margin-v', '2px');
        }
    };

    const setTheme = (theme: ThemeType) => setSettings(prev => ({ ...prev, theme }));
    const setDensity = (density: DensityType) => setSettings(prev => ({ ...prev, density }));
    const setMessageSpacing = (messageSpacing: number) => setSettings(prev => ({ ...prev, messageSpacing }));
    const setGroupSpacing = (groupSpacing: number) => setSettings(prev => ({ ...prev, groupSpacing }));
    const setFontScale = (fontScale: number) => setSettings(prev => ({ ...prev, fontScale }));
    const setAppIcon = (appIcon: AppIconType) => setSettings(prev => ({ ...prev, appIcon }));

    return (
        <AppearanceContext.Provider value={{
            ...settings,
            setTheme,
            setDensity,
            setMessageSpacing,
            setGroupSpacing,
            setFontScale,
            setAppIcon
        }}>
            {children}
        </AppearanceContext.Provider>
    );
};

export const useAppearance = () => {
    const context = useContext(AppearanceContext);
    if (context === undefined) {
        throw new Error('useAppearance must be used within an AppearanceProvider');
    }
    return context;
};
