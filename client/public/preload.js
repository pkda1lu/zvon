// Preload script for Electron
// This script runs in the renderer process before the web page loads
console.log('Preload script loading...');

const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload: Electron modules loaded');

// Expose protected methods that allow the renderer process to use
// the desktopCapturer API via IPC (desktopCapturer is not available in renderer process)
try {
    // Use IPC for desktopCapturer (required in renderer process with context isolation)
    const getSourcesFn = (options) => {
        console.log('Preload: getSources called via IPC with options:', options);
        return ipcRenderer.invoke('get-desktop-sources', options);
    };

    const electronAPI = {
        desktopCapturer: {
            getSources: getSourcesFn
        },
        isElectron: true,
        // Also expose IPC for direct access
        ipc: {
            invoke: (channel, ...args) => {
                console.log('Preload: IPC invoke:', channel, args);
                return ipcRenderer.invoke(channel, ...args);
            },
            on: (channel, func) => {
                const subscription = (event, ...args) => func(event, ...args);
                ipcRenderer.on(channel, subscription);
                return () => ipcRenderer.removeListener(channel, subscription);
            },
            send: (channel, ...args) => {
                ipcRenderer.send(channel, ...args);
            },
            removeAllListeners: (channel) => {
                ipcRenderer.removeAllListeners(channel);
            }
        },
        clipboard: {
            writeText: (text) => ipcRenderer.send('clipboard-write', text)
        },
        getCurrentActivity: () => ipcRenderer.invoke('get-current-activity'),
        onActivityChanged: (callback) => {
            const subscription = (event, activity) => callback(activity);
            ipcRenderer.on('activity-changed', subscription);
            return () => ipcRenderer.removeListener('activity-changed', subscription);
        },
        setPendingDisplaySource: (sourceId) => ipcRenderer.send('set-pending-display-source', sourceId),
        windowControls: {
            minimize: () => ipcRenderer.send('window-minimize'),
            maximize: () => ipcRenderer.send('window-maximize'),
            close: () => ipcRenderer.send('window-close')
        }
    };

    contextBridge.exposeInMainWorld('electron', electronAPI);
    console.log('Preload: Electron API exposed successfully');
    console.log('Preload: API keys:', Object.keys(electronAPI));
    console.log('Preload: desktopCapturer type:', typeof electronAPI.desktopCapturer);
    console.log('Preload: desktopCapturer.getSources type:', typeof electronAPI.desktopCapturer?.getSources);
    console.log('Preload: ipc type:', typeof electronAPI.ipc);
} catch (error) {
    console.error('Preload: Error exposing Electron API:', error);
    console.error('Preload: Error stack:', error.stack);
    // Fallback: expose IPC only
    try {
        const fallbackAPI = {
            desktopCapturer: {
                getSources: (options) => {
                    console.log('Preload: getSources called via IPC fallback with options:', options);
                    return ipcRenderer.invoke('get-desktop-sources', options);
                }
            },
            isElectron: true,
            ipc: {
                invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
            }
        };
        contextBridge.exposeInMainWorld('electron', fallbackAPI);
        console.log('Preload: Electron API exposed via IPC fallback', Object.keys(fallbackAPI));
    } catch (fallbackError) {
        console.error('Preload: Failed to expose Electron API even with IPC:', fallbackError);
        console.error('Preload: Fallback error stack:', fallbackError.stack);
    }
}

console.log('Preload script loaded and executed');

