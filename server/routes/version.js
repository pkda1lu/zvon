const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const router = express.Router();

// --- Configuration -----------------------------------------------------------
const GH_OWNER = process.env.GH_RELEASES_OWNER || 'pkda1lu';
const GH_REPO = process.env.GH_RELEASES_REPO || 'zvon';
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

// --- Local package.json Version ----------------------------------------------
const resolveLatestVersion = () => {
    if (process.env.APP_LATEST_VERSION) return process.env.APP_LATEST_VERSION;
    const candidates = [
        path.join(__dirname, '..', '..', 'client', 'package.json'),
        path.join(__dirname, '..', 'package.json'),
    ];
    for (const file of candidates) {
        try {
            const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (pkg && typeof pkg.version === 'string') return pkg.version;
        } catch (e) { }
    }
    return '0.0.0';
};

let cachedVersion = null;
let cachedVersionAt = 0;
const VERSION_TTL = 60_000;

router.get('/', (req, res) => {
    const now = Date.now();
    if (!cachedVersion || now - cachedVersionAt > VERSION_TTL) {
        cachedVersion = resolveLatestVersion();
        cachedVersionAt = now;
    }
    res.json({ version: cachedVersion });
});

// --- GitHub API Helper with In-Memory Caching & Rate-Limit Shield -------------
const ghCache = new Map(); // key -> { data, at, etag }

function ghFetchJson(apiPath) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'zvon-version-proxy',
            Accept: 'application/vnd.github+json',
        };
        if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`;

        const cached = ghCache.get(apiPath);
        if (cached?.etag) {
            headers['If-None-Match'] = cached.etag;
        }

        const req = https.get(
            { hostname: 'api.github.com', path: apiPath, headers, timeout: 10_000 },
            (res) => {
                if (res.statusCode === 304 && cached) {
                    cached.at = Date.now();
                    return resolve(cached.data);
                }

                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsed = JSON.parse(body);
                            const etag = res.headers['etag'] || null;
                            ghCache.set(apiPath, { data: parsed, at: Date.now(), etag });
                            return resolve(parsed);
                        } catch (e) {
                            return reject(e);
                        }
                    }

                    // On rate limit (403) or upstream error, fallback to cached data if present
                    if (cached?.data) {
                        console.warn(`[GitHub API] HTTP ${res.statusCode} for ${apiPath}, serving stale cache.`);
                        return resolve(cached.data);
                    }

                    reject(new Error(`GitHub API HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error('GitHub API timeout'));
        });

        req.on('error', (err) => {
            if (cached?.data) {
                console.warn(`[GitHub API] Request failed for ${apiPath}, serving stale cache:`, err.message);
                return resolve(cached.data);
            }
            reject(err);
        });
    });
}

// GET /api/version/releases - List GitHub releases with caching (TTL 10 min)
const RELEASES_TTL = 10 * 60_000;
router.get('/releases', async (req, res) => {
    const apiPath = `/repos/${GH_OWNER}/${GH_REPO}/releases?per_page=50`;
    const cached = ghCache.get(apiPath);
    const now = Date.now();

    if (cached && now - cached.at < RELEASES_TTL) {
        return res.json(cached.data);
    }

    try {
        const data = await ghFetchJson(apiPath);
        res.json(data);
    } catch (err) {
        if (cached?.data) {
            return res.json(cached.data);
        }
        res.status(502).json({ error: 'Failed to fetch releases from GitHub', message: err.message });
    }
});

// GET /api/version/compare - Compare two git references (TTL 10 min)
const COMPARE_TTL = 10 * 60_000;
router.get('/compare', async (req, res) => {
    const { base, head = 'main' } = req.query;
    if (!base) {
        return res.status(400).json({ error: 'Base reference is required' });
    }

    const apiPath = `/repos/${GH_OWNER}/${GH_REPO}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    const cached = ghCache.get(apiPath);
    const now = Date.now();

    if (cached && now - cached.at < COMPARE_TTL) {
        return res.json(cached.data);
    }

    try {
        const data = await ghFetchJson(apiPath);
        res.json(data);
    } catch (err) {
        // If 'main' fails, try 'master'
        if (head === 'main') {
            const masterPath = `/repos/${GH_OWNER}/${GH_REPO}/compare/${encodeURIComponent(base)}...master`;
            try {
                const masterData = await ghFetchJson(masterPath);
                return res.json(masterData);
            } catch (e) { }
        }

        if (cached?.data) {
            return res.json(cached.data);
        }
        res.status(502).json({ error: 'Failed to compare commits from GitHub', message: err.message });
    }
});

// GET /api/version/commits - Commits for a tag or comparison (TTL 60 min)
const COMMITS_TTL = 60 * 60_000;
router.get('/commits', async (req, res) => {
    const { tag, prevTag } = req.query;
    if (!tag) {
        return res.status(400).json({ error: 'Tag parameter is required' });
    }

    let apiPath;
    let isCompare = false;
    if (prevTag) {
        apiPath = `/repos/${GH_OWNER}/${GH_REPO}/compare/${encodeURIComponent(prevTag)}...${encodeURIComponent(tag)}`;
        isCompare = true;
    } else {
        apiPath = `/repos/${GH_OWNER}/${GH_REPO}/commits?sha=${encodeURIComponent(tag)}&per_page=100`;
    }

    const cached = ghCache.get(apiPath);
    const now = Date.now();

    if (cached && now - cached.at < COMMITS_TTL) {
        return res.json({ commits: cached.data, isCompare });
    }

    try {
        const rawData = await ghFetchJson(apiPath);
        const commits = isCompare ? (rawData?.commits || []) : (Array.isArray(rawData) ? rawData : []);
        ghCache.set(apiPath, { data: commits, at: now });
        res.json({ commits, isCompare });
    } catch (err) {
        if (cached?.data) {
            return res.json({ commits: cached.data, isCompare });
        }
        res.status(502).json({ error: 'Failed to fetch commits from GitHub', message: err.message });
    }
});

module.exports = router;
