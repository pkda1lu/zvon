const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false, // Disable for security
            contextIsolation: true, // Enable for security with preload
            enableRemoteModule: false,
            webSecurity: true, // Keep web security enabled for getDisplayMedia
            // Allow access to media devices
            allowRunningInsecureContent: false,
            preload: isDev 
                ? path.join(__dirname, '../public/preload.js')
                : path.join(__dirname, 'preload.js'), // Load preload script for desktopCapturer
        },
        autoHideMenuBar: true, // Hide default menu
        icon: path.join(__dirname, 'favicon.ico'), // Ensure you have an icon if possible
    });

    // Handle screen sharing permissions
    mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
        event.preventDefault();
        callback('');
    });

    // Request media access permissions
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture'];
        if (allowedPermissions.includes(permission)) {
            callback(true); // Allow
        } else {
            callback(false); // Deny
        }
    });

    // Handle media access check
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture'];
        return allowedPermissions.includes(permission);
    });

    // Wait for preload to be ready and check if it loaded
    const preloadPath = path.join(__dirname, isDev ? '../public/preload.js' : 'preload.js');
    console.log('Preload path:', preloadPath);
    const fs = require('fs');
    if (fs.existsSync(preloadPath)) {
        console.log('Preload file exists');
    } else {
        console.error('Preload file NOT found at:', preloadPath);
    }

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Window loaded, checking Electron API availability...');
        mainWindow.webContents.executeJavaScript(`
            console.log('Window electron API:', typeof window.electron);
            console.log('Window electron keys:', window.electron ? Object.keys(window.electron) : 'undefined');
            console.log('Window process:', typeof window.process);
        `).catch(console.error);
    });

    mainWindow.loadURL(
        isDev
            ? 'http://localhost:3000'
            : `file://${path.join(__dirname, 'index.html')}`
    );

    // Filter out non-critical console errors
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        // Ignore Autofill API errors (not supported in Electron, but harmless)
        if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
            return; // Suppress these messages
        }
        // You can log other messages if needed
    });

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

// IPC handler for desktopCapturer (fallback if preload doesn't work)
ipcMain.handle('get-desktop-sources', async (event, options) => {
    try {
        const sources = await desktopCapturer.getSources(options);
        return sources;
    } catch (error) {
        console.error('Error getting desktop sources:', error);
        throw error;
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
