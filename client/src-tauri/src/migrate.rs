//! Первый запуск после перехода с Electron.
//!
//! Переходный релиз на Electron (2.9.0, public/transition.js) перед установкой
//! этой версии выгружает localStorage интерфейса — токен входа, настройки
//! звука, клавиш, внешнего вида — в %APPDATA%\Zvon\zvon-migration.json.
//! Здесь содержимое подкладывается в localStorage новой страницы до запуска
//! её скриптов, поэтому человек открывает Zvon уже вошедшим, со своими
//! настройками. Файл удаляется, как только основное окно загрузилось.
//!
//! Настройки окна (window-settings.json) забирает settings.rs, автозапуск
//! прежней версии снимается здесь же.

use std::path::PathBuf;
use std::sync::OnceLock;

use serde_json::Value;

const MARK: &str = "__zvon_migrated_v1";

static SCRIPT: OnceLock<Option<String>> = OnceLock::new();

fn file() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("Zvon").join("zvon-migration.json"))
}

fn build_script() -> Option<String> {
    let path = file()?;
    let raw = std::fs::read_to_string(&path).ok()?;
    let parsed: Value = serde_json::from_str(&raw).ok()?;
    let storage = parsed.get("localStorage").filter(|v| v.is_object())?;
    let count = storage.as_object().map(|o| o.len()).unwrap_or(0);
    log::info!("[migrate] найден перенос из Electron: {count} ключей localStorage");
    Some(format!(
        r#"(function () {{
  try {{
    if (window.top !== window) return;
    if (localStorage.getItem('{MARK}')) return;
    var data = {storage};
    Object.keys(data).forEach(function (k) {{
      if (localStorage.getItem(k) === null && typeof data[k] === 'string') localStorage.setItem(k, data[k]);
    }});
    localStorage.setItem('{MARK}', String(Date.now()));
  }} catch (e) {{ }}
}})();"#
    ))
}

/// Скрипт переноса для окон или None, если переносить нечего.
pub fn script() -> Option<&'static str> {
    SCRIPT.get_or_init(build_script).as_deref()
}

/// Основное окно загрузилось — данные уже в localStorage, файл больше не нужен.
pub fn finish() {
    if script().is_some() {
        if let Some(path) = file() {
            match std::fs::remove_file(&path) {
                Ok(()) => log::info!("[migrate] перенос завершён"),
                Err(e) => log::warn!("[migrate] файл переноса не удалён: {e}"),
            }
        }
    }
}

/// Снять автозапуск прежней версии. Возвращает true, если он был включён —
/// тогда включается автозапуск новой.
#[cfg(windows)]
pub fn take_electron_autostart() -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE,
        KEY_SET_VALUE,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let me = std::env::current_exe().map(|p| p.to_string_lossy().to_lowercase()).unwrap_or_default();
    let subkey = wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    let mut removed = false;
    unsafe {
        let mut key = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(subkey.as_ptr()), None, KEY_QUERY_VALUE | KEY_SET_VALUE, &mut key).is_err() {
            return false;
        }
        // Имена, под которыми Electron (setLoginItemSettings) регистрировал Zvon.
        for name in ["com.zvon.app", "electron.app.Zvon"] {
            let wname = wide(name);
            let mut buf = vec![0u16; 1024];
            let mut size = (buf.len() * 2) as u32;
            let ok = RegQueryValueExW(key, PCWSTR(wname.as_ptr()), None, None, Some(buf.as_mut_ptr() as *mut u8), Some(&mut size)).is_ok();
            if !ok {
                continue;
            }
            let data = String::from_utf16_lossy(&buf[..(size as usize / 2)]).trim_end_matches('\0').to_lowercase();
            if data.contains("zvon.exe") && !data.contains(&me) {
                if RegDeleteValueW(key, PCWSTR(wname.as_ptr())).is_ok() {
                    log::info!("[migrate] снят автозапуск прежней версии ({name})");
                    removed = true;
                }
            }
        }
        let _ = RegCloseKey(key);
    }
    removed
}

#[cfg(not(windows))]
pub fn take_electron_autostart() -> bool {
    false
}
