const express = require('express');
const axios = require('axios');
const router = express.Router();
const auth = require('../middleware/auth');

// Прокси к GIPHY. Ключ хранится на сервере (GIPHY_API_KEY в .env) и не попадает
// в клиентский бандл. Ответ нормализуется в компактный вид, удобный для пикера.
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const RATING = 'pg-13';

// Приводим ответ GIPHY к нашему формату: { id, preview, url }.
// preview — лёгкая версия для сетки, url — полноразмерный GIF для отправки.
const mapGifs = (data) => (Array.isArray(data) ? data : [])
  .map(g => {
    const img = g.images || {};
    const preview = img.fixed_width_small?.url || img.fixed_width?.url || img.downsized?.url || img.original?.url;
    const url = img.original?.url || img.downsized_medium?.url || img.fixed_width?.url;
    if (!url) return null;
    return { id: g.id, preview: preview || url, url, title: g.title || '' };
  })
  .filter(Boolean);

const ensureKey = (res) => {
  if (!GIPHY_API_KEY) {
    res.status(503).json({ message: 'GIF-сервис не настроен: отсутствует GIPHY_API_KEY' });
    return false;
  }
  return true;
};

router.get('/trending', auth, async (req, res) => {
  if (!ensureKey(res)) return;
  try {
    const limit = Math.min(parseInt(req.query.limit) || 24, 50);
    const { data } = await axios.get(`${GIPHY_BASE}/trending`, {
      params: { api_key: GIPHY_API_KEY, limit, rating: RATING },
      timeout: 6000,
    });
    res.json({ results: mapGifs(data?.data) });
  } catch (error) {
    res.status(502).json({ message: 'Не удалось загрузить GIF' });
  }
});

router.get('/search', auth, async (req, res) => {
  if (!ensureKey(res)) return;
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.json({ results: [] });
    const limit = Math.min(parseInt(req.query.limit) || 24, 50);
    const { data } = await axios.get(`${GIPHY_BASE}/search`, {
      params: { api_key: GIPHY_API_KEY, q, limit, rating: RATING, lang: 'ru' },
      timeout: 6000,
    });
    res.json({ results: mapGifs(data?.data) });
  } catch (error) {
    res.status(502).json({ message: 'Не удалось загрузить GIF' });
  }
});

module.exports = router;
