//! Игровой оверлей: прозрачное окно поверх игры, не перехватывающее мышь и
//! не забирающее фокус.

use serde_json::Value;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow};

use crate::state::AppState;
use crate::windows;

const LABEL: &str = "overlay";

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

pub fn ensure(app: &AppHandle) {
    if window(app).is_some() {
        return;
    }
    match windows::create_overlay(app) {
        Ok(w) => {
            let _ = w.set_ignore_cursor_events(true);
            if let Some(cfg) = app.state::<AppState>().get_sticky(LABEL, "overlay-config") {
                apply_bounds(app, &w, &cfg);
            }
        }
        Err(e) => log::error!("[overlay] окно не создано: {e}"),
    }
}

/// Показать без активации: фокус остаётся у игры.
pub fn show_inactive(app: &AppHandle) {
    let Some(w) = window(app) else { return };
    #[cfg(windows)]
    if let Ok(hwnd) = w.hwnd() {
        use ::windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE,
        };
        unsafe {
            let h = ::windows::Win32::Foundation::HWND(hwnd.0 as _);
            let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
            let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
        return;
    }
    let _ = w.show();
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = window(app) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        }
    }
}

pub fn toggle(app: &AppHandle, enabled: bool) {
    let state = app.state::<AppState>();
    state.overlay_enabled.store(enabled, std::sync::atomic::Ordering::Relaxed);
    if enabled {
        ensure(app);
        state.scan_now();
    } else {
        hide(app);
    }
}

pub fn set_data(app: &AppHandle, data: Value) {
    app.state::<AppState>().set_sticky(LABEL, "overlay-data", data.clone());
    if window(app).is_some() {
        let _ = app.emit_to(LABEL, "overlay-data", data);
    }
}

pub fn set_config(app: &AppHandle, config: Value) {
    app.state::<AppState>().set_sticky(LABEL, "overlay-config", config.clone());
    let Some(w) = window(app) else { return };
    if config.get("position").is_some() {
        apply_bounds(app, &w, &config);
        let _ = app.emit_to(LABEL, "overlay-config", config);
    }
}

fn apply_bounds(app: &AppHandle, w: &WebviewWindow, config: &Value) {
    let Some(position) = config.get("position").and_then(Value::as_str) else { return };
    let Ok(Some(monitor)) = app.primary_monitor() else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (ax, ay) = (area.position.x as f64 / scale, area.position.y as f64 / scale);
    let (width, height) = (area.size.width as f64 / scale, area.size.height as f64 / scale);

    let mult = config.get("size").and_then(Value::as_f64).unwrap_or(1.0);
    let win_w = (300.0 * mult).round();
    let win_h = (600.0 * mult).round();
    let (x, y) = match position {
        "top-right" => (width - win_w - 20.0, 20.0),
        "middle-left" => (20.0, (height / 2.0 - win_h / 2.0).round()),
        "middle-right" => (width - win_w - 20.0, (height / 2.0 - win_h / 2.0).round()),
        "bottom-left" => (20.0, height - win_h - 20.0),
        "bottom-right" => (width - win_w - 20.0, height - win_h - 20.0),
        _ => (20.0, 20.0),
    };
    let _ = w.set_size(LogicalSize::new(win_w, win_h));
    let _ = w.set_position(LogicalPosition::new(ax + x, ay + y));
}
