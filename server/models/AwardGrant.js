const mongoose = require('mongoose');
const { OPTIONS } = require('../utils/awardCollectibles');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  award: { type: mongoose.Schema.Types.ObjectId, ref: 'Award', required: true },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  source: { type: String, enum: ['manual', 'rule'], required: true },
  collectible: {
    type: new mongoose.Schema({
      palette: { type: String, enum: OPTIONS.palette, required: true },
      background: { type: String, enum: OPTIONS.background, required: true },
      pattern: { type: String, enum: OPTIONS.pattern, required: true },
      finish: { type: String, enum: OPTIONS.finish, required: true }
    }, { _id: false }), default: undefined
  },
  revoked: { type: Boolean, default: false },
  noticeAt: { type: Date, default: null },
  noticeReadAt: { type: Date, default: null },
  noticeDismissedAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ user: 1, award: 1 }, { unique: true });
schema.index({ user: 1, noticeAt: -1 });
module.exports = mongoose.model('AwardGrant', schema);
