//! Настольный клиент Zvon на Tauri. Замена главного процесса Electron
//! (public/electron.js): интерфейс остаётся тем же React-приложением, а всё,
//! что раньше делал Node, — здесь.

mod activity;
mod audio;
mod ipc;
mod overlay;
mod permissions;
mod settings;
mod state;
mod tray;
mod tunnel;
mod updater;
mod windows;
mod winsys;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

use state::AppState;

fn deep_link_from(args: &[String]) -> Option<String> {
    args.iter().find(|a| a.starts_with("zvon://")).cloned()
}

/// Основное окно. Показывается после загрузки страницы (без белой вспышки),
/// если не просили стартовать свёрнутым в трей.
pub fn open_main(app: &AppHandle) {
    if app.get_webview_window("main").is_some() {
        windows::reveal_main(app);
        return;
    }
    if let Err(e) = windows::create_main(app) {
        log::error!("[main] окно не создано: {e}");
    }
}

static MAIN_SHOWN: AtomicBool = AtomicBool::new(false);

pub fn on_main_loaded(window: &tauri::WebviewWindow, event: PageLoadEvent) {
    if event != PageLoadEvent::Finished || window.label() != "main" {
        return;
    }
    let app = window.app_handle();
    if !MAIN_SHOWN.swap(true, Ordering::SeqCst) && !windows::should_start_hidden(app) {
        let _ = window.show();
        let _ = window.set_focus();
    }
    app.state::<AppState>().scan_now();
}

fn on_main_event(window: &tauri::Window, event: &WindowEvent) {
    let app = window.app_handle();
    let state = app.state::<AppState>();
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            let close_to_tray = state.settings.lock().close_to_tray;
            if !state.quitting.load(Ordering::Relaxed) && close_to_tray {
                api.prevent_close();
                let _ = window.hide();
            }
        }
        WindowEvent::Resized(_) => {
            if window.is_minimized().unwrap_or(false) {
                if state.settings.lock().minimize_to_tray {
                    let _ = window.hide();
                }
                return;
            }
            let maximized = window.is_maximized().unwrap_or(false);
            if state.was_maximized.swap(maximized, Ordering::Relaxed) != maximized {
                let _ = app.emit_to("main", "window-maximized", maximized);
            }
        }
        // Основное окно закрыто по-настоящему — завершаемся, даже если
        // скрытый оверлей ещё существует.
        WindowEvent::Destroyed => app.exit(0),
        _ => {}
    }
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let opened_hidden = args.iter().any(|a| a == "--hidden");
    let startup_link = deep_link_from(&args);

    let mut builder = tauri::Builder::default();

    #[cfg(windows)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            windows::reveal_main(app);
            if let Some(url) = deep_link_from(&argv) {
                let _ = app.emit_to("main", "deep-link", url);
            }
        }));
    }

    let app = builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all() & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .with_denylist(&["overlay", "updater"])
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(audio::Capture::default())
        .invoke_handler(tauri::generate_handler![ipc::ipc_invoke, ipc::ipc_send, ipc::audio_start])
        .setup(move |app| {
            let handle = app.handle().clone();
            let loaded = settings::load(&handle);
            app.manage(AppState::new(loaded, opened_hidden, startup_link.clone()));

            #[cfg(windows)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    log::warn!("[deep-link] регистрация zvon:// не удалась: {e}");
                }
            }

            tray::create(&handle)?;

            if cfg!(debug_assertions) {
                open_main(&handle);
            } else {
                updater::start(&handle);
            }

            tauri::async_runtime::spawn(activity::run(handle));
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if let Some(w) = webview.app_handle().get_webview_window(webview.label()) {
                on_main_loaded(&w, payload.event());
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                on_main_event(window, event);
            }
        })
        .build(tauri::generate_context!())
        .expect("не удалось запустить Zvon");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            app.state::<audio::Capture>().stop();
            tauri::async_runtime::block_on(tunnel::stop(app));
        }
    });
}
