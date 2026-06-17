const express = require('express');
const axios = require('axios');
const router = express.Router();
const MiniApp = require('../models/MiniApp');
const MiniAppStorage = require('../models/MiniAppStorage');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const { logGlobalAction } = require('../utils/globalAuditLogger');

// Create a new mini-app
router.post('/create', auth, async (req, res) => {
    try {
        const { name, url } = req.body;
        if (!name || !url) return res.status(400).json({ message: 'Name and URL are required' });

        const miniApp = new MiniApp({
            name,
            url,
            owner: req.user._id
        });

        await miniApp.save();

        await logGlobalAction({
            executorId: req.user._id,
            action: 'MINIAPP_CREATE',
            targetId: miniApp._id,
            targetModel: 'MiniApp',
            details: { name: miniApp.name }
        });

        res.status(201).json({
            message: 'Мини-приложение успешно создано',
            miniApp
        });
    } catch (error) {
        console.error('MiniApp creation error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's mini-apps
router.get('/my', auth, async (req, res) => {
    try {
        const miniApps = await MiniApp.find({ owner: req.user._id });
        res.json(miniApps);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Public meta for a single mini-app (used to auto-open collaborative apps).
// Only returns apps that are launchable: system, published, or owned by the user.
router.get('/:id', auth, async (req, res) => {
    try {
        const app = await MiniApp.findById(req.params.id)
            .select('name url description avatar banner owner isSystem isPublished isBlocked');
        if (!app) return res.status(404).json({ message: 'MiniApp not found' });
        const launchable = app.isSystem || (app.isPublished && !app.isBlocked) || String(app.owner) === String(req.user._id);
        if (!launchable) return res.status(403).json({ message: 'Not available' });
        res.json({ app });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update mini-app
router.patch('/:id', auth, async (req, res) => {
    try {
        const { name, url, description } = req.body;
        const miniApp = await MiniApp.findOne({ _id: req.params.id, owner: req.user._id });
        if (!miniApp) return res.status(404).json({ message: 'MiniApp not found' });

        if (name) miniApp.name = name;
        if (url) miniApp.url = url;
        if (description !== undefined) miniApp.description = description;

        await miniApp.save();
        res.json({ message: 'Мини-приложение обновлено', miniApp });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Submit mini-app for marketplace review / un-publish.
router.patch('/:id/publish', auth, async (req, res) => {
    try {
        const miniApp = await MiniApp.findOne({ _id: req.params.id, owner: req.user._id });
        if (!miniApp) return res.status(404).json({ message: 'MiniApp not found' });

        if (miniApp.isBlocked) {
            return res.status(403).json({ message: 'Приложение заблокировано модерацией: ' + (miniApp.blockReason || 'без указания причины') });
        }

        // System apps bypass moderation — they're built-in.
        if (miniApp.isSystem) {
            miniApp.isPublished = !miniApp.isPublished;
            await miniApp.save();
            return res.json({ message: miniApp.isPublished ? 'Опубликовано' : 'Снято', isPublished: miniApp.isPublished });
        }

        let message;
        if (miniApp.isPublished) {
            miniApp.isPublished = false;
            miniApp.moderationStatus = 'draft';
            message = 'Снято с витрины';
        } else if (miniApp.moderationStatus === 'pending') {
            miniApp.moderationStatus = 'draft';
            message = 'Заявка на публикацию отозвана';
        } else {
            miniApp.moderationStatus = 'pending';
            miniApp.moderationReason = null;
            miniApp.moderatedAt = null;
            miniApp.moderatedBy = null;
            message = 'Приложение отправлено на модерацию';
        }
        await miniApp.save();
        res.json({ message, isPublished: miniApp.isPublished, moderationStatus: miniApp.moderationStatus });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete mini-app
router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await MiniApp.deleteOne({ _id: req.params.id, owner: req.user._id });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'MiniApp not found' });

        res.json({ message: 'Мини-приложение успешно удалено' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update mini-app avatar
router.post('/:id/avatar', auth, (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const miniApp = await MiniApp.findOne({ _id: req.params.id, owner: req.user._id });
        if (!miniApp) return res.status(404).json({ message: 'MiniApp not found' });

        const avatarUrl = `/api/uploads/${req.file.filename}`;
        miniApp.avatar = avatarUrl;
        await miniApp.save();

        res.json({ message: 'Аватар обновлен', avatar: avatarUrl });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update mini-app banner
router.post('/:id/banner', auth, (req, res, next) => {
    upload.single('banner')(req, res, (err) => {
        if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const miniApp = await MiniApp.findOne({ _id: req.params.id, owner: req.user._id });
        if (!miniApp) return res.status(404).json({ message: 'MiniApp not found' });

        const bannerUrl = `/api/uploads/${req.file.filename}`;
        miniApp.banner = bannerUrl;
        await miniApp.save();

        res.json({ message: 'Баннер обновлен', banner: bannerUrl });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Reset mini-app avatar
router.delete('/:id/avatar', auth, async (req, res) => {
    try {
        const miniApp = await MiniApp.findOne({ _id: req.params.id, owner: req.user._id });
        if (!miniApp) return res.status(404).json({ message: 'MiniApp not found' });

        miniApp.avatar = null;
        await miniApp.save();

        res.json({ message: 'Аватар сброшен', avatar: null });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Reset mini-app banner
router.delete('/:id/banner', auth, async (req, res) => {
    try {
        const miniApp = await MiniApp.findOne({ _id: req.params.id, owner: req.user._id });
        if (!miniApp) return res.status(404).json({ message: 'MiniApp not found' });

        miniApp.banner = null;
        await miniApp.save();

        res.json({ message: 'Баннер сброшен' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

async function loadApp(req, res, next) {
  try {
    const app = await MiniApp.findById(req.params.id);
    if (!app) return res.status(404).json({ message: 'MiniApp not found' });
    req.miniApp = app;
    next();
  } catch (e) { res.status(400).json({ message: 'Bad id' }); }
}

router.get('/:id/storage', auth, loadApp, async (req, res) => {
  const entries = await MiniAppStorage.find({ user: req.user._id, app: req.miniApp._id });
  const obj = {};
  entries.forEach(e => { obj[e.key] = e.value; });
  res.json(obj);
});

router.get('/:id/storage/:key', auth, loadApp, async (req, res) => {
  const entry = await MiniAppStorage.findOne({ user: req.user._id, app: req.miniApp._id, key: req.params.key });
  res.json({ value: entry ? entry.value : null });
});

router.put('/:id/storage/:key', auth, loadApp, async (req, res) => {
  const value = req.body?.value;
  await MiniAppStorage.findOneAndUpdate(
    { user: req.user._id, app: req.miniApp._id, key: req.params.key },
    { $set: { value, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

router.delete('/:id/storage/:key', auth, loadApp, async (req, res) => {
  await MiniAppStorage.deleteOne({ user: req.user._id, app: req.miniApp._id, key: req.params.key });
  res.json({ ok: true });
});

// SSRF: блокируем localhost/частные/служебные хосты во всех формах записи.
const FETCH_BLOCK_HOSTS = /^(localhost$|.*\.local(host)?$|.*\.internal$|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.|\[?::1\]?|\[?fc00:|\[?fd00:|\[?fe80:)/i;
function isBlockedHost(hostname) {
  const h = (hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (FETCH_BLOCK_HOSTS.test(hostname) || FETCH_BLOCK_HOSTS.test(h)) return true;
  // IPv4 в десятичной/восьмеричной/шестнадцатеричной записи (обход 127.0.0.1 → 2130706433 и т.п.)
  let n = null;
  if (/^0x[0-9a-f]+$/i.test(h)) n = parseInt(h, 16);
  else if (/^0[0-7]+$/.test(h)) n = parseInt(h, 8);
  else if (/^\d+$/.test(h)) n = parseInt(h, 10);
  if (n !== null && Number.isFinite(n)) {
    const a = (n >>> 24) & 255, b = (n >>> 16) & 255;
    if (a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)) return true;
  }
  return false;
}
router.post('/:id/fetch', auth, loadApp, async (req, res) => {
  try {
    const { url, method = 'GET', headers = {}, body, responseType = 'json', timeout = 15000 } = req.body || {};
    if (!url || typeof url !== 'string') return res.status(400).json({ message: 'url required' });
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ message: 'invalid url' }); }
    if (!/^https?:$/.test(parsed.protocol)) return res.status(400).json({ message: 'only http(s) allowed' });
    if (isBlockedHost(parsed.hostname)) return res.status(400).json({ message: 'internal host blocked' });

    const safeHeaders = { ...headers };
    delete safeHeaders.host;
    delete safeHeaders.cookie;
    delete safeHeaders.Cookie;
    // ВАЖНО: Authorization НЕ срезаем — мини-аппы легитимно передают свой токен
    // стороннего API (напр. OAuth Яндекс Музыки). Токен zvon сюда не попадает:
    // axios на стороне сервера не наследует заголовки клиента, шлём только safeHeaders.

    const r = await axios({
      url, method, headers: safeHeaders, data: body,
      timeout: Math.min(Number(timeout) || 15000, 30000),
      responseType: responseType === 'arraybuffer' ? 'arraybuffer' : 'text',
      validateStatus: () => true,
      // Разрешаем редиректы (CDN-потоки Яндекса их используют). Начальный хост уже
      // проверен isBlockedHost; остаточный risk redirect→internal принят осознанно.
      maxRedirects: 5,
    });

    let payload;
    if (responseType === 'arraybuffer') {
      payload = { base64: Buffer.from(r.data).toString('base64') };
    } else if (responseType === 'json') {
      try { payload = { data: JSON.parse(r.data) }; }
      catch { payload = { data: r.data }; }
    } else {
      payload = { data: r.data };
    }
    res.json({ status: r.status, headers: r.headers, ...payload });
  } catch (e) {
    res.status(502).json({ message: 'proxy error: ' + e.message });
  }
});

module.exports = router;
