//! Системные сведения Windows напрямую через Win32.
//!
//! В Electron всё это добывалось запуском powershell.exe и tasklist.exe: сначала
//! на каждый цикл опроса, потом одним долгоживущим процессом с Add-Type. Здесь
//! те же сведения — это несколько системных вызовов без дочерних процессов.

use std::collections::HashMap;
use std::ffi::c_void;

use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, EnumWindows, GetForegroundWindow, GetIconInfo, GetWindowTextLengthW,
    GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, GetWindow, GW_OWNER, HICON, ICONINFO,
};

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub struct ProcEntry {
    pub pid: u32,
    pub exe: String,
}

/// Все процессы: pid и имя исполняемого файла. Работает и для процессов,
/// запущенных от администратора, — снимок не требует прав на сам процесс.
pub fn processes() -> Vec<ProcEntry> {
    let mut out = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                out.push(ProcEntry {
                    pid: entry.th32ProcessID,
                    exe: String::from_utf16_lossy(&entry.szExeFile[..len]),
                });
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
    }
    out
}

pub fn exe_name_of(pid: u32) -> Option<String> {
    processes().into_iter().find(|p| p.pid == pid).map(|p| p.exe)
}

/// Полный путь к исполняемому файлу; None, если процесс не открыть.
pub fn exe_path(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let res = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        res.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

fn window_text(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }
}

pub fn pid_of_window(hwnd: isize) -> u32 {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(HWND(hwnd as *mut c_void), Some(&mut pid));
    }
    pid
}

pub struct Foreground {
    pub exe: String,
    pub title: String,
}

/// Переднее окно. Своё окно даёт zvon.exe — оно в списке нейтральных, и
/// оверлей при фокусе на Zvon скрывается, как и раньше.
pub fn foreground() -> Option<Foreground> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let exe = exe_path(pid)
            .and_then(|p| p.rsplit('\\').next().map(String::from))
            .or_else(|| exe_name_of(pid))
            .unwrap_or_default();
        Some(Foreground { exe, title: window_text(hwnd) })
    }
}

/// Заголовки видимых окон верхнего уровня по pid (главное окно процесса).
pub fn main_window_titles() -> HashMap<u32, String> {
    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let map = &mut *(lparam.0 as *mut HashMap<u32, String>);
        if IsWindowVisible(hwnd).as_bool() && GetWindow(hwnd, GW_OWNER).map(|h| h.0.is_null()).unwrap_or(true) {
            let title = window_text(hwnd);
            if !title.trim().is_empty() {
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                map.entry(pid).or_insert(title);
            }
        }
        BOOL(1)
    }
    let mut map: HashMap<u32, String> = HashMap::new();
    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut map as *mut _ as isize));
    }
    map
}

/// HKCU\Software\Valve\Steam\RunningAppID — id запущенной Steam-игры (0 — нет).
pub fn steam_running_app_id() -> Option<u32> {
    let key = wide("Software\\Valve\\Steam");
    let name = wide("RunningAppID");
    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let res = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(key.as_ptr()),
            windows::core::PCWSTR(name.as_ptr()),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut value as *mut u32 as *mut c_void),
            Some(&mut size),
        )
    };
    if res.is_ok() && value != 0 { Some(value) } else { None }
}

/// Значок файла (32×32) как data:image/png;base64,…
pub fn file_icon_data_url(path: &str) -> Option<String> {
    unsafe {
        let wpath = wide(path);
        let mut info = SHFILEINFOW::default();
        let r = SHGetFileInfoW(
            windows::core::PCWSTR(wpath.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if r == 0 || info.hIcon.is_invalid() {
            return None;
        }
        let png = icon_to_png(info.hIcon);
        let _ = DestroyIcon(info.hIcon);
        png.map(|bytes| {
            use base64::Engine;
            format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
        })
    }
}

unsafe fn icon_to_png(icon: HICON) -> Option<Vec<u8>> {
    let mut ii = ICONINFO::default();
    GetIconInfo(icon, &mut ii).ok()?;
    let color = ii.hbmColor;
    let mask = ii.hbmMask;
    let cleanup = || {
        if !color.is_invalid() { let _ = DeleteObject(color.into()); }
        if !mask.is_invalid() { let _ = DeleteObject(mask.into()); }
    };
    if color.is_invalid() {
        cleanup();
        return None;
    }
    let mut bm = BITMAP::default();
    if GetObjectW(color.into(), std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut c_void)) == 0 {
        cleanup();
        return None;
    }
    let (w, h) = (bm.bmWidth, bm.bmHeight);
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h, // сверху вниз
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    let dc = GetDC(None);
    let lines = GetDIBits(dc, color, 0, h as u32, Some(pixels.as_mut_ptr() as *mut c_void), &mut bmi, DIB_RGB_COLORS);
    ReleaseDC(None, dc);
    cleanup();
    if lines == 0 {
        return None;
    }
    // BGRA → RGBA. У старых значков без альфа-канала альфа нулевая целиком.
    let no_alpha = pixels.chunks_exact(4).all(|p| p[3] == 0);
    for p in pixels.chunks_exact_mut(4) {
        p.swap(0, 2);
        if no_alpha { p[3] = 255; }
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w as u32, h as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(&pixels).ok()?;
    }
    Some(out)
}

