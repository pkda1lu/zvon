const StoreProduct = require('../models/StoreProduct');

// Сидим базовые VPN-тарифы как товары, если каталог ещё пуст.
// Дальше всё редактируется через админку магазина.
const SEED = [
  { type: 'vpn', title: 'VPN — Пробный доступ', price: 0, sortOrder: 1,
    description: '24 часа бесплатно. Доступно один раз.',
    vpn: { days: 1, whitelist: true, trialOnce: true } },
  { type: 'vpn', title: 'VPN — 1 месяц', price: 189, sortOrder: 2,
    description: '30 дней полного доступа к VLESS VPN.',
    vpn: { days: 30, whitelist: false, trialOnce: false } },
  { type: 'vpn', title: 'VPN — Месяц + белые списки', price: 289, sortOrder: 3,
    description: '30 дней + белые списки (обход блокировок).',
    vpn: { days: 30, whitelist: true, trialOnce: false } },
];

module.exports = async function seedStoreProducts() {
  const count = await StoreProduct.countDocuments();
  if (count > 0) return;
  await StoreProduct.insertMany(SEED);
  console.log(`[Store] Seeded ${SEED.length} VPN products`);
};
