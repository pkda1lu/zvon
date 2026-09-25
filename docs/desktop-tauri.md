# Настольный клиент на Tauri и переход с Electron

С версии 3.0.0 настольный Zvon собирается на Tauri (Rust + WebView2) вместо
Electron. Интерфейс не менялся: это тот же React-бандл, что и в браузере.
Главный процесс Electron (`client/public/electron.js`) переписан на Rust в
`client/src-tauri`.

Установщик весит ~45 МБ вместо ~145 МБ.

---

## Как устроено

| Было в Electron | Стало | Где |
| :--- | :--- | :--- |
| `preload.js` → `window.electron` | шим с тем же API поверх IPC Tauri | `src-tauri/src/shim.js` |
| `ipcMain.handle/on` | диспетчер каналов с теми же именами | `src-tauri/src/ipc.rs` |
| PowerShell/tasklist для активности | Win32 напрямую | `activity.rs`, `winsys.rs` |
| C++-модуль `native-audio` | WASAPI process loopback на Rust | `audio.rs` |
| `desktopCapturer` + `chromeMediaSourceId` | список с превью + Windows Graphics Capture, кадры через общую память WebView2 | `capture.rs`, `shim.js` |
| `session.webRequest` (XFO/CSP, YouTube) | домен Fetch протокола DevTools | `netfilter.rs` |
| PAC на сессию для TikTok | постоянный PAC + локальный SOCKS5-ретранслятор + sing-box | `tunnel.rs` |
| `electron-updater` | `tauri-plugin-updater` | `updater.rs` |

Интерфейс узнаёт десктоп по `window.electron`, как и раньше, поэтому общий код
браузерной и настольной версий остался общим. `window.electron.isTauri`
отличает новую оболочку, если это когда-нибудь понадобится.

### Особенности WebView2, о которых стоит помнить

- **`--disable-web-security`** (как `webSecurity: false` в Electron). С ним
  Chromium не шлёт `Origin`, и штатный транспорт IPC Tauri не работает; шим
  переключает его на `postMessage`. Команды, которые трогают главный поток
  (трей, горячие клавиши), обязаны быть `async` — синхронные команды Tauri
  исполняются в главном потоке, и это взаимоблокировка.
- **Звук страницы** Windows приписывает корневому процессу `msedgewebview2.exe`,
  а не `Zvon.exe`. Поэтому захват «всё, кроме Zvon» исключает именно его
  (`winsys::webview_browser_pid`).
- **CSP `frame-ancestors`** WebView2 сверяет по исходному ответу, правка
  заголовков через `continueResponse` на неё не влияет. Ответы, запрещающие
  встраивание, отдаются заново через `Fetch.fulfillRequest`.
- **Прокси** WebView2 берёт только при запуске, поэтому PAC постоянный, а
  включение туннеля переключает ретранслятор.

---

## Переход существующих пользователей

Установленные клиенты на Electron умеют читать только `latest.yml`. Цепочка:

```
Electron ≤ 2.8.x ──latest.yml──▶ Electron 2.9.0 (переходная) ──latest.json──▶ Tauri 3.x
```

1. Старый клиент видит в `latest.yml` версию **2.9.0** и обновляется до неё
   обычным путём (для установки «для всех пользователей» — с запросом UAC, как
   и всегда).
2. 2.9.0 при запуске (`client/public/transition.js`):
   - выгружает localStorage интерфейса (вход, настройки звука, клавиши…) в
     `%APPDATA%\zvon-client\zvon-migration.json`;
   - читает `latest.json`, скачивает установщик новой версии и проверяет
     подпись minisign тем же ключом, что и автообновление Tauri;
   - запускает сценарий PowerShell и закрывается.
3. Сценарий: ждёт выхода Electron → ставит новую версию тихо → удаляет
   Electron его же деинсталлятором (HKCU или HKLM; для HKLM — с UAC) →
   восстанавливает ярлыки → запускает новую версию. Журнал —
   `%APPDATA%\zvon-client\transition.log`.
4. Новая версия при первом запуске подкладывает localStorage до скриптов
   страницы (`migrate.rs`), забирает `window-settings.json`, снимает старый
   автозапуск. Человек открывает Zvon уже вошедшим.

Если что-то пошло не так (нет сети, подпись не сошлась, установка не удалась),
открывается Electron-версия, и переход повторится при следующем запуске.
Удаление старой версии идёт **после** установки новой — без приложения человек
не остаётся ни на одном шаге.

### Правило для всех будущих релизов

**В каждом релизе должны лежать `latest.yml` и `Zvon-Setup-2.9.0.exe`.**
Клиент, не запускавшийся со времён Electron, читает `latest.yml` последнего
релиза; если его там нет, он не обновится никогда. Скрипт
`release-assets.mjs` кладёт их автоматически.

---

## Выпуск релиза

Всё — из `client/`.

```bash
# 1. Новая версия (подпись для автообновления обязательна)
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/zvon-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri:build

# 2. Переходная версия — один раз; результат хранится в release-transition/
npm run electron:build:transition
mkdir -p release-transition && cp dist/Zvon-Setup-2.9.0.exe* dist/latest.yml release-transition/

# 3. Файлы релиза
npm run release:assets        # → release/v<версия>/

# 4. Публикация
gh release create v<версия> release/v<версия>/* --title <версия>
```

Версия берётся из `client/package.json` (её же читает `tauri.conf.json`), в
`src-tauri/Cargo.toml` её стоит держать такой же.

### Порядок первого выката (3.0.0)

1. **Сервер** — задеплоить до релиза: `routes/download.js` отдаёт на кнопке
   «Скачать» установщик Tauri (`*_x64-setup.exe`), а не переходный; в CORS
   добавлен origin `http://tauri.localhost`.
2. **Релиз v3.0.0** со всеми файлами из `release/v3.0.0/`.
3. Проверить на чистой машине (виртуалке) с установленной 2.8.x: обновление
   до 2.9.0 → переход → Tauri открылся вошедшим, в «Программах и компонентах»
   один Zvon, ярлыки ведут на новую версию, `zvon://` открывает её.

### Ключ подписи

`~/.tauri/zvon-updater.key` (без пароля), открытый ключ — в
`tauri.conf.json` и `public/transition.js`. **Без него невозможно выпустить
обновление**, которое примут установленные клиенты. Храните копию вне этой
машины; для CI — секрет `TAURI_SIGNING_PRIVATE_KEY`.

---

## Разработка

```bash
npm run tauri:dev
```

Отладочная сборка открывает порт DevTools `9222` (для проверок по CDP), не
трогает автозапуск и регистрацию `zvon://`. Если на диске C: мало места,
можно вынести кэш Cargo и временные файлы: `CARGO_HOME`, `TEMP`, `TMP`.
