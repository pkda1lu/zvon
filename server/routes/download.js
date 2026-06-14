const express = require('express');
const https = require('https');

const router = express.Router();

// --- Configuration -----------------------------------------------------------
const GH_OWNER = process.env.GH_RELEASES_OWNER || 'pkda1lu';
const GH_REPO = process.env.GH_RELEASES_REPO || 'zvon';
// Optional token lifts the unauthenticated GitHub API rate limit (60/h -> 5000/h)
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const RELEASES_PAGE = `https://github.com/${GH_OWNER}/${GH_REPO}/releases`;

// --- Tiny GitHub API helper --------------------------------------------------
function ghGetJson(apiPath) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'zvon-download-proxy',
            Accept: 'application/vnd.github+json',
        };
        if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`;

        const req = https.get(
            { hostname: 'api.github.com', path: apiPath, headers, timeout: 10_000 },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        return reject(new Error(`GitHub API ${res.statusCode}: ${data.slice(0, 200)}`));
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }
        );
        req.on('timeout', () => req.destroy(new Error('GitHub API timeout')));
        req.on('error', reject);
    });
}

// Pick the best Windows installer asset from a release.
function pickAsset(assets, platform) {
    if (!Array.isArray(assets)) return null;
    const byName = (pred) => assets.find((a) => pred((a.name || '').toLowerCase()));

    if (platform === 'mac') {
        return byName((n) => n.endsWith('.dmg')) || byName((n) => n.endsWith('.zip')) || null;
    }
    if (platform === 'linux') {
        return (
            byName((n) => n.endsWith('.appimage')) ||
            byName((n) => n.endsWith('.deb')) ||
            byName((n) => n.endsWith('.rpm')) ||
            null
        );
    }
    // default: windows installer (NSIS). Prefer the user-facing "Setup .exe",
    // never the blockmap or web-setup helper files.
    return (
        byName((n) => n.includes('setup') && n.endsWith('.exe')) ||
        byName((n) => n.endsWith('.exe') && !n.includes('.blockmap')) ||
        null
    );
}

// --- Cache -------------------------------------------------------------------
const cache = new Map(); // platform -> { url, version, at }
const TTL = 5 * 60_000; // 5 minutes

async function resolveLatest(platform) {
    const cached = cache.get(platform);
    if (cached && Date.now() - cached.at < TTL) return cached;

    const release = await ghGetJson(`/repos/${GH_OWNER}/${GH_REPO}/releases/latest`);
    const asset = pickAsset(release.assets, platform);
    if (!asset || !asset.browser_download_url) {
        throw new Error(`No ${platform} asset in release ${release.tag_name || '?'}`);
    }
    const entry = {
        url: asset.browser_download_url,
        version: release.tag_name || release.name || '',
        name: asset.name,
        at: Date.now(),
    };
    cache.set(platform, entry);
    return entry;
}

function normalizePlatform(req) {
    const p = String(req.query.platform || req.query.os || '').toLowerCase();
    if (p.startsWith('mac') || p === 'darwin' || p === 'osx') return 'mac';
    if (p.startsWith('lin')) return 'linux';
    return 'win';
}

// GET /api/download/latest   -> 302 redirect to the newest installer asset
//   ?platform=win|mac|linux  (default win)
async function latestRedirect(req, res) {
    const platform = normalizePlatform(req);
    try {
        const { url } = await resolveLatest(platform);
        res.redirect(302, url);
    } catch (err) {
        console.error('[download] latest resolve failed:', err.message);
        // Graceful fallback: send the user to the releases page so they can
        // always grab a build manually.
        res.redirect(302, RELEASES_PAGE);
    }
}

// GET /api/download/latest.json -> { version, url, name } (for the website UI)
async function latestInfo(req, res) {
    const platform = normalizePlatform(req);
    try {
        const info = await resolveLatest(platform);
        res.json({ platform, version: info.version, name: info.name, url: info.url });
    } catch (err) {
        res.status(502).json({ error: 'unavailable', releasesPage: RELEASES_PAGE });
    }
}

router.get('/latest', latestRedirect);
router.get('/latest.json', latestInfo);

module.exports = { router, latestRedirect, latestInfo };
