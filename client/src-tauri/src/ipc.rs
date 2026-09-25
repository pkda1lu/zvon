//! Каналы главного процесса. Имена и форма данных совпадают с ipcMain из
//! electron.js — интерфейс их не различает.

use std::collections::HashMap;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::image::Image;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::audio::Capture;
use crate::state::{AppState, VoiceState};
use crate::{overlay, settings, tray, tunnel, winsys};

fn arg(args: &[Value], i: usize) -> Value {
    args.get(i).cloned().unwrap_or(Value::Null)
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

#[tauri::command]
pub async fn ipc_invoke(app: AppHandle, window: WebviewWindow, channel: String, args: Vec<Value>) -> Result<Value, String> {
    let state = app.state::<AppState>();
    match channel.as_str() {
        "__sticky" => {
            let ch = arg(&args, 0);
            Ok(ch.as_str().and_then(|c| state.get_sticky(window.label(), c)).unwrap_or(Value::Null))
        }
        "get-app-version" => Ok(json!(app.package_info().version.to_string())),
        "get-pending-deep-link" => Ok(state.pending_deep_link.lock().take().map(Value::from).unwrap_or(Value::Null)),
        "get-running-processes" => tauri::async_runtime::spawn_blocking(running_processes)
            .await
            .map_err(|e| e.to_string()),
        "check-process" => {
            let name = arg(&args, 0).as_str().unwrap_or_default().to_lowercase();
            let found = tauri::async_runtime::spawn_blocking(move || {
                winsys::processes().iter().any(|p| p.exe.to_lowercase() == name)
            })
            .await
            .unwrap_or(false);
            Ok(json!(found))
        }
        "toggle-autostart" => Ok(json!(toggle_autostart(&app, arg(&args, 0).as_bool().unwrap_or(false)))),
        "get-autostart-status" => Ok(json!(autostart_enabled(&app))),
        "get-current-activity" => Ok(state.activity.lock().current()),
        "toggle-fullscreen" => {
            let Some(w) = main_window(&app) else { return Ok(json!(false)) };
            let want = arg(&args, 0).as_bool().unwrap_or(false);
            if w.set_fullscreen(want).is_err() {
                return Ok(json!(false));
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
            let is = w.is_fullscreen().unwrap_or(false);
            let _ = app.emit_to("main", "fullscreen-changed", is);
            Ok(json!(is))
        }
        "tunnel:start" => Ok(tunnel::start(&app, arg(&args, 0)).await),
        "tunnel:stop" => Ok(tunnel::stop(&app).await),
        "tunnel:status" => Ok(tunnel::status(&app)),
        "get-desktop-sources" => {
            let options = arg(&args, 0);
            tauri::async_runtime::spawn_blocking(move || crate::capture::list_sources(&options))
                .await
                .map_err(|e| e.to_string())
        }
        "capture:start" => {
            let source = arg(&args, 0).as_str().unwrap_or_default().to_string();
            let fps = arg(&args, 1).as_u64().unwrap_or(30) as u32;
            let session = app.state::<crate::capture::ScreenCapture>().start(&app, &source, fps).await?;
            Ok(json!(session))
        }
        "capture:stop" => {
            app.state::<crate::capture::ScreenCapture>().stop(&app);
            Ok(Value::Null)
        }
        "set-content-protection" => {
            if let Some(w) = main_window(&app) {
                let _ = w.set_content_protected(arg(&args, 0).as_bool().unwrap_or(false));
            }
            Ok(Value::Null)
        }
        "get-app-pid" => Ok(json!(std::process::id())),
        "get-pid-from-hwnd" => {
            let hwnd = arg(&args, 0).as_f64().unwrap_or(0.0) as isize;
            Ok(json!(if hwnd == 0 { 0 } else { winsys::pid_of_window(hwnd) }))
        }
        _ => Err(format!("No handler registered for '{channel}'")),
    }
}

// Асинхронная намеренно: синхронные команды Tauri выполняются на главном
// потоке, а часть обработчиков (глобальные сочетания, трей) сама ждёт главный
// поток — синхронный вызов заблокировал бы окно насовсем.
#[tauri::command]
pub async fn ipc_send(app: AppHandle, channel: String, args: Vec<Value>) {
    let state = app.state::<AppState>();
    match channel.as_str() {
        "update-window-settings" => {
            let mut s = state.settings.lock();
            settings::merge(&mut s, &arg(&args, 0));
            settings::persist(&app, &s);
            drop(s);
            state.scan_now();
        }
        "update-user-apps" => {
            let apps: HashMap<String, Value> = arg(&args, 0)
                .as_object()
                .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                .unwrap_or_default();
            state.settings.lock().user_apps = apps;
            state.scan_now();
        }
        "restart-app" => app.restart(),
        "update-keybinds" => update_keybinds(&app, &arg(&args, 0)),
        "voice-state-sync" => {
            if let Ok(v) = serde_json::from_value::<VoiceState>(arg(&args, 0)) {
                tray::update_voice(&app, v);
            }
        }
        "show-native-notification" => {
            let n = arg(&args, 0);
            use tauri_plugin_notification::NotificationExt;
            let mut b = app.notification().builder();
            if let Some(t) = n.get("title").and_then(Value::as_str) { b = b.title(t); }
            if let Some(t) = n.get("body").and_then(Value::as_str) { b = b.body(t); }
            if n.get("silent").and_then(Value::as_bool) != Some(true) { b = b.sound("Default"); }
            if let Err(e) = b.show() {
                log::warn!("[notification] {e}");
            }
        }
        "clipboard-write" => {
            use tauri_plugin_clipboard_manager::ClipboardExt;
            if let Some(text) = arg(&args, 0).as_str() {
                let _ = app.clipboard().write_text(text.to_string());
            }
        }
        "open-external-url" => {
            use tauri_plugin_opener::OpenerExt;
            if let Some(url) = arg(&args, 0).as_str() {
                if let Err(e) = app.opener().open_url(url, None::<&str>) {
                    log::error!("Failed to open external URL: {e}");
                }
            }
        }
        "change-icon" => change_icon(&app, arg(&args, 0).as_str().unwrap_or_default()),
        "window-minimize" => { if let Some(w) = main_window(&app) { let _ = w.minimize(); } }
        "window-maximize" => {
            if let Some(w) = main_window(&app) {
                if w.is_maximized().unwrap_or(false) { let _ = w.unmaximize(); } else { let _ = w.maximize(); }
            }
        }
        "window-close" => { if let Some(w) = main_window(&app) { let _ = w.close(); } }
        "toggle-overlay" => overlay::toggle(&app, arg(&args, 0).as_bool().unwrap_or(false)),
        "update-overlay-data" => overlay::set_data(&app, arg(&args, 0)),
        "update-overlay-config" => overlay::set_config(&app, arg(&args, 0)),
        "stop-audio-capture" => app.state::<Capture>().stop(),
        // Каналы, которые интерфейс шлёт, но и в Electron их никто не слушал.
        "set-hardware-acceleration" | "close-window" | "minimize-to-tray" => {}
        other => log::debug!("[ipc] нет обработчика для '{other}'"),
    }
}

#[tauri::command]
pub async fn audio_start(app: AppHandle, pid: u32, mode: u32, on_data: Channel<InvokeResponseBody>) {
    // «Всё, кроме Zvon»: исключать нужно корневой процесс WebView2 — иначе
    // в демонстрацию попадают голоса собеседников и звуки самого Zvon.
    let pid = if mode == 1 && pid == std::process::id() {
        winsys::webview_browser_pid().unwrap_or(pid)
    } else {
        pid
    };
    log::info!("[NativeAudio] старт захвата: pid {pid}, режим {mode}");
    app.state::<Capture>().start(pid, mode, on_data);
}

// --- Автозапуск ------------------------------------------------------------

fn toggle_autostart(app: &AppHandle, enable: bool) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    // Отладочная сборка не должна прописывать в автозагрузку target\debug.
    if cfg!(debug_assertions) {
        return false;
    }
    let al = app.autolaunch();
    let _ = if enable { al.enable() } else { al.disable() };
    al.is_enabled().unwrap_or(false)
}

fn autostart_enabled(app: &AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

// --- Глобальные сочетания ---------------------------------------------------

// Глобально регистрируются только действия, которые интерфейс ловит из
// главного процесса. Остальные сочетания (стрелки, Escape, PageUp…) интерфейс
// обрабатывает сам, а глобальная регистрация лишь отнимала бы эти клавиши у
// всех остальных программ.
const GLOBAL_ACTIONS: &[&str] = &["toggle-mute", "toggle-deafen", "toggle-overlay"];

fn normalize_accelerator(acc: &str) -> String {
    acc.split('+')
        .map(|p| match p {
            "CommandOrControl" | "CmdOrCtrl" | "CmdOrControl" | "CommandOrCtrl" => "Control",
            other => other,
        })
        .collect::<Vec<_>>()
        .join("+")
}

fn update_keybinds(app: &AppHandle, list: &Value) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let Some(items) = list.as_array() else { return };
    for kb in items {
        let (Some(action), Some(acc)) = (kb.get("action").and_then(Value::as_str), kb.get("accelerator").and_then(Value::as_str)) else {
            continue;
        };
        if !GLOBAL_ACTIONS.contains(&action) {
            continue;
        }
        let event = format!("{action}-shortcut");
        let acc = normalize_accelerator(acc);
        let res = gs.on_shortcut(acc.as_str(), move |app, _shortcut, e| {
            if e.state == ShortcutState::Pressed {
                let _ = app.emit_to("main", &event, ());
            }
        });
        if let Err(e) = res {
            log::error!("Failed to register shortcut {acc}: {e}");
        }
    }
}

// --- Значок приложения -------------------------------------------------------

fn change_icon(app: &AppHandle, name: &str) {
    let bytes: &'static [u8] = match name {
        "icon1" => include_bytes!("../../public/icon1.PNG"),
        "icon2" => include_bytes!("../../public/icon2.png"),
        "icon3" => include_bytes!("../../public/icon3.png"),
        "icon4" => include_bytes!("../../public/icon4.png"),
        "legacy" => include_bytes!("../../public/zvon_legacy.png"),
        _ => include_bytes!("../../public/app_icon.ico"),
    };
    let Ok(icon) = Image::from_bytes(bytes) else { return };
    if let Some(w) = main_window(app) {
        let _ = w.set_icon(icon.clone());
    }
    tray::set_icon(app, icon);
}

// --- Список запущенных приложений (настройки активности) ---------------------

const EXCLUDED_SUBSTRINGS: &[&str] = &[
    "service", "host", "edge", "amd", "onedrive", "software", "system", "gamebar", "helper", "proxy", "notifier",
];

const EXCLUDED_EXES: &[&str] = &[
    "explorer.exe", "node.exe", "openconsole.exe", "widgets.exe", "widgetservice.exe", "zvon.exe", "electron.exe",
    "cmd.exe", "powershell.exe", "pwsh.exe", "taskmgr.exe", "ctfmon.exe", "conhost.exe", "dllhost.exe", "sihost.exe",
    "runtimebroker.exe", "searchhost.exe", "startmenuexperiencehost.exe", "shellexperiencehost.exe",
    "applicationframehost.exe", "textinputhost.exe", "lockapp.exe", "spoolsv.exe", "audiodg.exe", "smartscreen.exe",
    "cncmd.exe", "esbuild.exe", "filecoauth.exe", "git.exe", "jetbraimsd.exe", "jetbrainsd.exe", "lanuage_server.exe",
    "language_server.exe", "wstoastnotification.exe", "msedgewebview2.exe",
];

const SYSTEM_DIRS: &[&str] = &[
    "c:\\windows\\system32", "c:\\windows\\syswow64", "c:\\windows\\systemapps", "c:\\windows\\winsxs",
];

fn running_processes() -> Value {
    let titles = winsys::main_window_titles();
    let mut unique: Vec<(String, String, String)> = Vec::new(); // (process, name, path)
    let mut seen = std::collections::HashSet::new();

    for p in winsys::processes() {
        let has_window = titles.contains_key(&p.pid);
        let path = winsys::exe_path(p.pid).unwrap_or_default();
        let lower_path = path.to_lowercase();
        let outside_system = !path.is_empty() && !SYSTEM_DIRS.iter().any(|d| lower_path.starts_with(d));
        if !(has_window || outside_system) {
            continue;
        }
        let key = p.exe.to_lowercase();
        let base = p.exe.strip_suffix(".exe").or_else(|| p.exe.strip_suffix(".EXE")).unwrap_or(&p.exe).to_string();
        let name = titles.get(&p.pid).filter(|t| !t.trim().is_empty()).cloned().unwrap_or_else(|| base.clone());
        let name_key = name.to_lowercase();
        if EXCLUDED_EXES.contains(&key.as_str()) {
            continue;
        }
        if EXCLUDED_SUBSTRINGS.iter().any(|s| key.contains(s) || name_key.contains(s)) {
            continue;
        }
        if seen.insert(key) {
            unique.push((p.exe.clone(), name, path));
        }
    }

    let mut list: Vec<Value> = unique
        .into_iter()
        .map(|(process, name, path)| {
            let icon = if path.is_empty() { None } else { winsys::file_icon_data_url(&path) };
            json!({ "process": process, "name": name, "icon": icon })
        })
        .collect();
    list.sort_by(|a, b| {
        let an = a["name"].as_str().unwrap_or_default().to_lowercase();
        let bn = b["name"].as_str().unwrap_or_default().to_lowercase();
        an.cmp(&bn)
    });
    Value::Array(list)
}
