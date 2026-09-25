/*
 * Сборка файлов релиза GitHub после перехода на Tauri.
 *
 * Каждый релиз обслуживает два вида клиентов:
 *
 *  • версия на Tauri читает latest.json (автообновление Tauri) и ставит
 *    Zvon_<версия>_x64-setup.exe;
 *  • старые клиенты на Electron читают latest.yml (electron-updater). Он
 *    указывает на переходную версию Zvon-Setup-2.9.0.exe, а уже она ставит
 *    версию на Tauri (public/transition.js). Поэтому latest.yml и переходный
 *    установщик кладутся в КАЖДЫЙ релиз — иначе клиент, не запускавшийся
 *    со времён Electron, не найдёт, куда обновиться.
 *
 * Запуск (из client/):
 *   node scripts/release-assets.mjs            — версия из package.json
 *   node scripts/release-assets.mjs 3.0.1
 *
 * Ожидает:
 *   src-tauri/target/release/bundle/nsis/Zvon_<версия>_x64-setup.exe(.sig) — `npm run tauri:build`
 *   dist/Zvon-Setup-<переходная>.exe и dist/latest.yml — `npm run electron:build:transition`
 *     (или release-transition/ с этими файлами, если dist/ уже пересобран)
 *
 * Результат — release/v<версия>/, всё содержимое прикладывается к релизу:
 *   gh release create v<версия> release/v<версия>/* --title <версия>
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;
const REPO = 'pkda1lu/zvon';

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// --- версия на Tauri ---------------------------------------------------------
const nsisDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const setupName = `Zvon_${version}_x64-setup.exe`;
const setup = path.join(nsisDir, setupName);
const sig = `${setup}.sig`;
if (!fs.existsSync(setup)) fail(`нет ${setup} — сначала npm run tauri:build`);
if (!fs.existsSync(sig)) fail(`нет подписи ${sig} — сборка без TAURI_SIGNING_PRIVATE_KEY?`);

// --- переходная версия на Electron ------------------------------------------
const transitionDirs = [path.join(root, 'release-transition'), path.join(root, 'dist')];
let latestYml = null;
let transitionDir = null;
for (const dir of transitionDirs) {
    const p = path.join(dir, 'latest.yml');
    if (fs.existsSync(p)) { latestYml = p; transitionDir = dir; break; }
}
if (!latestYml) fail('нет latest.yml переходной версии — npm run electron:build:transition');
const ymlText = fs.readFileSync(latestYml, 'utf8');
const ymlVersion = (ymlText.match(/^version:\s*(.+)$/m) || [])[1]?.trim();
const ymlFile = (ymlText.match(/^path:\s*(.+)$/m) || [])[1]?.trim();
if (!ymlVersion || !ymlFile) fail(`не разобран ${latestYml}`);
if (!ymlVersion.startsWith('2.9.')) fail(`latest.yml указывает на ${ymlVersion}, а должен — на переходную 2.9.x`);
const transitionExe = path.join(transitionDir, ymlFile);
if (!fs.existsSync(transitionExe)) fail(`нет ${transitionExe}`);

// --- сборка ------------------------------------------------------------------
const out = path.join(root, 'release', `v${version}`);
fs.mkdirSync(out, { recursive: true });

const copy = (from, name = path.basename(from)) => {
    fs.copyFileSync(from, path.join(out, name));
    console.log(`  + ${name}`);
};

copy(setup);
copy(sig);
copy(latestYml);
copy(transitionExe);
const blockmap = `${transitionExe}.blockmap`;
if (fs.existsSync(blockmap)) copy(blockmap);

const latestJson = {
    version,
    notes: `Zvon ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
        'windows-x86_64': {
            signature: fs.readFileSync(sig, 'utf8').trim(),
            url: `https://github.com/${REPO}/releases/download/v${version}/${setupName}`,
        },
    },
};
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(latestJson, null, 2));
console.log('  + latest.json');

console.log(`\n✓ release/v${version} готов. Старые клиенты: latest.yml → ${ymlVersion}, новые: latest.json → ${version}.`);
console.log(`  gh release create v${version} release/v${version}/* --title ${version}`);
