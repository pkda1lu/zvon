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

const TOKEN = "YOUR_BOT_TOKEN_HERE";
const SERVER_URL = "http://localhost:5000";

const socket = io(SERVER_URL, {
    auth: { token: TOKEN }
});

let livekitRoom = null;
let audioTrack = null;

socket.on("connect", () => {
    console.log("Music Bot Connected to Zvon!");
});

socket.on("new-message", async (msg) => {
    if (msg.author._id === socket.userId) return;

    const content = msg.content.trim();

    // Command: !play <url>
    if (content.startsWith("!play ")) {
        const query = content.replace("!play ", "");

        // 1. Join the voice channel if user is in one
        // In a real bot, we'd find which channel the user is in.
        // For this demo, let's assume we need to join a specific channel or get it from context.

        socket.emit("send-message", {
            content: `🔍 Ищу музыку: ${query}...`,
            channelId: msg.channel,
            dmId: msg.directMessage
        });

        try {
            // Here you would use Yandex Music or VK API to get a direct MP3 link
            // For example purposes, we'll use a placeholder or a direct link if provided
            let streamUrl = query;

            if (query.includes("yandex.ru") || query.includes("vk.com")) {
                // TODO: Implement actual scraping or API call here
                // streamUrl = await getDirectLink(query);
            }

            await playMusic(streamUrl, msg.channel);

            socket.emit("send-message", {
                content: `🎶 Сейчас играет: ${query}`,
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
