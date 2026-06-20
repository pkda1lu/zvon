const { app, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage, screen, desktopCapturer, globalShortcut, Notification, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const axios = require('axios');

// Register custom protocol for the app to bypass file:// restrictions
if (!isDev) {
    protocol.registerSchemesAsPrivileged([
        { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true, corsEnabled: true, stream: true } }
    ]);
}

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let pendingDeepLink = null;
let mainWindow;
let updaterWindow;
let tray = null;
let overlayWindow = null;
// Последняя конфигурация оверлея, присланная из рендера. Кэшируем, чтобы заново
// созданное окно оверлея сразу получило актуальные настройки (фон, прозрачность и
// т.п.), а не показывало значения по умолчанию из Overlay.tsx до первой смены настроек.
let lastOverlayConfig = null;
let isQuitting = false;
let currentVoiceState = { isMuted: false, isDeafened: false, isConnected: false };
const isOpenedHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;

let appSettings = {
    minimizeToTray: true,
    closeToTray: true,
    startMinimized: false,
    activityDetectionEnabled: true,
    overlayCategories: ['game', 'music', 'video'],
    userApps: {} // { 'process.exe': { name: '...', type: '...' } }
};

let isOverlayEnabled = true; // Default enabled

// --- IPC Handlers (Registered early to prevent renderer errors) ---
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-pending-deep-link', () => {
    const link = pendingDeepLink;
    pendingDeepLink = null;
    return link;
});

ipcMain.handle('get-running-processes', () => {
    return new Promise((resolve) => {
        exec('tasklist /NH /FO CSV', (err, stdout) => {
            if (err) { resolve([]); return; }
            const lines = stdout.split(/\r?\n/);
            const processes = [];
            for (const line of lines) {
                const parts = line.split('","');
                if (parts.length > 0) {
                    const name = parts[0].replace(/"/g, '').trim();
                    if (name && !processes.includes(name)) processes.push(name);
                }
            }
            resolve(processes.sort());
        });
    });
});

ipcMain.handle('check-process', (event, processName) => {
    return new Promise((resolve) => {
        exec(`tasklist /FI "IMAGENAME eq ${processName}" /NH`, (err, stdout) => {
            if (err) resolve(false);
            resolve(stdout.toLowerCase().includes(processName.toLowerCase()));
        });
    });
});

ipcMain.handle('toggle-autostart', (event, enable) => {
    try {
        app.setLoginItemSettings({
            openAtLogin: enable,
            path: app.getPath('exe'),
            args: ['--hidden']
        });
        return app.getLoginItemSettings().openAtLogin;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('get-autostart-status', () => app.getLoginItemSettings().openAtLogin);

ipcMain.on('update-window-settings', (event, settings) => {
    appSettings = { ...appSettings, ...settings };
    scanActivities(); // Immediate scan with new settings
});

ipcMain.on('update-user-apps', (event, userApps) => {
    appSettings.userApps = userApps;
    scanActivities();
});

ipcMain.on('restart-app', () => {
    app.relaunch();
    app.exit();
});

ipcMain.on('update-keybinds', (event, keybinds) => {
    unregisterGlobalShortcuts();
    keybinds.forEach(kb => {
        try {
            globalShortcut.register(kb.accelerator, () => {
                if (mainWindow) {
                    mainWindow.webContents.send(`${kb.action}-shortcut`);
                }
            });
        } catch (e) {
            console.error(`Failed to register shortcut ${kb.accelerator}:`, e);
        }
    });
});
// -------------------------------------------------------------

// Performance Tuning
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-oop-rasterization');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-video-encode'); // HW encode for VP9/AV1
app.commandLine.appendSwitch('enable-zero-copy'); // Reduces memory copy for video/audio
app.commandLine.appendSwitch('ignore-gpu-blocklist'); // Ensure GPU is used even on older drivers
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096 --stack-size=2048');

// Enable hardware-accelerated VP9/AV1 encoding and high-bitrate WebRTC
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder,WebRtcAllowInputVolumeAdjustment,PlatformEncryptedDolbyVision,WebRtcHideLocalSdps,WebRtcUseEchoCanceller3,D3D11VideoDecoder,D3D11VideoEncoder');
// Force WebRTC to use higher bitrate and disable internal bandwidth limits
app.commandLine.appendSwitch('force-fieldtrials', 'WebRTC-Video-MinimumSendBitrate/Enabled-300000/');

if (!isDev) {
    app.commandLine.appendSwitch('force-device-scale-factor', '1'); // Consistent sizing
}

// Disable the yellow/green border on Windows 10/11 when capturing windows
// Also disable Vulkan which can cause green screen/flickering on some GPUs
// Added IsolateOrigins and site-per-process to disable-features to fix cross-origin track transfer
app.commandLine.appendSwitch('disable-features', 'WinrtCaptureBorders,Vulkan,IsolateOrigins,site-per-process');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('allow-file-access-from-files');

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
        if (!tray) createTray();
        if (isDev) createWindow();
        else createUpdaterWindow();
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'app_icon.ico');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    updateTrayMenu();
    tray.setToolTip('Zvon');
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                if (mainWindow.isFocused()) mainWindow.hide();
                else { mainWindow.show(); mainWindow.focus(); }
            } else { mainWindow.show(); mainWindow.focus(); }
        }
    });
}

function updateTrayMenu() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Открыть Zvon', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
        { type: 'separator' },
        {
            label: currentVoiceState.isMuted ? '✓ Микрофон выключен' : 'Выключить микрофон',
            enabled: currentVoiceState.isConnected,
            click: () => { if (mainWindow) mainWindow.webContents.send('toggle-mute-shortcut'); }
        },
        {
            label: currentVoiceState.isDeafened ? '✓ Звук выключен' : 'Выключить звук',
            enabled: currentVoiceState.isConnected,
            click: () => { if (mainWindow) mainWindow.webContents.send('toggle-deafen-shortcut'); }
        },
        { type: 'separator' },
        { label: 'Выйти', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
}

function updateTrayStatus(state) {
    if (!tray) return;
    currentVoiceState = state;
    const { isMuted, isDeafened, isConnected } = state;
    let iconName = 'app_icon.ico';
    let statusText = 'Zvon - В сети';

    if (isDeafened) {
        iconName = 'icon_deafened.ico';
        statusText = 'Zvon - Звук выключен';
    } else if (isMuted) {
        iconName = 'icon_muted.ico';
        statusText = 'Zvon - Микрофон выключен';
    } else if (!isConnected) {
        statusText = 'Zvon - Не в голосе';
    }

    const iconPath = path.join(__dirname, iconName);
    if (fs.existsSync(iconPath)) {
        tray.setImage(nativeImage.createFromPath(iconPath));
    }
    tray.setToolTip(statusText);
    updateTrayMenu();
}

function registerGlobalShortcuts() {
    // Default shortcuts until dynamic ones are loaded from frontend
    globalShortcut.register('CommandOrControl+Shift+M', () => {
        if (mainWindow) mainWindow.webContents.send('toggle-mute-shortcut');
    });

    globalShortcut.register('CommandOrControl+Shift+D', () => {
        if (mainWindow) mainWindow.webContents.send('toggle-deafen-shortcut');
    });
}

function unregisterGlobalShortcuts() {
    globalShortcut.unregisterAll();
}

function createUpdaterWindow() {
    updaterWindow = new BrowserWindow({ width: 480, height: 600, resizable: false, frame: false, backgroundColor: '#04040a', show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    updaterWindow.loadFile(path.join(__dirname, 'updater.html'));
    updaterWindow.once('ready-to-show', () => {
        if (!isOpenedHidden) updaterWindow.show();
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
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: false, 
            allowRunningInsecureContent: true, // Allow mixed content
            backgroundThrottling: false,
            spellcheck: false, // Performance: Disable spellcheck
            v8CacheOptions: 'bypass-heat-check-and-allow-code-cache', // Faster JIT
            preload: isDev ? path.join(__dirname, '../public/preload.js') : path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true,
        frame: false,
        backgroundColor: '#1e1f22',
        icon: path.join(__dirname, 'app_icon.ico'),
        show: false // Performance: Use ready-to-show to prevent white flash
    });
    mainWindow.once('ready-to-show', () => {
        if (!appSettings.startMinimized && !isOpenedHidden) {
            mainWindow.show();
        }
        scanActivities();
    });

    // Mask as a standard Chrome browser to avoid YouTube 152-4 errors
    mainWindow.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36");


    // Handle Permissions (Essential for packaged apps)
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
        if (permission === 'media' || permission === 'display-capture') return true;
        return false;
    });

    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media' || permission === 'display-capture') {
            callback(true);
        } else {
            callback(false);
        }
    });
    let saveTimeout;
    const debouncedSave = () => { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveWindowState, 500); };
    mainWindow.on('resize', debouncedSave);
    mainWindow.on('move', debouncedSave);
    mainWindow.on('minimize', (event) => {
        if (appSettings.minimizeToTray) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
    mainWindow.on('close', (event) => {
        if (!isQuitting && appSettings.closeToTray) {
            event.preventDefault();
            saveWindowState();
            mainWindow.hide();
            return false;
        }
        saveWindowState();
    });
    if (!tray) createTray();
    registerGlobalShortcuts();

    app.on('will-quit', () => {
        unregisterGlobalShortcuts();
    });
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

    // YouTube Fix: Intercept and modify headers for YouTube embeds to bypass Error 153/152 in production
    mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googlevideo.com/*', '*://*.ytimg.com/*'] },
        (details, callback) => {
            const ytId = details.url.match(/embed\/([^?&]+)/)?.[1] || '';
            const referer = ytId ? `https://www.youtube-nocookie.com/embed/${ytId}` : 'https://www.youtube-nocookie.com/';
            details.requestHeaders['Referer'] = referer;
            details.requestHeaders['Origin'] = 'https://www.youtube-nocookie.com';
            details.requestHeaders['User-Agent'] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
            details.requestHeaders['Sec-Fetch-Dest'] = 'iframe';
            details.requestHeaders['Sec-Fetch-Site'] = 'cross-site';
            callback({ requestHeaders: details.requestHeaders });
        }
    );

    // Final Strike: Robustly strip and replace protection headers
    mainWindow.webContents.session.webRequest.onHeadersReceived(
        { urls: ['*://*/*'] }, // Apply to all URLs to handle frame-ancestors globally
        (details, callback) => {
            const responseHeaders = {};
            
            // Filter out existing security and CORS headers to prevent duplicates and iframe blocks
            Object.keys(details.responseHeaders).forEach(key => {
                const lowerKey = key.toLowerCase();
                if (![
                    'x-frame-options', 
                    'content-security-policy', 
                    'frame-options', 
                    'access-control-allow-origin',
                    'access-control-allow-headers',
                    'access-control-allow-methods',
                    'access-control-allow-credentials'
                ].includes(lowerKey)) {
                    responseHeaders[key] = details.responseHeaders[key];
                }
            });
            
            // Dynamic mirroring for CORS with Credentials support
            let requestOrigin = details.requestHeaders?.['Origin'] || details.requestHeaders?.['origin'];
            
            // Fallback for Electron custom protocols
            if (!requestOrigin || requestOrigin === 'null' || requestOrigin === 'file://' || requestOrigin.startsWith('app://')) {
                // If it's a YouTube request, use their origin, otherwise use the request origin or fallback
                if (details.url.includes('youtube.com') || details.url.includes('youtube-nocookie.com')) {
                    requestOrigin = 'https://www.youtube-nocookie.com';
                } else {
                    requestOrigin = '*';
                }
            }
            
            responseHeaders['Access-Control-Allow-Origin'] = [requestOrigin];
            responseHeaders['Access-Control-Allow-Headers'] = ['*'];
            responseHeaders['Access-Control-Allow-Methods'] = ['*'];
            // Only set credentials true if origin is not wildcard
            if (requestOrigin !== '*') {
                responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
            }
            
            callback({ responseHeaders });
        }
    );

    mainWindow.webContents.on('context-menu', (event, params) => {
        const template = [];
        if (params.isEditable) {
            template.push({ role: 'undo', label: 'Отменить' });
            template.push({ role: 'redo', label: 'Повторить' });
            template.push({ type: 'separator' });
            template.push({ role: 'cut', label: 'Вырезать' });
        }
        if (params.selectionText.trim().length > 0 || params.isEditable) {
            template.push({ role: 'copy', label: 'Копировать' });
        }
        if (params.isEditable) {
            template.push({ role: 'paste', label: 'Вставить' });
            template.push({ role: 'selectAll', label: 'Выбрать все' });
        }
        if (template.length > 0) {
            const menu = Menu.buildFromTemplate(template);
            menu.popup({ window: mainWindow });
        }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        if (pendingDeepLink) mainWindow.webContents.send('deep-link', pendingDeepLink);
    });
    mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-changed', true));
    mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-changed', false));
    
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        // Use custom protocol in production to bypass file:// restrictions
        protocol.handle('app', (request) => {
            const url = new URL(request.url);
            let relativePath = url.pathname;
            
            // On Windows, the pathname might start with a leading slash or be the hostname
            if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
            if (!relativePath || relativePath === 'index.html') relativePath = 'index.html';
            
            const filePath = path.join(__dirname, relativePath);
            return net.fetch(`file://${filePath}`);
        });
        mainWindow.loadURL('app://index.html');
    }

    mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));

    // Disable backward/forward navigation using mouse side buttons (App commands)
    mainWindow.on('app-command', (e, cmd) => {
        if (cmd === 'browser-backward' || cmd === 'browser-forward') {
            e.preventDefault();
        }
    });

    if (isDev) mainWindow.webContents.openDevTools();
}

ipcMain.on('voice-state-sync', (event, state) => {
    updateTrayStatus(state);
});

ipcMain.on('show-native-notification', (event, { title, body, silent }) => {
    if (Notification.isSupported()) {
        const notification = new Notification({
            title,
            body,
            silent,
            icon: path.join(__dirname, 'icon.png')
        });
        notification.show();
        notification.on('click', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
            }
        });
    }
});

ipcMain.on('clipboard-write', (event, text) => {
    try { clipboard.writeText(text); } catch (error) { }
});

ipcMain.on('open-external-url', (event, url) => {
    try {
        shell.openExternal(url);
    } catch (e) {
        log.error("Failed to open external URL:", e);
    }
});

const { exec } = require('child_process');
let lastActivity = null;
let activityStartTime = null;
let scanInProgress = false;
let currentScanTimeout = null;
let adaptiveInterval = 3000;

// API Keys and Cache
// USER: Replace with your actual SteamGridDB API Key
const STEAMGRID_API_KEY = '84d5caff741db867dcb433b3e3a7fd37';
const gameMetadataCache = new Map();

const KNOWN_APPS = {
    // Games
    'VALORANT-Win64-Shipping.exe': { name: 'VALORANT', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/516575_IGDB-285x380.jpg', type: 'game' },
    'VALORANT.exe': { name: 'VALORANT', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/516575_IGDB-285x380.jpg', type: 'game' },
    'cs2.exe': { name: 'Counter-Strike 2', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/32399_IGDB-285x380.jpg', type: 'game' },
    'csgo.exe': { name: 'Counter-Strike: GO', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/32399_IGDB-285x380.jpg', type: 'game' },
    'dota2.exe': { name: 'Dota 2', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/29595_IGDB-285x380.jpg', type: 'game' },
    'League of Legends.exe': { name: 'League of Legends', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/21779_IGDB-285x380.jpg', type: 'game' },
    'Minecraft.exe': { name: 'Minecraft', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg', type: 'game' },
    'javaw.exe': { name: 'Minecraft', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg', type: 'game' },
    'RobloxPlayerBeta.exe': { name: 'Roblox', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/23020_IGDB-285x380.jpg', type: 'game' },
    'Roblox.exe': { name: 'Roblox', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/23020_IGDB-285x380.jpg', type: 'game' },
    'GenshinImpact.exe': { name: 'Genshin Impact', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/513181_IGDB-285x380.jpg', type: 'game' },
    'aces.exe': { name: 'War Thunder', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/66366_IGDB-285x380.jpg', type: 'game' },
    'WarThunder.exe': { name: 'War Thunder', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/66366_IGDB-285x380.jpg', type: 'game' },
    'FortniteClient-Win64-Shipping.exe': { name: 'Fortnite', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/33214_IGDB-285x380.jpg', type: 'game' },
    'deadlock.exe': { name: 'Deadlock', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/1908684124_IGDB-285x380.jpg', type: 'game' },

    // Music
    'Spotify.exe': { name: 'Spotify', icon: 'https://www.scdn.co/i/_global/twitter_card-default.jpg', type: 'music' },
    'Music.exe': { name: 'Apple Music', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/0d/1b/3c/0d1b3c1b-6b7b-6b7b-6b7b-6b7b6b7b6b7b/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/512x512bb.jpg', type: 'music' },
    'YouTube Music.exe': { name: 'YouTube Music', icon: 'https://music.youtube.com/img/on_platform_logo_dark.png', type: 'music' },
    'AIMP.exe': { name: 'AIMP', icon: 'https://www.aimp.ru/favicon.ico', type: 'music' },
    'foobar2000.exe': { name: 'foobar2000', icon: 'https://www.foobar2000.org/favicon.ico', type: 'music' },

    // Video
    'vlc.exe': { name: 'VLC Media Player', icon: 'https://www.videolan.org/favicon.ico', type: 'video' },
    'mpc-hc64.exe': { name: 'MPC-HC', icon: 'https://mpc-hc.org/favicon.ico', type: 'video' },
    'Netflix.exe': { name: 'Netflix', icon: 'https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.ico', type: 'video' },
    
    // Other (Apps like ZVON itself, Code editors, etc.)
    'Code.exe': { name: 'Visual Studio Code', type: 'other' },
    'WebStorm.exe': { name: 'WebStorm', type: 'other' },
    'Discord.exe': { name: 'Discord', type: 'other' },
    'Telegram.exe': { name: 'Telegram', type: 'other' },
    'obs64.exe': { name: 'OBS Studio', type: 'other' },
    'obs32.exe': { name: 'OBS Studio', type: 'other' }
};

// Активностью (Rich Presence) считаем только приложения этих типов — игры, видео,
// музыка. Всё остальное ('other', неизвестные процессы) активностью НЕ показываем.
// Мини-приложения внутри Zvon ставят активность отдельно из рендера и здесь не участвуют.
const ACTIVITY_TYPES = new Set(['game', 'music', 'video']);

const SHARING_BLACKLIST = [
    'NVIDIA GeForce Experience',
    'NVIDIA Share',
    'NVIDIA Overlay',
    'Microsoft Text Input Application',
    'Settings',
    'Task Manager',
    'Program Manager',
    'Search',
    'Start',
    'Shell Experience Host',
    'Settings',
    'Action Center'
];

const NEUTRAL_PROCESSES = [
    'powershell.exe',
    'cmd.exe',
    'idle.exe',
    'electron.exe',
    'zvon.exe',
    'searchhost.exe',
    'startmenuexperiencehost.exe',
    'taskmgr.exe'
];

// Окна переднего плана, которые ТОЧНО не игры — при них не показываем оверлей и не
// считаем активностью. Всё, что НЕ в этом списке (и не нейтральное), на переднем
// плане трактуем как игру (детект по процессу для не-Steam игр).
const NON_GAME_FG = new Set([
    ...NEUTRAL_PROCESSES,
    'explorer.exe', 'dwm.exe', 'shellexperiencehost.exe', 'applicationframehost.exe',
    'textinputhost.exe', 'sihost.exe', 'systemsettings.exe', 'lockapp.exe',
    // браузеры
    'chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'opera_gx.exe', 'brave.exe', 'browser.exe', 'yandex.exe', 'vivaldi.exe',
    // мессенджеры/медиа/прочее ПО
    'discord.exe', 'telegram.exe', 'spotify.exe', 'whatsapp.exe', 'slack.exe',
    'obs64.exe', 'obs32.exe', 'steam.exe', 'steamwebhelper.exe', 'epicgameslauncher.exe', 'battle.net.exe',
    // редакторы/офис
    'code.exe', 'webstorm.exe', 'devenv.exe', 'rider64.exe', 'pycharm64.exe', 'notepad.exe', 'notepad++.exe',
    'winword.exe', 'excel.exe', 'powerpnt.exe', 'acrobat.exe', 'acrord32.exe'
]);

// Браузеры — для них активность (YouTube) определяется по заголовку окна.
const BROWSERS = new Set([
    'chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'opera_gx.exe', 'brave.exe', 'browser.exe', 'yandex.exe', 'vivaldi.exe'
]);

function scheduleNextScan() {
    if (currentScanTimeout) clearTimeout(currentScanTimeout);
    currentScanTimeout = setTimeout(scanActivities, adaptiveInterval);
}

// ВАЖНО: скрипт содержит двойные кавычки ("user32.dll"), поэтому его НЕЛЬЗЯ
// передавать как `powershell -Command "<script>"` — внешние кавычки рвутся, Add-Type
// не компилируется, GetForegroundWindow падает и powershell молча возвращает
// «Idle.exe» (PID 0). Из-за этого определение переднего окна не работало вообще.
// Передаём скрипт через -EncodedCommand (Base64 UTF-16LE) — это полностью убирает
// проблемы экранирования. `$null =` гасит лишний вывод GetWindowThreadProcessId.
// Возвращаем «процесс.exe|заголовок окна» — заголовок нужен, чтобы определять
// YouTube в браузере по тайтлу (а не считать любой браузер «ютубом» бесконечно).
const FG_SCRIPT = `$code = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId); [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);'; $t = Add-Type -MemberDefinition $code -Name 'W32' -Namespace 'W32' -PassThru; $hwnd = $t::GetForegroundWindow(); if($hwnd -ne 0){ $pidOut=0; $null = $t::GetWindowThreadProcessId($hwnd, [ref]$pidOut); if ($pidOut -ne $pid) { $name = (Get-Process -Id $pidOut -ErrorAction SilentlyContinue).ProcessName + '.exe'; $sb = New-Object System.Text.StringBuilder 512; $null = $t::GetWindowText($hwnd, $sb, 512); $name + '|' + $sb.ToString() } }`;
const FG_SCRIPT_B64 = Buffer.from(FG_SCRIPT, 'utf16le').toString('base64');

const STEAM_ID_SCRIPT = `Get-ItemProperty -Path 'HKCU:\\Software\\Valve\\Steam' -Name 'RunningAppID' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty RunningAppID`;

async function getSteamAppId() {
    return new Promise((resolve) => {
        exec(`powershell -Command "${STEAM_ID_SCRIPT}"`, (err, stdout) => {
            if (err || !stdout.trim()) resolve(null);
            else resolve(stdout.trim());
        });
    });
}

async function getGameMetadata(appId, exeName = null) {
    const cacheKey = appId || exeName;
    if (gameMetadataCache.has(cacheKey)) return gameMetadataCache.get(cacheKey);

    let metadata = { name: 'Unknown App', icon: null, type: 'other' };

    try {
        // Check User Apps first
        if (exeName && appSettings.userApps && appSettings.userApps[exeName]) {
            metadata = { ...appSettings.userApps[exeName], icon: null };
        } else if (exeName && KNOWN_APPS[exeName]) {
            metadata = { ...KNOWN_APPS[exeName] };
        }

        // If it's a game and we have appId, try Steam/SGDB
        if (metadata.type === 'game' || appId) {
            if (!STEAMGRID_API_KEY) {
                if (appId) {
                    const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}`);
                    if (steamRes.data[appId]?.success) {
                        metadata.name = steamRes.data[appId].data.name;
                        metadata.icon = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
                        metadata.type = 'game';
                    }
                }
            } else {
                const headers = { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` };
                let sgdbGameId = null;
                if (appId) {
                    try {
                        const gameRes = await axios.get(`https://www.steamgriddb.com/api/v2/games/steam/${appId}`, { headers });
                        if (gameRes.data.success) {
                            metadata.name = gameRes.data.data.name;
                            sgdbGameId = gameRes.data.data.id;
                            metadata.type = 'game';
                        }
                    } catch (e) { }
                }

                if (!sgdbGameId && metadata.name !== 'Unknown App' && metadata.type === 'game') {
                    const searchRes = await axios.get(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(metadata.name)}`, { headers });
                    if (searchRes.data.success && searchRes.data.data.length > 0) {
                        sgdbGameId = searchRes.data.data[0].id;
                    }
                }

                if (sgdbGameId) {
                    const assetsRes = await axios.get(`https://www.steamgriddb.com/api/v2/grids/game/${sgdbGameId}?dimensions=342x482,600x900`, { headers });
                    if (assetsRes.data.success && assetsRes.data.data.length > 0) {
                        metadata.icon = assetsRes.data.data[0].url;
                    }
                }
            }
        }

        gameMetadataCache.set(cacheKey, metadata);
        return metadata;
    } catch (e) {
        log.error("Failed to fetch app metadata", e);
        return metadata.name !== 'Unknown App' ? metadata : null;
    }
}

async function scanActivities() {
    if (process.platform !== 'win32' || scanInProgress) { scheduleNextScan(); return; }
    if (!appSettings.activityDetectionEnabled) { 
        updateActivity(null); 
        scheduleNextScan(); 
        return; 
    }
    scanInProgress = true;

    try {
        const steamAppId = await getSteamAppId();
        let steamMetadata = null;
        if (steamAppId && steamAppId !== '0' && steamAppId !== 'null') {
            steamMetadata = await getGameMetadata(steamAppId);
        }

        exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${FG_SCRIPT_B64}`, async (fgErr, fgStdout) => {
            // Формат вывода: "процесс.exe|заголовок окна".
            const fgRaw = (fgStdout || '').trim();
            const sepIdx = fgRaw.indexOf('|');
            const fgExe = (sepIdx >= 0 ? fgRaw.slice(0, sepIdx) : fgRaw).toLowerCase();
            const fgTitle = sepIdx >= 0 ? fgRaw.slice(sepIdx + 1) : '';

            if (!fgErr && fgExe) {
                const fgBase = fgExe.endsWith('.exe') ? fgExe.slice(0, -4) : fgExe;

                // Браузер на переднем плане: YouTube определяем ПО ЗАГОЛОВКУ ОКНА.
                // Так активность «YouTube» появляется только когда реально открыт YouTube
                // и сбрасывается при переходе на другую страницу — раньше она «висела»,
                // т.к. любой браузер маппился в YouTube навсегда.
                if (BROWSERS.has(fgExe)) {
                    if (/youtube/i.test(fgTitle)) {
                        updateActivity({ name: 'YouTube', icon: 'https://www.youtube.com/favicon.ico', type: 'video' }, true, fgExe);
                    } else {
                        updateActivity(null, false, fgExe);
                    }
                    scanInProgress = false;
                    adaptiveInterval = 3000;
                    scheduleNextScan();
                    return;
                }

                // Ищем переднее окно сначала среди пользовательских приложений
                // (настроенных в Активности), затем среди встроенного списка.
                const userKeys = appSettings.userApps ? Object.keys(appSettings.userApps) : [];
                let foundKey = [...userKeys, ...Object.keys(KNOWN_APPS)].find(key => {
                    const kLower = key.toLowerCase();
                    return fgExe === kLower || fgBase === kLower || fgExe === kLower.replace('.exe', '');
                });

                if (foundKey) {
                    const metadata = await getGameMetadata(null, foundKey);
                    // Показываем активностью только разрешённые типы (игры/видео/музыка);
                    // приложения типа 'other' активностью не считаем.
                    updateActivity(metadata && ACTIVITY_TYPES.has(metadata.type) ? metadata : null, true, fgExe);
                    scanInProgress = false;
                    // Пока игра на переднем плане (оверлей показан) — чаще опрашиваем,
                    // чтобы оверлей скрывался почти сразу при сворачивании/закрытии игры.
                    adaptiveInterval = 800;
                    scheduleNextScan();
                    return;
                }

                // Steam-игры: имя процесса (isaac-ng.exe) почти никогда не совпадает с
                // названием игры, поэтому считаем игру активной, если запущена steam-игра
                // и на переднем плане НЕ системное/нейтральное окно (т.е. само окно игры).
                // Это даёт показ во время игры и скрытие при сворачивании (фокус → explorer/Zvon).
                const fgIsSystemOrNeutral = NEUTRAL_PROCESSES.includes(fgExe) || fgExe === 'explorer.exe' || fgExe === 'dwm.exe';
                const fgNameMatch = steamMetadata && (fgExe.includes(steamMetadata.name.toLowerCase()) || steamMetadata.name.toLowerCase().includes(fgBase));
                if (steamMetadata && (fgNameMatch || !fgIsSystemOrNeutral)) {
                    updateActivity(steamMetadata, true, fgExe);
                    scanInProgress = false;
                    adaptiveInterval = 800;
                    scheduleNextScan();
                    return;
                }

                // Неизвестное приложение на переднем плане больше НЕ считаем игрой:
                // активность показываем только для приложений, явно подходящих под
                // настроенные типы (см. ветку foundKey выше) или Steam-игр (ниже).
            }

            if (steamMetadata) {
                updateActivity(steamMetadata, false, fgExe);
                scanInProgress = false;
                // Steam-игра запущена, но свёрнута/не в фокусе — опрашиваем чаще,
                // чтобы оверлей быстро вернулся, когда игра снова на переднем плане.
                adaptiveInterval = 1200;
                scheduleNextScan();
            } else {
                performFullScan(fgExe);
            }
        });
    } catch (err) {
        log.error("Activity scan error:", err);
        scanInProgress = false;
        scheduleNextScan();
    }
}

function updateActivity(foundActivity, isForeground = false, currentForegroundExe = '') {
    const currentName = foundActivity ? foundActivity.name : null;
    const lastName = lastActivity ? lastActivity.name : null;
    
    // 1. Manage Activity State (Rich Presence)
    if (currentName !== lastName) {
        if (foundActivity) {
            lastActivity = { ...foundActivity };
            activityStartTime = Date.now();
        } else {
            lastActivity = null;
            activityStartTime = null;
        }
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('activity-changed', lastActivity ? { ...lastActivity, startTime: activityStartTime } : null);
        }
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('activity-changed', lastActivity ? { ...lastActivity, startTime: activityStartTime } : null);
        }
    }

    // 2. Manage Overlay Visibility
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        const fg = (currentForegroundExe || '').trim().toLowerCase();
        const currentCategory = foundActivity ? foundActivity.type : 'other';
        // Оверлей показываем ТОЛЬКО для игр (видео/музыка активность ставят, но оверлея не дают).
        const isCategoryAllowed = currentCategory === 'game';

        // 1) Игра реально на переднем плане — показываем.
        const gameInForeground = !!foundActivity && isForeground && isCategoryAllowed;

        // 2) Фокус явно ушёл на ИЗВЕСТНОЕ не-игровое окно (сам Zvon, браузер, рабочий
        //    стол/проводник, поиск в таскбаре, мессенджеры, dwm) — это «свернул игру /
        //    переключился на другую вкладку», оверлей надо скрыть.
        const fgIsKnownNonGame = !!fg && NON_GAME_FG.has(fg);

        // 3) Активное окно НЕ читается (fg пуст): у многих игр с античитом или
        //    запущенных от администратора PowerShell не может прочитать процесс
        //    переднего окна. Если игра при этом запущена (есть lastActivity) и её
        //    категория разрешена — считаем, что игра по-прежнему на переднем плане,
        //    иначе оверлей не показывался бы вовсе. Когда фокус уходит на обычное
        //    окно (см. п.2), fg читается и оверлей корректно скрывается.
        const lastAllowed = !!lastActivity && lastActivity.type === 'game';
        const unreadableButGameRunning = !fg && lastAllowed;

        const shouldShow = isOverlayEnabled && !fgIsKnownNonGame && (gameInForeground || unreadableButGameRunning);

        if (shouldShow) {
            overlayWindow.showInactive();
            // Игры (borderless/полноэкранные оконные) периодически перехватывают
            // верхний z-порядок и заслоняют оверлей — поэтому каждый тик скана
            // заново поднимаем окно на самый верх.
            try {
                overlayWindow.setAlwaysOnTop(true, 'screen-saver');
                overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                overlayWindow.moveTop();
            } catch (e) { /* ignore */ }
        } else {
            overlayWindow.hide();
        }
    }
}

function performFullScan(fgExe = '') {
    exec('tasklist /NH /FO CSV', (err, stdout) => {
        scanInProgress = false;
        if (err) { adaptiveInterval = 5000; scheduleNextScan(); return; }
        const lines = stdout.split(/\r?\n/);
        let bestMatch = null;

        const userApps = appSettings.userApps || {};
        const normalizedApps = [
            ...Object.keys(userApps).map(k => ({ lower: k.toLowerCase(), base: k.toLowerCase().replace('.exe', ''), meta: { ...userApps[k], icon: null } })),
            ...Object.keys(KNOWN_APPS).map(k => ({ lower: k.toLowerCase(), base: k.toLowerCase().replace('.exe', ''), meta: KNOWN_APPS[k] })),
        ];

        for (const line of lines) {
            const parts = line.split('","');
            if (parts.length > 0) {
                const exeNameLower = parts[0].replace(/"/g, '').trim().toLowerCase();
                const baseName = exeNameLower.endsWith('.exe') ? exeNameLower.slice(0, -4) : exeNameLower;

                const match = normalizedApps.find(g => exeNameLower === g.lower || baseName === g.base);
                // Учитываем только разрешённые типы (игры/видео/музыка), 'other' пропускаем.
                if (match && ACTIVITY_TYPES.has(match.meta.type)) {
                    bestMatch = match.meta;
                    // If multiple apps running, prefer games for activity
                    if (bestMatch.type === 'game') break;
                }
            }
        }
        updateActivity(bestMatch, false, fgExe);
        // Игра запущена, но не на переднем плане — держим частый опрос, чтобы оверлей
        // быстро появился при возврате в игру; иначе можно опрашивать реже.
        adaptiveInterval = bestMatch ? 1200 : 5000;
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
        case 'legacy': iconFile = 'zvon_legacy.png'; break;
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
    let sources = await desktopCapturer.getSources(options);

    // Filter out blacklisted apps
    sources = sources.filter(source => {
        const name = source.name;
        // Skip if empty or in blacklist
        if (!name || name.trim() === '') return false;
        return !SHARING_BLACKLIST.some(blacklisted => name.includes(blacklisted));
    });

    return sources.map(source => ({
        id: source.id,
        name: source.name,
        // Use JPEG with 40% quality to avoid main process blocking (much faster than PNG)
        thumbnail: source.thumbnail.toDataURL({ type: 'image/jpeg', quality: 40 }),
        display_id: source.display_id,
        appIcon: source.appIcon ? source.appIcon.toDataURL({ type: 'image/jpeg', quality: 40 }) : null
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

ipcMain.on('start-audio-capture', (event, { pid, mode }) => {
    if (!zvonAudio) {
        log.warn("start-native-audio called but module is not loaded.");
        return;
    }
    log.info(`[NativeAudio] Attempting to start capture. PID: ${pid}, Mode: ${mode}`);
    try {
        let audioBuffer = [];
        let bufferSizeThreshold = 3; // Batch 3 packets
        let flushTimeout = null;

        const flush = () => {
            if (audioBuffer.length > 0 && event.sender && !event.sender.isDestroyed()) {
                const totalLength = audioBuffer.reduce((acc, val) => acc + val.length, 0);
                const mergedBuffer = Buffer.concat(audioBuffer, totalLength);
                event.sender.send('audio-data-batch', mergedBuffer);
                audioBuffer = [];
            }
            if (flushTimeout) {
                clearTimeout(flushTimeout);
                flushTimeout = null;
            }
        };

        const result = zvonAudio.start(pid, mode, (data) => {
            if (event.sender && !event.sender.isDestroyed()) {
                if (!Buffer.isBuffer(data)) {
                    event.sender.send('audio-meta', data);
                } else {
                    audioBuffer.push(data);

                    if (audioBuffer.length >= bufferSizeThreshold) {
                        flush();
                    } else if (!flushTimeout) {
                        // Ensure we don't hold data too long
                        flushTimeout = setTimeout(flush, 10);
                    }
                }
            }
        });
        log.info("[NativeAudio] Capture start result:", result);
    } catch (e) {
        log.error("[NativeAudio] Capture execution error:", e);
    }
});

ipcMain.on('stop-audio-capture', () => {
    if (zvonAudio) {
        log.info("Stopping native capture.");
        zvonAudio.stop();
    }
});
ipcMain.handle('get-app-pid', () => process.pid);
ipcMain.handle('get-pid-from-hwnd', (event, hwnd) => {
    if (zvonAudio && zvonAudio.getPidFromWindowHandle) {
        return zvonAudio.getPidFromWindowHandle(Number(hwnd));
    }
    return 0;
});
// ----------------------------------------

function createOverlayWindow() {
    if (overlayWindow) return;

    const display = screen.getPrimaryDisplay();
    const { width, height } = display.bounds;

    overlayWindow = new BrowserWindow({
        width: 300,
        height: 500,
        x: 20,
        y: 20,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        movable: true,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: isDev ? path.join(__dirname, '../public/preload.js') : path.join(__dirname, 'preload.js')
        }
    });

    overlayWindow.webContents.setFrameRate(60);

    const url = isDev ? 'http://localhost:3000/#/overlay' : `file://${path.join(__dirname, 'index.html')}#/overlay`;
    console.log('[Electron] Loading Overlay URL:', url);
    
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setFullScreenable(false);
    
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.loadURL(url);

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });

    overlayWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription) => {
        console.error('Overlay failed to load:', errorCode, errorDescription);
    });

    // Как только окно загрузилось — отдаём ему последнюю конфигурацию, иначе оно
    // останется на дефолтах Overlay.tsx (в т.ч. тёмный фон включён) до первой смены настроек.
    overlayWindow.webContents.on('did-finish-load', () => {
        if (lastOverlayConfig && overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('overlay-config', lastOverlayConfig);
        }
    });

    let isShown = false;
    overlayWindow.once('ready-to-show', () => {
        if (!isShown && overlayWindow && lastActivity) {
            overlayWindow.showInactive();
            isShown = true;
        }
    });

    // We no longer fallback to show inactive here. 
    // updateActivity will handle showing it when a game is found.
}

ipcMain.on('toggle-overlay', (event, enabled) => {
    console.log('[Electron] Toggling overlay:', enabled);
    isOverlayEnabled = enabled;

    if (enabled) {
        if (!overlayWindow) {
            createOverlayWindow();
        }
        // Force evaluation of foreground game
        scanActivities();
    } else {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.hide();
        }
    }
});

ipcMain.on('update-overlay-data', (event, data) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('overlay-data', data);
    }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('update-overlay-config', (event, config) => {
    lastOverlayConfig = config;
    if (overlayWindow && !overlayWindow.isDestroyed() && config.position) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        
        const sizeMultiplier = config.size || 1;
        const winWidth = Math.round(300 * sizeMultiplier);
        const winHeight = Math.round(600 * sizeMultiplier);
        let x = 20;
        let y = 20;
        
        switch (config.position) {
            case 'top-left': x = 20; y = 20; break;
            case 'top-right': x = width - winWidth - 20; y = 20; break;
            case 'middle-left': x = 20; y = Math.round((height / 2) - (winHeight / 2)); break;
            case 'middle-right': x = width - winWidth - 20; y = Math.round((height / 2) - (winHeight / 2)); break;
            case 'bottom-left': x = 20; y = height - winHeight - 20; break;
            case 'bottom-right': x = width - winWidth - 20; y = height - winHeight - 20; break;
        }
        
        overlayWindow.setBounds({ x, y, width: winWidth, height: winHeight });
        overlayWindow.webContents.send('overlay-config', config);
    }
});

// -------------------------------------------------------------
