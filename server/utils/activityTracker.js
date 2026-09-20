const DailyUserActivity = require('../models/DailyUserActivity');

// Кэш в памяти (key: `${day}_${userId}_${brand}`), чтобы не нагружать MongoDB однотипными upsert-запросами в течение суток
const activityCache = new Set();

// Периодическая очистка кэша раз в несколько часов, чтобы память процесса не разрасталась бесконечно
setInterval(() => {
  if (activityCache.size > 50000) {
    activityCache.clear();
  }
}, 4 * 60 * 60 * 1000);

/**
 * Возвращает строковую дату дня в формате "YYYY-MM-DD"
 */
function getDayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Регистрирует активность пользователя за текущий день с указанным брендом.
 * Выполняется асинхронно и безопасно (best-effort), не замедляя основной запрос.
 */
function trackUserActivity(userId, brand = 'zvon') {
  if (!userId) return;

  const day = getDayString();
  const cacheKey = `${day}_${String(userId)}_${brand || 'zvon'}`;

  if (activityCache.has(cacheKey)) {
    return;
  }

  activityCache.add(cacheKey);

  DailyUserActivity.updateOne(
    { day, user: userId, brand: brand || 'zvon' },
    { $setOnInsert: { day, user: userId, brand: brand || 'zvon', createdAt: new Date() } },
    { upsert: true }
  ).catch(err => {
    // В случае дубликата из-за гонки процессов просто игнорируем
    if (err && err.code !== 11000) {
      console.error('[trackUserActivity] error:', err.message);
    }
  });
}

module.exports = {
  trackUserActivity,
  getDayString
};
