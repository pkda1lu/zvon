//! Светлая полоса внизу развёрнутого основного окна.
//!
//! Окно без системной рамки, и когда оно развёрнуто, а панель задач
//! скрывается автоматически, tao оставляет внизу 1 px вне клиентской области:
//! иначе Windows считает окно полноэкранным и не выдвигает панель задач при
//! наведении. Эту строку рисует не страница, а сама Windows — светлым цветом
//! по умолчанию, и на тёмном интерфейсе она видна белой линией по всему низу
//! экрана. Пиксель оставляем (панель задач должна выдвигаться), а закрашиваем
//! его в тон интерфейса.

use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    ClientToScreen, CreateSolidBrush, DeleteObject, FillRect, GetWindowDC, ReleaseDC,
};
use windows::Win32::Graphics::Gdi::{RedrawWindow, RDW_FRAME, RDW_INVALIDATE, RDW_NOCHILDREN, RDW_UPDATENOW};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowRect, IsWindowVisible, IsZoomed, PostMessageW, WM_APP, WM_NCACTIVATE,
    WM_NCPAINT, WM_NCDESTROY, WM_PAINT, WM_ERASEBKGND, WM_SHOWWINDOW, WM_DPICHANGED, WM_SIZE,
    WM_WINDOWPOSCHANGED,
};

// Тёмно-синий из нижней части фона интерфейса. COLORREF — 0x00BBGGRR.
const EDGE_COLOR: COLORREF = COLORREF(0x00_1a_0c_0c);
const SUBCLASS_ID: usize = 0x5a56_6e65;
/// Отложенная перерисовка рамки: показ и разворачивание окна заканчиваются
/// позже, чем приходят их сообщения.
const WM_REPAINT_EDGE: u32 = WM_APP + 0x5a;

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if msg == WM_REPAINT_EDGE {
        // RedrawWindow may skip WM_NCPAINT if it considers the nonclient region
        // clean after ShowWindow/WebView restoration. Always paint explicitly,
        // after the default repaint has finished. Do not invalidate WebView children.
        let _ = RedrawWindow(Some(hwnd), None, None, RDW_FRAME | RDW_INVALIDATE | RDW_UPDATENOW | RDW_NOCHILDREN);
        paint_edge(hwnd);
        return LRESULT(0);
    }
    if msg == WM_NCDESTROY {
        let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
        return DefSubclassProc(hwnd, msg, wparam, lparam);
    }
    let result = DefSubclassProc(hwnd, msg, wparam, lparam);
    match msg {
        // Обе эти перерисовки рамки закрашивают строку заново — красим после них.
        WM_NCPAINT | WM_NCACTIVATE | WM_PAINT | WM_ERASEBKGND => paint_edge(hwnd),
        // Первый показ уже развёрнутого окна (восстановленное состояние) и
        // разворачивание: строку Windows рисует сама, без WM_NCPAINT к нам.
        WM_WINDOWPOSCHANGED | WM_SIZE | WM_SHOWWINDOW | WM_DPICHANGED if IsZoomed(hwnd).as_bool() => {
            let _ = PostMessageW(Some(hwnd), WM_REPAINT_EDGE, WPARAM(0), LPARAM(0));
        }
        _ => {}
    }
    result
}

unsafe fn paint_edge(hwnd: HWND) {
    if !IsZoomed(hwnd).as_bool() || !IsWindowVisible(hwnd).as_bool() {
        return;
    }
    let mut window = RECT::default();
    let mut client = RECT::default();
    if GetWindowRect(hwnd, &mut window).is_err() || GetClientRect(hwnd, &mut client).is_err() {
        return;
    }
    let mut client_bottom = POINT { x: 0, y: client.bottom };
    if !ClientToScreen(hwnd, &mut client_bottom).as_bool() {
        return;
    }
    let Some(strip) = bottom_strip(window, client_bottom.y) else { return };
    // Координаты контекста окна отсчитываются от его левого верхнего угла.
    let dc = GetWindowDC(Some(hwnd));
    if dc.is_invalid() {
        return;
    }
    let brush = CreateSolidBrush(EDGE_COLOR);
    FillRect(dc, &strip, brush);
    let _ = DeleteObject(brush.into());
    ReleaseDC(Some(hwnd), dc);
}

fn bottom_strip(window: RECT, client_bottom_y: i32) -> Option<RECT> {
    if window.right <= window.left || client_bottom_y <= window.top || client_bottom_y >= window.bottom {
        return None;
    }
    Some(RECT { left: 0, top: client_bottom_y - window.top, right: window.right - window.left, bottom: window.bottom - window.top })
}

/// Вызывать в потоке окна (при его создании).
pub fn install(window: &tauri::WebviewWindow) {
    let Ok(raw) = window.hwnd() else { return };
    let hwnd = HWND(raw.0 as _);
    unsafe {
        if SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0).as_bool() {
            // Окно могли развернуть ещё до установки (восстановление состояния).
            paint_edge(hwnd);
        } else {
            log::warn!("[window] не удалось подключить закраску нижней полосы");
        }
    }
}

/// Перерисовать строку после показа окна. Вызывается из любого потока;
/// повторяется с задержкой — первый кадр WebView2 появляется не сразу.
pub fn refresh(window: &tauri::WebviewWindow) {
    let Ok(raw) = window.hwnd() else { return };
    let hwnd = raw.0 as isize;
    let post = move || unsafe {
        let _ = PostMessageW(Some(HWND(hwnd as _)), WM_REPAINT_EDGE, WPARAM(0), LPARAM(0));
    };
    post();
    std::thread::spawn(move || {
        for delay in [150u64, 600, 1500] {
            std::thread::sleep(std::time::Duration::from_millis(delay));
            post();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paints_only_the_nonclient_bottom_strip() {
        let strip = bottom_strip(RECT { left: 0, top: -8, right: 1920, bottom: 1041 }, 1040).unwrap();
        assert_eq!((strip.left, strip.top, strip.right, strip.bottom), (0, 1048, 1920, 1049));
    }
    #[test]
    fn handles_monitor_offsets_without_touching_client_content() {
        let window = RECT { left: -1928, top: -8, right: 8, bottom: 1041 };
        let strip = bottom_strip(window, 1040).unwrap();
        assert_eq!((strip.left, strip.right, strip.bottom - strip.top), (0, 1936, 1));
        assert!(bottom_strip(window, 1041).is_none());
        assert!(bottom_strip(window, 1042).is_none());
        assert!(bottom_strip(window, -8).is_none());
    }
}
