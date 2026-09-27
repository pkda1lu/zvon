use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::Notify;

use crate::activity::ActivityState;
use crate::settings::Settings;

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceState {
    pub is_muted: bool,
    pub is_deafened: bool,
    pub is_connected: bool,
}

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub voice: Mutex<VoiceState>,
    pub pending_deep_link: Mutex<Option<String>>,
    pub quitting: AtomicBool,
    pub opened_hidden: bool,
    pub overlay_enabled: AtomicBool,
    pub activity: Mutex<ActivityState>,
    pub scan_notify: Arc<Notify>,
    /// Последнее значение канала для окна: отдаётся подписчику, который
    /// подключился позже отправки (ключ — метка окна и имя канала).
    pub sticky: Mutex<HashMap<(String, String), Value>>,
    pub was_maximized: AtomicBool,
    /// Идёт личный звонок (VoiceCall): голосовой канал сервера — в `voice`.
    pub call_active: AtomicBool,
}

impl AppState {
    pub fn new(settings: Settings, opened_hidden: bool, deep_link: Option<String>) -> Self {
        Self {
            settings: Mutex::new(settings),
            voice: Mutex::new(VoiceState::default()),
            pending_deep_link: Mutex::new(deep_link),
            quitting: AtomicBool::new(false),
            opened_hidden,
            overlay_enabled: AtomicBool::new(true),
            activity: Mutex::new(ActivityState::default()),
            scan_notify: Arc::new(Notify::new()),
            sticky: Mutex::new(HashMap::new()),
            was_maximized: AtomicBool::new(false),
            call_active: AtomicBool::new(false),
        }
    }

    /// Идёт ли голос: канал сервера или личный звонок (см. power.rs).
    pub fn in_voice(&self) -> bool {
        self.voice.lock().is_connected || self.call_active.load(Ordering::Relaxed)
    }

    pub fn scan_now(&self) {
        self.scan_notify.notify_one();
    }

    pub fn set_sticky(&self, window: &str, channel: &str, value: Value) {
        self.sticky.lock().insert((window.to_string(), channel.to_string()), value);
    }

    pub fn get_sticky(&self, window: &str, channel: &str) -> Option<Value> {
        self.sticky.lock().get(&(window.to_string(), channel.to_string())).cloned()
    }
}
