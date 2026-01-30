const { YandexMusicClient } = require("yandex-music-client");
const axios = require("axios");

const tokens = [
    "y0__xDvo5iwBBje-AYghJDMnxYwjqm0hQhXgYlVwLXfMHVMjTu7ZEZPKDY4SA",
    "y0__xDvo5iwBBje-AYghJDMnxYwjqm0hQhXgYlVwLXjMHVMjTu7ZEZPKDY4SA"
];

async function testToken(token) {
    console.log(`Testing token: ...${token.slice(-10)}`);
    const client = new YandexMusicClient({
        TOKEN: token,
        BASE: "https://api.music.yandex.net"
    });

    try {
        const res = await client.account.getAccountStatus();
        console.log("  Success!");
        console.log("  Login:", res.result?.account?.login || "Unknown");
        console.log("  Plus:", !!res.result?.plus?.hasPlus);
        console.log("  Until:", res.result?.permissions?.until);
    } catch (err) {
        console.log("  Failed:", err.message);
    }
}

async function run() {
    for (const t of tokens) {
        await testToken(t);
        console.log("---");
    }
}

run();
