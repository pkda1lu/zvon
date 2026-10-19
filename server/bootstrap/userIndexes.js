const User = require('../models/User');

/*
 * Замена индекса telegram.id (см. models/User.js).
 *
 * Старый уникальный sparse-индекс telegram.id_1 учитывал явный null, и с ним
 * не регистрировался ни один новый пользователь после первого. Mongoose сам
 * старые индексы не удаляет, поэтому снимаем его здесь и создаём новый,
 * частичный. Повторный запуск ничего не делает.
 */
module.exports = async function migrateUserIndexes() {
  const indexes = await User.collection.indexes();
  if (indexes.some(i => i.name === 'telegram.id_1')) {
    await User.collection.dropIndex('telegram.id_1');
    console.log('[Users] Снят старый индекс telegram.id_1 (блокировал регистрацию)');
  }
  // null в telegram.id больше ничего не значит — убираем, чтобы данные были однородны.
  const cleaned = await User.updateMany({ 'telegram.id': null }, { $unset: { 'telegram.id': 1 } });
  if (cleaned.modifiedCount) console.log(`[Users] Очищено пустых telegram.id: ${cleaned.modifiedCount}`);
  await User.createIndexes();
};
