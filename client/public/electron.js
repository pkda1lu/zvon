const { app, BrowserWindow, desktopCapturer, ipcMain, clipboard } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let pendingDeepLink = null;
let mainWindow;

// Register the custom protocol
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('zvon', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('zvon');
}

// Check if app was opened with a protocol URL on startup
const startupUrl = process.argv.find(arg => arg.startsWith('zvon://'));
if (startupUrl) {
    pendingDeepLink = startupUrl;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            // Handle deep link from second instance
            const url = commandLine.find(arg => arg.startsWith('zvon://'));
            if (url) {
                mainWindow.webContents.send('deep-link', url);
            }
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
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            preload: isDev
                ? path.join(__dirname, '../public/preload.js')
                : path.join(__dirname, 'preload.js'),
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'app_icon.ico'),
    });

    // Handle Deep Links for macOS
    app.on('open-url', (event, url) => {
        event.preventDefault();
        if (mainWindow) {
            mainWindow.webContents.send('deep-link', url);
        } else {
            pendingDeepLink = url;
        }
    });


    // Handle screen sharing permissions
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture'];
        return allowedPermissions.includes(permission);
    });

    mainWindow.webContents.on('did-finish-load', () => {
        if (pendingDeepLink) {
            mainWindow.webContents.send('deep-link', pendingDeepLink);
            // We usually don't clear it here but let the renderer ask for it specifically to be sure
        }
    });

    mainWindow.on('enter-full-screen', () => {
        mainWindow.webContents.send('fullscreen-changed', true);
    });

    mainWindow.on('leave-full-screen', () => {
        mainWindow.webContents.send('fullscreen-changed', false);
    });

    mainWindow.loadURL(
        isDev
            ? 'http://localhost:3000'
            : `file://${path.join(__dirname, 'index.html')}`
    );

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}


// IPC handler to get pending deep link
ipcMain.handle('get-pending-deep-link', () => {
    const link = pendingDeepLink;
    pendingDeepLink = null; // Clear after retrieval
    return link;
});

// IPC handler for native clipboard write
ipcMain.on('clipboard-write', (event, text) => {
    try {
        clipboard.writeText(text);
    } catch (error) {
        console.error('Native clipboard write failed:', error);
    }
});

// IPC handler for desktopCapturer
ipcMain.handle('get-desktop-sources', async (event, options) => {
    try {
        const sources = await desktopCapturer.getSources(options);
        return sources;
    } catch (error) {
        console.error('Error getting desktop sources:', error);
        throw error;
    }
});

// IPC handler to toggle window fullscreen
ipcMain.handle('toggle-fullscreen', (event, isFullscreen) => {
    if (mainWindow) {
        mainWindow.setFullScreen(isFullscreen);
        return mainWindow.isFullScreen();
    }
    return false;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
