//! Настройки окна на диске.
//!
//! Нужны до создания окна: от них зависит, показывать его или сразу уводить в
//! трей. Интерфейс присылает настоящие значения по IPC уже после загрузки, и
//! без файла первая проверка всегда видела бы умолчания.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "window-settings.json";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub minimize_to_tray: bool,
    pub close_to_tray: bool,
    // По умолчанию окно показывается. Скрытый старт остаётся для автозапуска
    // при входе в систему — его ловит отдельный признак --hidden.
    pub start_minimized: bool,
    pub activity_detection_enabled: bool,
    pub overlay_categories: Vec<String>,
    // { "process.exe": { name, type } } — приходит из интерфейса, на диск не пишется.
    #[serde(skip_serializing)]
    pub user_apps: HashMap<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            minimize_to_tray: false,
            close_to_tray: true,
            start_minimized: false,
            activity_detection_enabled: true,
            overlay_categories: vec!["game".into(), "music".into(), "video".into()],
            user_apps: HashMap::new(),
        }
    }
}

/// Сохраняемая часть — те же четыре поля, что писал Electron.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Persisted {
    minimize_to_tray: bool,
    close_to_tray: bool,
    start_minimized: bool,
    activity_detection_enabled: bool,
}

fn own_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(FILE_NAME))
}

/// Файл прежнего клиента на Electron: %APPDATA%\zvon-client\window-settings.json
/// (папку данных Electron называет по имени пакета, а не продукта).
fn electron_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("zvon-client").join(FILE_NAME))
}

fn read(path: &PathBuf) -> Option<Settings> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn load(app: &AppHandle) -> Settings {
    if let Some(s) = own_path(app).as_ref().and_then(read) {
        return s;
    }
    // Первый запуск после перехода с Electron: забираем выбор пользователя.
    if let Some(s) = electron_path().as_ref().and_then(read) {
        persist(app, &s);
        return s;
    }
    Settings::default()
}

pub fn persist(app: &AppHandle, s: &Settings) {
    let Some(path) = own_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let data = Persisted {
        minimize_to_tray: s.minimize_to_tray,
        close_to_tray: s.close_to_tray,
        start_minimized: s.start_minimized,
        activity_detection_enabled: s.activity_detection_enabled,
    };
    match serde_json::to_string_pretty(&data) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                log::error!("[settings] не удалось сохранить настройки окна: {e}");
            }
        }
        Err(e) => log::error!("[settings] сериализация: {e}"),
    }
}

/// Слияние частичного объекта из интерфейса ('update-window-settings').
pub fn merge(s: &mut Settings, patch: &Value) {
    let Some(obj) = patch.as_object() else { return };
    let flag = |k: &str| obj.get(k).and_then(Value::as_bool);
    if let Some(v) = flag("minimizeToTray") { s.minimize_to_tray = v; }
    if let Some(v) = flag("closeToTray") { s.close_to_tray = v; }
    if let Some(v) = flag("startMinimized") { s.start_minimized = v; }
    if let Some(v) = flag("activityDetectionEnabled") { s.activity_detection_enabled = v; }
    if let Some(v) = obj.get("overlayCategories").and_then(Value::as_array) {
        s.overlay_categories = v.iter().filter_map(|x| x.as_str().map(String::from)).collect();
    }
    if let Some(v) = obj.get("userApps").and_then(Value::as_object) {
        s.user_apps = v.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    }
}
