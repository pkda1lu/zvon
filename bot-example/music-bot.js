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
 * Zvon Music Bot Example
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
let isProcessing = false;
let lastUsedChannelId = null;
let volume = 1.0;
let loopMode = false; // false, 'track', 'queue'
let currentTrackStartTs = 0;
let currentTrackOffset = 0;
let currentPlayerMessageId = null;
let playerUpdateInterval = null;

const yandexClient = new YandexMusicClient({
    // We don't use the TOKEN field because the library adds a "Bearer " prefix.
    // Yandex expects "OAuth " for tokens starting with y0__.
    HEADERS: {
        'Authorization': `OAuth ${YANDEX_TOKEN}`,
        'X-Yandex-Music-Client': 'Android/14562',
        'User-Agent': 'YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)'
    },
    BASE: "https://api.music.yandex.net"
});

socket.on("connect", () => {
    console.log("Music Bot Connected to Zvon!");
    // Verify Yandex Auth & Plus Status
    yandexClient.account.getAccountStatus()
        .then(res => {
            const result = res.result || {};
            const acc = result.account || {};
            const plus = result.plus || result.subscription || {};

            const hasPlus = !!(plus.hasPlus || plus.can_play || result.permissions?.values?.includes('landing-play'));
            const uid = acc.uid || result.uid;
            const login = acc.login || result.login;

            console.log(`[Yandex] Logged in as: ${login || 'User'} (UID: ${uid || '?'})`);
            console.log(`[Yandex] Plus Subscription: ${hasPlus ? "✅ ACTIVE" : "❌ INACTIVE"}`);

            if (!hasPlus) {
                console.log("[Yandex] NOTICE: If Plus is active on your account, the token might be limited or Guest.");
            }
        })
        .catch(err => console.error(`[Yandex] Auth failed: ${err.message}`));
});

socket.on("connect_error", (err) => console.error("Socket Connection Error:", err.message));

socket.on("ready", async (data) => {
    socket.userId = data.userId;
    try {
        const res = await axios.get(`${SERVER_URL}/api/servers/me`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        const servers = res.data;
        for (const server of servers) {
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
    const deviceId = crypto.randomBytes(16).toString('hex');
    
    try {
        // Try getting download info with Device ID
        let infoRes;
        try {
            infoRes = await yandexClient.tracks.getDownloadInfo(id);
        } catch (e) {
            infoRes = await yandexClient.tracksGetDownloadInfo({ trackId: id });
        }

        if (!infoRes.result || infoRes.result.length === 0) throw new Error("No download info");

        // Prefer higher bitrates, and non-preview tracks
        const sortedInfo = infoRes.result.sort((a, b) => b.bitrateKbps - a.bitrateKbps);
        const info = sortedInfo.find(i => i.codec === 'mp3' && !i.preview) || sortedInfo[0];

        const headers = {
            'Authorization': `OAuth ${YANDEX_TOKEN}`,
            'User-Agent': 'YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)',
            'X-Yandex-Music-Client': 'Android/14562',
            'X-Yandex-Music-Device': deviceId
        };

        try {
            const downloadUrl = info.downloadInfoUrl + (info.downloadInfoUrl.includes('?') ? '&' : '?') + "format=json";
            const directRes = await axios.get(downloadUrl, { headers, timeout: 5000 });

            if (directRes.data && directRes.data.host) {
                const { host, path, ts, s } = directRes.data;
                const sign = crypto.createHash('md5').update('XGRwNC9wZnduYm9n' + path.substring(1) + s).digest('hex');
                const finalUrl = `https://${host}/get-mp3/${sign}/${ts}${path}`;

                // Final head check
                try {
                    await axios.head(finalUrl, { timeout: 3000, headers: { ...headers, 'Range': 'bytes=0-100' } });
                    return finalUrl;
                } catch (headErr) {
                    if (headErr.response?.status === 403 && attempt < 2) {
                        return await getTrackUrlCustom(trackId, attempt + 1);
                    }
                    throw headErr;
                }
            }
        } catch (e) {
            // Mirror failed, try library fallback
            try {
                const libUrl = await getTrackUrl(yandexClient, id);
                if (libUrl) return libUrl;
            } catch (le) {}
            throw e;
        }
    } catch (err) {
        if (attempt < 2) return await getTrackUrlCustom(trackId, attempt + 1);
        throw new Error(`Track ${id} error: ${err.message}`);
    }
}

async function startPlayback(channelId, offset = 0) {
    // 1. Force kill existing process to prevent overlap
    if (currentFFmpeg) {
        console.log("[Playback] Killing old FFmpeg before starting new track...");
        currentFFmpeg.removeAllListeners('close'); // Important: don't let old close trigger next track
        currentFFmpeg.kill();
        currentFFmpeg = null;
    }

    if (currentIndex < 0 || currentIndex >= playlistQueue.length) {
        isPlaying = false;
        isProcessing = false;
        stopMusic();
        return;
    }

    const track = playlistQueue[currentIndex];
    isPlaying = true;
    currentTrackOffset = offset;
    currentTrackStartTs = Date.now();

    if (playerUpdateInterval) clearInterval(playerUpdateInterval);

    try {
        const link = await getTrackUrlCustom(track.id);

        const embedData = getPlayerEmbed();
        if (offset === 0) {
            if (currentPlayerMessageId) {
                // UPDATE existing message instead of deleting
                socket.emit("edit-message", {
                    messageId: currentPlayerMessageId,
                    channelId: lastUsedChannelId,
                    ...embedData
                });
            } else {
                // Send new one if not exists
                socket.emit("send-message", {
                    channelId: lastUsedChannelId,
                    ...embedData
                }, (res) => {
                    if (res?.messageId) currentPlayerMessageId = res.messageId;
                });
            }
        }

        playerUpdateInterval = setInterval(() => {
            refreshPlayerMessage();
        }, 10000);

        await playTrackStream(link, channelId, offset);
    } catch (err) {
        console.error("Playback Error:", err.message);
        socket.emit("send-message", { content: `❌ Ошибка: ${err.message}`, channelId: lastUsedChannelId });
        skipTrack(channelId);
    } finally {
        isProcessing = false;
    }
}

function getPlayerEmbed() {
    if (currentIndex < 0 || currentIndex >= playlistQueue.length) return {};
    const track = playlistQueue[currentIndex];
    const elapsedMs = (Date.now() - currentTrackStartTs) + (currentTrackOffset * 1000);
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const totalSec = Math.floor(track.durationMs / 1000);

    const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    return {
        embeds: [{
            title: track.title,
            url: `https://music.yandex.ru/album/${track.albums?.[0]?.id}/track/${track.id}`,
            author: { name: "Сейчас играет" },
            description: `**${track.artists?.[0]?.name || 'Unknown Artist'}**`,
            thumbnail: { url: track.coverUri ? `https://${track.coverUri.replace('%%', '200x200')}` : undefined },
            color: "#00e5ff",
            fields: [
                { name: "Громкость", value: `🔊 **${Math.round(volume * 100)}%**`, inline: true },
                { name: "Очередь", value: `📜 **${playlistQueue.length} треков**`, inline: true },
                { name: "Режим", value: loopMode ? "🔂 **Закольцовано**" : "🔁 **Плейлист**", inline: true }
            ],
            footer: {
                text: `Яндекс Музыка • ${formatTime(elapsedSec)} - ${formatTime(totalSec)}`,
                icon_url: "https://music.yandex.ru/favicon.ico"
            }
        }],
        buttons: [
            { label: "🔀", actionId: "shuffle_queue", style: "secondary", row: 1 },
            { label: "🔉", actionId: "vol_down", style: "secondary", row: 1 },
            { label: `${Math.round(volume * 100)}%`, actionId: "vol_reset", style: "secondary", row: 1 },
            { label: "🔊", actionId: "vol_up", style: "secondary", row: 1 },
            { label: loopMode ? "🔂" : "🔁", actionId: "loop_mode", style: loopMode ? "success" : "secondary", row: 1 },
            
            { label: "⏪", actionId: "rewind", style: "secondary", row: 2 },
            { label: "⏮️", actionId: "prev_track", style: "secondary", row: 2 },
            { label: "⏸️", actionId: "stop_track", style: "secondary", row: 2 },
            { label: "⏭️", actionId: "skip_track", style: "secondary", row: 2 },
            { label: "⏩", actionId: "fast_forward", style: "secondary", row: 2 },

            { label: "➕", actionId: "add_fav", style: "success", row: 3 },
            { label: "📜", actionId: "queue_view", style: "secondary", row: 3 },
            { label: "AΞ", actionId: "lyrics", style: "secondary", row: 3 },
            { label: "⏹️", actionId: "stop_music", style: "secondary", row: 3 },
            { label: "🚪", actionId: "leave_voice", style: "danger", row: 3 }
        ]
    };
}

function refreshPlayerMessage() {
    if (!currentPlayerMessageId || !isPlaying) return;
    const embedData = getPlayerEmbed();
    socket.emit("edit-message", {
        messageId: currentPlayerMessageId,
        channelId: lastUsedChannelId,
        ...embedData
    });
}

function skipTrack(channelId) {
    if (loopMode === 'track') {
        // Just restart same track
        if (currentFFmpeg) currentFFmpeg.kill();
        else startPlayback(channelId);
        return;
    }

    if (currentIndex < playlistQueue.length - 1) {
        if (currentFFmpeg) {
            currentFFmpeg.kill();
        } else {
            currentIndex++;
            startPlayback(channelId);
        }
    } else if (loopMode === 'queue') {
        currentIndex = 0;
        if (currentFFmpeg) currentFFmpeg.kill();
        else startPlayback(channelId);
    } else {
        stopMusic();
    }
}

function prevTrack(channelId) {
    if (currentIndex > 0) {
        currentIndex--;
        if (currentFFmpeg) currentFFmpeg.kill();
        else startPlayback(channelId);
    }
}

function shuffleQueue() {
    for (let i = playlistQueue.length - 1; i > currentIndex + 1; i--) {
        const j = Math.floor(Math.random() * (i - currentIndex)) + currentIndex + 1;
        [playlistQueue[i], playlistQueue[j]] = [playlistQueue[j], playlistQueue[i]];
    }
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
            socket.emit("join-voice-channel", { channelId: voiceChannel._id });
            socket.voiceChannelId = voiceChannel._id;

            let added = [];
            if (query.includes("playlists/") || query.includes("album/")) {
                const cleanUrl = query.split('?')[0].split('#')[0];
                let res = null;
                let uniqueIds = [];

                try {
                    // 1. ALBUM HANDLING
                    if (query.includes("album/")) {
                        const albumId = cleanUrl.split("album/")[1].split("/")[0];
                        const trackMatch = cleanUrl.match(/\/track\/(\d+)/);
                        const trackIdInUrl = trackMatch ? trackMatch[1] : null;

                        let albumRes;
                        try {
                            // Try multiple variations of generated API
                            if (yandexClient.albums?.getAlbumDirect) albumRes = await yandexClient.albums.getAlbumDirect(albumId);
                            else if (yandexClient.albumsGetAlbumWithTracks) albumRes = await yandexClient.albumsGetAlbumWithTracks({ albumId });
                            else if (yandexClient.getAlbumWithTracks) albumRes = await yandexClient.getAlbumWithTracks({ albumId });
                            else {
                                // Search fallback
                                const sRes = await yandexClient.search.search(albumId, 0, 'album');
                                const album = sRes.result.albums?.results?.[0];
                                if (!album) throw new Error("Альбом не найден");
                                try { albumRes = await yandexClient.albums.getAlbumDirect(album.id.toString()); } catch(e) {
                                    albumRes = { result: album };
                                }
                            }
                        } catch (e) {
                            console.log(`[Yandex] Album fetch failed, trying generic search fallback for ID: ${albumId}`);
                            const sRes = await yandexClient.search.search(albumId, 0, 'album');
                            const album = sRes.result.albums?.results?.find(a => a.id.toString() === albumId) || sRes.result.albums?.results?.[0];
                            if (!album) throw new Error("Альбом не найден через поиск");
                            albumRes = { result: album };
                        }
                        
                        const allTracks = (albumRes.result.volumes?.[0] || []);
                        let tracks = allTracks;
                        
                        if (trackIdInUrl) {
                            const specific = allTracks.find(t => t.id.toString() === trackIdInUrl);
                            if (specific) tracks = [specific];
                        }

                        res = {
                            result: {
                                tracks: tracks.map(t => ({ track: t })),
                                title: albumRes.result.title,
                                coverUri: albumRes.result.coverUri
                            }
                        };
                    }
                    // 2. PLAYLIST HANDLING
                    else if (query.includes("playlists/")) {
                        const parts = cleanUrl.split("/");
                        const kind = parts[parts.indexOf("playlists") + 1];
                        let owner = null;
                        if (query.includes("/users/")) owner = parts[parts.indexOf("users") + 1];

                        // Attempt API
                        if (owner && kind) {
                            try { res = await yandexClient.playlists.getPlaylistById(owner, kind); } catch (e) { }
                        }
                        if (!res?.result?.tracks?.length) {
                            const sRes = await yandexClient.search.search(kind, 0, 'playlist');
                            const disc = sRes.result.playlists?.results?.find(p => p.playlistUuid === kind || p.kind.toString() === kind);
                            if (disc) res = await yandexClient.playlists.getPlaylistById(disc.owner.uid || disc.owner.login, disc.kind);
                        }

                        // 3. SCRAPER FALLBACK (only for playlists)
                        if (!res?.result?.tracks?.length) {
                            console.log(`[Yandex] API failed, trying Scraper for: ${cleanUrl}`);
                            let scrapedHtml = null;
                            const tryScrape = async (userAgent) => {
                                try {
                                    const hRes = await axios.get(cleanUrl, {
                                        headers: {
                                            'User-Agent': userAgent,
                                            'Referer': 'https://music.yandex.ru/',
                                            'Cookie': 'yandexuid=1;' // Some basic cookie might help
                                        },
                                        timeout: 8000
                                    });
                                    const html = hRes.data;

                                    // Try to find owner and kind in the JS state
                                    const ownerMatch = html.match(/"owner":\s*\{\s*"login":\s*"(.*?)"/);
                                    const kindMatch = html.match(/"kind":\s*(\d+)/) || html.match(/"playlistUuid":\s*"(.*?)"/);

                                    if (ownerMatch && kindMatch) {
                                        const foundOwner = ownerMatch[1];
                                        const foundKind = kindMatch[1];
                                        console.log(`[Yandex] Scraper found owner: ${foundOwner}, kind: ${foundKind}`);
                                        const apiRes = await yandexClient.playlists.getPlaylistById(foundOwner, foundKind);
                                        if (apiRes?.result?.tracks?.length) {
                                            return { res: apiRes, html };
                                        }
                                    }

                                    // Fallback to track ID extraction if API fails again
                                    const nextDataChunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/g)];
                                    let tIds = [];
                                    nextDataChunks.forEach(chunk => {
                                        const decoded = chunk[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                                        const matches = [...decoded.matchAll(/"trackId":(\d+)/g)].map(m => m[1]);
                                        tIds.push(...matches);
                                    });

                                    if (tIds.length === 0) {
                                        tIds = [...html.matchAll(/\/track\/(\d+)/g)].map(m => m[1]);
                                        tIds.push(...[...html.matchAll(/"id":"(\d+)"/g)].map(m => m[1]));
                                    }

                                    const uniqueIds = [...new Set(tIds)].filter(id => id.length >= 5);
                                    return { ids: uniqueIds, html };
                                } catch (e) {
                                    console.error("[Yandex] Scrape attempt error:", e.message);
                                    return { ids: [], html: "" };
                                }
                            };

                            let sResult = await tryScrape('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

                            if (sResult.res) {
                                res = sResult.res;
                                scrapedHtml = sResult.html;
                            } else if (sResult.ids?.length > 0) {
                                const trks = await yandexClient.tracks.getTracks({ 'track-ids': sResult.ids.slice(0, 300) });
                                res = {
                                    result: {
                                        tracks: trks.result.map(t => ({ track: t })),
                                        title: sResult.html.match(/<title>(.*?)<\/title>/)?.[1]?.split(/[—-]/)[0]?.trim() || "Плейлист"
                                    }
                                };
                            } else {
                                // Try one more time with mobile user agent
                                sResult = await tryScrape('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1');
                                if (sResult.res) {
                                    res = sResult.res;
                                } else if (sResult.ids?.length > 0) {
                                    const trks = await yandexClient.tracks.getTracks({ 'track-ids': sResult.ids.slice(0, 300) });
                                    res = {
                                        result: {
                                            tracks: trks.result.map(t => ({ track: t })),
                                            title: sResult.html.match(/<title>(.*?)<\/title>/)?.[1]?.split(/[—-]/)[0]?.trim() || "Плейлист"
                                        }
                                    };
                                }
                            }
                        }
                    }

                    if (!res?.result?.tracks?.length) throw new Error("Плейлист пуст или недоступен.");

                    added = res.result.tracks.map(t => {
                        const trk = t.track || t;
                        return { ...trk, id: trk.id.toString().split(':')[0] };
                    });
                    socket.emit("send-message", {
                        channelId: msg.channel,
                        embeds: [{
                            title: "Добавлены треки из плейлиста",
                            description: `**${res.result.title || 'Плейлист'}**`,
                            color: "#ffca28",
                            thumbnail: { url: res.result.coverUri ? `https://${res.result.coverUri.replace('%%', '200x200')}` : undefined },
                            fields: [
                                { name: "Добавлено треков", value: added.length.toString(), inline: true },
                                { name: "Всего треков", value: playlistQueue.length.toString(), inline: true }
                            ],
                            footer: { text: "Чтобы добавить больше треков, введите количество треков в аргумент \"количество\"." }
                        }]
                    });
                } catch (e) {
                    console.error("[Yandex] Load error:", e.message);
                    throw new Error(`Ошибка загрузки: ${e.message}`);
                }
            } else {
                const sRes = await yandexClient.search.search(query, 0, 'all');
                const t = sRes.result.tracks?.results?.find(trk => trk.durationMs > 40000) || sRes.result.tracks?.results?.[0];
                if (!t) throw new Error("Не найдено.");
                added = [{ ...t, id: t.id.toString().split(':')[0] }];
            }

            playlistQueue.push(...added);
            if (!isPlaying && !isProcessing) { 
                isProcessing = true;
                currentIndex = playlistQueue.length - added.length; 
                startPlayback(voiceChannel._id); 
            }
        } catch (err) { 
            isProcessing = false;
            socket.emit("send-message", { content: `❌ ${err.message}`, channelId: msg.channel }); 
        }
    }

    if (content === "!skip") skipTrack(voiceChannel?._id);
    if (content === "!prev") prevTrack(voiceChannel?._id);
    if (content === "!shuffle") {
        shuffleQueue();
        socket.emit("send-message", { content: "🔀 Очередь перемешана.", channelId: msg.channel });
    }
    if (content === "!queue") {
        const qText = playlistQueue.slice(currentIndex, currentIndex + 10).map((t, i) => `${i + currentIndex + 1}. ${t.title}`).join("\n");
        socket.emit("send-message", { content: `📋 **Очередь:**\n${qText}${playlistQueue.length > 10 ? "\n..." : ""}`, channelId: msg.channel });
    }
    if (content === "!stop") {
        stopMusic();
        socket.emit("send-message", { content: "⏹️ Остановлено.", channelId: msg.channel });
    }

    if (content === "!help") {
        axios.post(`${SERVER_URL}/api/webhooks/${TOKEN}/${msg.channel}`, {
            content: "👋 Привет! Я **Zvon Music Bot**!\n\nТеперь у меня есть **Интерактивные Кнопки**! Они появляются под каждым играющим треком.\n\n**Команды:**\n- `!play <Поиск или ссылка>`: Включить трек или плейлист (Yandex Music)\n- `!skip`: Следующий трек\n- `!prev`: Предыдущий трек\n- `!stop`: Остановить и выйти\n- `!queue`: Показать очередь\n- `!shuffle`: Перемешать",
            buttons: [
                { label: "⏮️ Prev", actionId: "prev_track", style: "secondary" },
                { label: "⏹️ Stop", actionId: "stop_track", style: "danger" },
                { label: "⏭️ Skip", actionId: "skip_track", style: "primary" },
                {
                    label: "Наш GitHub",
                    url: "https://github.com/vlyne/zvon",
                    style: "secondary"
                }
            ]
        }).catch(err => console.error("Webhook help error:", err.message));
    }
});

socket.on("interactive-button-click", async (data) => {
    if (!socket.voiceChannelId) return;

    const channelId = socket.voiceChannelId;
    const { actionId, user } = data;

    if (actionId === "skip_track") {
        skipTrack(channelId);
    } else if (actionId === "prev_track") {
        prevTrack(channelId);
    } else if (actionId === "stop_track" || actionId === "stop_music") {
        stopMusic();
    } else if (actionId === "leave_voice") {
        stopMusic();
    } else if (actionId === "shuffle_queue") {
        shuffleQueue();
        refreshPlayerMessage();
    } else if (actionId === "vol_up") {
        volume = Math.min(volume + 0.1, 2.0);
        refreshPlayerMessage();
    } else if (actionId === "vol_down") {
        volume = Math.max(volume - 0.1, 0.1);
        refreshPlayerMessage();
    } else if (actionId === "vol_reset") {
        volume = 1.0;
        refreshPlayerMessage();
    } else if (actionId === "loop_mode") {
        loopMode = !loopMode;
        refreshPlayerMessage();
    } else if (actionId === "fast_forward") {
        const elapsed = (Date.now() - currentTrackStartTs) / 1000;
        const newOffset = Math.floor(currentTrackOffset + elapsed + 20);
        if (currentIndex >= 0) startPlayback(channelId, newOffset);
    } else if (actionId === "rewind") {
        const elapsed = (Date.now() - currentTrackStartTs) / 1000;
        const newOffset = Math.max(0, Math.floor(currentTrackOffset + elapsed - 20));
        if (currentIndex >= 0) startPlayback(channelId, newOffset);
    } else if (actionId === "queue_view") {
        const qText = playlistQueue.slice(currentIndex + 1, currentIndex + 11).map((t, i) => `${i + 1}. **${t.title}**`).join("\n") || "Очередь пуста.";
        socket.emit("send-message", { 
            channelId: lastUsedChannelId,
            embeds: [{ title: "📋 Очередь", description: qText, color: "#99AAB5" }]
        });
    } else if (actionId === "lyrics") {
        const track = playlistQueue[currentIndex];
        if (!track) return;
        try {
            const lRes = await yandexClient.tracks.getTrackLyrics(track.id);
            const lyrics = lRes.result?.lyrics?.fullLyrics || "Текст песни отсутствует.";
            socket.emit("send-message", {
                channelId: lastUsedChannelId,
                embeds: [{ title: `🎤 Текст: ${track.title}`, description: lyrics.substring(0, 1500), color: "#00e5ff" }]
            });
        } catch (e) {
            socket.emit("send-message", { content: "❌ Не удалось загрузить текст.", channelId: lastUsedChannelId });
        }
    }
});

// --- CORE STREAMING LOGIC ---

async function playTrackStream(url, channelId, offset = 0) {
    try {
        if (!livekitRoom) {
            const tokenRes = await axios.get(`${SERVER_URL}/api/livekit/token`, {
                params: { roomName: `channel-${channelId}`, identity: socket.userId },
                headers: { Authorization: `Bearer ${TOKEN}` }
            });
            livekitRoom = new Room();
            await livekitRoom.connect(tokenRes.data.serverUrl, tokenRes.data.token);

            let retry = 0;
            while (!livekitRoom.localParticipant && retry < 10) {
                await new Promise(r => setTimeout(r, 500));
                if (!livekitRoom) return; // Disconnected while waiting
                retry++;
            }

            if (!livekitRoom || !livekitRoom.localParticipant) return;

            audioSource = new AudioSource(48000, 1);
            audioTrack = LocalAudioTrack.createAudioTrack("music", audioSource);
            await livekitRoom.localParticipant.publishTrack(audioTrack, { source: TrackSource.SOURCE_MICROPHONE, stream: 'music', dtx: true });
        }

        const ffmpeg = spawn("ffmpeg", [
            "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
            "-analyzeduration", "1000000", "-probesize", "1000000",
            "-ss", offset.toString(),
            "-user_agent", "YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)", "-re", "-i", url, "-f", "s16le", "-ar", "48000", "-ac", "1", "pipe:1"
        ]);
        currentFFmpeg = ffmpeg;

        let audioBuffer = Buffer.alloc(0);
        const FRAME_SIZE = 960 * 2;

        ffmpeg.stdout.on("data", async (chunk) => {
            // Apply volume transformation
            const int16Array = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
            for (let i = 0; i < int16Array.length; i++) {
                int16Array[i] = Math.max(-32768, Math.min(32767, int16Array[i] * volume));
            }
            
            audioBuffer = Buffer.concat([audioBuffer, chunk]);
            while (audioBuffer.length >= FRAME_SIZE) {
                const frameData = audioBuffer.slice(0, FRAME_SIZE);
                audioBuffer = audioBuffer.slice(FRAME_SIZE);
                const freshBuffer = Buffer.alloc(FRAME_SIZE);
                frameData.copy(freshBuffer);
                const int16Array = new Int16Array(freshBuffer.buffer, 0, freshBuffer.length / 2);
                const frame = new AudioFrame(int16Array, 48000, 1, int16Array.length);
                try { await audioSource.captureFrame(frame); } catch (e) { }
            }
        });

        ffmpeg.on("close", (code) => {
            // Only trigger next track if THIS ffmpeg is still the current one
            if (currentFFmpeg === ffmpeg) {
                currentFFmpeg = null;
                if (isPlaying) {
                    currentIndex++;
                    startPlayback(channelId);
                }
            }
        });

    } catch (err) {
        console.error("playTrackStream Error:", err.message);
        throw err;
    }
}

function stopMusic() {
    isPlaying = false;
    if (playerUpdateInterval) {
        clearInterval(playerUpdateInterval);
        playerUpdateInterval = null;
    }
    if (currentPlayerMessageId) {
        socket.emit("delete-message", { messageId: currentPlayerMessageId });
        currentPlayerMessageId = null;
    }
    if (currentFFmpeg) {
        currentFFmpeg.kill();
        currentFFmpeg = null;
    }
    if (livekitRoom) {
        livekitRoom.disconnect();
        livekitRoom = null;
    }
    if (socket.voiceChannelId) {
        socket.emit("leave-voice-channel", { channelId: socket.voiceChannelId });
        socket.voiceChannelId = null;
    }
}
