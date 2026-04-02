const { io } = require("socket.io-client");
const axios = require("axios");
const { spawn } = require("child_process");
const {
    AccessToken,
    Room,
    LocalAudioTrack,
    AudioSource,
    AudioFrame,
    TrackSource,
    TrackPublishOptions
} = require("@livekit/rtc-node");
const { YandexMusicClient } = require("yandex-music-client");
const { getTrackUrl } = require("yandex-music-client/trackUrl");
const crypto = require('crypto');

const YANDEX_TOKEN = "y0__xDvo5iwBBje-AYghJDMnxYwjqm0hQhXgYlVwLXfMHVMjTu7ZEZPKDY4SA";

/**
 * Zvon Music Bot - Global Repair & Optimization
 */

const TOKEN = "bot_e43739c7bbfdb16d40fb58062c9038b0ebc07742b8b0bbeb45a2001a05747861";
const SERVER_URL = "https://zvonserver.ru";

console.log("Starting Zvon Music Bot with Playlists...");
const socket = io(SERVER_URL, {
    auth: { token: TOKEN }
});

// Bot State
let botServers = new Map();
let livekitRoom = null;
let audioSource = null;
let audioTrack = null;
let currentFFmpeg = null;
let playlistQueue = [];
let currentIndex = -1;
let isPlaying = false;
let lastUsedChannelId = null;

const userAgent = 'YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)';

// --- PROXY CONFIGURATION ---
// Set your proxy here (e.g. 'http://user:pass@host:port') or leave null.
const SCRAPER_PROXY = process.env.SCRAPER_PROXY || null; 
// ----------------------------

const yandexClient = new YandexMusicClient({
    HEADERS: {
        'Authorization': `OAuth ${YANDEX_TOKEN}`,
        'X-Yandex-Music-Client': 'Android/14562',
        'User-Agent': userAgent
    },
    BASE: "https://api.music.yandex.net"
});

socket.on("connect", () => {
    console.log("Music Bot Connected to Zvon!");
    yandexClient.account.getAccountStatus()
        .then(res => {
            const acc = res.result?.account || {};
            console.log(`[Yandex] Logged in as: ${acc.login || 'User'}`);
        })
        .catch(err => console.error(`[Yandex] Auth failed: ${err.message}`));
});

socket.on("ready", async (data) => {
    socket.userId = data.userId;
    try {
        const res = await axios.get(`${SERVER_URL}/api/servers/me`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        for (const server of res.data) {
            botServers.set(server._id, server);
            socket.emit("join-server", server._id);
            for (const channel of server.channels) {
                if (channel.type === "text") socket.emit("join-channel", channel._id);
            }
        }
    } catch (err) { console.error("Error fetching servers:", err.message); }
});

// --- HELPER FUNCTIONS ---

async function getTrackUrlCustom(trackId, attempt = 0) {
    const id = trackId.toString().split(':')[0];
    try {
        const infoRes = await yandexClient.tracks.getDownloadInfo(id);
        const sortedInfo = (infoRes.result || []).sort((a, b) => b.bitrateKbps - a.bitrateKbps);
        const info = sortedInfo.find(i => i.codec === 'mp3' && !i.preview) || sortedInfo[0];

        if (!info) throw new Error("No download info found");

        const downloadUrl = info.downloadInfoUrl + (info.downloadInfoUrl.includes('?') ? '&' : '?') + "format=json";
        const directRes = await axios.get(downloadUrl, { 
            headers: { 'Authorization': `OAuth ${YANDEX_TOKEN}`, 'User-Agent': userAgent },
            timeout: 5000 
        });

        if (directRes.data && directRes.data.host) {
            const { host, path, ts, s } = directRes.data;
            const sign = crypto.createHash('md5').update('XGRwNC9wZnduYm9n' + path.substring(1) + s).digest('hex');
            const finalUrl = `https://${host}/get-mp3/${sign}/${ts}${path}`;
            return finalUrl;
        }
        throw new Error("Invalid mirror response");
    } catch (err) {
        if (attempt < 2) return await getTrackUrlCustom(trackId, attempt + 1);
        throw err;
    }
}

async function startPlayback(channelId) {
    if (currentIndex < 0 || currentIndex >= playlistQueue.length) {
        isPlaying = false;
        stopMusic();
        return;
    }

    const track = playlistQueue[currentIndex];
    isPlaying = true;

    try {
        const link = await getTrackUrlCustom(track.id);
        socket.emit("send-message", {
            channelId: lastUsedChannelId,
            embeds: [{
                title: track.title,
                url: `https://music.yandex.ru/album/${track.albums?.[0]?.id}/track/${track.id}`,
                author: { name: "Сейчас играет" },
                description: `**${track.artists?.[0]?.name || 'Unknown Artist'}**`,
                thumbnail: { url: track.coverUri ? `https://${track.coverUri.replace('%%', '200x200')}` : undefined },
                color: "#00e5ff",
                footer: { 
                    text: `Яндекс Музыка • Очередь: ${currentIndex + 1}/${playlistQueue.length} • 00:00 - ${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}`,
                    icon_url: "https://music.yandex.ru/favicon.ico"
                }
            }],
            buttons: [
                { label: "🔀", actionId: "shuffle_queue", style: "secondary", row: 1 },
                { label: "🔉", actionId: "vol_down", style: "secondary", row: 1 },
                { label: "100%", actionId: "vol_reset", style: "secondary", row: 1 },
                { label: "🔊", actionId: "vol_up", style: "secondary", row: 1 },
                { label: "🔁", actionId: "loop_mode", style: "secondary", row: 1 },
                
                { label: "⏪", actionId: "rewind", style: "secondary", row: 2 },
                { label: "⏮️", actionId: "prev_track", style: "secondary", row: 2 },
                { label: "⏸️", actionId: "stop_track", style: "secondary", row: 2 },
                { label: "⏭️", actionId: "skip_track", style: "secondary", row: 2 },
                { label: "⏩", actionId: "fast_forward", style: "secondary", row: 2 },

                { label: "📜", actionId: "queue_view", style: "secondary", row: 3 },
                { label: "⏹️", actionId: "stop_music", style: "secondary", row: 3 },
                { label: "🚪", actionId: "leave_voice", style: "danger", row: 3 }
            ]
        });
        await playTrackStream(link, channelId);
    } catch (err) {
        console.error("Playback Error:", err.message);
        socket.emit("send-message", { content: `❌ Ошибка: ${err.message}`, channelId: lastUsedChannelId });
        skipTrack(channelId);
    }
}

function skipTrack(channelId) {
    if (currentIndex < playlistQueue.length - 1) {
        if (currentFFmpeg) currentFFmpeg.kill();
        else { currentIndex++; startPlayback(channelId); }
    } else { stopMusic(); }
}

function prevTrack(channelId) {
    if (currentIndex > 0) {
        currentIndex--;
        if (currentFFmpeg) currentFFmpeg.kill();
        else startPlayback(channelId);
    }
}

function stopMusic() {
    isPlaying = false;
    if (currentFFmpeg) { currentFFmpeg.kill(); currentFFmpeg = null; }
    if (livekitRoom) { livekitRoom.disconnect(); livekitRoom = null; }
    if (socket.voiceChannelId) {
        socket.emit("leave-voice-channel", { channelId: socket.voiceChannelId });
        socket.voiceChannelId = null;
    }
}

async function resolvePlaylistInfo(urlOrUUID) {
    let owner = null;
    let kind = null;
    let html = null;

    if (urlOrUUID.includes(':') && !urlOrUUID.includes('http')) {
        const parts = urlOrUUID.split(':');
        return { owner: parts[0], kind: parts[1] };
    }

    const cleanUrl = urlOrUUID.includes('http') ? urlOrUUID.split('?')[0].split('#')[0] : null;
    
    // Normalize kind from URL or UUID
    if (cleanUrl?.includes('/users/') && cleanUrl?.includes('/playlists/')) {
        const parts = cleanUrl.split('/');
        owner = parts[parts.indexOf('users') + 1];
        kind = parts[parts.indexOf('playlists') + 1];
    } else if (cleanUrl?.includes('/playlists/')) {
        kind = cleanUrl.split('/playlists/')[1];
    } else if (!urlOrUUID.includes('/') && urlOrUUID.length > 20) {
        kind = urlOrUUID;
    }

    if (kind) {
        console.log(`[Yandex] Resolving kind/uuid: ${kind}...`);

        // Helper to perform HTTP request with optional proxy
        const performRequest = async (url, customHeaders = {}) => {
            const config = {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Referer': 'https://music.yandex.ru/',
                    ...customHeaders
                },
                timeout: 10000
            };
            
            // Apply Manual Proxy if defined
            if (SCRAPER_PROXY) {
                const proxyUrl = new URL(SCRAPER_PROXY);
                config.proxy = {
                    protocol: proxyUrl.protocol.replace(':', ''),
                    host: proxyUrl.hostname,
                    port: parseInt(proxyUrl.port),
                };
                if (proxyUrl.username) {
                    config.proxy.auth = { username: proxyUrl.username, password: proxyUrl.password };
                }
            }
            
            try { return await axios.get(url, config); }
            catch (e) {
                // TRY FALLBACK via public CORS proxy (useful for bypassing simple IP blocks)
                if (!SCRAPER_PROXY && url.includes("music.yandex.ru")) {
                    console.log(`[Yandex] Resolution failed, trying public CORS proxy gateway...`);
                    const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                    try { return await axios.get(corsUrl, { timeout: 10000 }); } catch (corsErr) { throw e; }
                }
                throw e;
            }
        };

        // 1. Try internal Web Handler (good for shared playlists lk.*)
        try {
            const hdlRes = await performRequest(`https://music.yandex.ru/api/v2.1/handlers/playlist/${kind}`);
            if (hdlRes.data?.playlist?.tracks?.length) {
                const p = hdlRes.data.playlist;
                console.log(`[Yandex] Resolved via Web Handler: ${p.owner.login}:${p.kind}`);
                return { owner: p.owner.login, kind: p.kind.toString(), res: p };
            }
        } catch (e) {
            console.warn(`[Yandex] Web Handler resolution failed: ${e.message}`);
        }

        // 2. Try official API directly (usually doesn't need proxy if token is valid)
        for (const pName of ['playlistIds', 'playlist-ids']) {
            try {
                const apiRes = await axios.post('https://api.music.yandex.net/playlists/list', 
                    `${pName}=${kind}`,
                    {
                        headers: {
                            'Authorization': `OAuth ${YANDEX_TOKEN}`,
                            'X-Yandex-Music-Client': 'Android/14562',
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': userAgent
                        },
                        timeout: 5000
                    }
                );
                if (apiRes.data?.result?.[0] && apiRes.data.result[0].tracks?.length) {
                    const p = apiRes.data.result[0];
                    console.log(`[Yandex] Resolved via Direct API (${pName}): ${p.owner.login}:${p.kind}`);
                    return { owner: p.owner.login, kind: p.kind.toString(), res: p };
                }
            } catch (e) { console.warn(`[Yandex] Direct API resolution failed: ${e.message}`); }
        }

        // 3. Try Scraping (last resort)
        try {
            const scraperRes = await performRequest(cleanUrl || `https://music.yandex.ru/playlists/${kind}`, {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                'Cookie': `yandexuid=${Math.random().toString().substring(2)};`
            });
            html = scraperRes.data;
            if (html.includes("captcha") || html.includes("g-recaptcha")) console.error("[Yandex] CAPTCHA detected!");
            
            const finalUrl = scraperRes.request?.res?.responseUrl || cleanUrl;
            if (finalUrl?.includes('/users/')) {
                const parts = finalUrl.split('/');
                owner = parts[parts.indexOf('users') + 1];
                kind = parts[parts.indexOf('playlists') + 1];
            } else {
                const ogUrlMatch = html.match(/<meta property="og:url" content="(.*?)"/);
                if (ogUrlMatch && ogUrlMatch[1].includes("/users/")) {
                    const parts = ogUrlMatch[1].split("/");
                    owner = parts[parts.indexOf("users") + 1];
                    kind = parts[parts.indexOf("playlists") + 1];
                }
            }
        } catch (e) { console.error("[Yandex] Resolver scraper error:", e.message); }
    }
    return { owner, kind, html };
}

// --- COMMAND HANDLER ---

socket.on("new-message", async (msg) => {
    if (msg.author._id === socket.userId) return;
    const content = msg.content.trim();
    lastUsedChannelId = msg.channel;

    let targetServer = Array.from(botServers.values()).find(s => s.channels.some(c => c._id === msg.channel));
    const voiceChannel = targetServer?.channels.find(c => c.type === "voice");

    if (content.startsWith("!play ")) {
        const query = content.replace("!play ", "").trim();
        try {
            if (!voiceChannel) throw new Error("Голосовой канал не найден.");
            
            const tryLoad = async () => {
                let tracks = [];
                let res = null;
                const info = await resolvePlaylistInfo(query);

                if (info.res) {
                    res = { result: info.res };
                } else if (info.owner && info.kind) {
                    res = await yandexClient.playlists.getPlaylistById(info.owner, info.kind);
                } else if (info.kind) {
                    const sRes = await yandexClient.search.search(info.kind, 0, 'playlist');
                    const p = sRes.result.playlists?.results?.[0];
                    if (p) res = await yandexClient.playlists.getPlaylistById(p.owner.login, p.kind);
                }

                if (res?.result?.tracks?.length) {
                    tracks = res.result.tracks.map(t => t.track || t);
                } else if (info.html) {
                    const tIds = [...new Set([
                        ...info.html.matchAll(/\/track\/(\d+)/g),
                        ...info.html.matchAll(/"trackId":(\d+)/g)
                    ].map(m => m[1]))].filter(id => id.length >= 5);
                    
                    if (tIds.length > 0) {
                        const batch = await yandexClient.tracks.getTracksByIds({ trackIds: tIds.slice(0, 50) });
                        tracks = batch.result || [];
                        res = { result: { title: "Скраппинг плейлиста", coverUri: "" } };
                    }
                }

                if (tracks.length === 0 && !query.includes("http")) { // Try regular search 
                    const s = await yandexClient.search.search(query, 0, 'track');
                    const t = s.result.tracks?.results?.[0];
                    if (t) { tracks = [t]; res = { result: { title: "Поиск", coverUri: "" } }; }
                }

                if (tracks.length === 0) throw new Error("Ничего не найдено или плейлист пуст.");
                return { tracks, res };
            };

            let loadRes;
            for (let i = 0; i < 2; i++) {
                try {
                    loadRes = await tryLoad();
                    break;
                } catch (e) {
                    if (i === 1) throw e;
                    console.log(`[Yandex] Load attempt 1 failed, retrying...`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            socket.emit("join-voice-channel", { channelId: voiceChannel._id });
            socket.voiceChannelId = voiceChannel._id;

            const added = loadRes.tracks.map(t => ({ ...t, id: t.id.toString().split(':')[0] }));
            playlistQueue.push(...added);

            if (!isPlaying) {
                currentIndex = playlistQueue.length - added.length;
                startPlayback(voiceChannel._id);
            } else {
                socket.emit("send-message", { 
                    channelId: msg.channel,
                    content: added.length > 1 ? `📂 Добавлено **${added.length}** треков.` : `➕ В очереди: **${added[0].title}**`
                });
            }
        } catch (err) {
            socket.emit("send-message", { content: `❌ ${err.message}`, channelId: msg.channel });
        }
    }

    if (content === "!skip") skipTrack(voiceChannel?._id);
    if (content === "!stop") stopMusic();
    if (content === "!queue") {
        const text = playlistQueue.slice(currentIndex, currentIndex+10).map((t,i)=>`${i+currentIndex+1}. ${t.title}`).join("\n");
        socket.emit("send-message", { content: `📋 **Очередь:**\n${text}`, channelId: msg.channel });
    }
});

socket.on("interactive-button-click", (data) => {
    if (!socket.voiceChannelId) return;

    const channelId = socket.voiceChannelId;
    const { actionId, user } = data;

    console.log(`[Button] ${user.username} clicked ${actionId}`);

    if (actionId === "skip_track") {
        socket.emit("send-message", { content: `⏭️ **${user.username}** пропустил трек.`, channelId: lastUsedChannelId });
        skipTrack(channelId);
    } 
    else if (actionId === "prev_track") {
        socket.emit("send-message", { content: `⏮️ **${user.username}** включил предыдущий трек.`, channelId: lastUsedChannelId });
        prevTrack(channelId);
    } 
    else if (actionId === "stop_track" || actionId === "stop_music") {
        socket.emit("send-message", { content: `⏹️ **${user.username}** остановил музыку.`, channelId: lastUsedChannelId });
        stopMusic();
    }
    else if (actionId === "shuffle_queue") {
        for (let i = playlistQueue.length - 1; i > currentIndex + 1; i--) {
            const j = Math.floor(Math.random() * (i - currentIndex)) + currentIndex + 1;
            [playlistQueue[i], playlistQueue[j]] = [playlistQueue[j], playlistQueue[i]];
        }
        socket.emit("send-message", { content: `🔀 **${user.username}** перемешал очередь.`, channelId: lastUsedChannelId });
    }
    else if (actionId === "leave_voice") {
        socket.emit("send-message", { content: `🚪 **${user.username}** выгнал бота.`, channelId: lastUsedChannelId });
        stopMusic();
    }
    else if (actionId === "queue_view") {
        const text = playlistQueue.slice(currentIndex, currentIndex + 10).map((t, i) => `${i + currentIndex + 1}. ${t.title}`).join("\n");
        socket.emit("send-message", { content: `📋 **Очередь:**\n${text}`, channelId: lastUsedChannelId });
    }
});

// --- CORE STREAMING LOGIC ---

async function playTrackStream(url, channelId) {
    try {
        if (!livekitRoom) {
            const tokenRes = await axios.get(`${SERVER_URL}/api/livekit/token`, {
                params: { roomName: `channel-${channelId}`, identity: socket.userId },
                headers: { Authorization: `Bearer ${TOKEN}` }
            });
            livekitRoom = new Room();
            await livekitRoom.connect(tokenRes.data.serverUrl, tokenRes.data.token);
            audioSource = new AudioSource(48000, 1);
            audioTrack = LocalAudioTrack.createAudioTrack("music", audioSource);
            await livekitRoom.localParticipant.publishTrack(audioTrack, { source: TrackSource.SOURCE_MICROPHONE, stream: 'music', dtx: true });
        }

        const ffmpeg = spawn("ffmpeg", [
            "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
            "-i", url, "-f", "s16le", "-ar", "48000", "-ac", "1", "pipe:1"
        ]);
        currentFFmpeg = ffmpeg;

        let buffer = Buffer.alloc(0);
        const FRAME_SIZE = 960 * 2;

        ffmpeg.stdout.on("data", async (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= FRAME_SIZE) {
                const frameData = buffer.slice(0, FRAME_SIZE);
                buffer = buffer.slice(FRAME_SIZE);
                const int16 = new Int16Array(frameData.buffer, frameData.byteOffset, frameData.length / 2);
                const frame = new AudioFrame(int16, 48000, 1, int16.length);
                try { await audioSource.captureFrame(frame); } catch (e) { }
            }
        });

        ffmpeg.on("close", () => {
            currentFFmpeg = null;
            if (isPlaying) { currentIndex++; startPlayback(channelId); }
        });
    } catch (err) {
        console.error("Stream Error:", err.message);
        throw err;
    }
}
