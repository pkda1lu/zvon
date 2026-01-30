const { io } = require("socket.io-client");

/**
 * Zvon Bot Client Example
 * 
 * To run:
 * 1. Create a bot in the Zvon UI (or via API)
 * 2. Get the bot token
 * 3. Set the token below
 * 4. npm install socket.io-client
 * 5. node bot.js
 */

const TOKEN = "YOUR_BOT_TOKEN_HERE";
const SERVER_URL = "http://localhost:5000";

const socket = io(SERVER_URL, {
    auth: {
        token: TOKEN
    }
});

socket.on("connect", () => {
    console.log("Connected to Zvon as bot!");
    console.log("Bot ID:", socket.userId);
});

socket.on("connect_error", (err) => {
    console.error("Connection error:", err.message);
});

socket.on("new-message", (message) => {
    // If the message is from us, it might be an edit demo
    if (message.author._id === socket.userId) {
        if (message.content === 'Я сейчас изменю это сообщение...') {
            setTimeout(() => {
                socket.emit('edit-message', {
                    messageId: message._id,
                    content: 'Бум! Сообщение отредактировано ботом. ✨'
                });
            }, 2000);
        }
        return;
    }

    console.log(`New message from ${message.author.username}: ${message.content}`);

    // Join server/channel (Make sure the bot is added to the server in UI first!)
    // socket.emit('join-voice-channel', { channelId: 'CHANNEL_ID' });

    // Simple ping-pong
    if (message.content.toLowerCase() === "!ping") {
        socket.emit("send-message", {
            content: "Pong! 🏓",
            channelId: message.channel,
            dmId: message.directMessage
        });
    }

    // Example: Edit message after 2 seconds
    if (message.content.toLowerCase() === '!edit-demo') {
        // 1. Send initial message
        socket.emit('send-message', {
            content: 'Я сейчас изменю это сообщение...',
            channelId: message.channel,
            dmId: message.directMessage
        });

        // To actually edit, we'd need the message ID. 
        // In a real bot, we'd listen for 'new-message' from the server to get the ID of OUR message,
        // then call 'edit-message'.
    }

    // Help command
    if (message.content.toLowerCase() === "!help") {
        socket.emit("send-message", {
            content: "Звон Бот готов к работе! Доступные команды: !ping, !help",
            channelId: message.channel,
            dmId: message.directMessage
        });
    }
});

socket.on("disconnect", () => {
    console.log("Disconnected from server");
});
