import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getIconBrand } from '../utils/branding';
import { getDeviceIdKey, DeviceScalesMap, DeviceScaleConfig } from '../utils/device';
import axios from 'axios';

export type ThemeType = 'dark' | 'amoled';
export type DensityType = 'cozy' | 'compact';
export type AppIconType = 'default' | 'icon1' | 'icon2' | 'icon3' | 'icon4' | 'legacy';

export interface CustomColors {
    primary: string;
    secondary: string;
    accent: string;
}

export interface ThemeObject {
    _id?: string;
    name: string;
    theme: ThemeType;
    customColors: CustomColors;
    customBackground: string;
    backgroundDim: number;
    backgroundBlur: number;
    messageSpacing: number;
    groupSpacing: number;
    interfaceScale: number;
    isPublic?: boolean;
    creator?: string | { _id: string; username: string; displayName?: string; avatar?: string | null };
    /** Состояние проверки. Публикацию даёт только модерация. */
    moderationStatus?: 'draft' | 'pending' | 'approved' | 'rejected';
    moderationReason?: string | null;
    isPublished?: boolean;
    isBlocked?: boolean;
    installs?: number;
    createdAt?: string;
}

export interface PageScales {
    scaleMode?: 'global' | 'separate';
    sidebar?: number;
    chat?: number;
    members?: number;
    settings?: number;
}

interface AppearanceSettings {
    theme: ThemeType;
    density: DensityType;
    messageSpacing: number; // 0 to 24px
    groupSpacing: number; // 0 to 48px
    interfaceScale: number; // 0.7 to 1.5
    pageScales: PageScales;
    deviceScales: DeviceScalesMap;
    screenReader: boolean;
    appIcon: AppIconType;
    performanceMode: boolean;
    reduceMotion: boolean;
    customColors: CustomColors;
    customBackground: string;
    backgroundDim: number; // 0 to 100
    backgroundBlur: number; // 0 to 20
}

interface AppearanceContextType extends AppearanceSettings {
    setTheme: (theme: ThemeType) => void;
    setDensity: (density: DensityType) => void;
    setMessageSpacing: (spacing: number) => void;
    setGroupSpacing: (spacing: number) => void;
    setInterfaceScale: (scale: number) => void;
    setPageScales: (scales: Partial<PageScales>) => void;
    setAppIcon: (icon: AppIconType) => void;
    setPerformanceMode: (enabled: boolean) => void;
    setReduceMotion: (enabled: boolean) => void;
    setCustomColors: (colors: Partial<CustomColors>) => void;
    setCustomBackground: (url: string) => void;
    setBackgroundDim: (value: number) => void;
    setBackgroundBlur: (value: number) => void;
    setScreenReader: (enabled: boolean) => void;
    resetCustomTheme: () => void;
    
    // New Theme management
    savedThemes: ThemeObject[];
    isLoadingThemes: boolean;
    activeThemeId: string | null;
    fetchThemes: () => Promise<void>;
    saveTheme: (name: string, isPublic: boolean) => Promise<void>;
    applyTheme: (theme: ThemeObject) => void;
    deleteTheme: (id: string) => Promise<void>;

    /** Общий список — только прошедшие проверку темы. */
    publicThemes: ThemeObject[];
    isLoadingPublic: boolean;
    fetchPublicThemes: (query?: string) => Promise<void>;
    /** Отправить свою тему на проверку или снять с публикации. */
    setThemePublished: (id: string, publish: boolean) => Promise<void>;
}

const DEFAULT_CUSTOM_COLORS: CustomColors = {
    primary: '#006aff',
    secondary: '#7000ff',
    accent: '#ff00c8'
};

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<AppearanceSettings>(() => {
        const saved = localStorage.getItem('appearance-settings');
        const deviceKey = getDeviceIdKey();
        if (saved) {
            const parsed = JSON.parse(saved);
            const devScales: DeviceScalesMap = parsed.deviceScales || {};
            const localDeviceConfig = devScales[deviceKey];

            return {
                theme: parsed.theme === 'amoled' ? 'amoled' : 'dark',
                density: parsed.density || 'cozy',
                messageSpacing: parsed.messageSpacing ?? 2,
                groupSpacing: parsed.groupSpacing ?? 16,
                interfaceScale: localDeviceConfig?.interfaceScale ?? parsed.interfaceScale ?? 1.0,
                pageScales: localDeviceConfig?.pageScales || parsed.pageScales || {},
                deviceScales: devScales,
                screenReader: parsed.screenReader ?? false,
                appIcon: parsed.appIcon || 'default',
                performanceMode: parsed.performanceMode ?? false,
                reduceMotion: parsed.reduceMotion ?? false,
                customColors: parsed.customColors || { ...DEFAULT_CUSTOM_COLORS },
                customBackground: parsed.customBackground || '',
                backgroundDim: parsed.backgroundDim ?? 40,
                backgroundBlur: parsed.backgroundBlur ?? 0
            };
        }
        return {
            theme: 'dark',
            density: 'cozy',
            messageSpacing: 2,
            groupSpacing: 16,
            interfaceScale: 1.0,
            pageScales: {},
            deviceScales: {},
            screenReader: false,
            appIcon: 'default',
            performanceMode: false,
            reduceMotion: false,
            customColors: { ...DEFAULT_CUSTOM_COLORS },
            customBackground: '',
            backgroundDim: 40,
            backgroundBlur: 0,
        };
    });

    const [savedThemes, setSavedThemes] = useState<ThemeObject[]>([]);
    const [isLoadingThemes, setIsLoadingThemes] = useState(false);
    const [publicThemes, setPublicThemes] = useState<ThemeObject[]>([]);
    const [isLoadingPublic, setIsLoadingPublic] = useState(false);
    const [activeThemeId, setActiveThemeId] = useState<string | null>(localStorage.getItem('active-theme-id'));

    const fetchSettings = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const res = await axios.get('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.data.settings && res.data.settings.appearance) {
                const s = res.data.settings.appearance;
                const acc = res.data.settings.accessibility || {};
                const deviceKey = getDeviceIdKey();
                const devScales: DeviceScalesMap = s.deviceScales || {};
                const localDeviceConfig = devScales[deviceKey];

                setSettings(prev => ({
                    ...prev,
                    theme: s.theme || prev.theme,
                    deviceScales: devScales,
                    interfaceScale: localDeviceConfig?.interfaceScale ?? acc.interfaceScale ?? s.interfaceScale ?? prev.interfaceScale,
                    pageScales: localDeviceConfig?.pageScales || s.pageScales || prev.pageScales,
                    screenReader: acc.screenReader ?? prev.screenReader,
                    appIcon: s.appIcon || prev.appIcon,
                    reduceMotion: s.reduceMotion ?? prev.reduceMotion,
                    performanceMode: s.performanceMode ?? prev.performanceMode,
                    customColors: s.customColors || prev.customColors,
                    customBackground: s.customBackground ?? prev.customBackground,
                    backgroundDim: s.backgroundDim ?? prev.backgroundDim,
                    backgroundBlur: s.backgroundBlur ?? prev.backgroundBlur,
                }));
            }
        } catch (err) {
            console.error('Failed to fetch user settings', err);
        }
    }, []);

    const syncSettings = useCallback(async (newSettings: AppearanceSettings) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            await axios.put('/api/users/settings', {
                settings: { 
                    appearance: {
                        theme: newSettings.theme,
                        density: newSettings.density,
                        messageSpacing: newSettings.messageSpacing,
                        groupSpacing: newSettings.groupSpacing,
                        pageScales: newSettings.pageScales,
                        deviceScales: newSettings.deviceScales,
                        appIcon: newSettings.appIcon,
                        reduceMotion: newSettings.reduceMotion,
                        performanceMode: newSettings.performanceMode,
                        customColors: newSettings.customColors,
                        customBackground: newSettings.customBackground,
                        backgroundDim: newSettings.backgroundDim,
                        backgroundBlur: newSettings.backgroundBlur,
                    },
                    accessibility: {
                        screenReader: newSettings.screenReader,
                        interfaceScale: newSettings.interfaceScale
                    }
                }
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (err) {
            console.error('Failed to sync settings to server', err);
        }
    }, []);

    const fetchThemes = useCallback(async () => {
        setIsLoadingThemes(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            
            const res = await axios.get('/api/themes', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSavedThemes(res.data);
        } catch (err) {
            console.error('Failed to fetch themes', err);
        } finally {
            setIsLoadingThemes(false);
        }
    }, []);

    /**
     * Общий список тем. Отдельный запрос, а не часть своих: он нужен только
     * когда человек открыл вкладку с чужими темами, и тянуть его при каждом
     * входе в приложение незачем.
     */
    const fetchPublicThemes = useCallback(async (query?: string) => {
        setIsLoadingPublic(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const res = await axios.get('/api/themes/public', {
                params: query ? { q: query } : undefined,
                headers: { Authorization: `Bearer ${token}` }
            });
            setPublicThemes(res.data || []);
        } catch (err) {
            console.error('Не удалось загрузить общие темы', err);
        } finally {
            setIsLoadingPublic(false);
        }
    }, []);

    const setThemePublished = useCallback(async (id: string, publish: boolean) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const res = await axios.post(`/api/themes/${id}/publish`, { publish }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSavedThemes(prev => prev.map(t => t._id === id ? res.data : t));
        } catch (err) {
            console.error('Не удалось изменить публикацию темы', err);
            throw err;
        }
    }, []);

    useEffect(() => {
        fetchSettings();
        fetchThemes();
    }, [fetchSettings, fetchThemes]);

    useEffect(() => {
        localStorage.setItem('appearance-settings', JSON.stringify(settings));
        if (activeThemeId) {
            localStorage.setItem('active-theme-id', activeThemeId);
        } else {
            localStorage.removeItem('active-theme-id');
        }
        applySettings(settings);

        // Sync with server (throttled/debounced would be better, but for now simple sync)
        const timer = setTimeout(() => {
            syncSettings(settings);
        }, 2000);

        const electron = (window as any).electron;
        if (electron && electron.ipc) {
            electron.ipc.send('change-icon', settings.appIcon);
        }

        updateFavicon(settings.appIcon);

        return () => clearTimeout(timer);
    }, [settings, activeThemeId, syncSettings]);

    const updateFavicon = (iconType: AppIconType) => {
        const brand = getIconBrand();
        const iconOption = brand.appIcons.find(i => i.id === iconType) || brand.appIcons[0];
        const fileName = iconOption.img;
        const fullUrl = `${import.meta.env.BASE_URL}${fileName}`;

        const linkTags = document.querySelectorAll("link[rel*='icon']");
        
        if (linkTags.length > 0) {
            linkTags.forEach(tag => {
                (tag as HTMLLinkElement).href = fullUrl;
            });
        } else {
            const newLink = document.createElement('link');
            newLink.rel = 'icon';
            newLink.href = fullUrl;
            document.head.appendChild(newLink);
        }
    };

    const applySettings = (s: AppearanceSettings) => {
        const root = document.documentElement;
        root.dataset.theme = s.theme;

        if (s.theme === 'dark') {
            root.style.setProperty('--bg-primary', '#36393f');
            root.style.setProperty('--bg-dark', '#020205');
            root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.04)');
            root.style.setProperty('--glass-bg-subtle', 'rgba(255, 255, 255, 0.02)');
            root.style.setProperty('--glass-bg-active', 'rgba(255, 255, 255, 0.1)');
            root.style.setProperty('--glass-bg-accent', 'rgba(255, 255, 255, 0.05)');
            root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.08)');
            root.style.setProperty('--text-main', '#ffffff');
            root.style.setProperty('--text-dim', 'rgba(255, 255, 255, 0.45)');
            root.style.setProperty('--header-primary', '#ffffff');
            root.style.setProperty('--border-divider', 'rgba(255, 255, 255, 0.06)');
        } else if (s.theme === 'amoled') {
            root.style.setProperty('--bg-primary', '#000000');
            root.style.setProperty('--bg-dark', '#000000');
            root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.04)');
            root.style.setProperty('--glass-bg-subtle', 'rgba(255, 255, 255, 0.02)');
            root.style.setProperty('--glass-bg-active', 'rgba(255, 255, 255, 0.08)');
            root.style.setProperty('--glass-bg-accent', 'rgba(255, 255, 255, 0.04)');
            root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.1)');
            root.style.setProperty('--text-main', '#ffffff');
            root.style.setProperty('--text-dim', 'rgba(255, 255, 255, 0.5)');
            root.style.setProperty('--header-primary', '#ffffff');
            root.style.setProperty('--border-divider', 'rgba(255, 255, 255, 0.1)');
        }

        root.style.setProperty('--primary-neon', s.customColors.primary);
        root.style.setProperty('--secondary-neon', s.customColors.secondary);
        root.style.setProperty('--accent-pink', s.customColors.accent);

        // Режим производительности гасит размытие, но не сам фон — см. App.tsx.
        // Раньше условие включало !performanceMode, и разметка с переменными
        // расходились бы в том, показан фон или нет.
        if (s.customBackground) {
            root.style.setProperty('--custom-bg-image', `url(${s.customBackground})`);
            root.style.setProperty('--custom-bg-dim', (s.backgroundDim / 100).toString());
            root.style.setProperty('--custom-bg-blur', s.performanceMode ? '0px' : `${s.backgroundBlur}px`);
            root.classList.add('has-custom-bg');
        } else {
            root.style.removeProperty('--custom-bg-image');
            root.style.removeProperty('--custom-bg-dim');
            root.style.removeProperty('--custom-bg-blur');
            root.classList.remove('has-custom-bg');
        }

        root.style.setProperty('--message-spacing', `${s.messageSpacing}px`);
        root.style.setProperty('--group-spacing', `${s.groupSpacing}px`);

        root.style.setProperty('--interface-scale', s.interfaceScale.toString());
        root.style.setProperty('--base-font-size', `${16 * s.interfaceScale}px`);

        const ps = s.pageScales || {};
        root.style.setProperty('--sidebar-scale', (ps.sidebar ?? s.interfaceScale).toString());
        root.style.setProperty('--chat-scale', (ps.chat ?? s.interfaceScale).toString());
        root.style.setProperty('--members-scale', (ps.members ?? s.interfaceScale).toString());
        root.style.setProperty('--settings-scale', (ps.settings ?? s.interfaceScale).toString());

        if (s.density === 'compact') {
            root.style.setProperty('--message-padding-v', '2px');
            root.style.setProperty('--message-margin-v', '0px');
            root.style.setProperty('--avatar-size', '32px');
            root.style.setProperty('--avatar-radius', '10px');
        } else {
            root.style.setProperty('--message-padding-v', '10px');
            root.style.setProperty('--message-margin-v', '2px');
            root.style.setProperty('--avatar-size', '42px');
            root.style.setProperty('--avatar-radius', '14px');
        }

        if (s.performanceMode) {
            root.classList.add('performance-mode');
            root.style.setProperty('--glass-blur-value', '0px');
        } else {
            root.classList.remove('performance-mode');
            root.style.setProperty('--glass-blur-value', '28px');
        }

        if (s.reduceMotion) {
            root.classList.add('reduce-motion');
            document.body.dataset.reduceMotion = "force";
        } else {
            root.classList.remove('reduce-motion');
            document.body.dataset.reduceMotion = "none";
        }
    };

    const setTheme = (theme: ThemeType) => {
        setSettings(prev => ({ ...prev, theme }));
        setActiveThemeId(null);
    };
    const setDensity = (density: DensityType) => setSettings(prev => ({ ...prev, density }));
    const setMessageSpacing = (messageSpacing: number) => {
        setSettings(prev => ({ ...prev, messageSpacing }));
        setActiveThemeId(null);
    };
    const setGroupSpacing = (groupSpacing: number) => {
        setSettings(prev => ({ ...prev, groupSpacing }));
        setActiveThemeId(null);
    };
    const setInterfaceScale = (interfaceScale: number) => {
        setSettings(prev => {
            const deviceKey = getDeviceIdKey();
            const updatedDeviceScales: DeviceScalesMap = {
                ...prev.deviceScales,
                [deviceKey]: {
                    interfaceScale,
                    pageScales: prev.pageScales
                }
            };
            return {
                ...prev,
                interfaceScale,
                deviceScales: updatedDeviceScales
            };
        });
        setActiveThemeId(null);
    };
    const setPageScales = (scales: Partial<PageScales>) => {
        setSettings(prev => {
            const deviceKey = getDeviceIdKey();
            const newPageScales = { ...prev.pageScales, ...scales };
            const updatedDeviceScales: DeviceScalesMap = {
                ...prev.deviceScales,
                [deviceKey]: {
                    interfaceScale: prev.interfaceScale,
                    pageScales: newPageScales
                }
            };
            return {
                ...prev,
                pageScales: newPageScales,
                deviceScales: updatedDeviceScales
            };
        });
        setActiveThemeId(null);
    };
    const setAppIcon = (appIcon: AppIconType) => setSettings(prev => ({ ...prev, appIcon }));
    const setPerformanceMode = (performanceMode: boolean) => setSettings(prev => ({ ...prev, performanceMode }));
    const setReduceMotion = (reduceMotion: boolean) => setSettings(prev => ({ ...prev, reduceMotion }));
    const setScreenReader = (screenReader: boolean) => setSettings(prev => ({ ...prev, screenReader }));
    
    const setCustomColors = (colors: Partial<CustomColors>) => {
        setSettings(prev => ({
            ...prev,
            customColors: { ...prev.customColors, ...colors }
        }));
        setActiveThemeId(null);
    };

    const setCustomBackground = (customBackground: string) => {
        setSettings(prev => ({ ...prev, customBackground }));
        setActiveThemeId(null);
    };
    const setBackgroundDim = (backgroundDim: number) => {
        setSettings(prev => ({ ...prev, backgroundDim }));
        setActiveThemeId(null);
    };
    const setBackgroundBlur = (backgroundBlur: number) => {
        setSettings(prev => ({ ...prev, backgroundBlur }));
        setActiveThemeId(null);
    };

    const resetCustomTheme = () => {
        setSettings(prev => ({
            ...prev,
            customColors: { ...DEFAULT_CUSTOM_COLORS },
            customBackground: '',
            backgroundDim: 40,
            backgroundBlur: 0,
            theme: 'dark'
        }));
        setActiveThemeId(null);
    };

    const saveTheme = async (name: string, isPublic: boolean) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const themeData: ThemeObject = {
                name,
                theme: settings.theme,
                customColors: settings.customColors,
                customBackground: settings.customBackground,
                backgroundDim: settings.backgroundDim,
                backgroundBlur: settings.backgroundBlur,
                messageSpacing: settings.messageSpacing,
                groupSpacing: settings.groupSpacing,
                interfaceScale: settings.interfaceScale,
                isPublic
            };

            const res = await axios.post('/api/themes', themeData, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setSavedThemes(prev => [res.data, ...prev]);
            setActiveThemeId(res.data._id);
        } catch (err) {
            console.error('Failed to save theme', err);
        }
    };

    const applyTheme = (theme: ThemeObject) => {
        // Счётчик применений у опубликованных тем — по нему строится порядок
        // в общем списке. Ошибку глушим: не смогли посчитать — тема всё равно
        // должна примениться.
        if (theme._id && theme.isPublished) {
            const token = localStorage.getItem('token');
            if (token) {
                axios.post(`/api/themes/${theme._id}/install`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                }).catch(() => { });
            }
        }
        setSettings(prev => ({
            ...prev,
            theme: theme.theme,
            customColors: theme.customColors,
            customBackground: theme.customBackground,
            backgroundDim: theme.backgroundDim,
            backgroundBlur: theme.backgroundBlur,
            messageSpacing: theme.messageSpacing,
            groupSpacing: theme.groupSpacing,
            interfaceScale: theme.interfaceScale
        }));
        if (theme._id) setActiveThemeId(theme._id);
    };

    const deleteTheme = async (id: string) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            await axios.delete(`/api/themes/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setSavedThemes(prev => prev.filter(t => t._id !== id));
            if (activeThemeId === id) setActiveThemeId(null);
        } catch (err) {
            console.error('Failed to delete theme', err);
        }
    };

    return (
        <AppearanceContext.Provider value={{
            ...settings,
            setTheme,
            setDensity,
            setMessageSpacing,
            setGroupSpacing,
            setInterfaceScale,
            setPageScales,
            setAppIcon,
            setPerformanceMode,
            setReduceMotion,
            setScreenReader,
            setCustomColors,
            setCustomBackground,
            setBackgroundDim,
            setBackgroundBlur,
            resetCustomTheme,
            
            savedThemes,
            isLoadingThemes,
            activeThemeId,
            publicThemes,
            isLoadingPublic,
            fetchPublicThemes,
            setThemePublished,
            fetchThemes,
            saveTheme,
            applyTheme,
            deleteTheme
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
