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
//
// Без --disable-background-timer-throttling (был в Electron): свёрнутое в трей
// окно скрывает WebView (power.rs), и Chromium должен притормаживать таймеры
// страницы. Во время голоса страница остаётся видимой, так что звонка это не
// касается. AudioWorkletRealtimeThread — поток AudioWorklet (шумоподавление,
// VAD) с приоритетом реального времени: под нагрузкой от игры он не теряет
// 10-миллисекундные кадры.
const BROWSER_ARGS: &str = concat!(
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,WinrtCaptureBorders,Vulkan,IsolateOrigins,site-per-process ",
    "--enable-features=WebRtcAllowInputVolumeAdjustment,WebRtcHideLocalSdps,WebRtcUseEchoCanceller3,D3D11VideoDecoder,D3D11VideoEncoder,AudioWorkletRealtimeThread ",
    "--disable-site-isolation-trials ",
    "--disable-web-security ",
    "--allow-running-insecure-content ",
    "--autoplay-policy=no-user-gesture-required ",
    "--enable-gpu-rasterization ",
    "--enable-zero-copy ",
    "--ignore-gpu-blocklist ",
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

/// Метка `window.open` всплывающего окна трансляции (utils/streamPip.ts).
const STREAM_PIP_URL: &str = "about:blank#zvon-stream-pip";

/*
 * Всплывающее окно трансляции. Системное «картинка в картинке» Chromium в
 * WebView2 несёт кнопки «Вернуться на вкладку» и «Параметры», которые здесь
 * ничего не делают: вкладки и страницы настроек у приложения нет. Поэтому
 * страница открывает своё окно через window.open, а мы отвечаем на запрос
 * настоящим окном Tauri поверх остальных. Окно связано со страницей (opener,
 * то же окружение WebView2): она сама кладёт в него <video> с трансляцией и
 * свои кнопки. Прочие window.open обрабатываются как раньше.
 */
fn stream_pip_window(
    app: &AppHandle,
    features: tauri::webview::NewWindowFeatures,
) -> tauri::Result<WebviewWindow> {
    // Never create and destroy child WebViews during the same NewWindowRequested
    // deferral. The renderer clears stale children via IPC before window.open.
    if app.webview_windows().keys().any(|label| label.starts_with("stream-pip")) {
        return Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "Прежнее миниокно трансляции ещё не закрыто").into());
    }
    static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
    let label = format!("stream-pip-{}", NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
    // Позицию и размер из window.open не берём: WebView2 отдаёт там значения,
    // на которых tao переполняется и роняет процесс (window.rs, «attempt to add
    // with overflow»). Ставим сами — правый нижний угол монитора с Zvon.
    let geometry = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .map(|m| {
            let area = m.work_area();
            crate::pip_geometry::placement(area.position.x, area.position.y, area.size.width, area.size.height, m.scale_factor())
        })
        .unwrap_or_else(|| crate::pip_geometry::placement(0, 0, 1280, 800, 1.0));
    log::info!("[stream-pip] create {label}: {geometry:?}");
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::External("about:blank".parse().unwrap()))
        .window_features(features)
        // Override ALL browser geometry. Create at a safe primary-monitor origin;
        // move using physical coordinates only after the HWND exists.
        .inner_size(480.0, 270.0)
        .position(0.0, 0.0)
        .visible(false)
        .focused(false)
        .additional_browser_args(&browser_args())
        .user_agent(USER_AGENT)
        .title("Трансляция — Zvon")
        .always_on_top(true)
        // Как в Discord: без системной рамки и кнопок, закрытие — своей
        // кнопкой в окне, клик разворачивает голосовой чат.
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .skip_taskbar(true)
        .background_color(Color(0, 0, 0, 0xff))
        .build()?;
    let placed = (|| -> tauri::Result<()> {
        window.set_size(tauri::PhysicalSize::new(geometry.width, geometry.height))?;
        window.set_position(tauri::PhysicalPosition::new(geometry.x, geometry.y))?;
        window.show()
    })();
    if let Err(error) = placed {
        // Do not destroy here while WebView2 is still handling a new-window request.
        // A later stream-pip:clear call will discard this hidden child safely.
        log::warn!("[stream-pip] placement failed: {error}");
        return Err(error);
    }
    Ok(window)
}

/// Закрыть окно трансляции (см. "stream-pip-close" в ipc.rs).
pub fn close_stream_pip(app: &AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("stream-pip") {
            let _ = w.destroy();
        }
    }
}

/// Начать перетаскивание окна трансляции (кнопка мыши уже нажата в окне).
pub fn drag_stream_pip(app: &AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("stream-pip") {
            let _ = w.start_dragging();
        }
    }
}

pub fn create_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let handle = app.clone();
    let w = base(app, "main", "index.html")
        .on_new_window(move |url, features| {
            // Остальные window.open, как и до этого обработчика, не открываем:
            // без него wry отклонял их все (ссылки уходят в браузер своим путём).
            // Allow открывал бы голое окно WebView2 без нашей обвязки.
            if url.as_str() != STREAM_PIP_URL {
                return tauri::webview::NewWindowResponse::Deny;
            }
            match stream_pip_window(&handle, features) {
                Ok(window) => tauri::webview::NewWindowResponse::Create { window },
                Err(e) => {
                    log::warn!("[stream-pip] окно не создано: {e}");
                    tauri::webview::NewWindowResponse::Deny
                }
            }
        })
        // Скачивания (ссылка с download, в т. ч. на blob:): без обработчика
        // WebView2 молча ничего не сохранял. Кладём в «Загрузки», не
        // перезаписывая файлы с тем же именем.
        .on_download(|webview, event| {
            match event {
                tauri::webview::DownloadEvent::Requested { destination, .. } => {
                    if let Some(dir) = webview.app_handle().path().download_dir().ok() {
                        let name = destination
                            .file_name()
                            .map(|n| n.to_owned())
                            .unwrap_or_else(|| "download".into());
                        *destination = unique_path(&dir, std::path::Path::new(&name));
                    }
                    log::info!("[download] сохраняю в {}", destination.display());
                    true
                }
                tauri::webview::DownloadEvent::Finished { path, success, .. } => {
                    log::info!("[download] {}: {:?}", if success { "готово" } else { "не удалось" }, path);
                    true
                }
                _ => true,
            }
        })
        .title("Zvon")
        .inner_size(1280.0, 800.0)
        // The interface is dark even when Windows uses a light theme. Native
        // frame restoration must not fall back to a light system border.
        .theme(Some(tauri::Theme::Dark))
        .min_inner_size(800.0, 600.0)
        .center()
        .decorations(false)
        .background_color(Color(0x1e, 0x1f, 0x22, 0xff))
        .build()?;
    crate::permissions::install(&w);
    crate::permissions::install_fullscreen(&w);
    crate::permissions::install_context_menu(&w);
    crate::netfilter::install(&w);
    #[cfg(windows)]
    crate::maximized_edge::install(&w);
    Ok(w)
}

/// «имя.ext», а если занято — «имя (1).ext», «имя (2).ext»…
fn unique_path(dir: &std::path::Path, name: &std::path::Path) -> std::path::PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let stem = name.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = name.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..1000)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

pub fn create_updater(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let w = base(app, "updater", "updater.html")
        .title("Zvon")
        .inner_size(480.0, 600.0)
        .resizable(false)
        .maximizable(false)
        .center()
        .decorations(false)
        .background_color(Color(0x04, 0x04, 0x0a, 0xff))
        .build()?;
    crate::permissions::install_context_menu(&w);
    Ok(w)
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
        #[cfg(windows)]
        crate::maximized_edge::refresh(&w);
    }
    crate::power::refresh(app);
}

pub fn should_start_hidden(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let start_minimized = state.settings.lock().start_minimized;
    start_minimized || state.opened_hidden
}
