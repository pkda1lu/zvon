const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  award: { type: mongoose.Schema.Types.ObjectId, ref: 'Award', required: true },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  source: { type: String, enum: ['manual', 'rule'], required: true },
  collectible: {
    type: new mongoose.Schema({
      palette: { type: String, enum: ['graphite', 'cobalt', 'aurora', 'rose', 'amber', 'amethyst'], required: true },
      background: { type: String, enum: ['midnight', 'ocean', 'forest', 'sunset', 'nebula', 'pearl'], required: true },
      pattern: { type: String, enum: ['signal', 'stars', 'orbits', 'zvon'], required: true },
      finish: { type: String, enum: ['polished', 'satin', 'frosted'], required: true }
    }, { _id: false }), default: undefined
  },
  revoked: { type: Boolean, default: false }
}, { timestamps: true });
schema.index({ user: 1, award: 1 }, { unique: true });
module.exports = mongoose.model('AwardGrant', schema);
