/*
 * Переход с Electron на новую версию Zvon (Tauri).
 *
 * Эта сборка Electron (2.9.x) — переходная. Старые клиенты получают её обычным
 * автообновлением (latest.yml в релизе указывает на неё), а она при запуске:
 *
 *  1. выгружает localStorage интерфейса (вход, настройки звука, клавиши…) в
 *     %APPDATA%\zvon-client\zvon-migration.json — его подхватит новая версия;
 *  2. скачивает установщик новой версии по latest.json релиза (формат
 *     автообновления Tauri) и проверяет подпись minisign тем же ключом, что и
 *     автообновление новой версии;
 *  3. запускает отдельный сценарий, который после выхода Electron ставит
 *     новую версию, удаляет эту, восстанавливает ярлыки и открывает Zvon.
 *
 * Если что-то не вышло (нет сети, релиз ещё не опубликован, подпись не
 * сошлась) — Zvon просто открывается как обычно и попробует при следующем
 * запуске. Человек не остаётся без приложения ни на одном шаге.
 */

const { app, BrowserWindow, net } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FEED = process.env.ZVON_TRANSITION_FEED
    || 'https://github.com/pkda1lu/zvon/releases/latest/download/latest.json';

// Открытый ключ автообновления новой версии (tauri.conf.json → plugins.updater.pubkey).
const PUBKEY = 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4REYxMDM2M0Y2MUE3QTUKUldTbHAyRS9OaERmYUVjcVhWU05VUFExREVoT1RXWmhFL3UyUCtsdFBqSDVLWVRUQ0t0bFBjc2cK';

const MIGRATION_FILE = () => path.join(app.getPath('userData'), 'zvon-migration.json');

// --- minisign ---------------------------------------------------------------

function decodeLines(b64) {
    return Buffer.from(b64, 'base64').toString('utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

/**
 * Проверка подписи minisign (так подписывает `tauri signer`).
 * Алгоритм 'ED' — Ed25519 над BLAKE2b-512 файла, 'Ed' — над самим файлом.
 * Дополнительно проверяется глобальная подпись над доверенным комментарием.
 */
function verifyMinisign(fileBuf, sigB64, pubB64 = PUBKEY) {
    const pubLines = decodeLines(pubB64);
    const pub = Buffer.from(pubLines.find(l => !l.startsWith('untrusted comment:')), 'base64');
    if (pub.length !== 42 || pub.toString('latin1', 0, 2) !== 'Ed') throw new Error('неверный открытый ключ');
    const pubKeyId = pub.subarray(2, 10);
    const pubKey = crypto.createPublicKey({
        key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]),
        format: 'der',
        type: 'spki',
    });

    const sigLines = decodeLines(sigB64);
    const sigIdx = sigLines.findIndex(l => !l.startsWith('untrusted comment:'));
    const sig = Buffer.from(sigLines[sigIdx], 'base64');
    const trusted = sigLines[sigIdx + 1] || '';
    const globalSig = Buffer.from(sigLines[sigIdx + 2] || '', 'base64');
    if (sig.length !== 74) throw new Error('неверный формат подписи');
    const alg = sig.toString('latin1', 0, 2);
    if (!sig.subarray(2, 10).equals(pubKeyId)) throw new Error('подпись сделана другим ключом');

    const message = alg === 'ED' ? crypto.createHash('blake2b512').update(fileBuf).digest() : fileBuf;
    const signature = sig.subarray(10);
    if (!crypto.verify(null, message, pubKey, signature)) throw new Error('подпись файла не сходится');

    if (!trusted.startsWith('trusted comment: ')) throw new Error('нет доверенного комментария');
    const trustedText = Buffer.from(trusted.slice('trusted comment: '.length), 'utf8');
    if (!crypto.verify(null, Buffer.concat([signature, trustedText]), pubKey, globalSig)) {
        throw new Error('глобальная подпись не сходится');
    }
    return true;
}

// --- сеть -------------------------------------------------------------------

function fetchBuffer(url, onProgress) {
    return new Promise((resolve, reject) => {
        const req = net.request({ url, redirect: 'follow' });
        req.on('response', (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`HTTP ${res.statusCode} для ${url}`));
                res.on('data', () => { });
                return;
            }
            const total = Number(res.headers['content-length']) || 0;
            const chunks = [];
            let got = 0;
            res.on('data', (c) => {
                chunks.push(c);
                got += c.length;
                if (onProgress && total) onProgress(got * 100 / total);
            });
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
    });
}

// --- шаг 1: выгрузка localStorage -------------------------------------------

/**
 * localStorage живёт в origin app://index.html. Открываем в нём пустую
 * страницу (migrate.html) скрытым окном и читаем всё хранилище.
 */
async function exportLocalStorage(ensureAppProtocol) {
    ensureAppProtocol();
    const win = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    try {
        await win.loadURL('app://index.html/migrate.html');
        const json = await win.webContents.executeJavaScript(
            'JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))'
        );
        const storage = JSON.parse(json);
        const payload = { version: 1, exportedAt: new Date().toISOString(), from: app.getVersion(), localStorage: storage };
        fs.writeFileSync(MIGRATION_FILE(), JSON.stringify(payload), 'utf8');
        return Object.keys(storage).length;
    } finally {
        if (!win.isDestroyed()) win.destroy();
    }
}

// --- шаг 3: сценарий установки ----------------------------------------------

const INSTALL_SCRIPT = String.raw`
param([int]$ElectronPid, [string]$Setup, [string]$OldDir, [string]$Log)
$ErrorActionPreference = 'Continue'
function Say($m) { Add-Content -Path $Log -Value ("{0:u} {1}" -f (Get-Date), $m) -Encoding UTF8 }
function OldProcs { Get-CimInstance Win32_Process -Filter "Name='Zvon.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($OldDir, [StringComparison]::OrdinalIgnoreCase) } }

Say "переход: старт, Electron pid $ElectronPid, каталог $OldDir"

# 1. Ждём, пока Electron и его процессы полностью завершатся.
try { Wait-Process -Id $ElectronPid -Timeout 30 -ErrorAction SilentlyContinue } catch { }
$deadline = (Get-Date).AddSeconds(30)
while ((OldProcs) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
OldProcs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Ярлыки прежней версии: пользовательские и общие (установка «для всех»).
$desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory')) | ForEach-Object { Join-Path $_ 'Zvon.lnk' }
$hadDesktop = [bool]($desktops | Where-Object { Test-Path $_ })

# 2. Ставим новую версию. Старая пока на месте: если установка не удастся,
#    человек останется с работающим Electron.
if ($Setup -and (Test-Path $Setup)) {
  $p = Start-Process -FilePath $Setup -ArgumentList '/S' -PassThru -Wait
  Say "установщик новой версии завершился с кодом $($p.ExitCode)"
} else {
  Say "новая версия уже установлена, установщик не нужен"
}

$newExe = $null
$reg = Get-ItemProperty -Path 'HKCU:\Software\pkda1lu\Zvon' -ErrorAction SilentlyContinue
if ($reg -and $reg.'(default)') { $newExe = Join-Path $reg.'(default)' 'Zvon.exe' }
if (-not $newExe -or -not (Test-Path $newExe)) { $newExe = Join-Path $env:LOCALAPPDATA 'Zvon\Zvon.exe' }
if (-not (Test-Path $newExe)) {
  Say "новая версия не найдена после установки — возвращаем прежнюю"
  $old = Join-Path $OldDir 'Zvon.exe'
  if (Test-Path $old) { Start-Process -FilePath $old }
  exit 1
}

# 3. Удаляем Electron-версию её собственным деинсталлятором. Установка «для
#    всех пользователей» (HKLM) удаляется с правами администратора — Windows
#    спросит разрешение, как и при каждом обновлении такой установки.
$roots = @(
  @{ Path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'; Admin = $false },
  @{ Path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall'; Admin = $true },
  @{ Path = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; Admin = $true }
)
foreach ($root in $roots) {
  $keys = Get-ChildItem $root.Path -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty $_.PSPath } |
    Where-Object { $_.UninstallString -and $_.UninstallString -match 'Uninstall Zvon\.exe' }
  foreach ($k in $keys) {
    $cmd = if ($k.QuietUninstallString) { $k.QuietUninstallString } else { $k.UninstallString + ' /S' }
    if ($cmd -notmatch '^"([^"]+)"\s*(.*)$') { Say "не разобрана строка удаления: $cmd"; continue }
    $exe = $matches[1]; $argList = $matches[2]
    Say "удаление прежней версии: $cmd"
    try {
      if ($root.Admin) { Start-Process -FilePath $exe -ArgumentList $argList -Verb RunAs -Wait -ErrorAction Stop }
      else { Start-Process -FilePath $exe -ArgumentList $argList -Wait -ErrorAction Stop }
    } catch {
      Say "прежняя версия не удалена: $($_.Exception.Message)"
      continue
    }
    # Деинсталлятор NSIS перезапускает себя из временной папки и возвращается
    # сразу — ждём, пока исчезнет его запись.
    $until = (Get-Date).AddSeconds(90)
    while ((Test-Path $k.PSPath) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500 }
    Say "запись удаления исчезла: $(-not (Test-Path $k.PSPath))"
  }
}

# 4. Деинсталлятор Electron убирает ярлыки «Zvon» — возвращаем их на новую версию.
$shell = New-Object -ComObject WScript.Shell
$links = @(Join-Path ([Environment]::GetFolderPath('Programs')) 'Zvon.lnk')
if ($hadDesktop) { $links += Join-Path ([Environment]::GetFolderPath('Desktop')) 'Zvon.lnk' }
foreach ($lnk in $links) {
  if (-not (Test-Path $lnk)) {
    $s = $shell.CreateShortcut($lnk); $s.TargetPath = $newExe; $s.WorkingDirectory = (Split-Path $newExe); $s.Save()
    Say "ярлык восстановлен: $lnk"
  }
}

# 5. Запускаем новую версию.
Start-Process -FilePath $newExe
Say "переход завершён: $newExe"
if ($Setup) { Remove-Item -Path $Setup -Force -ErrorAction SilentlyContinue }
`;

function launchInstaller(setupPath) {
    const dir = path.join(os.tmpdir(), 'zvon-transition');
    const script = path.join(dir, 'install.ps1');
    // BOM: Windows PowerShell 5.1 читает скрипт без него в системной кодировке.
    fs.writeFileSync(script, '﻿' + INSTALL_SCRIPT, 'utf8');
    const log = path.join(app.getPath('userData'), 'transition.log');
    const child = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-File', script,
        '-ElectronPid', String(process.pid),
        '-Setup', setupPath,
        '-OldDir', path.dirname(process.execPath),
        '-Log', log,
    ], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
}

/** Путь к установленной новой версии, если она уже есть. */
function installedNewVersion() {
    const candidates = [];
    try {
        const out = require('child_process').execFileSync('reg', ['query', 'HKCU\\Software\\pkda1lu\\Zvon', '/ve'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        const m = out.match(/REG_SZ\s+(.+)/);
        if (m) candidates.push(path.join(m[1].trim(), 'Zvon.exe'));
    } catch { /* ключа нет */ }
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Zvon', 'Zvon.exe'));
    const self = path.resolve(process.execPath).toLowerCase();
    return candidates.find(p => fs.existsSync(p) && path.resolve(p).toLowerCase() !== self) || null;
}

// --- сценарий целиком -------------------------------------------------------

/**
 * @param {object} ui { message(text), progress(percent) }
 * @param {Function} ensureAppProtocol регистрирует протокол app:// (electron.js)
 * @returns {Promise<boolean>} true — установка запущена, приложение надо закрыть
 */
async function run(ui, ensureAppProtocol, log) {
    try {
        ui.message('Проверка обновлений...');

        const feed = JSON.parse((await fetchBuffer(FEED)).toString('utf8'));
        const platform = (feed.platforms && (feed.platforms['windows-x86_64-nsis'] || feed.platforms['windows-x86_64'])) || null;
        if (!platform || !platform.url || !platform.signature) throw new Error('в latest.json нет сборки для Windows');
        log.info(`[transition] новая версия ${feed.version}: ${platform.url}`);

        const keys = await exportLocalStorage(ensureAppProtocol);
        log.info(`[transition] выгружено ключей localStorage: ${keys}`);

        // Новая версия уже стоит (переход прервался на удалении старой или
        // человек открыл старый ярлык) — ничего не качаем, только доводим дело.
        if (installedNewVersion()) {
            log.info('[transition] новая версия уже установлена');
            ui.message('Обновление скачано. Установка...');
            launchInstaller('');
            return true;
        }

        ui.message(`Найдено обновление ${feed.version}. Загрузка...`);
        const setup = await fetchBuffer(platform.url, (p) => ui.progress(p));
        verifyMinisign(setup, platform.signature);
        log.info('[transition] подпись установщика проверена');

        const dir = path.join(os.tmpdir(), 'zvon-transition');
        fs.mkdirSync(dir, { recursive: true });
        const setupPath = path.join(dir, `Zvon_${feed.version}_setup.exe`);
        fs.writeFileSync(setupPath, setup);

        ui.message('Обновление скачано. Установка...');
        launchInstaller(setupPath);
        return true;
    } catch (e) {
        log.error('[transition] переход отложен:', e);
        return false;
    }
}

module.exports = { run, verifyMinisign, installedNewVersion };
