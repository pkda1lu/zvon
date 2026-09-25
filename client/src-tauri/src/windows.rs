//! Создание окон. Все окна делят одно окружение WebView2, поэтому аргументы
//! движка у них обязаны совпадать — иначе второе окно не создастся.

use tauri::webview::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::state::AppState;

pub const SHIM: &str = include_str!("shim.js");

// Те же ключи, что Electron ставил через app.commandLine.appendSwitch. Без
// use-fake-ui-for-media-stream: в WebView2 он заставил бы getDisplayMedia
// молча брать весь экран вместо выбора окна. Разрешения на микрофон и камеру
// выдаются обработчиком в permissions.rs.
const BROWSER_ARGS: &str = concat!(
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,WinrtCaptureBorders,Vulkan,IsolateOrigins,site-per-process ",
    "--enable-features=WebRtcAllowInputVolumeAdjustment,WebRtcHideLocalSdps,WebRtcUseEchoCanceller3,D3D11VideoDecoder,D3D11VideoEncoder ",
    "--disable-site-isolation-trials ",
    "--disable-web-security ",
    "--allow-running-insecure-content ",
    "--autoplay-policy=no-user-gesture-required ",
    "--enable-gpu-rasterization ",
    "--enable-zero-copy ",
    "--ignore-gpu-blocklist ",
    "--disable-background-timer-throttling ",
    "--disable-renderer-backgrounding ",
    "--disable-backgrounding-occluded-windows ",
    "--force-fieldtrials=WebRTC-Video-MinimumSendBitrate/Enabled-300000/ ",
    "--js-flags=--max-old-space-size=4096",
);

// Как в Electron: маскировка под обычный Chrome ради встраиваемого YouTube.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

/// PAC туннеля TikTok (tunnel.rs), заданный при запуске.
pub static PAC_URL: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn browser_args() -> String {
    let mut args = BROWSER_ARGS.to_string();
    if let Some(pac) = PAC_URL.get() {
        args.push_str(&format!(" --proxy-pac-url={pac}"));
    }
    if cfg!(debug_assertions) {
        // Отладочная сборка: DevTools-протокол для проверки моста снаружи.
        args.push_str(" --remote-debugging-port=9222");
    }
    args
}

// Страницы TikTok в рамке: SPA, увидев себя в iframe, может ничего не
// нарисовать. Выполняется во всех кадрах, но действует только на TikTok.
const TIKTOK_FRAME: &str = r#"(function () {
  try {
    var h = (location && location.hostname) || '';
    if ((/(^|\.)tiktok\.com$/i.test(h) || /(^|\.)tiktokv\.com$/i.test(h)) && window.top !== window.self) {
      Object.defineProperty(window, 'top', { get: function () { return window; }, configurable: true });
      Object.defineProperty(window, 'parent', { get: function () { return window; }, configurable: true });
      Object.defineProperty(window, 'frameElement', { get: function () { return null; }, configurable: true });
    }
  } catch (e) { }
})();"#;

fn base<'a>(app: &'a AppHandle, label: &str, url: &str) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let mut b = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .additional_browser_args(&browser_args())
        .user_agent(USER_AGENT);
    // Перенос localStorage из Electron — до скриптов страницы.
    if let Some(script) = crate::migrate::script() {
        b = b.initialization_script(script);
    }
    b.initialization_script(SHIM)
        .initialization_script_for_all_frames(TIKTOK_FRAME)
        // Иначе перетаскивание файлов в чат перехватывает сам Tauri.
        .disable_drag_drop_handler()
        .visible(false)
}

pub fn create_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let w = base(app, "main", "index.html")
        .title("Zvon")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .center()
        .decorations(false)
        .background_color(Color(0x1e, 0x1f, 0x22, 0xff))
        .build()?;
    crate::permissions::install(&w);
    crate::netfilter::install(&w);
    Ok(w)
}

pub fn create_updater(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    base(app, "updater", "updater.html")
        .title("Zvon")
        .inner_size(480.0, 600.0)
        .resizable(false)
        .maximizable(false)
        .center()
        .decorations(false)
        .background_color(Color(0x04, 0x04, 0x0a, 0xff))
        .build()
}

pub fn create_overlay(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    base(app, "overlay", "index.html#/overlay")
        .title("Zvon Overlay")
        .inner_size(300.0, 500.0)
        .position(20.0, 20.0)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .build()
}

/// Показать основное окно и вывести на передний план.
pub fn reveal_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_minimized().unwrap_or(false) {
            let _ = w.unminimize();
        }
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn should_start_hidden(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let start_minimized = state.settings.lock().start_minimized;
    start_minimized || state.opened_hidden
}
