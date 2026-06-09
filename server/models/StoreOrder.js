const mongoose = require('mongoose');

// Заказ магазина (VPN или мерч).
const storeOrderSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  product:    { type: mongoose.Schema.Types.ObjectId, ref: 'StoreProduct', default: null },
  type:       { type: String, enum: ['vpn', 'merch'], required: true },
  title:      { type: String, default: '' },         // снимок названия на момент покупки
  amount:     { type: Number, default: 0 },          // итог в рублях
  currency:   { type: String, default: 'RUB' },
  qty:        { type: Number, default: 1 },
  promocode:  { type: String, default: null },

  status:     { type: String, enum: ['pending', 'paid', 'canceled'], default: 'pending', index: true },
  provider:   { type: String, default: null },       // yookassa | cryptobot | free
  paymentId:  { type: String, default: null },

  // VPN
  os:         { type: String, default: 'windows' },
  subUrl:     { type: String, default: null },
  link:       { type: String, default: null },
  expiryMs:   { type: Number, default: null },

  // Мерч
  shipping:   {
    name:    { type: String, default: '' },
    phone:   { type: String, default: '' },
    address: { type: String, default: '' },
    comment: { type: String, default: '' },
    option:  { type: String, default: '' },
  },
  fulfillment:{ type: String, enum: ['new', 'processing', 'shipped', 'done'], default: 'new' },

  createdAt:  { type: Date, default: Date.now },
  fulfilledAt:{ type: Date, default: null },
});

module.exports = mongoose.model('StoreOrder', storeOrderSchema);
