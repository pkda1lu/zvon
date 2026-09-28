//! Туннель мини-аппки TikTok: трафик ТОЛЬКО её доменов уходит через зарубежный
//! узел Vlyne, остальное приложение (голос, LiveKit, загрузки) ходит напрямую.
//!
//! В Electron PAC-скрипт ставился на сессию на время работы туннеля. WebView2
//! берёт прокси только при создании окружения, поэтому схема такая:
//!
//!  • при запуске поднимаются локальный PAC-сервер и SOCKS5-ретранслятор, а
//!    WebView2 получает --proxy-pac-url. PAC отправляет домены TikTok на
//!    ретранслятор, всё прочее — DIRECT;
//!  • туннель выключен — ретранслятор соединяет напрямую (как без прокси);
//!  • туннель включён — ретранслятор передаёт соединения в sing-box (локальный
//!    SOCKS5 → VLESS до узла). При переключении открытые соединения рвутся,
//!    чтобы Chromium не продолжил ходить по старым.
//!
//! Молча не сработавший туннель хуже ошибки, поэтому перед включением узел
//! проверяется пробным запросом через sing-box.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use parking_lot::Mutex;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

pub const TUNNELED_HOSTS: &[&str] = &[
    "tiktok.com", "tiktokv.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "ttwstatic.com",
    "ibyteimg.com", "ibytedtos.com", "byteoversea.com", "muscdn.com", "bytecdn.cn", "capcut.com",
];

struct Relay {
    pac_url: String,
    /// Порт sing-box; 0 — туннель выключен, соединяем напрямую.
    upstream: AtomicU16,
    generation: watch::Sender<u64>,
}

static RELAY: OnceLock<Relay> = OnceLock::new();

struct Running {
    child: std::process::Child,
    country: Option<String>,
    title: Option<String>,
}

static RUNNING: Mutex<Option<Running>> = Mutex::new(None);

fn pac_script(relay_port: u16) -> String {
    let hosts = serde_json::to_string(TUNNELED_HOSTS).unwrap_or_else(|_| "[]".into());
    format!(
        r#"function FindProxyForURL(url, host) {{
  var tunneled = {hosts};
  host = host.toLowerCase();
  for (var i = 0; i < tunneled.length; i++) {{
    var d = tunneled[i];
    if (host === d || host.indexOf('.' + d, host.length - d.length - 1) !== -1) {{
      return "SOCKS5 127.0.0.1:{relay_port}";
    }}
  }}
  return "DIRECT";
}}"#
    )
}

/// Поднять PAC и ретранслятор до создания окон. Возвращает ключ для WebView2.
pub fn init() -> Option<String> {
    let std_relay = std::net::TcpListener::bind("127.0.0.1:0").ok()?;
    let std_pac = std::net::TcpListener::bind("127.0.0.1:0").ok()?;
    let relay_port = std_relay.local_addr().ok()?.port();
    let pac_port = std_pac.local_addr().ok()?.port();
    std_relay.set_nonblocking(true).ok()?;
    std_pac.set_nonblocking(true).ok()?;

    let (tx, _rx) = watch::channel(0u64);
    let relay = Relay {
        pac_url: format!("http://127.0.0.1:{pac_port}/proxy.pac"),
        upstream: AtomicU16::new(0),
        generation: tx,
    };
    let pac_url = relay.pac_url.clone();
    RELAY.set(relay).ok()?;

    let body = pac_script(relay_port);
    tauri::async_runtime::spawn(async move {
        let Ok(listener) = TcpListener::from_std(std_pac) else { return };
        loop {
            let Ok((mut sock, _)) = listener.accept().await else { continue };
            let body = body.clone();
            tokio::spawn(async move {
                let mut buf = [0u8; 2048];
                let _ = sock.read(&mut buf).await;
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/x-ns-proxy-autoconfig\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = sock.write_all(resp.as_bytes()).await;
            });
        }
    });

    tauri::async_runtime::spawn(async move {
        let Ok(listener) = TcpListener::from_std(std_relay) else { return };
        loop {
            let Ok((sock, _)) = listener.accept().await else { continue };
            tokio::spawn(handle_client(sock));
        }
    });

    log::info!("[tunnel] PAC {pac_url}, ретранслятор 127.0.0.1:{relay_port}");
    Some(pac_url)
}

async fn handle_client(mut client: TcpStream) {
    let Some(relay) = RELAY.get() else { return };
    let mut generation = relay.generation.subscribe();
    let started_gen = *generation.borrow();
    let upstream = relay.upstream.load(Ordering::SeqCst);

    let result: std::io::Result<TcpStream> = if upstream != 0 {
        // Туннель включён: весь разговор SOCKS5 уходит в sing-box как есть.
        TcpStream::connect(("127.0.0.1", upstream)).await
    } else {
        socks_direct(&mut client).await
    };
    let Ok(mut server) = result else { return };

    tokio::select! {
        _ = tokio::io::copy_bidirectional(&mut client, &mut server) => {}
        _ = async {
            loop {
                if generation.changed().await.is_err() { break; }
                if *generation.borrow() != started_gen { break; }
            }
        } => {}
    }
}

/// Минимальный SOCKS5 (без авторизации, только CONNECT) с прямым выходом.
async fn socks_direct(client: &mut TcpStream) -> std::io::Result<TcpStream> {
    let mut head = [0u8; 2];
    client.read_exact(&mut head).await?;
    let mut methods = vec![0u8; head[1] as usize];
    client.read_exact(&mut methods).await?;
    client.write_all(&[5, 0]).await?;

    let mut req = [0u8; 4];
    client.read_exact(&mut req).await?;
    if req[1] != 1 {
        client.write_all(&[5, 7, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
        return Err(std::io::Error::other("поддерживается только CONNECT"));
    }
    let host = match req[3] {
        1 => {
            let mut ip = [0u8; 4];
            client.read_exact(&mut ip).await?;
            std::net::Ipv4Addr::from(ip).to_string()
        }
        3 => {
            let mut len = [0u8; 1];
            client.read_exact(&mut len).await?;
            let mut name = vec![0u8; len[0] as usize];
            client.read_exact(&mut name).await?;
            String::from_utf8_lossy(&name).to_string()
        }
        4 => {
            let mut ip = [0u8; 16];
            client.read_exact(&mut ip).await?;
            std::net::Ipv6Addr::from(ip).to_string()
        }
        _ => return Err(std::io::Error::other("неизвестный тип адреса")),
    };
    let mut port = [0u8; 2];
    client.read_exact(&mut port).await?;
    let port = u16::from_be_bytes(port);

    match TcpStream::connect((host.as_str(), port)).await {
        Ok(server) => {
            client.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
            Ok(server)
        }
        Err(e) => {
            let _ = client.write_all(&[5, 4, 0, 1, 0, 0, 0, 0, 0, 0]).await;
            Err(e)
        }
    }
}

fn switch_upstream(port: u16) {
    if let Some(relay) = RELAY.get() {
        relay.upstream.store(port, Ordering::SeqCst);
        relay.generation.send_modify(|g| *g += 1);
    }
}

// --- sing-box ----------------------------------------------------------------

fn find_binary(app: &AppHandle) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("ZVON_SINGBOX").map(PathBuf::from).filter(|p| p.exists()) {
        return Some(p);
    }
    let mut candidates = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("singbox").join("sing-box.exe"));
    }
    if cfg!(debug_assertions) {
        candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("singbox").join("sing-box.exe"));
    }
    candidates.into_iter().find(|p| p.exists())
}

/// Ссылка узла → outbound sing-box. Понимает vless:// и hysteria2:// (hy2://),
/// готовый JSON берётся как есть.
fn parse_outbound(uri: &str) -> Result<Value, String> {
    let raw = uri.trim();
    if raw.starts_with('{') {
        return serde_json::from_str(raw).map_err(|e| e.to_string());
    }
    if let Some(rest) = raw.strip_prefix("hysteria2://").or_else(|| raw.strip_prefix("hy2://")) {
        return parse_hysteria2(rest);
    }
    let rest = raw
        .strip_prefix("vless://")
        .ok_or("Поддерживаются ссылки vless://, hysteria2:// или готовый JSON выходного подключения.")?;
    let (uuid, host, port, q) = split_link(rest)?;
    let get = |k: &str| q.get(k).filter(|v| !v.is_empty()).cloned();

    let mut out = json!({
        "type": "vless", "tag": "proxy", "server": host, "server_port": port, "uuid": uuid,
    });
    if let Some(flow) = get("flow") {
        out["flow"] = json!(flow);
    }
    let security = get("security").unwrap_or_else(|| "none".into());
    if security == "tls" || security == "reality" {
        let mut tls = json!({
            "enabled": true,
            "server_name": get("sni").or_else(|| get("host")).unwrap_or_else(|| host.clone()),
            "insecure": get("allowInsecure").as_deref() == Some("1"),
        });
        if let Some(fp) = get("fp") {
            tls["utls"] = json!({ "enabled": true, "fingerprint": fp });
        }
        if security == "reality" {
            tls["reality"] = json!({
                "enabled": true,
                "public_key": get("pbk").unwrap_or_default(),
                "short_id": get("sid").unwrap_or_default(),
            });
        }
        if let Some(alpn) = get("alpn") {
            tls["alpn"] = json!(alpn.split(',').collect::<Vec<_>>());
        }
        out["tls"] = tls;
    }
    match get("type").as_deref().unwrap_or("tcp") {
        "ws" => {
            let mut t = json!({ "type": "ws", "path": get("path").unwrap_or_else(|| "/".into()) });
            if let Some(h) = get("host") {
                t["headers"] = json!({ "Host": h });
            }
            out["transport"] = t;
        }
        "grpc" => out["transport"] = json!({ "type": "grpc", "service_name": get("serviceName").unwrap_or_default() }),
        _ => {}
    }
    Ok(out)
}

type LinkQuery = std::collections::HashMap<String, String>;

/// `auth@host:port/?query#name` → (auth, host, port, query).
fn split_link(rest: &str) -> Result<(String, String, u16, LinkQuery), String> {
    let rest = rest.split('#').next().unwrap_or("");
    let (auth, query) = rest.split_once('?').unwrap_or((rest, ""));
    let (auth, hostport) = auth.rsplit_once('@').ok_or("в ссылке нет адреса узла")?;
    let hostport = hostport.trim_end_matches('/');
    let (host, port) = match hostport.rsplit_once(':') {
        Some((h, p)) => (h.trim_matches(['[', ']']).to_string(), p.parse::<u16>().unwrap_or(443)),
        None => (hostport.to_string(), 443),
    };
    let q = query
        .split('&')
        .filter(|s| !s.is_empty())
        .map(|kv| {
            let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
            (k.to_string(), percent_decode(v))
        })
        .collect();
    Ok((percent_decode(auth), host, port, q))
}

/// hysteria2://password@host:port/?sni=…&obfs=salamander&obfs-password=…&insecure=1
fn parse_hysteria2(rest: &str) -> Result<Value, String> {
    let (password, host, port, q) = split_link(rest)?;
    let get = |k: &str| q.get(k).filter(|v| !v.is_empty()).cloned();
    let mut tls = json!({
        "enabled": true,
        "server_name": get("sni").unwrap_or_else(|| host.clone()),
        "insecure": get("insecure").as_deref() == Some("1"),
        "alpn": get("alpn").map(|a| a.split(',').map(String::from).collect::<Vec<_>>()).unwrap_or_else(|| vec!["h3".into()]),
    });
    if let Some(pin) = get("pinSHA256") {
        tls["certificate_public_key_sha256"] = json!([pin]);
    }
    let mut out = json!({
        "type": "hysteria2", "tag": "proxy", "server": host, "server_port": port, "password": password, "tls": tls,
    });
    if let Some(obfs) = get("obfs") {
        out["obfs"] = json!({ "type": obfs, "password": get("obfs-password").unwrap_or_default() });
    }
    Ok(out)
}

/// Ссылки на узел: от сервера приходит список `uris` (запасные транспорты —
/// например, reality и hysteria2 на одном узле), от старого сервера — одна `uri`.
fn candidate_links(config: &Value) -> Vec<String> {
    let mut links: Vec<String> = config
        .get("uris")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
        .unwrap_or_default();
    if let Some(uri) = config.get("uri").and_then(Value::as_str) {
        if !links.iter().any(|l| l == uri) {
            links.push(uri.to_string());
        }
    }
    links.retain(|l| !l.trim().is_empty());
    links
}

/// Последняя ошибка из журнала sing-box — для понятного сообщения и логов.
fn last_singbox_error(path: &std::path::Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let line = text.lines().rev().find(|l| l.contains("ERROR") || l.contains("FATAL"))?;
    // Без ANSI-раскраски и служебного префикса «connection: open connection to …».
    let mut clean = String::with_capacity(line.len());
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            for n in chars.by_ref() {
                if n.is_ascii_alphabetic() { break; }
            }
        } else {
            clean.push(c);
        }
    }
    let msg = clean.rsplit(": ").next().unwrap_or(&clean).trim().to_string();
    Some(msg)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("zz"), 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

async fn wait_for_port(port: u16) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    loop {
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            return Ok(());
        }
        if tokio::time::Instant::now() > deadline {
            return Err("Узел не ответил вовремя. Проверьте доступность сервера.".into());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

/// Пробный запрос через узел: без него неработающий узел выглядел бы как
/// пустое чёрное окно.
async fn probe(port: u16) -> Result<u16, String> {
    let proxy = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{port}")).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get("https://www.tiktok.com/").send().await.map_err(|e| e.to_string())?;
    Ok(resp.status().as_u16())
}

fn free_port() -> Option<u16> {
    let l = std::net::TcpListener::bind("127.0.0.1:0").ok()?;
    l.local_addr().ok().map(|a: SocketAddr| a.port())
}

async fn start_inner(app: &AppHandle, config: &Value) -> Result<Value, String> {
    stop_inner(app);
    if RELAY.get().is_none() {
        return Err("Маршрутизация TikTok не поднялась при запуске клиента.".into());
    }
    let bin = find_binary(app)
        .ok_or("Не найден компонент подключения (sing-box). Переустановите клиент или задайте ZVON_SINGBOX.")?;
    let links = candidate_links(config);
    if links.is_empty() {
        return Err("Сервер не выдал ссылку на узел.".into());
    }
    let country = config.get("country").and_then(Value::as_str).map(String::from);
    let title = config.get("title").and_then(Value::as_str).map(String::from);
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&dir);

    /*
     * Транспорты пробуются по очереди, пока пробный запрос не пройдёт. У части
     * провайдеров (и внутри другого VPN, чей узел подменяет адрес по SNI)
     * reality по TCP не доходит до узла — соединение уводят на настоящий сайт
     * маски, и sing-box отвечает «reality verification failed». Тот же узел по
     * hysteria2 (QUIC) при этом работает, поэтому одна ссылка — не вариант.
     */
    let mut errors = Vec::new();
    let mut connected = None;
    for (i, link) in links.iter().enumerate() {
        let outbound = match parse_outbound(link) {
            Ok(o) => o,
            Err(e) => { errors.push(e); continue; }
        };
        let kind = outbound.get("type").and_then(Value::as_str).unwrap_or("?").to_string();
        match launch(&bin, &dir, outbound).await {
            Ok((child, port)) => {
                log::info!("[tunnel] узел отвечает через {kind} (вариант {})", i + 1);
                connected = Some((child, port));
                break;
            }
            Err(e) => {
                log::warn!("[tunnel] {kind} (вариант {}) не прошёл: {e}", i + 1);
                errors.push(format!("{kind}: {e}"));
            }
        }
    }
    let Some((child, port)) = connected else {
        return Err(format!("Узел не пропускает трафик ({}). Попробуйте другую страну или повторите позже.", errors.join("; ")));
    };
    *RUNNING.lock() = Some(Running { child, country: country.clone(), title: title.clone() });

    switch_upstream(port);
    let locale = config.get("locale").and_then(Value::as_str).map(String::from);
    crate::netfilter::set_tunnel_locale(app, locale);
    log::info!("[tunnel] TikTok идёт через «{}», локальный порт {port}", title.clone().or(country.clone()).unwrap_or_default());
    Ok(json!({ "ok": true, "country": country, "port": port }))
}

/// Запустить sing-box с одним выходом и убедиться, что через него ходит
/// трафик. Ошибки sing-box пишутся в tiktok-tunnel.log рядом с конфигом.
async fn launch(bin: &std::path::Path, dir: &std::path::Path, outbound: Value) -> Result<(std::process::Child, u16), String> {
    let port = free_port().ok_or("нет свободного порта")?;
    let sb_config = json!({
        "log": { "level": "error" },
        "inbounds": [{ "type": "socks", "tag": "local", "listen": "127.0.0.1", "listen_port": port }],
        "outbounds": [outbound, { "type": "direct", "tag": "direct" }],
    });
    let config_path = dir.join("tiktok-tunnel.json");
    let log_path = dir.join("tiktok-tunnel.log");
    std::fs::write(&config_path, serde_json::to_string_pretty(&sb_config).unwrap_or_default()).map_err(|e| e.to_string())?;
    let log_file = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;

    let mut cmd = std::process::Command::new(bin);
    cmd.args(["run", "-c"])
        .arg(&config_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(log_file);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| format!("sing-box не запустился: {e}"))?;
    let kill = |child: &mut std::process::Child| {
        let _ = child.kill();
        let _ = child.wait();
    };

    if let Err(e) = wait_for_port(port).await {
        kill(&mut child);
        return Err(last_singbox_error(&log_path).unwrap_or(e));
    }
    match probe(port).await {
        Ok(status) => {
            log::info!("[tunnel] проверка через узел: HTTP {status}");
            Ok((child, port))
        }
        Err(e) => {
            kill(&mut child);
            Err(last_singbox_error(&log_path).unwrap_or(e))
        }
    }
}

fn stop_inner(app: &AppHandle) {
    switch_upstream(0);
    crate::netfilter::set_tunnel_locale(app, None);
    if let Some(mut r) = RUNNING.lock().take() {
        let _ = r.child.kill();
        let _ = r.child.wait();
    }
}

pub async fn start(app: &AppHandle, config: Value) -> Value {
    match start_inner(app, &config).await {
        Ok(v) => v,
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub async fn stop(app: &AppHandle) -> Value {
    stop_inner(app);
    json!({ "ok": true })
}

pub fn status(_app: &AppHandle) -> Value {
    let running = RUNNING.lock();
    match running.as_ref() {
        Some(r) => json!({ "running": true, "country": r.country, "title": r.title }),
        None => json!({ "running": false, "country": null, "title": null }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hysteria2_link() {
        let o = parse_outbound("hysteria2://p%40ss@node.example:36887/?sni=node.example&obfs=salamander&obfs-password=xyz#DE").unwrap();
        assert_eq!(o["type"], "hysteria2");
        assert_eq!(o["server"], "node.example");
        assert_eq!(o["server_port"], 36887);
        assert_eq!(o["password"], "p@ss");
        assert_eq!(o["obfs"]["type"], "salamander");
        assert_eq!(o["obfs"]["password"], "xyz");
        assert_eq!(o["tls"]["server_name"], "node.example");
        assert_eq!(o["tls"]["alpn"][0], "h3");
    }

    #[test]
    fn vless_reality_link() {
        let o = parse_outbound("vless://uuid-1@host.example:443?type=tcp&security=reality&pbk=KEY&sid=ab&sni=mask.example&fp=firefox&flow=xtls-rprx-vision#x").unwrap();
        assert_eq!(o["type"], "vless");
        assert_eq!(o["uuid"], "uuid-1");
        assert_eq!(o["flow"], "xtls-rprx-vision");
        assert_eq!(o["tls"]["reality"]["short_id"], "ab");
        assert_eq!(o["tls"]["server_name"], "mask.example");
    }

    #[test]
    fn candidates_merge_list_and_legacy_uri() {
        let c = json!({ "uris": ["hy2://a@h:1", "vless://b@h:2"], "uri": "vless://b@h:2" });
        assert_eq!(candidate_links(&c), vec!["hy2://a@h:1", "vless://b@h:2"]);
        assert_eq!(candidate_links(&json!({ "uri": "vless://b@h:2" })), vec!["vless://b@h:2"]);
    }
}
