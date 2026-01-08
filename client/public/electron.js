const { app, BrowserWindow, desktopCapturer, ipcMain, clipboard, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

let pendingDeepLink = null;
let mainWindow;
let updaterWindow;
let tray = null;
let isQuitting = false;

// Window state management
const stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
    try {
        if (fs.existsSync(stateFilePath)) {
            const data = fs.readFileSync(stateFilePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load window state:', e);
    }
    return { width: 1280, height: 800 };
}

function saveWindowState() {
    if (!mainWindow) return;
    try {
        const bounds = mainWindow.getBounds();
        const isMaximized = mainWindow.isMaximized();
        const state = {
            ...bounds,
            isMaximized
        };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));
    } catch (e) {
        console.error('Failed to save window state:', e);
    }
}


// Basic autoUpdater configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Explicitly set the feed URL for GitHub
autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'pkda1lu',
    repo: 'zvon'
});

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
        if (isDev) {
            createWindow();
        } else {
            createUpdaterWindow();
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                if (isDev) createWindow();
                else createUpdaterWindow();
            }
        });
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'app_icon.ico');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Открыть Zvon',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: 'Выйти',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Zvon');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                if (mainWindow.isFocused()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                    mainWindow.focus();
                }
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function createUpdaterWindow() {
    // Ensure no tray icon for updater
    if (tray) {
        tray.destroy();
        tray = null;
    }

    updaterWindow = new BrowserWindow({
        width: 400,
        height: 500,
        frame: false,
        backgroundColor: '#1e1f22',
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    updaterWindow.loadFile(path.join(__dirname, 'updater.html'));

    updaterWindow.once('ready-to-show', () => {
        updaterWindow.show();
        if (!isDev) {
            log.info('Checking for updates...');
            autoUpdater.checkForUpdates().then((result) => {
                log.info('Check for updates result:', result ? 'Update found' : 'No update found');
            }).catch(err => {
                log.error('Check for updates failed:', err);
            });

            // Safety timeout: if checking takes too long (e.g. network issue), just start the app
            const safetyTimeout = setTimeout(() => {
                log.warn('Update check timed out, starting app...');
                createWindow();
                if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close();
            }, 10000); // 10 seconds timeout

            autoUpdater.on('update-available', () => clearTimeout(safetyTimeout));
            autoUpdater.on('update-not-available', () => clearTimeout(safetyTimeout));
            autoUpdater.on('error', () => clearTimeout(safetyTimeout));
        } else {
            // In dev mode, just wait a bit and open main window
            setTimeout(() => {
                createWindow();
                updaterWindow.close();
            }, 2000);
        }
    });

    // updater events
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        updaterWindow.webContents.send('updater-message', 'Проверка обновлений...');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info.version);
        updaterWindow.webContents.send('updater-message', `Найдено обновление ${info.version}. Загрузка...`);
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Update not available.');
        updaterWindow.webContents.send('updater-message', 'У вас последняя версия');
        setTimeout(() => {
            createWindow();
            if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close();
        }, 1000);
    });

    autoUpdater.on('error', (err) => {
        log.error('Updater error:', err);
        updaterWindow.webContents.send('updater-message', 'Ошибка при поиске обновлений');
        setTimeout(() => {
            createWindow();
            if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close();
        }, 2000);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        updaterWindow.webContents.send('updater-progress', progressObj.percent);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded:', info.version);
        updaterWindow.webContents.send('updater-message', 'Обновление скачано. Установка...');
        // Small delay to ensure the message is seen
        setTimeout(() => {
            autoUpdater.quitAndInstall();
        }, 1000);
    });
}

function createWindow() {
    const windowState = loadWindowState();

    // Validate bounds to ensure window is within work area (fixes taskbar overlap issues)
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;

    let { width, height, x, y } = windowState;

    // Ensure dimensions are valid
    if (!width || width < 800) width = 1280;
    if (!height || height < 600) height = 800;

    // Simple bounds check - if largely offscreen, reset to center
    if (x === undefined || y === undefined ||
        x < workArea.x || x > workArea.x + workArea.width ||
        y < workArea.y || y > workArea.y + workArea.height) {

        x = workArea.x + (workArea.width - width) / 2;
        y = workArea.y + (workArea.height - height) / 2;
    } else {
        // Clamp to work area if not maximized
        // This prevents the "under taskbar" issue if the saved state was weird
        if (!windowState.isMaximized) {
            if (width > workArea.width) width = workArea.width;
            if (height > workArea.height) height = workArea.height;
            if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;
        }
    }

    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        x: x,
        y: y,
        minWidth: 800,
        minHeight: 600,
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
        frame: false, // Frameless window
        backgroundColor: '#1e1f22',
        icon: path.join(__dirname, 'app_icon.ico'),
    });

    if (windowState.isMaximized) {
        mainWindow.maximize();
    }

    // Save state on events
    let saveTimeout;
    const debouncedSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveWindowState, 500);
    };

    mainWindow.on('resize', debouncedSave);
    mainWindow.on('move', debouncedSave);

    // Override close event to minimize to tray
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            saveWindowState();
            mainWindow.hide();
            return false;
        }
        saveWindowState();
    });

    // Create tray icon if it doesn't exist
    if (!tray) createTray();


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

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-maximized', true);
    });

    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-maximized', false);
    });

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

// IPC handler to change application icon
ipcMain.on('change-icon', (event, iconName) => {
    let iconFile = 'app_icon.ico';
    switch (iconName) {
        case 'icon1': iconFile = 'icon1.PNG'; break;
        case 'icon2': iconFile = 'icon2.png'; break;
        case 'icon3': iconFile = 'icon3.png'; break;
        case 'icon4': iconFile = 'icon4.png'; break;
        default: iconFile = 'app_icon.ico'; break;
    }

    // In dev mode, or whenever __dirname is correct (it should be public/)
    const iconPath = path.join(__dirname, iconFile);
    console.log('Changing icon to:', iconName, 'from path:', iconPath);

    try {
        if (!fs.existsSync(iconPath)) {
            console.error('Icon file does not exist at path:', iconPath);
            return;
        }

        const iconImage = nativeImage.createFromPath(iconPath);

        if (iconImage.isEmpty()) {
            console.error('Failed to create nativeImage from path:', iconPath);
            return;
        }

        if (mainWindow) {
            mainWindow.setIcon(iconImage);
            console.log('Main window icon set successfully');
        }
        if (tray) {
            tray.setImage(iconImage);
            console.log('Tray icon set successfully');
        }
    } catch (err) {
        console.error('Failed to change icon:', err);
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
ipcMain.handle('toggle-fullscreen', async (event, isFullscreen) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            mainWindow.setFullScreen(isFullscreen);
            // Wait a bit for the state to actually change
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(mainWindow.isFullScreen());
                }, 100);
            });
        } catch (err) {
            console.error('Error toggling fullscreen:', err);
            return false;
        }
    }
    return false;
});

// Window control IPC handlers
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

// Configure display media request handler for getDisplayMedia
app.on('web-contents-created', (event, contents) => {
    contents.session.setDisplayMediaRequestHandler((request, callback) => {
        const sourceId = pendingDisplaySourceId;
        console.log('DisplayMedia request received. Pending source ID:', sourceId);

        desktopCapturer.getSources({ types: ['window', 'screen'] }).then(sources => {
            let source = null;
            if (sourceId) {
                source = sources.find(s => s.id === sourceId);
                console.log('Searching for sourceId:', sourceId, 'Found:', source ? source.name : 'No');
            }

            // Fallback if no sourceId or not found
            if (!source && sources.length > 0) {
                source = sources.find(s => s.id.startsWith('screen:')) || sources[0];
                console.log('Fallback to source:', source.name);
            }

            if (source) {
                console.log('Selected source for DisplayMedia:', source.name, source.id);
                const isWindow = source.id.startsWith('window:');

                // On Windows/Linux, 'loopback' is required for system-wide audio when sharing screen
                // For windows, the source itself can sometimes provide audio
                const audioConfig = isWindow ? source : 'loopback';
                console.log('Using audio config:', audioConfig === 'loopback' ? 'loopback (system audio)' : 'source-specific');

                callback({
                    video: source,
                    audio: audioConfig,
                    enableLocalEcho: false
                });
            } else {
                console.warn('No media source found for DisplayMedia request');
                callback({ video: null, audio: null });
            }
        }).catch(err => {
            console.error('Error in setDisplayMediaRequestHandler:', err);
            callback({ video: null, audio: null });
        });

        pendingDisplaySourceId = null;
    });
});

let pendingDisplaySourceId = null;
ipcMain.on('set-pending-display-source', (event, sourceId) => {
    pendingDisplaySourceId = sourceId;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
