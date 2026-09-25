//! Определение активности (Rich Presence) и видимость оверлея.
//!
//! Логика перенесена из electron.js без изменений: переднее окно и запущенная
//! Steam-игра опрашиваются с адаптивным интервалом, известные приложения
//! ищутся сначала среди настроенных пользователем, затем во встроенном списке.
//! Разница только в источнике сведений — Win32 вместо powershell и tasklist.

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;
use crate::{overlay, winsys};

const STEAMGRID_API_KEY: &str = "84d5caff741db867dcb433b3e3a7fd37";

struct Known {
    exe: &'static str,
    name: &'static str,
    icon: Option<&'static str>,
    kind: &'static str,
}

const fn k(exe: &'static str, name: &'static str, icon: Option<&'static str>, kind: &'static str) -> Known {
    Known { exe, name, icon, kind }
}

static KNOWN_APPS: &[Known] = &[
    // Игры
    k("VALORANT-Win64-Shipping.exe", "VALORANT", Some("https://static-cdn.jtvnw.net/ttv-boxart/516575_IGDB-285x380.jpg"), "game"),
    k("VALORANT.exe", "VALORANT", Some("https://static-cdn.jtvnw.net/ttv-boxart/516575_IGDB-285x380.jpg"), "game"),
    k("cs2.exe", "Counter-Strike 2", Some("https://static-cdn.jtvnw.net/ttv-boxart/32399_IGDB-285x380.jpg"), "game"),
    k("csgo.exe", "Counter-Strike: GO", Some("https://static-cdn.jtvnw.net/ttv-boxart/32399_IGDB-285x380.jpg"), "game"),
    k("dota2.exe", "Dota 2", Some("https://static-cdn.jtvnw.net/ttv-boxart/29595_IGDB-285x380.jpg"), "game"),
    k("League of Legends.exe", "League of Legends", Some("https://static-cdn.jtvnw.net/ttv-boxart/21779_IGDB-285x380.jpg"), "game"),
    k("Minecraft.exe", "Minecraft", Some("https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg"), "game"),
    k("javaw.exe", "Minecraft", Some("https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg"), "game"),
    k("RobloxPlayerBeta.exe", "Roblox", Some("https://static-cdn.jtvnw.net/ttv-boxart/23020_IGDB-285x380.jpg"), "game"),
    k("Roblox.exe", "Roblox", Some("https://static-cdn.jtvnw.net/ttv-boxart/23020_IGDB-285x380.jpg"), "game"),
    k("GenshinImpact.exe", "Genshin Impact", Some("https://static-cdn.jtvnw.net/ttv-boxart/513181_IGDB-285x380.jpg"), "game"),
    k("aces.exe", "War Thunder", Some("https://static-cdn.jtvnw.net/ttv-boxart/66366_IGDB-285x380.jpg"), "game"),
    k("WarThunder.exe", "War Thunder", Some("https://static-cdn.jtvnw.net/ttv-boxart/66366_IGDB-285x380.jpg"), "game"),
    k("FortniteClient-Win64-Shipping.exe", "Fortnite", Some("https://static-cdn.jtvnw.net/ttv-boxart/33214_IGDB-285x380.jpg"), "game"),
    k("deadlock.exe", "Deadlock", Some("https://static-cdn.jtvnw.net/ttv-boxart/1908684124_IGDB-285x380.jpg"), "game"),
    // Музыка
    k("Spotify.exe", "Spotify", Some("https://www.scdn.co/i/_global/twitter_card-default.jpg"), "music"),
    k("Music.exe", "Apple Music", Some("https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/0d/1b/3c/0d1b3c1b-6b7b-6b7b-6b7b-6b7b6b7b6b7b/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/512x512bb.jpg"), "music"),
    k("YouTube Music.exe", "YouTube Music", Some("https://music.youtube.com/img/on_platform_logo_dark.png"), "music"),
    k("AIMP.exe", "AIMP", Some("https://www.aimp.ru/favicon.ico"), "music"),
    k("foobar2000.exe", "foobar2000", Some("https://www.foobar2000.org/favicon.ico"), "music"),
    // Видео
    k("vlc.exe", "VLC Media Player", Some("https://www.videolan.org/favicon.ico"), "video"),
    k("mpc-hc64.exe", "MPC-HC", Some("https://mpc-hc.org/favicon.ico"), "video"),
    k("Netflix.exe", "Netflix", Some("https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.ico"), "video"),
    // Прочее
    k("Code.exe", "Visual Studio Code", None, "other"),
    k("WebStorm.exe", "WebStorm", None, "other"),
    k("Discord.exe", "Discord", None, "other"),
    k("Telegram.exe", "Telegram", None, "other"),
    k("obs64.exe", "OBS Studio", None, "other"),
    k("obs32.exe", "OBS Studio", None, "other"),
];

// Активностью считаем только эти типы.
const ACTIVITY_TYPES: &[&str] = &["game", "music", "video", "other"];

const NEUTRAL_PROCESSES: &[&str] = &[
    "powershell.exe", "cmd.exe", "idle.exe", "electron.exe", "zvon.exe", "searchhost.exe",
    "startmenuexperiencehost.exe", "taskmgr.exe",
];

// Окна переднего плана, которые точно не игры: при них оверлей не показываем.
const NON_GAME_FG_EXTRA: &[&str] = &[
    "explorer.exe", "dwm.exe", "shellexperiencehost.exe", "applicationframehost.exe",
    "textinputhost.exe", "sihost.exe", "systemsettings.exe", "lockapp.exe",
    // браузеры
    "chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "opera_gx.exe", "brave.exe", "browser.exe", "yandex.exe", "vivaldi.exe",
    // мессенджеры, медиа, прочее ПО
    "discord.exe", "telegram.exe", "spotify.exe", "whatsapp.exe", "slack.exe",
    "obs64.exe", "obs32.exe", "steam.exe", "steamwebhelper.exe", "epicgameslauncher.exe", "battle.net.exe",
    // редакторы и офис
    "code.exe", "webstorm.exe", "devenv.exe", "rider64.exe", "pycharm64.exe", "notepad.exe", "notepad++.exe",
    "winword.exe", "excel.exe", "powerpnt.exe", "acrobat.exe", "acrord32.exe",
    // окна самого WebView2
    "msedgewebview2.exe",
];

const BROWSERS: &[&str] = &[
    "chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "opera_gx.exe", "brave.exe", "browser.exe", "yandex.exe", "vivaldi.exe",
];

fn is_non_game_fg(fg: &str) -> bool {
    NEUTRAL_PROCESSES.contains(&fg) || NON_GAME_FG_EXTRA.contains(&fg)
}

fn known_meta(exe: &str) -> Option<Value> {
    KNOWN_APPS.iter().find(|a| a.exe == exe).map(|a| {
        let mut m = json!({ "name": a.name, "type": a.kind });
        if let Some(icon) = a.icon {
            m["icon"] = json!(icon);
        }
        m
    })
}

fn meta_type(m: &Value) -> &str {
    m.get("type").and_then(Value::as_str).unwrap_or("other")
}

fn meta_name(m: &Value) -> &str {
    m.get("name").and_then(Value::as_str).unwrap_or("")
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Default)]
pub struct ActivityState {
    pub last: Option<Value>,
    pub start_ms: Option<u64>,
    cache: HashMap<String, Value>,
}

impl ActivityState {
    pub fn current(&self) -> Value {
        match (&self.last, self.start_ms) {
            (Some(a), Some(t)) => {
                let mut v = a.clone();
                v["startTime"] = json!(t);
                v
            }
            _ => Value::Null,
        }
    }
}

async fn sgdb_get(client: &reqwest::Client, url: &str) -> Option<Value> {
    let resp = client.get(url).bearer_auth(STEAMGRID_API_KEY).send().await.ok()?;
    resp.json::<Value>().await.ok()
}

/// Сведения о приложении: пользовательский список → встроенный → SteamGridDB.
async fn game_metadata(app: &AppHandle, app_id: Option<u32>, exe: Option<&str>) -> Option<Value> {
    let state = app.state::<AppState>();
    let cache_key = app_id.map(|id| id.to_string()).or_else(|| exe.map(String::from))?;
    if let Some(v) = state.activity.lock().cache.get(&cache_key) {
        return Some(v.clone());
    }

    let mut meta = json!({ "name": "Unknown App", "icon": null, "type": "other" });
    if let Some(exe) = exe {
        let user = state.settings.lock().user_apps.get(exe).cloned();
        if let Some(Value::Object(u)) = user {
            let mut m: Map<String, Value> = u;
            m.insert("icon".into(), Value::Null);
            meta = Value::Object(m);
        } else if let Some(k) = known_meta(exe) {
            meta = k;
        }
    }

    if meta_type(&meta) == "game" || app_id.is_some() {
        let client = reqwest::Client::builder().timeout(Duration::from_secs(10)).build().ok()?;
        let mut sgdb_id: Option<i64> = None;
        if let Some(id) = app_id {
            if let Some(res) = sgdb_get(&client, &format!("https://www.steamgriddb.com/api/v2/games/steam/{id}")).await {
                if res["success"].as_bool() == Some(true) {
                    meta["name"] = res["data"]["name"].clone();
                    sgdb_id = res["data"]["id"].as_i64();
                    meta["type"] = json!("game");
                }
            }
        }
        if sgdb_id.is_none() && meta_name(&meta) != "Unknown App" && meta_type(&meta) == "game" {
            let q = urlencode(meta_name(&meta));
            if let Some(res) = sgdb_get(&client, &format!("https://www.steamgriddb.com/api/v2/search/autocomplete/{q}")).await {
                if res["success"].as_bool() == Some(true) {
                    sgdb_id = res["data"][0]["id"].as_i64();
                }
            }
        }
        if let Some(gid) = sgdb_id {
            if let Some(res) = sgdb_get(&client, &format!("https://www.steamgriddb.com/api/v2/grids/game/{gid}?dimensions=342x482,600x900")).await {
                if res["success"].as_bool() == Some(true) {
                    if let Some(url) = res["data"][0]["url"].as_str() {
                        meta["icon"] = json!(url);
                    }
                }
            }
        }
    }

    state.activity.lock().cache.insert(cache_key, meta.clone());
    Some(meta)
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn allowed(meta: Option<Value>) -> Option<Value> {
    meta.filter(|m| ACTIVITY_TYPES.contains(&meta_type(m)))
}

pub fn update_activity(app: &AppHandle, found: Option<Value>, is_foreground: bool, fg_exe: &str) {
    let state = app.state::<AppState>();
    let (changed, payload, last_is_game) = {
        let mut a = state.activity.lock();
        let cur_name = found.as_ref().map(|m| meta_name(m).to_string());
        let last_name = a.last.as_ref().map(|m| meta_name(m).to_string());
        let changed = cur_name != last_name;
        if changed {
            a.last = found.clone();
            a.start_ms = found.as_ref().map(|_| now_ms());
        }
        let last_is_game = a.last.as_ref().map(|m| meta_type(m) == "game").unwrap_or(false);
        (changed, a.current(), last_is_game)
    };

    if changed {
        let _ = app.emit_to("main", "activity-changed", payload.clone());
        let _ = app.emit_to("overlay", "activity-changed", payload);
    }

    // Видимость оверлея: только для игр.
    if app.get_webview_window("overlay").is_none() {
        return;
    }
    let fg = fg_exe.trim().to_lowercase();
    let is_game = found.as_ref().map(|m| meta_type(m) == "game").unwrap_or(false);
    let game_in_foreground = found.is_some() && is_foreground && is_game;
    let fg_known_non_game = !fg.is_empty() && is_non_game_fg(&fg);
    // Переднее окно не читается (игра с античитом или от администратора), но
    // игра запущена — считаем, что она по-прежнему на переднем плане.
    let unreadable_but_game = fg.is_empty() && last_is_game;
    let should_show = state.overlay_enabled.load(Ordering::Relaxed)
        && !fg_known_non_game
        && (game_in_foreground || unreadable_but_game);
    if should_show { overlay::show_inactive(app) } else { overlay::hide(app) }
}

/// Один цикл опроса. Возвращает паузу до следующего.
async fn scan_once(app: &AppHandle) -> u64 {
    let state = app.state::<AppState>();
    if !state.settings.lock().activity_detection_enabled {
        update_activity(app, None, false, "");
        return 3000;
    }

    let fg = winsys::foreground();
    let fg_exe = fg.as_ref().map(|f| f.exe.to_lowercase()).unwrap_or_default();
    let fg_title = fg.as_ref().map(|f| f.title.clone()).unwrap_or_default();

    let steam_meta = match winsys::steam_running_app_id() {
        Some(id) => game_metadata(app, Some(id), None).await,
        None => None,
    };

    if !fg_exe.is_empty() {
        let fg_base = fg_exe.strip_suffix(".exe").unwrap_or(&fg_exe).to_string();

        // Браузер на переднем плане: YouTube определяем по заголовку окна.
        if BROWSERS.contains(&fg_exe.as_str()) && fg_title.to_lowercase().contains("youtube") {
            let yt = json!({ "name": "YouTube", "icon": "https://www.youtube.com/favicon.ico", "type": "video" });
            update_activity(app, Some(yt), true, &fg_exe);
            return 3000;
        }

        let user_keys: Vec<String> = state.settings.lock().user_apps.keys().cloned().collect();
        let found_key = user_keys
            .iter()
            .map(String::as_str)
            .chain(KNOWN_APPS.iter().map(|a| a.exe))
            .find(|key| {
                let kl = key.to_lowercase();
                fg_exe == kl || fg_base == kl || fg_exe == kl.replace(".exe", "")
            })
            .map(String::from);

        if let Some(key) = found_key {
            let meta = game_metadata(app, None, Some(&key)).await;
            update_activity(app, allowed(meta), true, &fg_exe);
            // Пока игра на переднем плане — опрашиваем чаще, чтобы оверлей
            // скрывался почти сразу при сворачивании.
            return 800;
        }

        // Steam-игры: имя процесса почти никогда не совпадает с названием,
        // поэтому игра активна, если запущена и впереди не системное окно.
        let fg_system = NEUTRAL_PROCESSES.contains(&fg_exe.as_str()) || fg_exe == "explorer.exe" || fg_exe == "dwm.exe";
        if let Some(sm) = &steam_meta {
            let sname = meta_name(sm).to_lowercase();
            let name_match = fg_exe.contains(&sname) || sname.contains(&fg_base);
            if name_match || !fg_system {
                update_activity(app, Some(sm.clone()), true, &fg_exe);
                return 800;
            }
        }
    }

    if let Some(sm) = steam_meta {
        update_activity(app, Some(sm), false, &fg_exe);
        return 1200;
    }

    // Полный просмотр процессов.
    let user_apps = state.settings.lock().user_apps.clone();
    let mut candidates: Vec<(String, String, Value)> = user_apps
        .iter()
        .map(|(k, v)| {
            let l = k.to_lowercase();
            (l.clone(), l.replace(".exe", ""), v.clone())
        })
        .collect();
    for a in KNOWN_APPS {
        let l = a.exe.to_lowercase();
        candidates.push((l.clone(), l.replace(".exe", ""), known_meta(a.exe).unwrap_or(Value::Null)));
    }

    let mut best: Option<Value> = None;
    for p in winsys::processes() {
        let exe = p.exe.to_lowercase();
        let base = exe.strip_suffix(".exe").unwrap_or(&exe).to_string();
        if let Some((_, _, meta)) = candidates.iter().find(|(l, b, _)| exe == *l || base == *b) {
            if ACTIVITY_TYPES.contains(&meta_type(meta)) {
                best = Some(meta.clone());
                if meta_type(meta) == "game" {
                    break;
                }
            }
        }
    }
    let interval = if best.is_some() { 1200 } else { 5000 };
    update_activity(app, best, false, &fg_exe);
    interval
}

/// Фоновый цикл. Досрочный запуск — через AppState::scan_now.
pub async fn run(app: AppHandle) {
    loop {
        let wait = scan_once(&app).await;
        let notify = app.state::<AppState>().scan_notify.clone();
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(wait)) => {}
            _ = notify.notified() => {}
        }
    }
}

