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

// Enable High Performance Screen Capture (Windows Graphics Capture & DXGI)
if (process.platform === 'win32') {
    // Windows Graphics Capture (WGC) is the modern way (Windows 10/11)
    // Win7DesktopDuplication activates the DXGI Desktop Duplication API
    app.commandLine.appendSwitch('enable-features', 'WindowsGraphicsCapture,Win7DesktopDuplication,WinDirectComposition,WebRTCPipeWireCapturer');

    // Performance and compatibility tweaks for capture
    app.commandLine.appendSwitch('disable-features', 'D3D11VideoDecoder'); // Prevents some capture black-screen issues
    app.commandLine.appendSwitch('enable-webrtc-hw-encoding');
    app.commandLine.appendSwitch('enable-webrtc-hw-decoding');
    app.commandLine.appendSwitch('enable-zero-copy-tab-capture');

    log.info('Enabled high performance capture and HW acceleration flags for Windows');
}

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
                if (typeof scanActivities === 'function') scanActivities();
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
            backgroundThrottling: false,
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

    mainWindow.once('ready-to-show', () => {
        if (typeof scanActivities === 'function') scanActivities();
    });

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

// Activity Detection
const { exec, execSync } = require('child_process');
let lastActivity = null;
let activityStartTime = null;
let scanInProgress = false;
let currentScanTimeout = null;
let adaptiveInterval = 3000;

const KNOWN_GAMES = {
    'VALORANT-Win64-Shipping.exe': { name: 'VALORANT', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/516575-285x380.jpg', type: 'game' },
    'cs2.exe': { name: 'Counter-Strike 2', icon: 'https://upload.wikimedia.org/wikipedia/en/f/f2/Counter-Strike_2_cover_art.jpg', type: 'game' },
    'csgo.exe': { name: 'CS:GO', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/32399_IGDB-285x380.jpg', type: 'game' },
    'Dota2.exe': { name: 'Dota 2', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/29595-285x380.jpg', type: 'game' },
    'League of Legends.exe': { name: 'League of Legends', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/21779-285x380.jpg', type: 'game' },
    'Minecraft.exe': { name: 'Minecraft', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg', type: 'game' },
    'RobloxPlayerBeta.exe': { name: 'Roblox', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/33214-285x380.jpg', type: 'game' },
    'Roblox.exe': { name: 'Roblox', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/33214-285x380.jpg', type: 'game' },
    'GenshinImpact.exe': { name: 'Genshin Impact', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/513181-285x380.jpg', type: 'game' },
    'aces.exe': { name: 'War Thunder', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/27546_IGDB-285x380.jpg', type: 'game' },
    'WarThunder.exe': { name: 'War Thunder', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/27546_IGDB-285x380.jpg', type: 'game' }
};

// Map to keep track of current exe to handle fast checks
let currentExe = null;

function scheduleNextScan() {
    if (currentScanTimeout) clearTimeout(currentScanTimeout);
    currentScanTimeout = setTimeout(scanActivities, adaptiveInterval);
}

// PowerShell script to get foreground process name
const FG_SCRIPT = `
$processId = (Get-Process | Where-Object { $_.MainWindowHandle -eq (Add-Type -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
'@ -Name "Win32" -Namespace "Win32" -PassThru)::GetForegroundWindow() }).Id
if ($processId) { (Get-Process -Id $processId).ProcessName + ".exe" }
`;

async function scanActivities() {
    if (process.platform !== 'win32' || scanInProgress) {
        scheduleNextScan();
        return;
    }
    scanInProgress = true;

    // Fast path: Check foreground window first (Instant sync)
    exec(`powershell -Command "${FG_SCRIPT.replace(/\n/g, '')}"`, (fgErr, fgStdout) => {
        const fgExe = fgStdout?.trim().toLowerCase();

        if (!fgErr && fgExe) {
            let foundMatch = null;
            let rawKey = null;
            for (const key in KNOWN_GAMES) {
                const keyLower = key.toLowerCase();
                const keyBase = keyLower.endsWith('.exe') ? keyLower.slice(0, -4) : keyLower;
                if (fgExe === keyLower || fgExe === keyBase || fgExe === keyBase + ".exe") {
                    foundMatch = KNOWN_GAMES[key];
                    rawKey = key;
                    break;
                }
            }

            // Priority logic for foreground: If foreground is a game, always use it.
            // If foreground is an app, we might still want to show a game running in BG.
            if (foundMatch && foundMatch.type === 'game') {
                updateActivity(foundMatch, rawKey);
                scanInProgress = false;
                adaptiveInterval = 2000;
                scheduleNextScan();
                return;
            }
        }

        // Background Audit: Find ALL running matches and prioritize
        performFullScan();
    });
}

function updateActivity(foundActivity, foundExe) {
    const currentName = foundActivity ? foundActivity.name : null;
    const lastName = lastActivity ? lastActivity.name : null;

    if (currentName !== lastName) {
        console.log(`[Activity] Sync: ${lastName || 'Nothing'} -> ${currentName || 'Nothing'}`);

        if (foundActivity) {
            lastActivity = { ...foundActivity };
            currentExe = foundExe;
            activityStartTime = Date.now();
        } else {
            lastActivity = null;
            currentExe = null;
            activityStartTime = null;
        }

        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('activity-changed', lastActivity ? {
                ...lastActivity,
                startTime: activityStartTime
            } : null);
        }
    }
}

function performFullScan() {
    exec('tasklist /NH /FO CSV', (err, stdout) => {
        scanInProgress = false;
        if (err) {
            adaptiveInterval = 5000;
            scheduleNextScan();
            return;
        }

        const lines = stdout.split(/\r?\n/);
        let bestMatch = null;
        let bestExe = null;

        for (const line of lines) {
            if (!line.trim()) continue;
            const parts = line.split('","');
            if (parts.length > 0) {
                const rawName = parts[0].replace(/"/g, '').trim();
                const exeNameLower = rawName.toLowerCase();
                const baseName = exeNameLower.endsWith('.exe') ? exeNameLower.slice(0, -4) : exeNameLower;

                for (const key in KNOWN_GAMES) {
                    const keyLower = key.toLowerCase();
                    const keyBase = keyLower.endsWith('.exe') ? keyLower.slice(0, -4) : keyLower;

                    if (exeNameLower === keyLower || baseName === keyBase) {
                        const activity = KNOWN_GAMES[key];

                        // PRIORITY LOGIC:
                        // 1. If we found a game, and haven't found a game yet, this is our new best match.
                        // 2. If we found an app, and we don't have ANY match yet, this is our current best.
                        // 3. Games always overwrite apps.
                        if (!bestMatch || (activity.type === 'game' && bestMatch.type !== 'game')) {
                            bestMatch = activity;
                            bestExe = rawName;
                        }

                        // If we already found a game, we can stop looking (assuming first game found is fine)
                        if (bestMatch && bestMatch.type === 'game') break;
                    }
                }
                if (bestMatch && bestMatch.type === 'game') break;
            }
        }

        updateActivity(bestMatch, bestExe);
        adaptiveInterval = bestMatch ? 3000 : 5000;
        scheduleNextScan();
    });
}

// Initial scan sequence
scanActivities();

ipcMain.handle('get-current-activity', () => {
    return lastActivity ? { ...lastActivity, startTime: activityStartTime } : null;
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
            }

            if (!source && sources.length > 0) {
                source = sources.find(s => s.id.startsWith('screen:')) || sources[0];
            }

            if (source) {
                console.log('Selected source for DisplayMedia:', source.name, source.id);
                const isWindow = source.id.startsWith('window:');

                // If sharing a window, we try to capture ONLY that window's audio
                // If sharing a screen, we use 'loopback-with-out-echo' if available or just 'loopback'
                // Note: 'loopback' on Windows 10/11 with WGC is quite good.

                let audioConfig = isWindow ? source : 'loopback';

                // Special case: if the window is ZVON itself, we might want to disable audio to prevent feedback
                const isZvonWindow = source.name.toLowerCase().includes('zvon');
                if (isZvonWindow && isWindow) {
                    console.log('Zvon window detected for sharing, disabling audio to prevent feedback loops');
                    audioConfig = null;
                }

                callback({
                    video: source,
                    audio: audioConfig || undefined,
                    enableLocalEcho: false
                });
            } else {
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
