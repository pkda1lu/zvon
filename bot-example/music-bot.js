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
let lastUsedChannelId = null;

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
    try {
        const infoRes = await yandexClient.tracks.getDownloadInfo(id);
        if (!infoRes.result || infoRes.result.length === 0) throw new Error("No download info");

        // Prefer higher bitrates, and non-preview tracks
        const sortedInfo = infoRes.result.sort((a, b) => b.bitrateKbps - a.bitrateKbps);
        const info = sortedInfo.find(i => i.codec === 'mp3' && !i.preview) || sortedInfo[0];

        const headers = {
            'Authorization': `OAuth ${YANDEX_TOKEN}`,
            'User-Agent': 'YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)',
            'X-Yandex-Music-Client': 'Android/14562'
        };

        try {
            const downloadUrl = info.downloadInfoUrl + (info.downloadInfoUrl.includes('?') ? '&' : '?') + "format=json";
            const directRes = await axios.get(downloadUrl, { headers, timeout: 5000 });

            if (directRes.data && directRes.data.host) {
                const { host, path, ts, s } = directRes.data;
                const sign = crypto.createHash('md5').update('XGRwNC9wZnduYm9n' + path.substring(1) + s).digest('hex');
                const finalUrl = `https://${host}/get-mp3/${sign}/${ts}${path}`;

                // Final head check to verify Forbidden
                try {
                    await axios.head(finalUrl, { timeout: 3000 });
                    return finalUrl;
                } catch (headErr) {
                    if (headErr.response?.status === 403 && attempt < 2) {
                        console.log(`[Yandex] Mirror Forbidden for ${id}, retrying...`);
                        return await getTrackUrlCustom(trackId, attempt + 1);
                    }
                    throw headErr;
                }
            }
            throw new Error("Invalid mirror response");
        } catch (axiosErr) {
            if (attempt < 2) {
                console.log(`[Yandex] Mirror failed for track ${id}, retry ${attempt + 1}...`);
                await new Promise(r => setTimeout(r, 1000 + (attempt * 2000)));
                return await getTrackUrlCustom(trackId, attempt + 1);
            }
            throw axiosErr;
        }
    } catch (err) {
        throw new Error(`Track ${id} error: ${err.message}`);
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
                    text: `Яндекс Музыка • Треков в очереди: ${playlistQueue.length} • Добавил: @${socket.userId.substring(0, 8)} - 00:00 - ${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}`,
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

                { label: "➕", actionId: "add_fav", style: "success", row: 3 },
                { label: "📜", actionId: "queue_view", style: "secondary", row: 3 },
                { label: "AΞ", actionId: "lyrics", style: "secondary", row: 3 },
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
        if (currentFFmpeg) {
            // Killing will trigger the 'close' event in playTrackStream, 
            // which already handles currentIndex++ and startPlayback.
            currentFFmpeg.kill();
        } else {
            currentIndex++;
            startPlayback(channelId);
        }
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
                        const albumRes = await yandexClient.albums.getAlbumWithTracks(albumId);
                        res = {
                            result: {
                                tracks: (albumRes.result.volumes?.[0] || []).map(t => ({ track: t })),
                                title: albumRes.result.title
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
            if (!isPlaying) { currentIndex = playlistQueue.length - added.length; startPlayback(voiceChannel._id); }
            else if (added.length === 1) socket.emit("send-message", { content: `➕ В очереди: **${added[0].title}**`, channelId: msg.channel });
        } catch (err) { socket.emit("send-message", { content: `❌ ${err.message}`, channelId: msg.channel }); }
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

socket.on("interactive-button-click", (data) => {
    if (!socket.voiceChannelId) return;

    const channelId = socket.voiceChannelId;
    const { actionId, user } = data;

    if (actionId === "skip_track") {
        socket.emit("send-message", { content: `⏭️ **${user.username}** пропустил трек.`, channelId: lastUsedChannelId });
        skipTrack(channelId);
    } else if (actionId === "prev_track") {
        socket.emit("send-message", { content: `⏮️ **${user.username}** включил предыдущий трек.`, channelId: lastUsedChannelId });
        prevTrack(channelId);
    } else if (actionId === "stop_track") {
        socket.emit("send-message", { content: `⏹️ **${user.username}** остановил музыку.`, channelId: lastUsedChannelId });
        stopMusic();
    } else if (actionId === "shuffle_queue") {
        shuffleQueue();
        socket.emit("send-message", { content: `🔀 **${user.username}** перемешал очередь.`, channelId: lastUsedChannelId });
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
            "-user_agent", "YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)", "-re", "-i", url, "-f", "s16le", "-ar", "48000", "-ac", "1", "pipe:1"
        ]);
        currentFFmpeg = ffmpeg;

        let audioBuffer = Buffer.alloc(0);
        const FRAME_SIZE = 960 * 2;

        ffmpeg.stdout.on("data", async (chunk) => {
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
            currentFFmpeg = null;
            // If we didn't stop manually, play next
            if (isPlaying) {
                currentIndex++;
                startPlayback(channelId);
            }
        });

    } catch (err) {
        console.error("playTrackStream Error:", err.message);
        throw err;
    }
}

function stopMusic() {
    isPlaying = false;
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
