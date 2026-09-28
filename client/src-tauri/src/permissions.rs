//! Разрешения страницы. Electron выдавал микрофон, камеру и захват экрана
//! без вопросов (setPermissionRequestHandler); в WebView2 то же делает
//! обработчик PermissionRequested.

use tauri::WebviewWindow;

pub fn install(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        let res = window.with_webview(|wv| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use webview2_com::PermissionRequestedEventHandler;

            let Ok(core) = wv.controller().CoreWebView2() else { return };
            let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION;
                args.PermissionKind(&mut kind)?;
                let allow = matches!(
                    kind,
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                        | COREWEBVIEW2_PERMISSION_KIND_CAMERA
                        | COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS
                        | COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ
                        | COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY
                );
                if allow {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
                Ok(())
            }));
            let mut token = Default::default();
            if let Err(e) = core.add_PermissionRequested(&handler, &mut token) {
                log::error!("[permissions] обработчик не установлен: {e}");
            }
        });
        if let Err(e) = res {
            log::error!("[permissions] with_webview: {e}");
        }
    }
}

/// Стандартное контекстное меню движка («Назад», «Обновить», «Сохранить как»,
/// «Проверить элемент») в приложении не нужно. В полях ввода и на выделенном
/// тексте оставляем только правку, в остальных местах меню не показываем.
/// Собственные меню Zvon (по участникам, сообщениям) это не затрагивает: они
/// вызывают preventDefault и до движка не доходят.
pub fn install_context_menu(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        let res = window.with_webview(|wv| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use webview2_com::{take_pwstr, ContextMenuRequestedEventHandler};
            use windows::core::{Interface, BOOL, PWSTR};

            let Ok(core) = wv.controller().CoreWebView2() else { return };
            let Ok(core11) = core.cast::<ICoreWebView2_11>() else { return };
            let handler = ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let target = args.ContextMenuTarget()?;
                let (mut editable, mut selection) = (BOOL(0), BOOL(0));
                let _ = target.IsEditable(&mut editable);
                let _ = target.HasSelection(&mut selection);
                if !editable.as_bool() && !selection.as_bool() {
                    args.SetHandled(true)?;
                    return Ok(());
                }
                // Правка текста; в отладочной сборке ещё и «Проверить элемент».
                const KEEP: &[&str] = &["undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "selectAll"];
                let items = args.MenuItems()?;
                let mut count = 0u32;
                items.Count(&mut count)?;
                let mut i = count;
                while i > 0 {
                    i -= 1;
                    let item = items.GetValueAtIndex(i)?;
                    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND;
                    let _ = item.Kind(&mut kind);
                    if kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR {
                        continue;
                    }
                    let mut name = PWSTR::null();
                    let _ = item.Name(&mut name);
                    let name = take_pwstr(name);
                    let keep = KEEP.contains(&name.as_str()) || (cfg!(debug_assertions) && name == "inspectElement");
                    if !keep {
                        items.RemoveValueAtIndex(i)?;
                    }
                }
                // Разделители по краям и подряд остаются от удалённых пунктов.
                let mut prev_sep = true;
                let mut idx = 0u32;
                items.Count(&mut count)?;
                while idx < count {
                    let item = items.GetValueAtIndex(idx)?;
                    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND;
                    let _ = item.Kind(&mut kind);
                    let is_sep = kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR;
                    if is_sep && prev_sep {
                        items.RemoveValueAtIndex(idx)?;
                        count -= 1;
                        continue;
                    }
                    prev_sep = is_sep;
                    idx += 1;
                }
                if count > 0 {
                    let last = items.GetValueAtIndex(count - 1)?;
                    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND;
                    let _ = last.Kind(&mut kind);
                    if kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR {
                        items.RemoveValueAtIndex(count - 1)?;
                        count -= 1;
                    }
                }
                if count == 0 {
                    args.SetHandled(true)?;
                }
                Ok(())
            }));
            let mut token = Default::default();
            if let Err(e) = core11.add_ContextMenuRequested(&handler, &mut token) {
                log::error!("[context-menu] обработчик не установлен: {e}");
            }
        });
        if let Err(e) = res {
            log::error!("[context-menu] with_webview: {e}");
        }
    }
}
