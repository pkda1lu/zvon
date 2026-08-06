import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import fs from 'node:fs';
import path from 'node:path';

import { execSync } from 'node:child_process';

// detect if we are building for electron
const isElectron = process.env.VITE_ELECTRON === 'true';

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

// Extract git commit info dynamically
const getGitInfo = () => {
    try {
        const hash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
        const shortHash = hash.substring(0, 7);
        const author = execSync('git log -1 --format="%an"', { encoding: 'utf-8' }).trim();
        const date = execSync('git log -1 --format="%cd"', { encoding: 'utf-8' }).trim();
        const message = execSync('git log -1 --format="%s"', { encoding: 'utf-8' }).trim();
        return { hash, shortHash, author, date, message };
    } catch {
        return {
            hash: 'a11addbbad81ca254ac90a920d0c13b1abc516b6',
            shortHash: 'a11addb',
            author: 'pkda1lu',
            date: new Date().toISOString(),
            message: 'Latest release',
        };
    }
};

const gitInfo = getGitInfo();
const buildTime = new Date().toISOString();

// Vite's static server (sirv) treats files ending in `.gz` as *pre-compressed*
// and serves them with `Content-Encoding: gzip`. The browser then transparently
// decompresses them, so `response.arrayBuffer()` yields the raw TAR instead of
// the .tar.gz. DeepFilterNet's wasm `df_create` expects the gzipped bytes and
// decompresses internally, so the mangled input makes it trap ("unreachable").
//
// This plugin serves the self-hosted DeepFilterNet model (`/df/**/*.tar.gz`)
// verbatim with a neutral content type and NO Content-Encoding, in both the dev
// and preview servers. Production (express) and Electron (file://) are unaffected.
const serveDfAssetsRaw = (): Plugin => {
    const handler = (publicDir: string) =>
        (req: any, res: any, next: any) => {
            const url: string = req.url || '';
            if (!/^\/df\/.*\.tar\.gz(\?|$)/.test(url)) return next();
            const root = path.resolve(publicDir);
            const filePath = path.resolve(publicDir, '.' + decodeURIComponent(url.split('?')[0]));
            if (!filePath.startsWith(root) || !fs.existsSync(filePath)) return next();
            const buf = fs.readFileSync(filePath);
            res.setHeader('Content-Type', 'application/gzip');
            res.removeHeader?.('Content-Encoding');
            res.setHeader('Content-Length', String(buf.length));
            res.statusCode = 200;
            res.end(buf);
        };
    return {
        name: 'serve-df-assets-raw',
        configureServer(server) {
            const publicDir = server.config.publicDir;
            server.middlewares.use(handler(publicDir));
        },
        configurePreviewServer(server) {
            const publicDir = path.resolve(server.config.root, server.config.build.outDir);
            server.middlewares.use(handler(publicDir));
        },
    };
};

export default defineConfig({
    plugins: [react(), tsconfigPaths(), serveDfAssetsRaw()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __BUILD_TIME__: JSON.stringify(buildTime),
        __GIT_COMMIT_HASH__: JSON.stringify(gitInfo.hash),
        __GIT_COMMIT_SHORT_HASH__: JSON.stringify(gitInfo.shortHash),
        __GIT_COMMIT_AUTHOR__: JSON.stringify(gitInfo.author),
        __GIT_COMMIT_DATE__: JSON.stringify(gitInfo.date),
        __GIT_COMMIT_MESSAGE__: JSON.stringify(gitInfo.message),
    },
    base: isElectron ? './' : '/',
    server: {
        port: 3000,
    },
    build: {
        outDir: 'build',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                // Крупные и редко меняющиеся зависимости выносим в отдельные
                // чанки: они грузятся параллельно с кодом приложения и, что
                // важнее, переживают деплои в кэше браузера — правка в UI не
                // инвалидирует react/livekit/three.
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-motion': ['framer-motion'],
                    'vendor-livekit': ['livekit-client'],
                    'vendor-net': ['axios', 'socket.io-client'],
                },
            },
        },
    },
});
