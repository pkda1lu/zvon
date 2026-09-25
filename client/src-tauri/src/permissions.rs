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
