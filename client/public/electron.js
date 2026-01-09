const { app, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage, screen, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let pendingDeepLink = null;
let mainWindow;
let updaterWindow;
let tray = null;
let isQuitting = false;

const stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
    try {
        if (fs.existsSync(stateFilePath)) {
            const data = fs.readFileSync(stateFilePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) { }
    return { width: 1280, height: 800 };
}

function saveWindowState() {
    if (!mainWindow) return;
    try {
        const bounds = mainWindow.getBounds();
        const state = { ...bounds, isMaximized: mainWindow.isMaximized() };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));
    } catch (e) { }
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.setFeedURL({ provider: 'github', owner: 'pkda1lu', repo: 'zvon' });

if (process.defaultApp) {
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient('zvon', process.execPath, [path.resolve(process.argv[1])]);
} else app.setAsDefaultProtocolClient('zvon');

const startupUrl = process.argv.find(arg => arg.startsWith('zvon://'));
if (startupUrl) pendingDeepLink = startupUrl;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            const url = commandLine.find(arg => arg.startsWith('zvon://'));
            if (url) mainWindow.webContents.send('deep-link', url);
        }
    });

    app.whenReady().then(() => {
        if (isDev) createWindow();
        else createUpdaterWindow();
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'app_icon.ico');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Открыть Zvon', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
        { label: 'Выйти', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip('Zvon');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                if (mainWindow.isFocused()) mainWindow.hide();
                else { mainWindow.show(); mainWindow.focus(); }
            } else { mainWindow.show(); mainWindow.focus(); }
        }
    });
}

function createUpdaterWindow() {
    updaterWindow = new BrowserWindow({ width: 400, height: 500, frame: false, backgroundColor: '#1e1f22', show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    updaterWindow.loadFile(path.join(__dirname, 'updater.html'));
    updaterWindow.once('ready-to-show', () => {
        updaterWindow.show();
        if (!isDev) {
            autoUpdater.checkForUpdates();
            const safetyTimeout = setTimeout(() => { createWindow(); if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close(); }, 10000);
            autoUpdater.on('update-available', () => clearTimeout(safetyTimeout));
            autoUpdater.on('update-not-available', () => clearTimeout(safetyTimeout));
            autoUpdater.on('error', () => clearTimeout(safetyTimeout));
        } else setTimeout(() => { createWindow(); updaterWindow.close(); }, 2000);
    });
    autoUpdater.on('checking-for-update', () => updaterWindow.webContents.send('updater-message', 'Проверка обновлений...'));
    autoUpdater.on('update-available', (info) => updaterWindow.webContents.send('updater-message', `Найдено обновление ${info.version}. Загрузка...`));
    autoUpdater.on('update-not-available', () => {
        updaterWindow.webContents.send('updater-message', 'У вас последняя версия');
        setTimeout(() => { createWindow(); if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close(); }, 1000);
    });
    autoUpdater.on('error', () => {
        updaterWindow.webContents.send('updater-message', 'Ошибка при поиске обновлений');
        setTimeout(() => { createWindow(); if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close(); }, 2000);
    });
    autoUpdater.on('download-progress', (progressObj) => updaterWindow.webContents.send('updater-progress', progressObj.percent));
    autoUpdater.on('update-downloaded', () => {
        updaterWindow.webContents.send('updater-message', 'Обновление скачано. Установка...');
        setTimeout(() => autoUpdater.quitAndInstall(), 1000);
    });
}

function createWindow() {
    const windowState = loadWindowState();
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;
    let { width, height, x, y } = windowState;
    if (!width || width < 800) width = 1280;
    if (!height || height < 600) height = 800;
    if (x === undefined || y === undefined || x < workArea.x || x > workArea.x + workArea.width || y < workArea.y || y > workArea.y + workArea.height) {
        x = workArea.x + (workArea.width - width) / 2;
        y = workArea.y + (workArea.height - height) / 2;
    } else if (!windowState.isMaximized) {
        if (width > workArea.width) width = workArea.width;
        if (height > workArea.height) height = workArea.height;
        if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;
    }
    mainWindow = new BrowserWindow({
        width, height, x, y, minWidth: 800, minHeight: 600,
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, enableRemoteModule: false, webSecurity: true, backgroundThrottling: false,
            preload: isDev ? path.join(__dirname, '../public/preload.js') : path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true, frame: false, backgroundColor: '#1e1f22', icon: path.join(__dirname, 'app_icon.ico')
    });
    if (windowState.isMaximized) mainWindow.maximize();
    mainWindow.once('ready-to-show', () => { scanActivities(); });
    let saveTimeout;
    const debouncedSave = () => { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveWindowState, 500); };
    mainWindow.on('resize', debouncedSave);
    mainWindow.on('move', debouncedSave);
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            saveWindowState();
            mainWindow.hide();
            return false;
        }
        saveWindowState();
    });
    if (!tray) createTray();
    app.on('open-url', (event, url) => {
        event.preventDefault();
        if (mainWindow) mainWindow.webContents.send('deep-link', url);
        else pendingDeepLink = url;
    });
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = ['media', 'microphone', 'camera'];
        callback(allowed.includes(permission));
    });
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
        const allowed = ['media', 'microphone', 'camera'];
        return allowed.includes(permission);
    });
    mainWindow.webContents.on('did-finish-load', () => {
        if (pendingDeepLink) mainWindow.webContents.send('deep-link', pendingDeepLink);
    });
    mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-changed', true));
    mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-changed', false));
    mainWindow.loadURL(isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, 'index.html')}`);
    mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
    if (isDev) mainWindow.webContents.openDevTools();
}

ipcMain.handle('get-pending-deep-link', () => {
    const link = pendingDeepLink;
    pendingDeepLink = null;
    return link;
});

ipcMain.on('clipboard-write', (event, text) => {
    try { clipboard.writeText(text); } catch (error) { }
});

const { exec } = require('child_process');
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

function scheduleNextScan() {
    if (currentScanTimeout) clearTimeout(currentScanTimeout);
    currentScanTimeout = setTimeout(scanActivities, adaptiveInterval);
}

const FG_SCRIPT = `$processId = (Get-Process | Where-Object { $_.MainWindowHandle -eq (Add-Type -MemberDefinition @'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();'@ -Name "Win32" -Namespace "Win32" -PassThru)::GetForegroundWindow() }).Id
if ($processId) { (Get-Process -Id $processId).ProcessName + ".exe" }`;

async function scanActivities() {
    if (process.platform !== 'win32' || scanInProgress) { scheduleNextScan(); return; }
    scanInProgress = true;
    exec(`powershell -Command "${FG_SCRIPT.replace(/\n/g, '')}"`, (fgErr, fgStdout) => {
        const fgExe = fgStdout?.trim().toLowerCase();
        if (!fgErr && fgExe) {
            for (const key in KNOWN_GAMES) {
                const keyLower = key.toLowerCase();
                const keyBase = keyLower.endsWith('.exe') ? keyLower.slice(0, -4) : keyLower;
                if (fgExe === keyLower || fgExe === keyBase || fgExe === keyBase + ".exe") {
                    updateActivity(KNOWN_GAMES[key]);
                    scanInProgress = false;
                    adaptiveInterval = 2000;
                    scheduleNextScan();
                    return;
                }
            }
        }
        performFullScan();
    });
}

function updateActivity(foundActivity) {
    const currentName = foundActivity ? foundActivity.name : null;
    const lastName = lastActivity ? lastActivity.name : null;
    if (currentName !== lastName) {
        if (foundActivity) { lastActivity = { ...foundActivity }; activityStartTime = Date.now(); }
        else { lastActivity = null; activityStartTime = null; }
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('activity-changed', lastActivity ? { ...lastActivity, startTime: activityStartTime } : null);
        }
    }
}

function performFullScan() {
    exec('tasklist /NH /FO CSV', (err, stdout) => {
        scanInProgress = false;
        if (err) { adaptiveInterval = 5000; scheduleNextScan(); return; }
        const lines = stdout.split(/\r?\n/);
        let bestMatch = null;
        for (const line of lines) {
            const parts = line.split('","');
            if (parts.length > 0) {
                const exeNameLower = parts[0].replace(/"/g, '').trim().toLowerCase();
                const baseName = exeNameLower.endsWith('.exe') ? exeNameLower.slice(0, -4) : exeNameLower;
                for (const key in KNOWN_GAMES) {
                    const keyLower = key.toLowerCase();
                    const keyBase = keyLower.endsWith('.exe') ? keyLower.slice(0, -4) : keyLower;
                    if (exeNameLower === keyLower || baseName === keyBase) {
                        bestMatch = KNOWN_GAMES[key];
                        break;
                    }
                }
                if (bestMatch) break;
            }
        }
        updateActivity(bestMatch);
        adaptiveInterval = bestMatch ? 3000 : 5000;
        scheduleNextScan();
    });
}

scanActivities();

ipcMain.handle('get-current-activity', () => lastActivity ? { ...lastActivity, startTime: activityStartTime } : null);

ipcMain.on('change-icon', (event, iconName) => {
    let iconFile = 'app_icon.ico';
    switch (iconName) {
        case 'icon1': iconFile = 'icon1.PNG'; break;
        case 'icon2': iconFile = 'icon2.png'; break;
        case 'icon3': iconFile = 'icon3.png'; break;
        case 'icon4': iconFile = 'icon4.png'; break;
        default: iconFile = 'app_icon.ico'; break;
    }
    const iconPath = path.join(__dirname, iconFile);
    try {
        if (!fs.existsSync(iconPath)) return;
        const iconImage = nativeImage.createFromPath(iconPath);
        if (iconImage.isEmpty()) return;
        if (mainWindow) mainWindow.setIcon(iconImage);
        if (tray) tray.setImage(iconImage);
    } catch (err) { }
});

ipcMain.handle('toggle-fullscreen', async (event, isFullscreen) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            mainWindow.setFullScreen(isFullscreen);
            return new Promise((resolve) => setTimeout(() => resolve(mainWindow.isFullScreen()), 100));
        } catch (err) { return false; }
    }
    return false;
});

ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => { if (mainWindow) { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); } });
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

ipcMain.handle('get-desktop-sources', async (event, options) => {
    const sources = await desktopCapturer.getSources(options);
    return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        display_id: source.display_id,
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }));
});

ipcMain.handle('set-content-protection', (event, enabled) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setContentProtection(enabled);
    }
});

// --- Native Audio Capture Integration ---
let zvonAudio = null;
try {
    // Attempt to load the native module. 
    // This might fail if the module was compiled for Node.js but we are running in Electron 
    // and the ABIs don't match. In a production build, electron-builder handles rebuilding.
    zvonAudio = require('zvon-native-audio');
    log.info("Native Audio Module loaded successfully.");
} catch (e) {
    log.warn("Failed to load native audio module. Loopback capture will be unavailable.", e);
}

ipcMain.on('start-audio-capture', (event, pid) => {
    if (!zvonAudio) {
        log.warn("start-native-audio called but module is not loaded.");
        return;
    }
    log.info(`Starting native capture for PID: ${pid}`);
    try {
        const result = zvonAudio.start(pid, (buffer) => {
            // Buffer comes from C++ thread. Send it to renderer.
            // Note: Sending high-frequency IPC messages (100Hz) is okay for local socket.
            // buffer is a node Buffer (Uint8Array)
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('audio-data', buffer);
            }
        });
        log.info("Native capture start result:", result);
    } catch (e) {
        log.error("Native capture execution error:", e);
    }
});

ipcMain.on('stop-audio-capture', () => {
    if (zvonAudio) {
        log.info("Stopping native capture.");
        zvonAudio.stop();
    }
});
ipcMain.handle('get-pid-from-hwnd', (event, hwnd) => {
    if (zvonAudio && zvonAudio.getPidFromWindowHandle) {
        return zvonAudio.getPidFromWindowHandle(Number(hwnd));
    }
    return 0;
});
// ----------------------------------------

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
