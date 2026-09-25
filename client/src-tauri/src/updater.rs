//! Окно проверки обновлений при запуске — тот же сценарий, что в Electron:
//! проверка → загрузка с прогрессом → установка и перезапуск; если обновления
//! нет, ошибка или 10 секунд тишины — открывается основное окно.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::windows;

fn say(app: &AppHandle, text: &str) {
    let value = serde_json::json!(text);
    app.state::<crate::state::AppState>().set_sticky("updater", "updater-message", value.clone());
    let _ = app.emit_to("updater", "updater-message", value);
}

fn progress(app: &AppHandle, percent: f64) {
    let _ = app.emit_to("updater", "updater-progress", percent);
}

/// Закрыть окно обновления и открыть основное (один раз).
fn proceed(app: &AppHandle, opened: &AtomicBool) {
    if opened.swap(true, Ordering::SeqCst) {
        return;
    }
    crate::open_main(app);
    if let Some(w) = app.get_webview_window("updater") {
        let _ = w.close();
    }
}

pub fn start(app: &AppHandle) {
    let window = match windows::create_updater(app) {
        Ok(w) => w,
        Err(e) => {
            log::error!("[updater] окно не создано: {e}");
            crate::open_main(app);
            return;
        }
    };
    if !app.state::<crate::state::AppState>().opened_hidden {
        let _ = window.show();
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let opened = Arc::new(AtomicBool::new(false));
        // Страница окна должна успеть подписаться на сообщения.
        tokio::time::sleep(Duration::from_millis(300)).await;
        say(&app, "Проверка обновлений...");

        let check = async {
            let updater = app.updater().map_err(|e| e.to_string())?;
            updater.check().await.map_err(|e| e.to_string())
        };
        let result = tokio::time::timeout(Duration::from_secs(10), check).await;

        match result {
            Err(_) => proceed(&app, &opened),
            Ok(Err(e)) => {
                log::warn!("[updater] ошибка проверки: {e}");
                say(&app, "Ошибка при поиске обновлений");
                tokio::time::sleep(Duration::from_secs(2)).await;
                proceed(&app, &opened);
            }
            Ok(Ok(None)) => {
                say(&app, "У вас последняя версия");
                tokio::time::sleep(Duration::from_secs(1)).await;
                proceed(&app, &opened);
            }
            Ok(Ok(Some(update))) => {
                say(&app, &format!("Найдено обновление {}. Загрузка...", update.version));
                let mut downloaded: u64 = 0;
                let app_progress = app.clone();
                let app_done = app.clone();
                let res = update
                    .download_and_install(
                        move |chunk, total| {
                            downloaded += chunk as u64;
                            if let Some(total) = total.filter(|t| *t > 0) {
                                progress(&app_progress, downloaded as f64 * 100.0 / total as f64);
                            }
                        },
                        move || say(&app_done, "Обновление скачано. Установка..."),
                    )
                    .await;
                match res {
                    // В Windows установщик сам завершает приложение; сюда
                    // попадаем, только если он этого не сделал.
                    Ok(()) => app.restart(),
                    Err(e) => {
                        log::error!("[updater] установка не удалась: {e}");
                        say(&app, "Ошибка при поиске обновлений");
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        proceed(&app, &opened);
                    }
                }
            }
        }
    });
}
