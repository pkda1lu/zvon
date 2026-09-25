//! Туннель мини-аппки TikTok.
//!
//! В Electron он ставил PAC-скрипт на сессию во время работы. WebView2 берёт
//! настройки прокси только при создании окружения, поэтому здесь схема другая
//! и переносится отдельным этапом. Пока мини-аппка получает честный отказ,
//! а не молча неработающий туннель.

use serde_json::{json, Value};
use tauri::AppHandle;

const NOT_READY: &str = "Туннель ещё не перенесён в эту версию клиента.";

pub async fn start(_app: &AppHandle, _config: Value) -> Value {
    json!({ "ok": false, "error": NOT_READY })
}

pub async fn stop(_app: &AppHandle) -> Value {
    json!({ "ok": true })
}

pub fn status(_app: &AppHandle) -> Value {
    json!({ "running": false, "country": null, "title": null })
}
