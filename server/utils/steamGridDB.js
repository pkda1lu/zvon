const axios = require('axios');
const GameCache = require('../models/GameCache');

const API_KEY = process.env.STEAMGRIDDB_API_KEY;
const BASE_URL = 'https://www.steamgriddb.com/api/v2';

const getGameIcon = async (gameName) => {
  if (!API_KEY) {
    console.warn('STEAMGRIDDB_API_KEY is not set');
    return null;
  }

  // 1. Check cache
  const cached = await GameCache.findOne({ name: gameName });
  if (cached && (Date.now() - cached.updatedAt < 1000 * 60 * 60 * 24 * 7)) { // 1 week cache
    return cached.iconUrl;
  }

  try {
    // 2. Search for the game
    const searchRes = await axios.get(`${BASE_URL}/search/autocomplete/${encodeURIComponent(gameName)}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });

    if (!searchRes.data.success || searchRes.data.data.length === 0) {
      return null;
    }

    const gameId = searchRes.data.data[0].id;

    // 3. Get icons
    const iconsRes = await axios.get(`${BASE_URL}/icons/game/${gameId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });

    if (!iconsRes.data.success || iconsRes.data.data.length === 0) {
        // Even if no icon found, cache the empty result to avoid re-searching
        await GameCache.findOneAndUpdate(
            { name: gameName },
            { gameId, updatedAt: Date.now() },
            { upsid: true, new: true, upsert: true }
          );
      return null;
    }

    // Sort icons by rating or just take the first one
    const iconUrl = iconsRes.data.data[0].url;

    // 4. Update cache
    await GameCache.findOneAndUpdate(
      { name: gameName },
      { gameId, iconUrl, updatedAt: Date.now() },
      { upsert: true, new: true }
    );

    return iconUrl;
  } catch (error) {
    console.error('Error fetching from SteamGridDB:', error.response?.data || error.message);
    return null;
  }
};

module.exports = { getGameIcon };
