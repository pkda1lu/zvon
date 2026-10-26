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
use windows::Win32::Graphics::Gdi::{RedrawWindow, RDW_FRAME, RDW_INVALIDATE, RDW_UPDATENOW};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowRect, IsZoomed, PostMessageW, WM_APP, WM_NCACTIVATE, WM_NCPAINT, WM_SIZE,
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
        // Заставляет Windows перерисовать рамку — закраска пройдёт в WM_NCPAINT.
        let _ = RedrawWindow(Some(hwnd), None, None, RDW_FRAME | RDW_INVALIDATE | RDW_UPDATENOW);
        return LRESULT(0);
    }
    let result = DefSubclassProc(hwnd, msg, wparam, lparam);
    match msg {
        // Обе эти перерисовки рамки закрашивают строку заново — красим после них.
        WM_NCPAINT | WM_NCACTIVATE => paint_edge(hwnd),
        // Первый показ уже развёрнутого окна (восстановленное состояние) и
        // разворачивание: строку Windows рисует сама, без WM_NCPAINT к нам.
        WM_WINDOWPOSCHANGED | WM_SIZE if IsZoomed(hwnd).as_bool() => {
            let _ = PostMessageW(Some(hwnd), WM_REPAINT_EDGE, WPARAM(0), LPARAM(0));
        }
        _ => {}
    }
    result
}

unsafe fn paint_edge(hwnd: HWND) {
    if !IsZoomed(hwnd).as_bool() {
        return;
    }
    let mut window = RECT::default();
    let mut client = RECT::default();
    if GetWindowRect(hwnd, &mut window).is_err() || GetClientRect(hwnd, &mut client).is_err() {
        return;
    }
    let mut client_bottom = POINT { x: 0, y: client.bottom };
    if !ClientToScreen(hwnd, &mut client_bottom).as_bool() || client_bottom.y >= window.bottom {
        return;
    }
    // Координаты контекста окна отсчитываются от его левого верхнего угла.
    let strip = RECT {
        left: 0,
        top: client_bottom.y - window.top,
        right: window.right - window.left,
        bottom: window.bottom - window.top,
    };
    let dc = GetWindowDC(Some(hwnd));
    if dc.is_invalid() {
        return;
    }
    let brush = CreateSolidBrush(EDGE_COLOR);
    FillRect(dc, &strip, brush);
    let _ = DeleteObject(brush.into());
    ReleaseDC(Some(hwnd), dc);
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
