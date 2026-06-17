// Учёт времени в играх для блока «Любимые игры».
// Вызывается при завершении игровой сессии (смена активности или дисконнект):
// считает длительность по timestamps.start завершившейся активности и
// прибавляет к user.gameStats. Мутирует user (без save) и помечает gameStats
// как изменённый; сохранять должен вызывающий код.
const MAX_SESSION_SECONDS = 24 * 60 * 60; // защита от мусорных значений
const MIN_SESSION_SECONDS = 5;            // не засчитываем «промахи»

function recordGameSession(user, prevActivity, nextActivity) {
  if (!user || !prevActivity || prevActivity.type !== 'playing' || !prevActivity.name) return false;
  // Та же игра продолжается — сессия не завершилась.
  if (nextActivity && nextActivity.type === 'playing' && nextActivity.name === prevActivity.name) return false;

  const startRaw = prevActivity.timestamps && prevActivity.timestamps.start;
  if (!startRaw) return false;
  const startMs = startRaw > 1e12 ? startRaw : startRaw * 1000; // допускаем секунды и миллисекунды
  const seconds = Math.floor((Date.now() - startMs) / 1000);
  if (seconds < MIN_SESSION_SECONDS || seconds > MAX_SESSION_SECONDS) return false;

  if (!Array.isArray(user.gameStats)) user.gameStats = [];
  const image = (prevActivity.assets && prevActivity.assets.largeImage) || null;
  const entry = user.gameStats.find(g => g.name === prevActivity.name);
  if (entry) {
    entry.totalSeconds = (entry.totalSeconds || 0) + seconds;
    entry.lastPlayedAt = new Date();
    if (image) entry.image = image;
  } else {
    user.gameStats.push({ name: prevActivity.name, image, totalSeconds: seconds, lastPlayedAt: new Date() });
  }
  user.markModified('gameStats');
  return true;
}

// Топ-N игр по времени (для отдачи в профиле).
function getTopGames(user, limit = 3) {
  const stats = Array.isArray(user.gameStats) ? user.gameStats : [];
  return [...stats]
    .sort((a, b) => (b.totalSeconds || 0) - (a.totalSeconds || 0))
    .slice(0, limit)
    .map(g => ({ name: g.name, image: g.image || null, totalSeconds: g.totalSeconds || 0, lastPlayedAt: g.lastPlayedAt }));
}

module.exports = { recordGameSession, getTopGames };
