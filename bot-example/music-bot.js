const { io } = require("socket.io-client");
const axios = require("axios");
const { spawn } = require("child_process");
const {
    AccessToken,
    TrackSource,
    TrackKind,
    LocalAudioTrack,
    AudioFrame
} = require("@livekit/rtc-node"); // Note: Requires @livekit/rtc-node to be installed

/**
 * Zvon Music Bot Example
 * 
 * IMPORTANT: This bot requires 'ffmpeg' installed on your system to decode audio.
 * It also requires '@livekit/rtc-node' and 'socket.io-client'.
 * 
 * To install requirements:
 * 1. Install ffmpeg: https://ffmpeg.org/download.html
 * 2. npm install @livekit/rtc-node socket.io-client axios
 */

const TOKEN = "bot_e43739c7bbfdb16d40fb58062c9038b0ebc07742b8b0bbeb45a2001a05747861";
const SERVER_URL = "https://zvonserver.ru";

console.log("Starting music bot...");
const socket = io(SERVER_URL, {
    auth: { token: TOKEN }
});

let livekitRoom = null;
let audioTrack = null;

socket.on("connect", () => {
    console.log("Music Bot Connected to Zvon!");
});

socket.on("ready", async (data) => {
    socket.userId = data.userId;
    console.log("Bot User ID:", socket.userId);

    try {
        // Fetch all servers the bot is in
        const res = await axios.get(`${SERVER_URL}/api/servers/me`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        const servers = res.data;
        console.log(`Bot is in ${servers.length} servers.`);

        for (const server of servers) {
            console.log(`Joining server: ${server.name}`);
            socket.emit("join-server", server._id);

            for (const channel of server.channels) {
                if (channel.type === "text") {
                    console.log(`Joining text channel: ${channel.name} (${channel._id})`);
                    socket.emit("join-channel", channel._id);
                }
            }
        }
    } catch (err) {
        console.error("Error fetching servers:", err.message);
        if (err.response) {
            console.error("Server response:", err.response.data);
        }
    }
});

socket.on("connect_error", (err) => {
    console.error("Socket Connection Error:", err.message);
});

const YANDEX_TOKEN = "y0__xDvo5iwBBje-AYghJDMnxYwjqm0hQhXgYlVwLXfMHVMjTu7ZEZPKDY4SA";
const { YandexMusicClient } = require("yandex-music-client"); // npm install yandex-music-client

const yandexClient = new YandexMusicClient({
    token: YANDEX_TOKEN
});

socket.on("new-message", async (msg) => {
    console.log(`[Debug] Message received from ${msg.author.username}: ${msg.content}`);
    if (msg.author._id === socket.userId) return;

    const content = msg.content.trim();
    console.log(`[Debug] Processing command: ${content}`);

    // Command: !play <url>
    if (content.startsWith("!play ")) {
        const query = content.replace("!play ", "");

        // 1. Join the voice channel if user is in one
        // In a real bot, we'd find which channel the user is in.
        // For this demo, let's assume we need to join a specific channel or get it from context.

        socket.emit("send-message", {
            content: `🔍 Ищу в Яндекс.Музыке: ${query}...`,
            channelId: msg.channel,
            dmId: msg.directMessage
        });

        try {
            let streamUrl = "";
            let trackInfo = "";

            // Поиск трека
            const searchResult = await yandexClient.search(query);
            const track = searchResult.tracks?.results?.[0];

            if (!track) {
                throw new Error("Трек не найден");
            }

            // Получаем ссылку на поток
            const downloadInfo = await yandexClient.getTrackDownloadInfo(track.id);
            // Выбираем лучшее качество (обычно последний в списке)
            const directLink = await yandexClient.getTrackDirectLink(downloadInfo[downloadInfo.length - 1].downloadInfoUrl);

            streamUrl = directLink;
            trackInfo = `${track.artists[0].name} - ${track.title}`;

            await playMusic(streamUrl, msg.channel);

            socket.emit("send-message", {
                content: `🎶 Сейчас играет: **${trackInfo}**`,
                channelId: msg.channel
            });
        } catch (err) {
            console.error(err);
            socket.emit("send-message", {
                content: `❌ Ошибка: ${err.message}`,
                channelId: msg.channel
            });
        }
    }

    // Command: !stop
    if (content === "!stop") {
        stopMusic();
        socket.emit("send-message", {
            content: "⏹️ Воспроизведение остановлено.",
            channelId: msg.channel
        });
    }
});

async function playMusic(url, channelId) {
    // 1. Get LiveKit Token from Zvon Server
    // We need roomName. For Zvon, it's usually `channel-ID`
    const roomName = `channel-${channelId}`;
    const tokenRes = await axios.get(`${SERVER_URL}/api/livekit/token`, {
        params: { roomName, identity: socket.userId },
        headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const { token, serverUrl } = tokenRes.data;

    // 2. Connect to LiveKit via rtc-node
    const { Room } = require("@livekit/rtc-node");
    livekitRoom = new Room();
    await livekitRoom.connect(serverUrl, token);

    // 3. Create Audio Track
    audioTrack = await LocalAudioTrack.createAudioTrack("music", {
        source: TrackSource.MICROPHONE, // Use mic source for voice channel
    });

    await livekitRoom.localParticipant.publishTrack(audioTrack);

    // 4. Start FFmpeg to decode stream to PCM
    // We need 48kHz, Mono (LiveKit standard)
    const ffmpeg = spawn("ffmpeg", [
        "-i", url,
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "1",
        "pipe:1"
    ]);

    ffmpeg.stdout.on("data", (chunk) => {
        // Here we'd convert Buffer to AudioFrame and push to track
        // rtc-node API is specific about frames
        const frame = new AudioFrame(chunk, 48000, 1, chunk.length / 2);
        audioTrack.publishFrame(frame);
    });

    ffmpeg.on("close", () => {
        console.log("FFmpeg stream ended");
    });

    livekitRoom.on("disconnected", () => {
        ffmpeg.kill();
    });
}

function stopMusic() {
    if (livekitRoom) {
        livekitRoom.disconnect();
        livekitRoom = null;
    }
}
