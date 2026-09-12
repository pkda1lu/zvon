const StoreProduct = require('../models/StoreProduct');

// Сидим стартовый каталог, если он ещё пуст. VPN здесь намеренно нет:
// подписка одна на человека и живёт в телеграм-аккаунте Vlyne, а тарифы
// (пакеты трафика) магазин берёт из бота — см. utils/vlyneBot.js.
// Дальше всё редактируется через админку магазина.
const SEED = [
  { type: 'merch', title: 'Футболка Zvon', price: 1490, sortOrder: 1,
    description: 'Хлопок, чёрная, принт на груди.',
    merch: { stock: null, requiresShipping: true, options: ['S', 'M', 'L', 'XL'] } },
  { type: 'merch', title: 'Стикерпак Vlyne', price: 190, sortOrder: 2,
    description: 'Набор виниловых стикеров.',
    merch: { stock: null, requiresShipping: true, options: [] } },
];

module.exports = async function seedStoreProducts() {
  const count = await StoreProduct.countDocuments();
  if (count > 0) return;
  await StoreProduct.insertMany(SEED);
  console.log(`[Store] Seeded ${SEED.length} products`);
};
