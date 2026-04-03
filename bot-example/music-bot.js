const { io } = require("socket.io-client");
const axios = require("axios");
const { spawn } = require("child_process");
const {
    Room,
    LocalAudioTrack,
    AudioSource,
    AudioFrame,
    TrackSource
} = require("@livekit/rtc-node");
const { YandexMusicClient } = require("yandex-music-client");
const { getTrackUrl } = require("yandex-music-client/trackUrl");
const crypto = require('crypto');

const YANDEX_TOKEN = "y0__xDvo5iwBBje-AYghJDMnxYwjqm0hQhXgYlVwLXfMHVMjTu7ZEZPKDY4SA";
const TOKEN = "bot_e43739c7bbfdb16d40fb58062c9038b0ebc07742b8b0bbeb45a2001a05747861";
const SERVER_URL = "https://zvonserver.ru";

console.log("Starting Multi-Instance Zvon Music Bot...");

const socket = io(SERVER_URL, {
    auth: { token: TOKEN }
});

const yandexClient = new YandexMusicClient({
    HEADERS: {
        'Authorization': `OAuth ${YANDEX_TOKEN}`,
        'X-Yandex-Music-Client': 'Android/14562',
        'User-Agent': 'YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)'
    },
    BASE: "https://api.music.yandex.net"
});

// Bot Global State
let botServers = new Map();
let serverVoiceStates = new Map(); // serverId -> { channelId -> [userIds] }
let players = new Map(); // channelId -> Player instance

class Player {
    constructor(channelId, textChannelId) {
        this.channelId = channelId;
        this.textChannelId = textChannelId;
        this.livekitRoom = null;
        this.audioSource = null;
        this.audioTrack = null;
        this.currentFFmpeg = null;
        this.playlistQueue = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.isProcessing = false;
        this.volume = 1.0;
        this.loopMode = false;
        this.isShuffleMode = false;
        this.currentTrackStartTs = 0;
        this.currentTrackOffset = 0;
        this.currentPlayerMessageId = null;
        this.playerUpdateInterval = null;
    }

    async startPlayback(offset = 0) {
        if (this.currentFFmpeg) {
            console.log(`[Playback:${this.channelId}] Killing old FFmpeg...`);
            this.currentFFmpeg.removeAllListeners('close');
            this.currentFFmpeg.kill();
            this.currentFFmpeg = null;
        }

        if (this.currentIndex < 0 || this.currentIndex >= this.playlistQueue.length) {
            this.isPlaying = false;
            this.isProcessing = false;
            this.stopMusic();
            return;
        }

        const track = this.playlistQueue[this.currentIndex];
        this.isPlaying = true;
        this.currentTrackOffset = offset;
        this.currentTrackStartTs = Date.now();

        if (this.playerUpdateInterval) clearInterval(this.playerUpdateInterval);

        try {
            const link = await getTrackUrlCustom(track.id);
            const embedData = this.getPlayerEmbed();

            if (offset === 0) {
                if (this.currentPlayerMessageId) {
                    socket.emit("edit-message", {
                        messageId: this.currentPlayerMessageId,
                        channelId: this.textChannelId,
                        ...embedData
                    });
                } else {
                    socket.emit("send-message", {
                        channelId: this.textChannelId,
                        ...embedData
                    }, (res) => {
                        if (res?.messageId) this.currentPlayerMessageId = res.messageId;
                    });
                }
            }

            this.playerUpdateInterval = setInterval(() => this.refreshPlayerMessage(), 10000);
            await this.playTrackStream(link, offset);
        } catch (err) {
            console.error(`[Playback:${this.channelId}] Error:`, err.message);
            socket.emit("send-message", { content: `❌ Ошибка: ${err.message}`, channelId: this.textChannelId });
            this.skipTrack();
        } finally {
            this.isProcessing = false;
        }
    }

    getPlayerEmbed() {
        if (this.currentIndex < 0 || this.currentIndex >= this.playlistQueue.length) return {};
        const track = this.playlistQueue[this.currentIndex];
        const elapsedMs = (Date.now() - this.currentTrackStartTs) + (this.currentTrackOffset * 1000);
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
                    { name: "Громкость", value: `🔊 **${Math.round(this.volume * 100)}%**`, inline: true },
                    { name: "Очередь", value: `📜 **${this.playlistQueue.length} треков**`, inline: true },
                    { name: "Режим", value: this.loopMode ? "🔂 **Закольцовано**" : "🔁 **Плейлист**", inline: true }
                ],
                footer: {
                    text: `Яндекс Музыка • ${formatTime(elapsedSec)} - ${formatTime(totalSec)}`,
                    icon_url: "https://music.yandex.ru/favicon.ico"
                }
            }],
            buttons: [
                { label: "🔀", actionId: "shuffle_queue", style: this.isShuffleMode ? "success" : "secondary", row: 1 },
                { label: "🔉", actionId: "vol_down", style: "secondary", row: 1 },
                { label: `${Math.round(this.volume * 100)}%`, actionId: "vol_reset", style: "secondary", row: 1 },
                { label: "🔊", actionId: "vol_up", style: "secondary", row: 1 },
                { label: this.loopMode ? "🔂" : "🔁", actionId: "loop_mode", style: this.loopMode ? "success" : "secondary", row: 1 },
                
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

    refreshPlayerMessage() {
        if (!this.currentPlayerMessageId || !this.isPlaying) return;
        socket.emit("edit-message", {
            messageId: this.currentPlayerMessageId,
            channelId: this.textChannelId,
            ...this.getPlayerEmbed()
        });
    }

    async playTrackStream(url, offset = 0) {
        try {
            if (!this.livekitRoom) {
                const tokenRes = await axios.get(`${SERVER_URL}/api/livekit/token`, {
                    params: { roomName: `channel-${this.channelId}`, identity: socket.userId },
                    headers: { Authorization: `Bearer ${TOKEN}` }
                });
                this.livekitRoom = new Room();
                await this.livekitRoom.connect(tokenRes.data.serverUrl, tokenRes.data.token);

                let retry = 0;
                while (!this.livekitRoom.localParticipant && retry < 10) {
                    await new Promise(r => setTimeout(r, 500));
                    if (!this.livekitRoom) return; 
                    retry++;
                }

                if (!this.livekitRoom || !this.livekitRoom.localParticipant) return;
                this.audioSource = new AudioSource(48000, 1);
                this.audioTrack = LocalAudioTrack.createAudioTrack("music", this.audioSource);
                await this.livekitRoom.localParticipant.publishTrack(this.audioTrack, { source: TrackSource.SOURCE_MICROPHONE, stream: 'music', dtx: true });
            }

            const ffmpeg = spawn("ffmpeg", [
                "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
                "-analyzeduration", "1000000", "-probesize", "1000000",
                "-ss", offset.toString(),
                "-user_agent", "YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)", "-re", "-i", url, "-f", "s16le", "-ar", "48000", "-ac", "1", "pipe:1"
            ]);
            this.currentFFmpeg = ffmpeg;

            let audioBuffer = Buffer.alloc(0);
            const FRAME_SIZE = 960 * 2;

            ffmpeg.stdout.on("data", async (chunk) => {
                const int16Array = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
                for (let i = 0; i < int16Array.length; i++) {
                    int16Array[i] = Math.max(-32768, Math.min(32767, int16Array[i] * this.volume));
                }
                
                audioBuffer = Buffer.concat([audioBuffer, chunk]);
                while (audioBuffer.length >= FRAME_SIZE) {
                    const frameData = audioBuffer.slice(0, FRAME_SIZE);
                    audioBuffer = audioBuffer.slice(FRAME_SIZE);
                    const freshBuffer = Buffer.alloc(FRAME_SIZE);
                    frameData.copy(freshBuffer);
                    const finalArray = new Int16Array(freshBuffer.buffer, 0, freshBuffer.length / 2);
                    const frame = new AudioFrame(finalArray, 48000, 1, finalArray.length);
                    try { if (this.audioSource) await this.audioSource.captureFrame(frame); } catch (e) { }
                }
            });

            ffmpeg.on("close", () => {
                if (this.currentFFmpeg === ffmpeg) {
                    this.currentFFmpeg = null;
                    if (this.isPlaying) {
                        this.currentIndex++;
                        this.startPlayback();
                    }
                }
            });
        } catch (e) { console.error(`[Stream:${this.channelId}] Error:`, e.message); }
    }

    skipTrack() {
        if (this.loopMode === 'track') {
            this.startPlayback();
            return;
        }
        if (this.currentIndex < this.playlistQueue.length - 1) {
            if (this.currentFFmpeg) this.currentFFmpeg.kill();
            else { this.currentIndex++; this.startPlayback(); }
        } else if (this.loopMode === 'queue') {
            this.currentIndex = 0;
            if (this.currentFFmpeg) this.currentFFmpeg.kill();
            else this.startPlayback();
        } else {
            this.stopMusic();
        }
    }

    prevTrack() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            if (this.currentFFmpeg) this.currentFFmpeg.kill();
            else this.startPlayback();
        }
    }

    shuffleQueue() {
        for (let i = this.playlistQueue.length - 1; i > this.currentIndex + 1; i--) {
            const j = Math.floor(Math.random() * (i - this.currentIndex)) + this.currentIndex + 1;
            [this.playlistQueue[i], this.playlistQueue[j]] = [this.playlistQueue[j], this.playlistQueue[i]];
        }
    }

    stopMusic() {
        this.isPlaying = false;
        if (this.currentFFmpeg) {
            this.currentFFmpeg.removeAllListeners('close');
            this.currentFFmpeg.kill();
            this.currentFFmpeg = null;
        }
        if (this.playerUpdateInterval) clearInterval(this.playerUpdateInterval);
        if (this.currentPlayerMessageId) {
            socket.emit("delete-message", { messageId: this.currentPlayerMessageId, channelId: this.textChannelId });
            this.currentPlayerMessageId = null;
        }
    }

    leaveVoice() {
        this.stopMusic();
        if (this.livekitRoom) {
            this.livekitRoom.disconnect();
            this.livekitRoom = null;
        }
        this.audioSource = null;
        this.audioTrack = null;
        players.delete(this.channelId);
    }
}

// --- HELPER FUNCTIONS ---

async function getTrackUrlCustom(trackId, attempt = 0) {
    const id = trackId.toString().split(':')[0];
    const deviceId = crypto.randomBytes(16).toString('hex');
    try {
        let infoRes;
        try { infoRes = await yandexClient.tracks.getDownloadInfo(id); } catch (e) { infoRes = await yandexClient.tracksGetDownloadInfo({ trackId: id }); }
        if (!infoRes.result || infoRes.result.length === 0) throw new Error("No download info");
        const sortedInfo = infoRes.result.sort((a, b) => b.bitrateKbps - a.bitrateKbps);
        const info = sortedInfo.find(i => i.codec === 'mp3' && !i.preview) || sortedInfo[0];
        const headers = {
            'Authorization': `OAuth ${YANDEX_TOKEN}`,
            'User-Agent': 'YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)',
            'X-Yandex-Music-Client': 'Android/14562',
            'X-Yandex-Music-Device': deviceId
        };
        const downloadUrl = info.downloadInfoUrl + (info.downloadInfoUrl.includes('?') ? '&' : '?') + "format=json";
        const directRes = await axios.get(downloadUrl, { headers, timeout: 5000 });
        if (directRes.data && directRes.data.host) {
            const { host, path, ts, s } = directRes.data;
            const sign = crypto.createHash('md5').update('XGRwNC9wZnduYm9n' + path.substring(1) + s).digest('hex');
            const finalUrl = `https://${host}/get-mp3/${sign}/${ts}${path}`;
            await axios.head(finalUrl, { timeout: 3000, headers: { ...headers, 'Range': 'bytes=0-100' } });
            return finalUrl;
        }
    } catch (e) {
        if (attempt < 2) return await getTrackUrlCustom(trackId, attempt + 1);
        try { return await getTrackUrl(yandexClient, id); } catch (le) {}
        throw e;
    }
}

// --- SOCKET EVENTS ---

socket.on("connect", () => console.log("Music Bot Connected!"));
socket.on("ready", async (data) => {
    socket.userId = data.userId;
    try {
        const res = await axios.get(`${SERVER_URL}/api/servers/me`, { headers: { Authorization: `Bearer ${TOKEN}` } });
        for (const server of res.data) {
            botServers.set(server._id, server);
            socket.emit("join-server", server._id);
            for (const ch of server.channels) if (ch.type === "text") socket.emit("join-channel", ch._id);
        }
    } catch (err) { console.error("Ready error:", err.message); }
});

socket.on("server-voice-states", (states) => {
    Object.keys(states).forEach(channelId => serverVoiceStates.set(channelId, states[channelId].map(u => u._id)));
});
socket.on("voice-channel-users-update", (data) => serverVoiceStates.set(data.channelId, data.users.map(u => u._id)));

socket.on("new-message", async (msg) => {
    if (msg.author._id === socket.userId) return;
    const content = msg.content.trim();
    if (!content.startsWith("!")) return;

    let targetServer = Array.from(botServers.values()).find(s => s.channels.some(c => c._id === msg.channel));
    
    if (content.startsWith("!play ")) {
        let userVoiceId = null;
        for (const [vId, uIds] of serverVoiceStates.entries()) {
            if (uIds.includes(msg.author._id) && targetServer?.channels.some(c => c._id === vId)) {
                userVoiceId = vId; break;
            }
        }
        if (!userVoiceId) return socket.emit("send-message", { content: "❌ Вы должны быть в голосовом канале!", channelId: msg.channel });

        let player = players.get(userVoiceId);
        if (!player) { player = new Player(userVoiceId, msg.channel); players.set(userVoiceId, player); }

        const query = content.replace("!play ", "").trim();
        socket.emit("join-voice-channel", { channelId: userVoiceId });

        try {
            let added = [];
            if (query.includes("playlists/") || query.includes("album/")) {
                const cleanUrl = query.split('?')[0].split('#')[0];
                let res = null;
                try {
                    // 1. ALBUM HANDLING
                    if (query.includes("album/")) {
                        const albumId = cleanUrl.split("album/")[1].split("/")[0];
                        const trackMatch = cleanUrl.match(/\/track\/(\d+)/);
                        const trackIdInUrl = trackMatch ? trackMatch[1] : null;
                        let albumRes;
                        try {
                            if (yandexClient.albums?.getAlbumDirect) albumRes = await yandexClient.albums.getAlbumDirect(albumId);
                            else if (yandexClient.albumsGetAlbumWithTracks) albumRes = await yandexClient.albumsGetAlbumWithTracks({ albumId });
                            else {
                                const sRes = await yandexClient.search.search(albumId, 0, 'album');
                                const album = sRes.result.albums?.results?.[0];
                                albumRes = { result: album };
                            }
                        } catch (e) {
                            const sRes = await yandexClient.search.search(albumId, 0, 'album');
                            const album = sRes.result.albums?.results?.[0];
                            albumRes = { result: album };
                        }
                        const allTracks = (albumRes.result.volumes?.[0] || []);
                        let tracks = allTracks;
                        if (trackIdInUrl) {
                            const specific = allTracks.find(t => t.id.toString() === trackIdInUrl);
                            if (specific) tracks = [specific];
                        }
                        res = { result: { tracks: tracks.map(t => ({ track: t })), title: albumRes.result.title, coverUri: albumRes.result.coverUri } };
                    }
                    // 2. PLAYLIST HANDLING
                    else if (query.includes("playlists/")) {
                        const parts = cleanUrl.split("/");
                        const kind = parts[parts.indexOf("playlists") + 1];
                        let owner = null;
                        if (query.includes("/users/")) owner = parts[parts.indexOf("users") + 1];
                        if (owner && kind) try { res = await yandexClient.playlists.getPlaylistById(owner, kind); } catch (e) { }
                        if (!res?.result?.tracks?.length) {
                             const sRes = await yandexClient.search.search(kind, 0, 'playlist');
                             const disc = sRes.result.playlists?.results?.[0];
                             if (disc) res = await yandexClient.playlists.getPlaylistById(disc.owner.uid || disc.owner.login, disc.kind);
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
                            title: `Загружено: ${res.result.title || 'Плейлист'}`,
                            description: `Добавлено **${added.length}** треков в очередь.`,
                            color: "#ffca28",
                            thumbnail: { url: res.result.coverUri ? `https://${res.result.coverUri.replace('%%', '200x200')}` : undefined }
                        }]
                    });
                } catch (e) { throw new Error(`Ошибка загрузки: ${e.message}`); }
            } else {
                const sRes = await yandexClient.search.search(query, 0, 'track');
                const t = sRes.result.tracks?.results?.find(trk => trk.durationMs > 30000) || sRes.result.tracks?.results?.[0];
                if (!t) throw new Error("Ничего не найдено.");
                added = [{ ...t, id: t.id.toString().split(':')[0] }];
            }

            player.playlistQueue.push(...added);
            if (!player.isPlaying && !player.isProcessing) {
                player.isProcessing = true;
                player.currentIndex = player.playlistQueue.length - added.length;
                player.startPlayback();
            }
        } catch (e) { socket.emit("send-message", { content: `❌ ${e.message}`, channelId: msg.channel }); }
    }

    if (content === "!skip") players.get(msg.channel)?.skipTrack();
    if (content === "!stop") players.get(msg.channel)?.stopMusic();
});

socket.on("interactive-button-click", async (data) => {
    const { actionId, channelId, messageId } = data;
    // Find player by messageId
    const player = Array.from(players.values()).find(p => p.currentPlayerMessageId === messageId);
    if (!player) return;

    if (actionId === "skip_track") player.skipTrack();
    else if (actionId === "prev_track") player.prevTrack();
    else if (actionId === "stop_music" || actionId === "stop_track") player.stopMusic();
    else if (actionId === "leave_voice") player.leaveVoice();
    else if (actionId === "shuffle_queue") { player.isShuffleMode = !player.isShuffleMode; if (player.isShuffleMode) player.shuffleQueue(); player.refreshPlayerMessage(); }
    else if (actionId === "vol_up") { player.volume = Math.min(player.volume + 0.1, 2.0); player.refreshPlayerMessage(); }
    else if (actionId === "vol_down") { player.volume = Math.max(player.volume - 0.1, 0.1); player.refreshPlayerMessage(); }
    else if (actionId === "vol_reset") { player.volume = 1.0; player.refreshPlayerMessage(); }
    else if (actionId === "loop_mode") { player.loopMode = !player.loopMode; player.refreshPlayerMessage(); }
    else if (actionId === "fast_forward") {
        const elapsed = (Date.now() - player.currentTrackStartTs) / 1000;
        player.startPlayback(Math.floor(player.currentTrackOffset + elapsed + 20));
    }
    else if (actionId === "rewind") {
        const elapsed = (Date.now() - player.currentTrackStartTs) / 1000;
        player.startPlayback(Math.max(0, Math.floor(player.currentTrackOffset + elapsed - 20)));
    }
    else if (actionId === "queue_view") {
        const qText = player.playlistQueue.slice(player.currentIndex + 1, player.currentIndex + 11).map((t, i) => `${i + 1}. **${t.title}**`).join("\n") || "Очередь пуста.";
        socket.emit("send-message", { channelId: player.textChannelId, embeds: [{ title: "📋 Очередь", description: qText, color: "#99AAB5" }] });
    }
    // ... lyrics etc
});
