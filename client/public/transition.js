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

/*
 * BLAKE2b-512 (RFC 7693). Встроенного в Electron нет: его crypto собран на
 * BoringSSL, и createHash('blake2b512') бросает «Digest method not supported» —
 * из-за этого 2.9.1 не могла проверить подпись и переход не начинался.
 * 64-битные слова — парами 32-битных (lo, hi), как в blakejs.
 */
const B2B_IV = new Uint32Array([
    0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
    0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19,
]);
const B2B_SIGMA = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
    11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
    7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
    9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
    2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
    12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
    13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
    6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
    10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
].map(x => x * 2);

function blake2b512js(data) {
    const h = new Uint32Array(16);
    const v = new Uint32Array(32);
    const m = new Uint32Array(32);
    const block = Buffer.alloc(128);
    h.set(B2B_IV);
    h[0] ^= 0x01010040; // длина результата 64, без ключа

    const add64 = (a, b) => {
        const lo = v[a] + v[b];
        let hi = v[a + 1] + v[b + 1];
        if (lo >= 0x100000000) hi++;
        v[a] = lo; v[a + 1] = hi;
    };
    const add64c = (a, lo0, hi0) => {
        const lo = v[a] + lo0;
        let hi = v[a + 1] + hi0;
        if (lo >= 0x100000000) hi++;
        v[a] = lo; v[a + 1] = hi;
    };
    const G = (a, b, c, d, ix, iy) => {
        add64(a, b); add64c(a, m[ix], m[ix + 1]);
        let xl = v[d] ^ v[a], xh = v[d + 1] ^ v[a + 1];
        v[d] = xh; v[d + 1] = xl;                                   // >>> 32
        add64(c, d);
        xl = v[b] ^ v[c]; xh = v[b + 1] ^ v[c + 1];
        v[b] = (xl >>> 24) ^ (xh << 8); v[b + 1] = (xh >>> 24) ^ (xl << 8);   // >>> 24
        add64(a, b); add64c(a, m[iy], m[iy + 1]);
        xl = v[d] ^ v[a]; xh = v[d + 1] ^ v[a + 1];
        v[d] = (xl >>> 16) ^ (xh << 16); v[d + 1] = (xh >>> 16) ^ (xl << 16); // >>> 16
        add64(c, d);
        xl = v[b] ^ v[c]; xh = v[b + 1] ^ v[c + 1];
        v[b] = (xh >>> 31) ^ (xl << 1); v[b + 1] = (xl >>> 31) ^ (xh << 1);   // >>> 63
    };
    const compress = (buf, t, last) => {
        for (let i = 0; i < 16; i++) { v[i] = h[i]; v[i + 16] = B2B_IV[i]; }
        v[24] ^= t >>> 0; v[25] ^= Math.floor(t / 0x100000000);
        if (last) { v[28] = ~v[28]; v[29] = ~v[29]; }
        for (let i = 0; i < 32; i++) m[i] = buf.readUInt32LE(i * 4);
        for (let r = 0; r < 12; r++) {
            const s = r * 16;
            G(0, 8, 16, 24, B2B_SIGMA[s], B2B_SIGMA[s + 1]);
            G(2, 10, 18, 26, B2B_SIGMA[s + 2], B2B_SIGMA[s + 3]);
            G(4, 12, 20, 28, B2B_SIGMA[s + 4], B2B_SIGMA[s + 5]);
            G(6, 14, 22, 30, B2B_SIGMA[s + 6], B2B_SIGMA[s + 7]);
            G(0, 10, 20, 30, B2B_SIGMA[s + 8], B2B_SIGMA[s + 9]);
            G(2, 12, 22, 24, B2B_SIGMA[s + 10], B2B_SIGMA[s + 11]);
            G(4, 14, 16, 26, B2B_SIGMA[s + 12], B2B_SIGMA[s + 13]);
            G(6, 8, 18, 28, B2B_SIGMA[s + 14], B2B_SIGMA[s + 15]);
        }
        for (let i = 0; i < 16; i++) h[i] ^= v[i] ^ v[i + 16];
    };

    let off = 0;
    // Последний блок (даже полный) сжимается с флагом last — поэтому оставляем его.
    while (data.length - off > 128) { compress(data.subarray(off, off + 128), off + 128, false); off += 128; }
    block.fill(0);
    data.copy(block, 0, off);
    compress(block, data.length, true);

    const out = Buffer.alloc(64);
    for (let i = 0; i < 16; i++) out.writeUInt32LE(h[i], i * 4);
    return out;
}

function blake2b512(data) {
    try { return crypto.createHash('blake2b512').update(data).digest(); } catch { return blake2b512js(data); }
}

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

    const message = alg === 'ED' ? blake2b512(fileBuf) : fileBuf;
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
# Вместе с Zvon.exe — sing-box.exe туннеля: переживший приложение, он держит файлы
# в папке установки и не даёт деинсталлятору их удалить.
function OldProcs { Get-CimInstance Win32_Process -Filter "Name='Zvon.exe' OR Name='sing-box.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($OldDir, [StringComparison]::OrdinalIgnoreCase) } }

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

module.exports = { run, verifyMinisign, installedNewVersion, blake2b512js };
