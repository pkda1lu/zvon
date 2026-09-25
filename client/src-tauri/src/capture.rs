//! Демонстрация экрана.
//!
//! В Electron список источников с превью давал desktopCapturer, а поток
//! открывался по chromeMediaSourceId. В WebView2 такого механизма нет, поэтому:
//!
//!  • список экранов и окон с превью строится здесь (GDI, PrintWindow);
//!  • выбранный источник захватывается через Windows Graphics Capture — тот же
//!    системный механизм, которым пользовался Chromium внутри Electron;
//!  • кадры уходят в страницу через общую память WebView2 (SharedBuffer), без
//!    копирования через IPC, а там превращаются в MediaStreamTrack (см. shim.js).
//!
//! Id источников — в формате desktopCapturer ('screen:<n>:0', 'window:<hwnd>:0'),
//! поэтому захват звука окна (nativeAudio.ts) работает без изменений.

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::core::BOOL;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, EnumDisplayMonitors, GetDC,
    GetDIBits, ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HALFTONE, HBITMAP, HDC, HMONITOR, SRCCOPY,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, GetWindowThreadProcessId};

use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings, MinimumUpdateIntervalSettings,
    SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

use crate::winsys;

// Оверлеи и служебные окна, которые нет смысла показывать в списке.
const SHARING_BLACKLIST: &[&str] = &[
    // Русская Windows называет служебные окна по-своему.
    "Интерфейс ввода Windows", "Диспетчер задач", "Параметры", "Центр уведомлений", "Поиск", "Пуск",
    "NVIDIA GeForce Experience", "NVIDIA Share", "NVIDIA Overlay", "GeForce Overlay",
    "NVIDIA GeForce Overlay", "Steam Overlay", "Discord Overlay", "RTSS Overlay",
    "MSI Afterburner", "Game Bar", "Xbox Game Bar", "Microsoft Text Input Application",
    "Windows Input Experience", "Windows Default Lock Screen", "Windows Shell Experience Host",
    "Settings", "Task Manager", "Program Manager", "Search", "Start", "Shell Experience Host",
    "Action Center",
];

// --- Список источников -------------------------------------------------------

fn monitors() -> Vec<(HMONITOR, RECT)> {
    unsafe extern "system" fn cb(m: HMONITOR, _dc: HDC, rect: *mut RECT, data: LPARAM) -> BOOL {
        let list = &mut *(data.0 as *mut Vec<(HMONITOR, RECT)>);
        list.push((m, *rect));
        BOOL(1)
    }
    let mut list: Vec<(HMONITOR, RECT)> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut list as *mut _ as isize));
    }
    list
}

/// Размер превью с сохранением пропорций внутри рамки tw×th.
fn fit(w: i32, h: i32, tw: i32, th: i32) -> (i32, i32) {
    if w <= 0 || h <= 0 {
        return (tw, th);
    }
    let scale = (tw as f64 / w as f64).min(th as f64 / h as f64);
    (((w as f64 * scale).round() as i32).max(1), ((h as f64 * scale).round() as i32).max(1))
}

unsafe fn bitmap_to_png(dc: HDC, bmp: HBITMAP, w: i32, h: i32) -> Option<String> {
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut px = vec![0u8; (w * h * 4) as usize];
    if GetDIBits(dc, bmp, 0, h as u32, Some(px.as_mut_ptr() as *mut c_void), &mut bmi, DIB_RGB_COLORS) == 0 {
        return None;
    }
    for p in px.chunks_exact_mut(4) {
        p.swap(0, 2);
        p[3] = 255;
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w as u32, h as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(&px).ok()?;
    }
    use base64::Engine;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(out)))
}

/// Превью области экрана.
fn screen_thumbnail(rect: RECT, tw: i32, th: i32) -> Option<String> {
    let (w, h) = (rect.right - rect.left, rect.bottom - rect.top);
    let (pw, ph) = fit(w, h, tw, th);
    unsafe {
        let screen = GetDC(None);
        let mem = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, pw, ph);
        let old = SelectObject(mem, bmp.into());
        SetStretchBltMode(mem, HALFTONE);
        let ok = StretchBlt(mem, 0, 0, pw, ph, Some(screen), rect.left, rect.top, w, h, SRCCOPY).as_bool();
        SelectObject(mem, old);
        let png = if ok { bitmap_to_png(mem, bmp, pw, ph) } else { None };
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        png
    }
}

/// Превью окна: PrintWindow с PW_RENDERFULLCONTENT рисует и окна на DirectX.
fn window_thumbnail(hwnd: HWND, tw: i32, th: i32) -> Option<String> {
    unsafe {
        let mut r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
        let (w, h) = (r.right - r.left, r.bottom - r.top);
        if w <= 0 || h <= 0 {
            return None;
        }
        let (pw, ph) = fit(w, h, tw, th);
        let screen = GetDC(None);
        let full_dc = CreateCompatibleDC(Some(screen));
        let full = CreateCompatibleBitmap(screen, w, h);
        let old_full = SelectObject(full_dc, full.into());
        let printed = PrintWindow(hwnd, full_dc, PRINT_WINDOW_FLAGS(2)).as_bool();

        let thumb_dc = CreateCompatibleDC(Some(screen));
        let thumb = CreateCompatibleBitmap(screen, pw, ph);
        let old_thumb = SelectObject(thumb_dc, thumb.into());
        SetStretchBltMode(thumb_dc, HALFTONE);
        let ok = printed && StretchBlt(thumb_dc, 0, 0, pw, ph, Some(full_dc), 0, 0, w, h, SRCCOPY).as_bool();
        SelectObject(thumb_dc, old_thumb);
        SelectObject(full_dc, old_full);
        let png = if ok { bitmap_to_png(thumb_dc, thumb, pw, ph) } else { None };
        let _ = DeleteObject(thumb.into());
        let _ = DeleteObject(full.into());
        let _ = DeleteDC(thumb_dc);
        let _ = DeleteDC(full_dc);
        ReleaseDC(None, screen);
        png
    }
}

pub fn list_sources(options: &Value) -> Value {
    let types: Vec<String> = options
        .get("types")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_else(|| vec!["screen".into(), "window".into()]);
    let tw = options.pointer("/thumbnailSize/width").and_then(Value::as_i64).unwrap_or(150) as i32;
    let th = options.pointer("/thumbnailSize/height").and_then(Value::as_i64).unwrap_or(85) as i32;

    let mut out = Vec::new();

    if types.iter().any(|t| t == "screen") {
        let list = monitors();
        let single = list.len() == 1;
        for (i, (_m, rect)) in list.iter().enumerate() {
            out.push(json!({
                "id": format!("screen:{i}:0"),
                "name": if single { "Весь экран".to_string() } else { format!("Экран {}", i + 1) },
                "thumbnail": screen_thumbnail(*rect, tw, th),
                "display_id": i.to_string(),
                "appIcon": null,
            }));
        }
    }

    if types.iter().any(|t| t == "window") {
        let me = std::process::id();
        let mut icons: HashMap<u32, Option<String>> = HashMap::new();
        for w in Window::enumerate().unwrap_or_default() {
            let hwnd = HWND(w.as_raw_hwnd());
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
            if pid == me {
                continue;
            }
            let title = w.title().unwrap_or_default();
            if title.trim().is_empty() || SHARING_BLACKLIST.iter().any(|b| title.contains(b)) {
                continue;
            }
            let icon = icons
                .entry(pid)
                .or_insert_with(|| winsys::exe_path(pid).and_then(|p| winsys::file_icon_data_url(&p)))
                .clone();
            out.push(json!({
                "id": format!("window:{}:0", hwnd.0 as isize),
                "name": title,
                "thumbnail": window_thumbnail(hwnd, tw, th),
                "display_id": "",
                "appIcon": icon,
            }));
        }
    }

    Value::Array(out)
}

// --- Захват ------------------------------------------------------------------

/// Кольцо общих буферов WebView2. Память буферов доступна из любого потока;
/// создавать и отправлять их в страницу можно только в главном потоке.
#[derive(Default)]
struct Ring {
    slots: Vec<(usize, usize)>, // (адрес, размер)
    next: usize,
    generation: u64,
    alloc_pending: bool,
    /// Кадр, пришедший до выделения буферов. У неподвижного окна он может
    /// оказаться единственным — терять его нельзя.
    pending: Option<(Vec<u8>, String)>,
}

struct Shared {
    app: AppHandle,
    session: u64,
    ring: Mutex<Ring>,
}

const SLOTS: usize = 3;

struct Handler {
    shared: Arc<Shared>,
    min_interval: Duration,
    last: Option<Instant>,
    first: bool,
}

impl GraphicsCaptureApiHandler for Handler {
    type Flags = (Arc<Shared>, u32);
    type Error = String;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let (shared, fps) = ctx.flags;
        let fps = fps.clamp(1, 240);
        Ok(Self { shared, min_interval: Duration::from_micros(1_000_000 / fps as u64), last: None, first: true })
    }

    fn on_frame_arrived(&mut self, frame: &mut Frame, _control: InternalCaptureControl) -> Result<(), Self::Error> {
        // Ограничение частоты кадров выбранной в пикере.
        if let Some(t) = self.last {
            if t.elapsed() < self.min_interval {
                return Ok(());
            }
        }
        self.last = Some(Instant::now());

        let mut fb = match frame.buffer() {
            Ok(fb) => fb,
            Err(e) => {
                log::warn!("[capture] кадр не прочитан: {e}");
                return Ok(());
            }
        };
        let (width, height, stride) = (fb.width(), fb.height(), fb.row_pitch());
        if self.first {
            self.first = false;
            log::info!("[capture] первый кадр {width}×{height}, шаг строки {stride}");
        }
        let raw = fb.as_raw_buffer();
        let needed = stride as usize * height as usize;

        let meta = json!({
            "session": self.shared.session,
            "width": width,
            "height": height,
            "stride": stride,
        })
        .to_string();

        let (slot, generation) = {
            let mut ring = self.shared.ring.lock();
            let fits = !ring.slots.is_empty() && ring.slots.iter().all(|(_, size)| *size >= needed);
            if !fits {
                ring.pending = Some((raw[..needed.min(raw.len())].to_vec(), meta));
                if !ring.alloc_pending {
                    ring.alloc_pending = true;
                    let shared = self.shared.clone();
                    let _ = self.shared.app.run_on_main_thread(move || main_thread::allocate(&shared, needed));
                }
                return Ok(()); // кадр уйдёт, как только буферы будут готовы
            }
            ring.pending = None;
            let slot = ring.next;
            ring.next = (ring.next + 1) % ring.slots.len();
            let (ptr, _) = ring.slots[slot];
            unsafe { std::ptr::copy_nonoverlapping(raw.as_ptr(), ptr as *mut u8, needed.min(raw.len())) };
            (slot, ring.generation)
        };

        let shared = self.shared.clone();
        let _ = self.shared.app.run_on_main_thread(move || main_thread::post(&shared, slot, generation, &meta));
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        // Окно источника закрыли — трансляция заканчивается, как в браузере.
        let _ = self.shared.app.emit_to("main", "capture-ended", self.shared.session);
        Ok(())
    }
}

/// Всё, что трогает COM-объекты WebView2, — только в главном потоке.
mod main_thread {
    use super::*;
    use std::cell::RefCell;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::{Interface, HSTRING};

    pub struct Target {
        pub core: ICoreWebView2_17,
        pub env: ICoreWebView2Environment12,
        pub buffers: Vec<ICoreWebView2SharedBuffer>,
        pub session: u64,
    }

    thread_local! {
        pub static TARGET: RefCell<Option<Target>> = const { RefCell::new(None) };
    }

    pub fn attach(core: ICoreWebView2, session: u64) -> Result<(), String> {
        unsafe {
            let env: ICoreWebView2Environment12 = core
                .cast::<ICoreWebView2_2>()
                .and_then(|c| c.Environment())
                .and_then(|e| e.cast())
                .map_err(|e| format!("окружение WebView2: {e}"))?;
            let core: ICoreWebView2_17 = core.cast().map_err(|e| format!("WebView2 без SharedBuffer: {e}"))?;
            TARGET.with(|t| {
                detach_locked(&mut t.borrow_mut());
                *t.borrow_mut() = Some(Target { core, env, buffers: Vec::new(), session });
            });
        }
        Ok(())
    }

    fn detach_locked(t: &mut Option<Target>) {
        if let Some(target) = t.take() {
            for b in target.buffers {
                unsafe { let _ = b.Close(); }
            }
        }
    }

    pub fn detach(session: u64) {
        TARGET.with(|t| {
            let mut t = t.borrow_mut();
            if t.as_ref().map(|x| x.session == session).unwrap_or(false) {
                detach_locked(&mut t);
            }
        });
    }

    pub fn allocate(shared: &Arc<Shared>, needed: usize) {
        TARGET.with(|t| {
            let mut t = t.borrow_mut();
            let Some(target) = t.as_mut().filter(|x| x.session == shared.session) else { return };
            let mut ring = shared.ring.lock();
            // Старые буферы закрываем под замком кольца — поток захвата в них
            // в этот момент не пишет.
            for b in target.buffers.drain(..) {
                unsafe { let _ = b.Close(); }
            }
            ring.slots.clear();
            for _ in 0..SLOTS {
                let created = unsafe { target.env.CreateSharedBuffer(needed as u64) };
                let Ok(buf) = created else {
                    log::error!("[capture] общий буфер {needed} байт не создан");
                    break;
                };
                let mut ptr: *mut u8 = std::ptr::null_mut();
                if unsafe { buf.Buffer(&mut ptr) }.is_err() || ptr.is_null() {
                    break;
                }
                ring.slots.push((ptr as usize, needed));
                target.buffers.push(buf);
            }
            ring.next = 0;
            ring.generation += 1;
            ring.alloc_pending = false;

            // Отложенный кадр — сразу в первый буфер.
            if let Some((data, meta)) = ring.pending.take() {
                if let (Some(&(ptr, size)), Some(buf)) = (ring.slots.first(), target.buffers.first()) {
                    unsafe { std::ptr::copy_nonoverlapping(data.as_ptr(), ptr as *mut u8, data.len().min(size)) };
                    ring.next = 1 % ring.slots.len();
                    unsafe {
                        let _ = target.core.PostSharedBufferToScript(
                            buf,
                            COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY,
                            &HSTRING::from(meta.as_str()),
                        );
                    }
                }
            }
        });
    }

    pub fn post(shared: &Arc<Shared>, slot: usize, generation: u64, meta: &str) {
        TARGET.with(|t| {
            let t = t.borrow();
            let Some(target) = t.as_ref().filter(|x| x.session == shared.session) else { return };
            if shared.ring.lock().generation != generation {
                return; // буферы успели пересоздать — кадр устарел
            }
            let Some(buf) = target.buffers.get(slot) else { return };
            unsafe {
                let _ = target.core.PostSharedBufferToScript(
                    buf,
                    COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY,
                    &HSTRING::from(meta),
                );
            }
        });
    }
}

pub struct ScreenCapture {
    control: Mutex<Option<(u64, CaptureControl<Handler, String>)>>,
    counter: AtomicU64,
}

impl Default for ScreenCapture {
    fn default() -> Self {
        Self { control: Mutex::new(None), counter: AtomicU64::new(0) }
    }
}

fn parse_source(id: &str) -> Option<(&str, i64)> {
    let mut parts = id.split(':');
    let kind = parts.next()?;
    let n = parts.next()?.parse().ok()?;
    Some((kind, n))
}

impl ScreenCapture {
    /// Начать захват источника. Возвращает номер сеанса — им помечены кадры.
    pub async fn start(&self, app: &AppHandle, source: &str, fps: u32) -> Result<u64, String> {
        self.stop(app);
        let session = self.counter.fetch_add(1, Ordering::SeqCst) + 1;

        // Привязка к WebView2 основного окна — в главном потоке.
        let window = app.get_webview_window("main").ok_or("нет основного окна")?;
        let (tx, rx) = tokio::sync::oneshot::channel();
        window
            .with_webview(move |wv| {
                let res = unsafe { wv.controller().CoreWebView2() }
                    .map_err(|e| e.to_string())
                    .and_then(|core| main_thread::attach(core, session));
                let _ = tx.send(res);
            })
            .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())??;

        let shared = Arc::new(Shared { app: app.clone(), session, ring: Mutex::new(Ring::default()) });
        let flags = (shared, fps);

        let (kind, n) = parse_source(source).ok_or_else(|| format!("неизвестный источник {source}"))?;
        let control = match kind {
            "window" => {
                let item = Window::from_raw_hwnd(n as isize as *mut c_void);
                Handler::start_free_threaded(settings(item, flags))
            }
            _ => {
                let list = monitors();
                let (hmon, _) = list.get(n.max(0) as usize).or(list.first()).ok_or("мониторы не найдены")?;
                let item = Monitor::from_raw_hmonitor(hmon.0);
                Handler::start_free_threaded(settings(item, flags))
            }
        }
        .map_err(|e| format!("захват не запущен: {e}"))?;

        *self.control.lock() = Some((session, control));
        log::info!("[capture] сеанс {session}: {source}, {fps} к/с");
        Ok(session)
    }

    pub fn stop(&self, app: &AppHandle) {
        let Some((session, control)) = self.control.lock().take() else { return };
        let _ = control.stop();
        let _ = app.run_on_main_thread(move || main_thread::detach(session));
        log::info!("[capture] сеанс {session} остановлен");
    }
}

fn settings<T>(item: T, flags: (Arc<Shared>, u32)) -> Settings<(Arc<Shared>, u32), T>
where
    T: TryInto<windows_capture::settings::GraphicsCaptureItemType>,
{
    Settings::new(
        item,
        CursorCaptureSettings::WithCursor,
        // Как в Electron (WinrtCaptureBorders выключен): без жёлтой рамки.
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        flags,
    )
}
