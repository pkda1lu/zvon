import React, { createContext, useContext, useState, useEffect } from 'react';
import { soundManager } from '../utils/sounds';
import axios from 'axios';

interface WindowSettings {
    autoStart: boolean;
    minimizeToTray: boolean;
    closeToTray: boolean;
    startMinimized: boolean;
    hardwareAcceleration: boolean;
    appVersion: string;
    // Streamer Mode
    streamerModeEnabled: boolean;
    autoEnableWithOBS: boolean;
    streamerLink: string;
    censorInfo: boolean;
    disableSounds: boolean;
    disableNotifications: boolean;
    changeStatusToStreaming: boolean;
    confirmSettingsAccess: boolean;
    // Windows Actions
    activityDetectionEnabled: boolean;
    overlayCategories: string[];
    // Overlay
    overlayEnabled: boolean;
    overlayPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    overlayOpacity: number;
    overlaySize: number;
    overlayShowNames: boolean;
    overlayShowAvatars: boolean;
    overlayShowSpeakingRing: boolean;
    overlayIdleOpacity: number;
    overlayShowBackground: boolean;
    // User Apps
    userApps: Record<string, { name: string; type: string }>;
}

interface WindowSettingsContextType extends WindowSettings {
    setAutoStart: (value: boolean) => void;
    setMinimizeToTray: (value: boolean) => void;
    setCloseToTray: (value: boolean) => void;
    setStartMinimized: (value: boolean) => void;
    setHardwareAcceleration: (value: boolean) => void;
    setStreamerModeEnabled: (value: boolean) => void;
    setAutoEnableWithOBS: (value: boolean) => void;
    setStreamerLink: (value: string) => void;
    setCensorInfo: (value: boolean) => void;
    setDisableSounds: (value: boolean) => void;
    setDisableNotifications: (value: boolean) => void;
    setChangeStatusToStreaming: (value: boolean) => void;
    setConfirmSettingsAccess: (value: boolean) => void;
    setActivityDetectionEnabled: (value: boolean) => void;
    setOverlayCategories: (value: string[]) => void;
    setOverlayEnabled: (value: boolean) => void;
    setOverlayPosition: (value: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => void;
    setOverlayOpacity: (value: number) => void;
    setOverlaySize: (value: number) => void;
    setOverlayShowNames: (value: boolean) => void;
    setOverlayShowAvatars: (value: boolean) => void;
    setOverlayShowSpeakingRing: (value: boolean) => void;
    setOverlayIdleOpacity: (value: number) => void;
    setOverlayShowBackground: (value: boolean) => void;
    setUserApps: (userApps: Record<string, { name: string; type: string }>) => void;
}

const WindowSettingsContext = createContext<WindowSettingsContextType | undefined>(undefined);

export const WindowSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [appVersion, setAppVersion] = useState('1.6.79');
    const [settings, setSettings] = useState<WindowSettings>(() => {
        const saved = localStorage.getItem('window-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                autoStart: false,
                minimizeToTray: true,
                closeToTray: true,
                startMinimized: false,
                hardwareAcceleration: true,
                streamerModeEnabled: false,
                autoEnableWithOBS: true,
                censorInfo: true,
                disableSounds: true,
                disableNotifications: true,
                changeStatusToStreaming: true,
                confirmSettingsAccess: true,
                activityDetectionEnabled: true,
                streamerLink: '',
                overlayCategories: ['game', 'music', 'video'],
                overlayEnabled: true,
                overlayPosition: 'top-left',
                overlayOpacity: 1.0,
                overlaySize: 1.0,
                overlayShowNames: true,
                overlayShowAvatars: true,
                overlayShowSpeakingRing: true,
                overlayIdleOpacity: 0.5,
                overlayShowBackground: true,
                userApps: {},
                ...parsed
            };
        }
        return {
            autoStart: false,
            minimizeToTray: true,
            closeToTray: true,
            startMinimized: false,
            hardwareAcceleration: true,
            streamerModeEnabled: false,
            autoEnableWithOBS: true,
            streamerLink: '',
            censorInfo: true,
            disableSounds: true,
            disableNotifications: true,
            changeStatusToStreaming: true,
            confirmSettingsAccess: true,
            activityDetectionEnabled: true,
            overlayCategories: ['game', 'music', 'video'],
            overlayEnabled: true,
            overlayPosition: 'top-left',
            overlayOpacity: 1.0,
            overlaySize: 1.0,
            overlayShowNames: true,
            overlayShowAvatars: true,
            overlayShowSpeakingRing: true,
            overlayIdleOpacity: 0.5,
            overlayShowBackground: true,
            userApps: {},
        };
    });

    useEffect(() => {
        // Initial setup on mount
        // @ts-ignore
        const electron = window.electron;
        if (electron && electron.ipc) {
            // Get version once
            electron.ipc.invoke('get-app-version').then((v: string) => {
                if (v && v !== '1.0.0') setAppVersion(v);
            });

            // Sync current settings once
            electron.ipc.invoke('toggle-autostart', settings.autoStart).catch(() => { });
            electron.ipc.send('update-window-settings', {
                minimizeToTray: settings.minimizeToTray,
                closeToTray: settings.closeToTray,
                startMinimized: settings.startMinimized,
                activityDetectionEnabled: settings.activityDetectionEnabled,
                overlayCategories: settings.overlayCategories
            });
            electron.ipc.send('update-user-apps', settings.userApps || {});

            // Set HW Acceleration
            electron.ipc.send('set-hardware-acceleration', settings.hardwareAcceleration);

            // OBS Detection
            if (settings.autoEnableWithOBS) {
                const checkOBS = async () => {
                    const isOBSRunning64 = await electron.ipc.invoke('check-process', 'obs64.exe');
                    const isOBSRunning32 = await electron.ipc.invoke('check-process', 'obs32.exe');
                    if ((isOBSRunning64 || isOBSRunning32) && !settings.streamerModeEnabled) {
                        setSettings(prev => ({ ...prev, streamerModeEnabled: true }));
                    }
                };
                checkOBS();
                const interval = setInterval(checkOBS, 10000);
                return () => clearInterval(interval);
            }
        }
    }, [settings.autoEnableWithOBS]);

    useEffect(() => {
        localStorage.setItem('window-settings', JSON.stringify(settings));

        // Sync with SoundManager
        soundManager.setStreamerMode(settings.streamerModeEnabled, settings.disableSounds);

        // Sync with Electron
        // @ts-ignore
        const electron = window.electron;
        if (electron && electron.ipc) {
            electron.ipc.invoke('toggle-autostart', settings.autoStart).catch(() => { });
            electron.ipc.send('update-window-settings', {
                minimizeToTray: settings.minimizeToTray,
                closeToTray: settings.closeToTray,
                startMinimized: settings.startMinimized,
                activityDetectionEnabled: settings.activityDetectionEnabled,
                overlayCategories: settings.overlayCategories
            });
            electron.ipc.send('set-hardware-acceleration', settings.hardwareAcceleration);
            
            // Sync Overlay
            electron.ipc.send('toggle-overlay', settings.overlayEnabled);
            electron.ipc.send('update-overlay-config', {
                position: settings.overlayPosition,
                opacity: settings.overlayOpacity,
                size: settings.overlaySize,
                showNames: settings.overlayShowNames,
                showAvatars: settings.overlayShowAvatars,
                showSpeakingRing: settings.overlayShowSpeakingRing,
                idleOpacity: settings.overlayIdleOpacity,
                showBackground: settings.overlayShowBackground
            });
        }

        // Sync with Server (only relevant settings)
        const token = localStorage.getItem('token');
        if (token) {
            const syncTimeout = setTimeout(() => {
                axios.put('/api/users/settings', {
                    settings: {
                        streamerMode: {
                            enabled: settings.streamerModeEnabled,
                            autoEnableWithOBS: settings.autoEnableWithOBS,
                            streamerLink: settings.streamerLink,
                            censorInfo: settings.censorInfo,
                            disableSounds: settings.disableSounds,
                            disableNotifications: settings.disableNotifications,
                            changeStatusToStreaming: settings.changeStatusToStreaming,
                            confirmSettingsAccess: settings.confirmSettingsAccess
                        },
                        windows: {
                            activityDetectionEnabled: settings.activityDetectionEnabled,
                            overlayCategories: settings.overlayCategories
                        },
                        overlay: {
                            enabled: settings.overlayEnabled,
                            position: settings.overlayPosition,
                            opacity: settings.overlayOpacity,
                            size: settings.overlaySize,
                            showNames: settings.overlayShowNames,
                            showAvatars: settings.overlayShowAvatars,
                            showSpeakingRing: settings.overlayShowSpeakingRing,
                            idleOpacity: settings.overlayIdleOpacity,
                            showBackground: settings.overlayShowBackground
                        }
                    }
                }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
            }, 1500); // 1.5s debounce to be safe
            return () => clearTimeout(syncTimeout);
        }
    }, [settings]);

    const setAutoStart = (autoStart: boolean) => setSettings(prev => ({ ...prev, autoStart }));
    const setMinimizeToTray = (minimizeToTray: boolean) => setSettings(prev => ({ ...prev, minimizeToTray }));
    const setCloseToTray = (closeToTray: boolean) => setSettings(prev => ({ ...prev, closeToTray }));
    const setStartMinimized = (startMinimized: boolean) => setSettings(prev => ({ ...prev, startMinimized }));
    const setHardwareAcceleration = (hardwareAcceleration: boolean) => setSettings(prev => ({ ...prev, hardwareAcceleration }));
    const setStreamerModeEnabled = (streamerModeEnabled: boolean) => setSettings(prev => ({ ...prev, streamerModeEnabled }));
    const setAutoEnableWithOBS = (autoEnableWithOBS: boolean) => setSettings(prev => ({ ...prev, autoEnableWithOBS }));
    const setStreamerLink = (streamerLink: string) => setSettings(prev => ({ ...prev, streamerLink }));
    const setCensorInfo = (censorInfo: boolean) => setSettings(prev => ({ ...prev, censorInfo }));
    const setDisableSounds = (disableSounds: boolean) => setSettings(prev => ({ ...prev, disableSounds }));
    const setDisableNotifications = (disableNotifications: boolean) => setSettings(prev => ({ ...prev, disableNotifications }));
    const setChangeStatusToStreaming = (changeStatusToStreaming: boolean) => setSettings(prev => ({ ...prev, changeStatusToStreaming }));
    const setConfirmSettingsAccess = (confirmSettingsAccess: boolean) => setSettings(prev => ({ ...prev, confirmSettingsAccess }));
    const setActivityDetectionEnabled = (activityDetectionEnabled: boolean) => setSettings(prev => ({ ...prev, activityDetectionEnabled }));
    const setOverlayCategories = (overlayCategories: string[]) => setSettings(prev => ({ ...prev, overlayCategories }));
    const setOverlayEnabled = (overlayEnabled: boolean) => setSettings(prev => ({ ...prev, overlayEnabled }));
    const setOverlayPosition = (overlayPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => setSettings(prev => ({ ...prev, overlayPosition }));
    const setOverlayOpacity = (overlayOpacity: number) => setSettings(prev => ({ ...prev, overlayOpacity }));
    const setOverlaySize = (overlaySize: number) => setSettings(prev => ({ ...prev, overlaySize }));
    const setOverlayShowNames = (overlayShowNames: boolean) => setSettings(prev => ({ ...prev, overlayShowNames }));
    const setOverlayShowAvatars = (overlayShowAvatars: boolean) => setSettings(prev => ({ ...prev, overlayShowAvatars }));
    const setOverlayShowSpeakingRing = (overlayShowSpeakingRing: boolean) => setSettings(prev => ({ ...prev, overlayShowSpeakingRing }));
    const setOverlayIdleOpacity = (overlayIdleOpacity: number) => setSettings(prev => ({ ...prev, overlayIdleOpacity }));
    const setOverlayShowBackground = (overlayShowBackground: boolean) => setSettings(prev => ({ ...prev, overlayShowBackground }));
    const setUserApps = (userApps: Record<string, { name: string; type: string }>) => {
        setSettings(prev => ({ ...prev, userApps }));
        // @ts-ignore
        if (window.electron?.ipc) {
            // @ts-ignore
            window.electron.ipc.send('update-user-apps', userApps);
        }
    };

    return (
        <WindowSettingsContext.Provider value={{
            ...settings,
            setAutoStart,
            setMinimizeToTray,
            setCloseToTray,
            setStartMinimized,
            setHardwareAcceleration,
            setStreamerModeEnabled,
            setAutoEnableWithOBS,
            setStreamerLink,
            setCensorInfo,
            setDisableSounds,
            setDisableNotifications,
            setChangeStatusToStreaming,
            setConfirmSettingsAccess,
            setActivityDetectionEnabled,
            setOverlayCategories,
            setOverlayEnabled,
            setOverlayPosition,
            setOverlayOpacity,
            setOverlaySize,
            setOverlayShowNames,
            setOverlayShowAvatars,
            setOverlayShowSpeakingRing,
            setOverlayIdleOpacity,
            setOverlayShowBackground,
            setUserApps,
            appVersion
        }}>
            {children}
        </WindowSettingsContext.Provider>
    );
};

export const useWindowSettings = () => {
    const context = useContext(WindowSettingsContext);
    if (context === undefined) {
        throw new Error('useWindowSettings must be used within a WindowSettingsProvider');
    }
    return context;
};
