//! Правка заголовков запросов и ответов — замена session.webRequest из Electron.
//!
//! WebView2 не даёт менять заголовки ответа сети в WebResourceRequested (только
//! подменить ответ целиком, потеряв куки и потоковую загрузку). Поэтому здесь
//! домен Fetch протокола DevTools: запрос ставится на паузу, заголовки
//! правятся, и запрос продолжается штатно.
//!
//!  • Ответы-документы (в т. ч. в iframe): снимаются X-Frame-Options и CSP,
//!    иначе мини-аппки и встраиваемые плееры отказываются открываться в рамке.
//!  • YouTube: Referer/Origin/User-Agent как у youtube-nocookie (ошибки 152/153).
//!  • Сайты TikTok во время работы туннеля: Accept-Language под страну узла.

use std::cell::RefCell;

use parking_lot::Mutex;
use serde_json::{json, Value};
use tauri::{AppHandle, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, DevToolsProtocolEventReceivedEventHandler};
use windows::core::{HSTRING, PWSTR};

const CHROME_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const YOUTUBE_PATTERNS: &[&str] = &[
    "*://*.youtube.com/*",
    "*://*.youtube-nocookie.com/*",
    "*://*.googlevideo.com/*",
    "*://*.ytimg.com/*",
];

const STRIPPED_RESPONSE_HEADERS: &[&str] = &["x-frame-options", "content-security-policy", "frame-options"];

/// Язык для сайтов TikTok, пока работает туннель (None — не трогаем).
static TUNNEL_LOCALE: Mutex<Option<String>> = Mutex::new(None);

thread_local! {
    static CORE: RefCell<Option<ICoreWebView2>> = const { RefCell::new(None) };
}

fn patterns() -> Value {
    let mut list: Vec<Value> = vec![json!({ "urlPattern": "*", "resourceType": "Document", "requestStage": "Response" })];
    for p in YOUTUBE_PATTERNS {
        list.push(json!({ "urlPattern": p, "requestStage": "Request" }));
    }
    if TUNNEL_LOCALE.lock().is_some() {
        for host in crate::tunnel::TUNNELED_HOSTS {
            list.push(json!({ "urlPattern": format!("*://{host}/*"), "requestStage": "Request" }));
            list.push(json!({ "urlPattern": format!("*://*.{host}/*"), "requestStage": "Request" }));
        }
    }
    json!({ "patterns": list })
}

fn cdp(core: &ICoreWebView2, method: &str, params: Value, on_error: Option<(String, Value)>) {
    cdp_then(core, method, params, move |core, result| {
        if let (Err(e), Some((m, p))) = (result, on_error) {
            // Отменённый страницей запрос — обычное дело, не шумим.
            if e.contains("Invalid InterceptionId") {
                return;
            }
            log::warn!("[netfilter] {e}");
            // Запрос нельзя оставлять на паузе — иначе страница зависнет.
            cdp(core, &m, p, None);
        }
    });
}

/// Вызов метода DevTools с разбором ответа.
fn cdp_then<F>(core: &ICoreWebView2, method: &str, params: Value, then: F)
where
    F: FnOnce(&ICoreWebView2, Result<Value, String>) + 'static,
{
    let core_for_callback = core.clone();
    let method_name = method.to_string();
    let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |res, json| {
        let result = match res {
            Ok(()) => serde_json::from_str::<Value>(&json).map_err(|e| e.to_string()),
            Err(e) => Err(format!("{method_name}: {e} {json}")),
        };
        then(&core_for_callback, result);
        Ok(())
    }));
    unsafe {
        let _ = core.CallDevToolsProtocolMethod(&HSTRING::from(method), &HSTRING::from(params.to_string()), &handler);
    }
}

fn is_youtube(url: &str) -> bool {
    ["youtube.com", "youtube-nocookie.com", "googlevideo.com", "ytimg.com"].iter().any(|h| url.contains(h))
}

fn host_of(url: &str) -> &str {
    let rest = url.split("://").nth(1).unwrap_or("");
    rest.split(['/', '?', '#']).next().unwrap_or("").rsplit('@').next().unwrap_or("").split(':').next().unwrap_or("")
}

fn is_tunneled(url: &str) -> bool {
    let host = host_of(url).to_ascii_lowercase();
    crate::tunnel::TUNNELED_HOSTS.iter().any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

fn on_paused(core: &ICoreWebView2, params: &Value) {
    let Some(id) = params.get("requestId").and_then(Value::as_str) else { return };
    let url = params.pointer("/request/url").and_then(Value::as_str).unwrap_or("");
    let fallback = Some(("Fetch.continueRequest".to_string(), json!({ "requestId": id })));

    // Стадия ответа.
    if params.get("responseStatusCode").is_some() || params.get("responseErrorReason").is_some() {
        if params.get("responseErrorReason").is_some() {
            cdp(core, "Fetch.continueRequest", json!({ "requestId": id }), None);
            return;
        }
        let headers = params.get("responseHeaders").and_then(Value::as_array).cloned().unwrap_or_default();
        let kept: Vec<Value> = headers
            .iter()
            .filter(|h| {
                let name = h.get("name").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
                !STRIPPED_RESPONSE_HEADERS.contains(&name.as_str())
            })
            .cloned()
            .collect();
        if kept.len() == headers.len() {
            cdp(core, "Fetch.continueResponse", json!({ "requestId": id }), fallback);
            return;
        }
        // Запрет встраивания. Правка заголовков через continueResponse на
        // проверку frame-ancestors не влияет — WebView2 сверяет её по исходному
        // ответу, поэтому ответ отдаётся заново целиком. Тело приходит уже
        // распакованным: сведения о сжатии и длине убираются.
        let kept: Vec<Value> = kept
            .into_iter()
            .filter(|h| {
                let name = h.get("name").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
                name != "content-encoding" && name != "content-length"
            })
            .collect();
        let code = params.get("responseStatusCode").cloned().unwrap_or(json!(200));
        let id_owned = id.to_string();
        cdp_then(core, "Fetch.getResponseBody", json!({ "requestId": id }), move |core, result| {
            let body = match result {
                Ok(v) => {
                    let text = v.get("body").and_then(Value::as_str).unwrap_or("").to_string();
                    if v.get("base64Encoded").and_then(Value::as_bool) == Some(true) {
                        text
                    } else {
                        use base64::Engine;
                        base64::engine::general_purpose::STANDARD.encode(text.as_bytes())
                    }
                }
                Err(e) => {
                    log::warn!("[netfilter] тело ответа не получено: {e}");
                    cdp(core, "Fetch.continueRequest", json!({ "requestId": id_owned }), None);
                    return;
                }
            };
            cdp(
                core,
                "Fetch.fulfillRequest",
                json!({ "requestId": id_owned, "responseCode": code, "responseHeaders": kept, "body": body }),
                Some(("Fetch.continueRequest".to_string(), json!({ "requestId": id_owned }))),
            );
        });
        return;
    }

    // Стадия запроса.
    let mut headers: serde_json::Map<String, Value> = params
        .pointer("/request/headers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut changed = false;

    if is_youtube(url) {
        let video_id = url
            .split("embed/")
            .nth(1)
            .and_then(|s| s.split(['?', '&', '/', '#']).next())
            .unwrap_or("");
        let referer = if video_id.is_empty() {
            "https://www.youtube-nocookie.com/".to_string()
        } else {
            format!("https://www.youtube-nocookie.com/embed/{video_id}")
        };
        headers.retain(|k, _| {
            !matches!(k.to_ascii_lowercase().as_str(), "referer" | "origin" | "user-agent" | "sec-fetch-dest" | "sec-fetch-site")
        });
        headers.insert("Referer".into(), json!(referer));
        headers.insert("Origin".into(), json!("https://www.youtube-nocookie.com"));
        headers.insert("User-Agent".into(), json!(CHROME_UA));
        headers.insert("Sec-Fetch-Dest".into(), json!("iframe"));
        headers.insert("Sec-Fetch-Site".into(), json!("cross-site"));
        changed = true;
    }

    if is_tunneled(url) {
        if let Some(locale) = TUNNEL_LOCALE.lock().clone() {
            let base = locale.split('-').next().unwrap_or(&locale).to_string();
            headers.retain(|k, _| !k.eq_ignore_ascii_case("accept-language"));
            headers.insert("Accept-Language".into(), json!(format!("{locale},{base};q=0.9,en;q=0.8")));
            changed = true;
        }
    }

    if changed {
        let list: Vec<Value> = headers.into_iter().map(|(name, value)| json!({ "name": name, "value": value })).collect();
        cdp(core, "Fetch.continueRequest", json!({ "requestId": id, "headers": list }), fallback);
    } else {
        cdp(core, "Fetch.continueRequest", json!({ "requestId": id }), None);
    }
}

/// Подключить к окну. Вызывается сразу после создания основного окна.
pub fn install(window: &WebviewWindow) {
    let res = window.with_webview(|wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let Ok(receiver) = core.GetDevToolsProtocolEventReceiver(&HSTRING::from("Fetch.requestPaused")) else {
            log::error!("[netfilter] нет приёмника событий DevTools");
            return;
        };
        let core_for_events = core.clone();
        let handler = DevToolsProtocolEventReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut json = PWSTR::null();
            args.ParameterObjectAsJson(&mut json)?;
            let text = webview2_com::take_pwstr(json);
            if let Ok(params) = serde_json::from_str::<Value>(&text) {
                on_paused(&core_for_events, &params);
            }
            Ok(())
        }));
        let mut token = 0i64;
        if let Err(e) = receiver.add_DevToolsProtocolEventReceived(&handler, &mut token) {
            log::error!("[netfilter] подписка не удалась: {e}");
            return;
        }
        cdp(&core, "Fetch.enable", patterns(), None);
        CORE.with(|c| *c.borrow_mut() = Some(core));
    });
    if let Err(e) = res {
        log::error!("[netfilter] with_webview: {e}");
    }
}

/// Туннель включён/выключен: обновить язык и набор перехватываемых адресов.
pub fn set_tunnel_locale(app: &AppHandle, locale: Option<String>) {
    *TUNNEL_LOCALE.lock() = locale;
    let _ = app.run_on_main_thread(|| {
        CORE.with(|c| {
            if let Some(core) = c.borrow().as_ref() {
                cdp(core, "Fetch.enable", patterns(), None);
            }
        });
    });
}
