//! Valve Game State Integration. Only derived public status leaves here.
use std::{collections::HashMap, path::PathBuf, sync::Arc, time::{Duration, Instant}};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::{TcpListener, TcpStream}, sync::Semaphore};
use crate::state::AppState;

const PORT: u16 = 29873;
const LIMIT: usize = 128 * 1024;
const TTL: Duration = Duration::from_secs(30);

#[derive(Serialize, Deserialize)]
struct Config { enabled: bool, token: String }
pub struct State {
    config: Config,
    latest: HashMap<String, (Instant, Value)>,
    listening: bool,
}
impl Default for State {
    fn default() -> Self {
        Self { config: Config { enabled: true, token: uuid::Uuid::new_v4().simple().to_string() }, latest: HashMap::new(), listening: false }
    }
}
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map(|p| p.join("game-integration.json")).map_err(|e| e.to_string())
}
pub fn initialize(app: &AppHandle) {
    if let Ok(path) = config_path(app) {
        if let Ok(raw) = std::fs::read_to_string(path) {
            if let Ok(config) = serde_json::from_str::<Config>(&raw) {
                if config.token.len() == 32 && config.token.bytes().all(|b| b.is_ascii_hexdigit()) {
                    app.state::<AppState>().gsi.lock().config = config;
                }
            }
        }
    }
}
fn persist(app: &AppHandle, config: &Config) -> Result<(), String> {
    let path = config_path(app)?;
    std::fs::create_dir_all(path.parent().ok_or("Нет каталога настроек")?).map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_vec(config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<Value, String> {
    let state = app.state::<AppState>();
    {
        let mut gsi = state.gsi.lock();
        if enabled && !gsi.listening { return Err(format!("Не удалось открыть локальный порт {PORT}. Перезапустите Звон или проверьте, не занят ли порт.")); }
        let config = Config { enabled, token: gsi.config.token.clone() };
        persist(app, &config)?;
        gsi.config = config;
        if !enabled { gsi.latest.clear(); }
    }
    state.scan_now();
    Ok(status(app))
}

// VDF quoted tokens, including escaped Windows paths and library names with spaces.
fn tokens(raw: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        if c != '"' { continue; }
        let mut token = String::new();
        while let Some(c) = chars.next() {
            if c == '"' { break; }
            if c == '\\' { if let Some(next) = chars.next() { token.push(next); } }
            else { token.push(c); }
        }
        result.push(token);
    }
    result
}
fn installed_game(game: &str) -> Option<PathBuf> {
    let steam = crate::winsys::steam_path()?;
    let mut libraries = vec![steam.clone()];
    if let Ok(raw) = std::fs::read_to_string(steam.join("steamapps/libraryfolders.vdf")) {
        let values = tokens(&raw);
        for pair in values.windows(2) {
            if pair[0] == "path" { libraries.push(PathBuf::from(&pair[1])); }
        }
    }
    let app_id = if game == "dota2" { "570" } else { "730" };
    for library in libraries {
        let raw = match std::fs::read_to_string(library.join(format!("steamapps/appmanifest_{app_id}.acf"))) { Ok(v) => v, Err(_) => continue };
        let values = tokens(&raw);
        if let Some(pair) = values.windows(2).find(|pair| pair[0] == "installdir") {
            // A manifest supplies only a directory name, never an absolute/parent path.
            if pair[1].contains(['/', '\\', ':']) || pair[1] == ".." { continue; }
            let root = library.join("steamapps/common").join(&pair[1]);
            let cfg = root.join(if game == "dota2" { "game/dota/cfg/gamestate_integration" } else { "game/csgo/cfg" });
            if root.join(if game == "dota2" { "game/dota" } else { "game/csgo" }).is_dir() { return Some(cfg); }
        }
    }
    None
}
fn config_text(game: &str, token: &str) -> String {
    let data = if game == "dota2" { "\"provider\" \"1\"\n\"map\" \"1\"\n\"player\" \"1\"" }
        else { "\"provider\" \"1\"\n\"map\" \"1\"\n\"player_id\" \"1\"\n\"round\" \"1\"" };
    format!("\"Zvon Game State Integration\"\n{{\n\"uri\" \"http://127.0.0.1:{PORT}/gsi/{game}\"\n\"timeout\" \"5.0\"\n\"buffer\" \"0.1\"\n\"throttle\" \"5.0\"\n\"heartbeat\" \"10.0\"\n\"auth\" {{ \"token\" \"{token}\" }}\n\"data\" {{\n{data}\n}}\n}}\n")
}
pub fn install(app: &AppHandle, game: &str) -> Result<Value, String> {
    if !["dota2", "cs2"].contains(&game) { return Err("Неизвестная игра".into()); }
    let dir = installed_game(game).ok_or("Игра не найдена в библиотеках Steam. Запустите Steam и установите игру.")?;
    let path = dir.join("gamestate_integration_zvon.cfg");
    if let Ok(old) = std::fs::read_to_string(&path) {
        if !old.contains("\"Zvon Game State Integration\"") { return Err("Файл gamestate_integration_zvon.cfg уже занят другой конфигурацией.".into()); }
    }
    let state = app.state::<AppState>();
    let gsi = state.gsi.lock();
    persist(app, &gsi.config)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(path, config_text(game, &gsi.config.token)).map_err(|e| e.to_string())?;
    drop(gsi);
    Ok(status(app))
}
pub fn status(app: &AppHandle) -> Value {
    let state = app.state::<AppState>();
    let gsi = state.gsi.lock();
    let games: Vec<Value> = ["dota2", "cs2"].into_iter().map(|game| {
        let dir = installed_game(game);
        let installed = dir.as_ref().and_then(|d| std::fs::read_to_string(d.join("gamestate_integration_zvon.cfg")).ok())
            .map(|s| s == config_text(game, &gsi.config.token)).unwrap_or(false);
        json!({ "id": game, "available": dir.is_some(), "installed": installed,
            "receiving": gsi.config.enabled && gsi.latest.get(game).map(|(t, _)| t.elapsed() < TTL).unwrap_or(false) })
    }).collect();
    json!({ "enabled": gsi.config.enabled, "listening": gsi.listening, "games": games })
}

fn text<'a>(v: &'a Value, pointer: &str) -> &'a str { v.pointer(pointer).and_then(Value::as_str).unwrap_or("") }
fn dota_mode(v: &Value) -> Option<&'static str> {
    let mode = v.pointer("/map/game_mode").or_else(|| v.pointer("/map/gamemode")).and_then(Value::as_i64);
    if mode == Some(23) { return Some("Турбо"); }
    let lobby = v.pointer("/map/lobby_type").and_then(Value::as_i64);
    if lobby == Some(7) { return Some("Рейтинговый матч"); }
    None // All Pick alone does not prove that a match is ranked.
}
pub fn summarize(game: &str, v: &Value) -> Value {
    let menu = text(v, "/player/activity") == "menu";
    if menu { return json!({ "state": "Главное меню", "details": "" }); }
    if game == "dota2" {
        let game_state = v.pointer("/map/game_state").or_else(|| v.pointer("/map/gamestate")).and_then(Value::as_str).unwrap_or("");
        let phase = match game_state {
            "DOTA_GAMERULES_STATE_HERO_SELECTION" | "DOTA_GAMERULES_STATE_STRATEGY_TIME" => "Выбор героя",
            "DOTA_GAMERULES_STATE_PRE_GAME" => "До начала матча",
            "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" => "В матче",
            "DOTA_GAMERULES_STATE_POST_GAME" => "Матч завершён",
            _ => "Игра запущена",
        };
        let state = dota_mode(v).map(|m| format!("{m} · {phase}")).unwrap_or_else(|| phase.into());
        let clock = v.pointer("/map/clock_time").or_else(|| v.pointer("/map/clocktime")).and_then(Value::as_i64);
        let details = if phase == "В матче" || phase == "До начала матча" {
            clock.map(|s| format!("Игровое время {}{}:{:02}{}", if s < 0 { "−" } else { "" }, s.unsigned_abs() / 60, s.unsigned_abs() % 60,
                if v.pointer("/map/paused").and_then(Value::as_bool) == Some(true) { " · Пауза" } else { "" })).unwrap_or_default()
        } else { String::new() };
        return json!({ "state": state, "details": details });
    }
    let mode = match text(v, "/map/mode") {
        "scrimcomp2v2" | "wingman" => "Напарники", "premier" => "Премьер",
        "competitive" => "Соревновательный", "casual" => "Обычный", "deathmatch" => "Бой насмерть",
        _ => "В матче",
    };
    let phase = match text(v, "/map/phase") {
        "warmup" => "Разминка", "intermission" => "Перерыв", "gameover" => "Матч завершён", "live" => "В матче", _ => "Игра запущена",
    };
    let state = if mode == "В матче" { phase.to_string() } else { format!("{mode} · {phase}") };
    // Only map names with a constrained alphabet enter the public status.
    let map: String = text(v, "/map/name").rsplit('/').next().unwrap_or("").chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').take(48).collect();
    let ct = v.pointer("/map/team_ct/score").and_then(Value::as_u64);
    let t = v.pointer("/map/team_t/score").and_then(Value::as_u64);
    let score = match (ct, t) { (Some(a), Some(b)) => format!(" · {a}:{b}"), _ => String::new() };
    json!({ "state": state, "details": format!("{map}{score}") })
}
pub fn enrich(app: &AppHandle, mut meta: Value) -> Value {
    let name = text(&meta, "/name").to_lowercase();
    let game = match name.as_str() { "dota 2" => "dota2", "counter-strike 2" => "cs2", _ => return meta };
    let state = app.state::<AppState>();
    let gsi = state.gsi.lock();
    if !gsi.config.enabled { return meta; }
    if let Some((_, summary)) = gsi.latest.get(game).filter(|(t, _)| t.elapsed() < TTL) {
        meta["state"] = summary["state"].clone();
        meta["details"] = summary["details"].clone();
    }
    meta
}

async fn read_payload(stream: &mut (impl tokio::io::AsyncRead + Unpin)) -> Result<(String, Value), String> {
    let mut raw = Vec::new();
    let header_end = loop {
        if raw.len() > 8192 { return Err("headers".into()); }
        let mut buf = [0u8; 2048];
        let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 { return Err("closed".into()); }
        raw.extend_from_slice(&buf[..n]);
        if let Some(end) = raw.windows(4).position(|s| s == b"\r\n\r\n") {
            if end + 4 > 8192 { return Err("headers".into()); }
            break end + 4;
        }
    };
    let headers = std::str::from_utf8(&raw[..header_end]).map_err(|_| "headers")?;
    let route = headers.lines().next().unwrap_or("");
    let game = match route { "POST /gsi/dota2 HTTP/1.1" | "POST /gsi/dota2 HTTP/1.0" => "dota2", "POST /gsi/cs2 HTTP/1.1" | "POST /gsi/cs2 HTTP/1.0" => "cs2", _ => return Err("route".into()) }.to_string();
    let mut length = None;
    for line in headers.lines().skip(1) {
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("origin") || name.eq_ignore_ascii_case("transfer-encoding") { return Err("headers".into()); }
            if name.eq_ignore_ascii_case("content-length") {
                if length.is_some() { return Err("length".into()); }
                length = value.trim().parse::<usize>().ok();
            }
        }
    }
    let length = length.filter(|n| *n > 0 && *n <= LIMIT).ok_or("length")?;
    while raw.len() < header_end + length {
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 { return Err("closed".into()); }
        raw.extend_from_slice(&buf[..n]);
    }
    let payload: Value = serde_json::from_slice(&raw[header_end..header_end + length]).map_err(|_| "json")?;
    let appid = payload.pointer("/provider/appid").and_then(Value::as_u64);
    if appid != Some(if game == "dota2" { 570 } else { 730 }) { return Err("game".into()); }
    Ok((game, payload))
}
fn authorized(config: &Config, payload: &Value) -> bool {
    config.enabled && text(payload, "/auth/token") == config.token
}
async fn receive(app: &AppHandle, stream: &mut TcpStream) -> Result<(), String> {
    let (game, payload) = read_payload(stream).await?;
    {
        let state = app.state::<AppState>();
        let mut gsi = state.gsi.lock();
        if !authorized(&gsi.config, &payload) { return Err("auth".into()); }
        gsi.latest.insert(game.clone(), (Instant::now(), summarize(&game, &payload)));
        state.scan_now();
    }
    Ok(())
}
pub async fn run(app: AppHandle) {
    let listener = match TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, PORT)).await {
        Ok(l) => l, Err(e) => { log::warn!("[gsi] local listener unavailable: {e}"); return; }
    };
    app.state::<AppState>().gsi.lock().listening = true;
    let limit = Arc::new(Semaphore::new(16));
    while let Ok((mut stream, _)) = listener.accept().await {
        let Ok(permit) = limit.clone().try_acquire_owned() else { continue; };
        let app = app.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let ok = matches!(tokio::time::timeout(Duration::from_secs(5), receive(&app, &mut stream)).await, Ok(Ok(())));
            let response = if ok { "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n" }
                else { "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n" };
            let _ = tokio::time::timeout(Duration::from_secs(1), stream.write_all(response.as_bytes())).await;
        });
    }
    app.state::<AppState>().gsi.lock().listening = false;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn dota_clock_and_modes() {
        let v = json!({"map":{"game_state":"DOTA_GAMERULES_STATE_GAME_IN_PROGRESS","game_mode":23,"clock_time":1478}});
        let s = summarize("dota2", &v);
        assert_eq!(s["state"], "Турбо · В матче");
        assert_eq!(s["details"], "Игровое время 24:38");
        assert_eq!(summarize("dota2", &json!({"map":{"game_mode":1}}))["state"], "Игра запущена");
    }
    #[test] fn menu_clears_match() {
        let s = summarize("cs2", &json!({"player":{"activity":"menu"},"map":{"name":"de_mirage"}}));
        assert_eq!(s["state"], "Главное меню"); assert_eq!(s["details"], "");
    }
    #[test] fn competitive_is_not_assumed_premier() {
        let s = summarize("cs2", &json!({"map":{"mode":"competitive","phase":"live","name":"de_mirage","team_ct":{"score":8},"team_t":{"score":5}}}));
        assert_eq!(s["state"], "Соревновательный · В матче"); assert_eq!(s["details"], "de_mirage · 8:5");
    }
    #[test] fn vdf_escaped_paths() {
        assert_eq!(tokens(r#""path" "D:\\Steam Library""#), vec!["path", "D:\\Steam Library"]);
    }
    #[test] fn token_and_opt_in_are_required() {
        let mut config = Config { enabled: false, token: "secret".into() };
        let good = json!({"auth":{"token":"secret"}});
        assert!(!authorized(&config, &good));
        config.enabled = true;
        assert!(authorized(&config, &good));
        assert!(!authorized(&config, &json!({"auth":{"token":"wrong"}})));
        assert!(!authorized(&config, &json!({})));
    }
    #[test] fn only_public_summary_is_retained() {
        let result = summarize("dota2", &json!({"player":{"activity":"menu","steamid":"private-id","name":"private-name"},"auth":{"token":"private-token"}}));
        assert_eq!(result.as_object().unwrap().len(), 2);
        assert!(!result.to_string().contains("private"));
    }
    #[tokio::test] async fn http_framing_and_rejections() {
        let body = r#"{"provider":{"appid":730},"player":{"activity":"menu"}}"#;
        let request = format!("POST /gsi/cs2 HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}", body.len());
        let (_, payload) = read_payload(&mut request.as_bytes()).await.unwrap();
        assert_eq!(payload["provider"]["appid"], 730);
        for invalid in [
            "GET /gsi/cs2 HTTP/1.1\r\n\r\n".to_string(),
            "POST /gsi/cs2 HTTP/1.1\r\nContent-Length: 9999999\r\n\r\n".to_string(),
            format!("POST /gsi/cs2 HTTP/1.1\r\nOrigin: http://example.com\r\nContent-Length: {}\r\n\r\n{body}", body.len()),
            format!("POST /gsi/dota2 HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}", body.len()),
            "POST /gsi/cs2 HTTP/1.1\r\nContent-Length: 100\r\n\r\n{}".to_string(),
        ] { assert!(read_payload(&mut invalid.as_bytes()).await.is_err()); }
    }
}
