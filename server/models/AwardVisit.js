const mongoose = require('mongoose');
module.exports = mongoose.model('AwardVisit', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  firstVisitedAt: { type: Date, required: true }
}));
