const mongoose = require('mongoose');

// Универсальный товар магазина. type определяет способ выдачи:
//   vpn   — после оплаты провижинится VLESS-ключ;
//   merch — физический товар, после оплаты оформляется доставка (выполняет админ).
const storeProductSchema = new mongoose.Schema({
  type:        { type: String, enum: ['vpn', 'merch'], required: true, index: true },
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  price:       { type: Number, default: 0 },       // в рублях
  currency:    { type: String, default: 'RUB' },
  images:      { type: [String], default: [] },     // массив URL
  active:      { type: Boolean, default: true, index: true },
  sortOrder:   { type: Number, default: 0 },

  // Поля тарифа VPN
  vpn: {
    days:      { type: Number, default: 30 },
    whitelist: { type: Boolean, default: false },   // использовать whitelist-инбаунды
    trialOnce: { type: Boolean, default: false },   // пробный (один раз на пользователя)
  },

  // Поля мерча
  merch: {
    stock:           { type: Number, default: null },   // null = без ограничения
    requiresShipping:{ type: Boolean, default: true },
    options:         { type: [String], default: [] },   // напр. размеры: ["S","M","L"]
  },

  createdAt:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('StoreProduct', storeProductSchema);
