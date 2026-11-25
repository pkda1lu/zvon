const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  kind: { type: String, required: true },
  to: String,
  validity: String,
  uid: Number,
  text: String,
  author: String,
  requestId: { type: String, unique: true, sparse: true },
  status: { type: String, default: 'sent' },
  createdAt: { type: Date, default: Date.now }
});
schema.index({ kind: 1, validity: 1, uid: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400, partialFilterExpression: { kind: { $eq: 'automatic' } } });
schema.add({ purpose: String });

module.exports = mongoose.model('MailHistory', schema);
