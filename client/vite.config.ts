import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import fs from 'node:fs';
import path from 'node:path';

// detect if we are building for electron
const isElectron = process.env.VITE_ELECTRON === 'true';

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
    base: isElectron ? './' : '/',
    server: {
        port: 3000,
    },
    build: {
        outDir: 'build',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
    },
});
