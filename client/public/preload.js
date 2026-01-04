// Preload script for Electron
// This script runs in the renderer process before the web page loads
console.log('Preload script loading...');

const { contextBridge, ipcRenderer } = require('electron');
const { desktopCapturer } = require('electron');

console.log('Preload: Electron modules loaded');

// Expose protected methods that allow the renderer process to use
// the desktopCapturer API
try {
    // Always use IPC for better compatibility
    const getSourcesFn = (options) => {
        console.log('Preload: getSources called via IPC with options:', options);
        return ipcRenderer.invoke('get-desktop-sources', options);
    };

    // Also try direct access as primary method
    let directGetSourcesFn;
    try {
        directGetSourcesFn = (options) => {
            console.log('Preload: getSources called directly with options:', options);
            return desktopCapturer.getSources(options);
        };
    } catch (e) {
        console.log('Preload: Direct desktopCapturer access failed, using IPC only');
        directGetSourcesFn = getSourcesFn;
    }

    const electronAPI = {
        desktopCapturer: {
            getSources: directGetSourcesFn
        },
        isElectron: true,
        // Also expose IPC for fallback
        ipc: {
            invoke: (channel, ...args) => {
                console.log('Preload: IPC invoke:', channel, args);
                return ipcRenderer.invoke(channel, ...args);
            }
        }
    };

    contextBridge.exposeInMainWorld('electron', electronAPI);
    console.log('Preload: Electron API exposed successfully', Object.keys(electronAPI));
} catch (error) {
    console.error('Preload: Error exposing Electron API:', error);
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
    }
}

console.log('Preload script loaded');

