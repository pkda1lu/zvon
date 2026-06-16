import React, { createContext, useContext, useState, useEffect } from 'react';
import { soundManager } from '../utils/sounds';

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
    censorInfo: boolean;
    disableSounds: boolean;
    disableNotifications: boolean;
    changeStatusToStreaming: boolean;
}

interface WindowSettingsContextType extends WindowSettings {
    setAutoStart: (value: boolean) => void;
    setMinimizeToTray: (value: boolean) => void;
    setCloseToTray: (value: boolean) => void;
    setStartMinimized: (value: boolean) => void;
    setHardwareAcceleration: (value: boolean) => void;
    setStreamerModeEnabled: (value: boolean) => void;
    setAutoEnableWithOBS: (value: boolean) => void;
    setCensorInfo: (value: boolean) => void;
    setDisableSounds: (value: boolean) => void;
    setDisableNotifications: (value: boolean) => void;
    setChangeStatusToStreaming: (value: boolean) => void;
}

const WindowSettingsContext = createContext<WindowSettingsContextType | undefined>(undefined);

export const WindowSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [appVersion, setAppVersion] = useState('1.6.79');
    const [settings, setSettings] = useState<WindowSettings>(() => {
        const saved = localStorage.getItem('window-settings');
        if (saved) {
            return JSON.parse(saved);
        }
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
                startMinimized: settings.startMinimized
            });

            // Set HW Acceleration (handled in main process usually before window creation, 
            // but we can send it for next launch)
            electron.ipc.send('set-hardware-acceleration', settings.hardwareAcceleration);

            // OBS Detection for Streamer Mode
            if (settings.autoEnableWithOBS) {
                const checkOBS = async () => {
                    const isOBSRunning = await electron.ipc.invoke('check-process', 'obs64.exe');
                    if (isOBSRunning && !settings.streamerModeEnabled) {
                        setSettings(prev => ({ ...prev, streamerModeEnabled: true }));
                    } else if (!isOBSRunning && settings.streamerModeEnabled && settings.autoEnableWithOBS) {
                        // Optional: disable if OBS closed? Discord does this.
                        // For now let's just enable.
                    }
                };
                checkOBS();
                const interval = setInterval(checkOBS, 10000); // Check every 10s
                return () => clearInterval(interval);
            }
        }
    }, [settings.autoEnableWithOBS]);

    useEffect(() => {
        localStorage.setItem('window-settings', JSON.stringify(settings));

        // Sync with SoundManager
        soundManager.setStreamerMode(settings.streamerModeEnabled, settings.disableSounds);

        // Sync with Electron on change
        // @ts-ignore
        const electron = window.electron;
        if (electron && electron.ipc) {
            electron.ipc.invoke('toggle-autostart', settings.autoStart).catch(() => { });
            electron.ipc.send('update-window-settings', {
                minimizeToTray: settings.minimizeToTray,
                closeToTray: settings.closeToTray,
                startMinimized: settings.startMinimized
            });
            electron.ipc.send('set-hardware-acceleration', settings.hardwareAcceleration);
        }
    }, [settings]);

    const setAutoStart = (autoStart: boolean) => setSettings(prev => ({ ...prev, autoStart }));
    const setMinimizeToTray = (minimizeToTray: boolean) => setSettings(prev => ({ ...prev, minimizeToTray }));
    const setCloseToTray = (closeToTray: boolean) => setSettings(prev => ({ ...prev, closeToTray }));
    const setStartMinimized = (startMinimized: boolean) => setSettings(prev => ({ ...prev, startMinimized }));
    const setHardwareAcceleration = (hardwareAcceleration: boolean) => setSettings(prev => ({ ...prev, hardwareAcceleration }));
    const setStreamerModeEnabled = (streamerModeEnabled: boolean) => setSettings(prev => ({ ...prev, streamerModeEnabled }));
    const setAutoEnableWithOBS = (autoEnableWithOBS: boolean) => setSettings(prev => ({ ...prev, autoEnableWithOBS }));
    const setCensorInfo = (censorInfo: boolean) => setSettings(prev => ({ ...prev, censorInfo }));
    const setDisableSounds = (disableSounds: boolean) => setSettings(prev => ({ ...prev, disableSounds }));
    const setDisableNotifications = (disableNotifications: boolean) => setSettings(prev => ({ ...prev, disableNotifications }));
    const setChangeStatusToStreaming = (changeStatusToStreaming: boolean) => setSettings(prev => ({ ...prev, changeStatusToStreaming }));

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
            setCensorInfo,
            setDisableSounds,
            setDisableNotifications,
            setChangeStatusToStreaming,
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
