const mongoose = require('mongoose');

const vpnOrderSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan:       { type: String, required: true },     // trial24h | 30d | 30d_whitelist
  os:         { type: String, default: 'windows' },
  amount:     { type: Number, default: 0 },          // в рублях
  currency:   { type: String, default: 'RUB' },
  promocode:  { type: String, default: null },
  status:     { type: String, enum: ['pending', 'paid', 'canceled'], default: 'pending', index: true },
  provider:   { type: String, default: null },       // yookassa | cryptobot | free
  paymentId:  { type: String, default: null },
  subUrl:     { type: String, default: null },
  link:       { type: String, default: null },
  expiryMs:   { type: Number, default: null },
  createdAt:  { type: Date, default: Date.now },
  fulfilledAt:{ type: Date, default: null },
});

module.exports = mongoose.model('VpnOrder', vpnOrderSchema);
