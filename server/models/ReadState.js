const mongoose = require('mongoose');

/*
 * Докуда человек дочитал чат — канал сервера или личную переписку.
 *
 * Раньше непрочитанное жило только в памяти клиента: после перезапуска все
 * счётчики обнулялись, а между устройствами не совпадали. Теперь отметку
 * держит сервер, и любое устройство считает непрочитанное от неё.
 */
const readStateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // _id канала или личной переписки — они не пересекаются.
  chat: { type: mongoose.Schema.Types.ObjectId, required: true },
  lastReadAt: { type: Date, required: true },
});

readStateSchema.index({ user: 1, chat: 1 }, { unique: true });

module.exports = mongoose.model('ReadState', readStateSchema);
