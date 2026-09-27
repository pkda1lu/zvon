//! Режимы питания: сколько Zvon может забирать у системы.
//!
//! Интерфейс живёт в процессах WebView2 (браузер, рендерер, GPU, аудио), и
//! Windows ничего не знает о том, что из этого важно. Отсюда две беды:
//!
//!  • в игре процессор занят, Windows 11 гоняет фоновые процессы на
//!    энергоэффективных ядрах (EcoQoS), и обработка микрофона и воспроизведение
//!    собеседников в рендерере не успевают — голос рвётся или пропадает;
//!  • свёрнутый в трей Zvon продолжает рисовать и держать память, хотя смотреть
//!    на него некому.
//!
//! Поэтому режим выбирается здесь и применяется ко всему дереву процессов
//! Zvon (сам Zvon.exe и все msedgewebview2.exe под ним):
//!
//!  • Voice — идёт голос (канал или звонок): повышенный приоритет, троттлинг
//!    Windows запрещён. Видимость страницы не трогаем: демонстрация экрана и
//!    звук должны работать и из трея.
//!  • Normal — окно на экране и в фокусе: всё по умолчанию.
//!  • Unfocused — окно видно, но работают в другом окне: EcoQoS, приоритет
//!    обычный. Интерфейс отзывчив, но не спорит с игрой за быстрые ядра.
//!  • Background — окно свёрнуто или в трее и голоса нет: режим
//!    эффективности (EcoQoS + низший приоритет, как у фоновых вкладок Edge),
//!    WebView скрыт — Chromium перестаёт рисовать и притормаживает таймеры,
//!    — и просит у движка минимум памяти. Сокет и уведомления продолжают
//!    работать: страница не приостанавливается, только замедляется.

use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::state::AppState;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Mode {
    Normal = 1,
    Unfocused = 2,
    Voice = 3,
    Background = 4,
}

static CURRENT: AtomicU8 = AtomicU8::new(0);

fn current() -> Option<Mode> {
    match CURRENT.load(Ordering::SeqCst) {
        1 => Some(Mode::Normal),
        2 => Some(Mode::Unfocused),
        3 => Some(Mode::Voice),
        4 => Some(Mode::Background),
        _ => None,
    }
}

fn desired(app: &AppHandle) -> Mode {
    if app.state::<AppState>().in_voice() {
        return Mode::Voice;
    }
    let Some(w) = app.get_webview_window("main") else { return Mode::Background };
    let visible = w.is_visible().unwrap_or(true);
    let minimized = w.is_minimized().unwrap_or(false);
    if !visible || minimized {
        Mode::Background
    } else if !w.is_focused().unwrap_or(true) {
        Mode::Unfocused
    } else {
        Mode::Normal
    }
}

/// Пересчитать режим. Вызывается на события окна и смену голосового состояния.
pub fn refresh(app: &AppHandle) {
    let mode = desired(app);
    let prev = CURRENT.swap(mode as u8, Ordering::SeqCst);
    if prev == mode as u8 {
        return;
    }
    log::info!("[power] режим {mode:?}");
    let was_background = prev == Mode::Background as u8;
    if mode == Mode::Background || was_background || prev == 0 {
        apply_webview(app, mode);
    }
    // Снимок процессов и вызовы — на фоновом потоке, окно не ждёт.
    tauri::async_runtime::spawn_blocking(move || imp::apply_processes(mode));
}

/// Новые процессы WebView2 (кадры мини-приложений, перезапуск GPU) рождаются
/// с настройками по умолчанию — раз в полминуты доводим их до текущего режима.
pub async fn run() {
    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;
        if let Some(mode) = current() {
            if mode != Mode::Normal {
                let _ = tauri::async_runtime::spawn_blocking(move || imp::apply_processes(mode)).await;
            }
        }
    }
}

fn apply_webview(app: &AppHandle, mode: Mode) {
    #[cfg(windows)]
    {
        let Some(w) = app.get_webview_window("main") else { return };
        let background = mode == Mode::Background;
        let res = w.with_webview(move |wv| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use windows::core::Interface;

            let controller = wv.controller();
            if let Err(e) = controller.SetIsVisible(!background) {
                log::warn!("[power] видимость WebView: {e}");
            }
            if let Ok(core) = controller.CoreWebView2() {
                if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
                    let level = if background {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                    } else {
                        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                    };
                    let _ = core19.SetMemoryUsageTargetLevel(level);
                }
            }
        });
        if let Err(e) = res {
            log::warn!("[power] with_webview: {e}");
        }
    }
    #[cfg(not(windows))]
    let _ = (app, mode);
}

#[cfg(windows)]
mod imp {
    use super::Mode;
    use crate::winsys;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, ProcessPowerThrottling, SetPriorityClass, SetProcessInformation,
        ABOVE_NORMAL_PRIORITY_CLASS, IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS,
        PROCESS_CREATION_FLAGS, PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        PROCESS_POWER_THROTTLING_EXECUTION_SPEED, PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION,
        PROCESS_POWER_THROTTLING_STATE, PROCESS_SET_INFORMATION,
    };

    /// Zvon.exe и все его потомки (дерево WebView2, sing-box туннеля).
    fn tree() -> Vec<u32> {
        let all = winsys::processes();
        let mut pids = vec![std::process::id()];
        let mut i = 0;
        while i < pids.len() {
            let parent = pids[i];
            for p in &all {
                if p.parent == parent && p.pid != parent && !pids.contains(&p.pid) {
                    pids.push(p.pid);
                }
            }
            i += 1;
        }
        pids
    }

    pub fn apply_processes(mode: Mode) {
        // (класс приоритета, троттлинг: Some(true) — EcoQoS, Some(false) — запрещён, None — на усмотрение системы)
        let (class, throttle): (PROCESS_CREATION_FLAGS, Option<bool>) = match mode {
            Mode::Normal => (NORMAL_PRIORITY_CLASS, None),
            Mode::Unfocused => (NORMAL_PRIORITY_CLASS, Some(true)),
            Mode::Voice => (ABOVE_NORMAL_PRIORITY_CLASS, Some(false)),
            Mode::Background => (IDLE_PRIORITY_CLASS, Some(true)),
        };
        let state = match throttle {
            Some(true) => PROCESS_POWER_THROTTLING_STATE {
                Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
                ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
                StateMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            },
            // В голосе запрещаем и замедление, и огрубление таймеров: аудио
            // Chromium живёт 10-миллисекундными периодами.
            Some(false) => PROCESS_POWER_THROTTLING_STATE {
                Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
                ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED
                    | PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION,
                StateMask: 0,
            },
            None => PROCESS_POWER_THROTTLING_STATE {
                Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
                ControlMask: 0,
                StateMask: 0,
            },
        };
        for pid in tree() {
            unsafe {
                let Ok(h) = OpenProcess(PROCESS_SET_INFORMATION, false, pid) else { continue };
                let _ = SetPriorityClass(h, class);
                let _ = SetProcessInformation(
                    h,
                    ProcessPowerThrottling,
                    &state as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
                );
                let _ = CloseHandle(h);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn apply_processes(_mode: super::Mode) {}
}
