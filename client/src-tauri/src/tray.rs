//! Значок в трее: открыть окно, микрофон и звук, выход.

use std::sync::atomic::Ordering;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{AppState, VoiceState};
use crate::windows;

const ID: &str = "main";

fn build_menu(app: &AppHandle, v: VoiceState) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Открыть Zvon", true, None::<&str>)?;
    let mute_label = if v.is_muted { "✓ Микрофон выключен" } else { "Выключить микрофон" };
    let deaf_label = if v.is_deafened { "✓ Звук выключен" } else { "Выключить звук" };
    let mute = MenuItem::with_id(app, "mute", mute_label, v.is_connected, None::<&str>)?;
    let deafen = MenuItem::with_id(app, "deafen", deaf_label, v.is_connected, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
    Menu::with_items(app, &[
        &open,
        &PredefinedMenuItem::separator(app)?,
        &mute,
        &deafen,
        &PredefinedMenuItem::separator(app)?,
        &quit,
    ])
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, VoiceState::default())?;
    let mut builder = TrayIconBuilder::with_id(ID)
        .tooltip("Zvon")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => windows::reveal_main(app),
            "mute" => { let _ = app.emit_to("main", "toggle-mute-shortcut", ()); }
            "deafen" => { let _ = app.emit_to("main", "toggle-deafen-shortcut", ()); }
            "quit" => {
                app.state::<AppState>().quitting.store(true, Ordering::Relaxed);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let visible = w.is_visible().unwrap_or(false);
                    let minimized = w.is_minimized().unwrap_or(false);
                    if visible && !minimized && w.is_focused().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        windows::reveal_main(app);
                    }
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn update_voice(app: &AppHandle, v: VoiceState) {
    *app.state::<AppState>().voice.lock() = v;
    let Some(tray) = app.tray_by_id(ID) else { return };
    let status = if v.is_deafened {
        "Zvon - Звук выключен"
    } else if v.is_muted {
        "Zvon - Микрофон выключен"
    } else if !v.is_connected {
        "Zvon - Не в голосе"
    } else {
        "Zvon - В сети"
    };
    let _ = tray.set_tooltip(Some(status));
    if let Ok(menu) = build_menu(app, v) {
        let _ = tray.set_menu(Some(menu));
    }
}

pub fn set_icon(app: &AppHandle, icon: Image<'static>) {
    if let Some(tray) = app.tray_by_id(ID) {
        let _ = tray.set_icon(Some(icon));
    }
}
