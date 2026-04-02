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
                await new Promise(r => setTimeout(r, 1000));
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
            content: `🎶 Играет (**${currentIndex + 1}/${playlistQueue.length}**): **${track.artists?.[0]?.name || '?'} - ${track.title}**`,
            channelId: lastUsedChannelId,
            buttons: [
                { label: "⏮️ Prev", actionId: "prev_track", style: "secondary" },
                { label: "⏹️ Stop", actionId: "stop_track", style: "danger" },
                { label: "⏭️ Skip", actionId: "skip_track", style: "primary" },
                { label: "🔀 Shuffle", actionId: "shuffle_queue", style: "secondary" }
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
        currentIndex++;
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
                                const hRes = await axios.get(cleanUrl, {
                                    headers: { 'User-Agent': userAgent, 'Referer': 'https://music.yandex.ru/' }
                                });
                                const html = hRes.data;
                                const nextData = html.match(/self\.__next_f\.push\(\[1,"(.*?)",/);
                                let tIds = [];
                                if (nextData) {
                                    const decoded = nextData[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                                    tIds = [...decoded.matchAll(/"trackId":(\d+)/g)].map(m => m[1]);
                                }
                                if (tIds.length < 5) {
                                    tIds = [...html.matchAll(/\/track\/(\d+)/g)].map(m => m[1]);
                                }
                                return { ids: [...new Set(tIds)].filter(id => id.length >= 7), html };
                            };

                            let sResult = await tryScrape('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                            uniqueIds = sResult.ids;
                            scrapedHtml = sResult.html;

                            if (uniqueIds.length === 0) {
                                sResult = await tryScrape('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15');
                                uniqueIds = sResult.ids;
                                scrapedHtml = sResult.html;
                            }

                            if (uniqueIds.length > 0) {
                                const trks = await yandexClient.tracks.getTracks({ 'track-ids': uniqueIds.slice(0, 100) });
                                res = {
                                    result: {
                                        tracks: trks.result.map(t => ({ track: t })),
                                        title: scrapedHtml.match(/<title>(.*?)<\/title>/)?.[1]?.split(/[—-]/)[0]?.trim() || "Плейлист"
                                    }
                                };
                            }
                        }
                    }

                    if (!res?.result?.tracks?.length) throw new Error("Плейлист пуст или недоступен.");

                    added = res.result.tracks.map(t => {
                        const trk = t.track || t;
                        return { ...trk, id: trk.id.toString().split(':')[0] };
                    });
                    socket.emit("send-message", { content: `📂 Загружено **${added.length}** треков: **${res.result.title || 'Плейлист'}**`, channelId: msg.channel });
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
