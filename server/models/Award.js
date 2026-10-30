const mongoose = require('mongoose');
const { OPTIONS } = require('../utils/awardCollectibles');
const schema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 500 },
  model: { type: String, enum: ['trophy', 'medal', 'crystal', 'rose', 'star', 'bell'], required: true },
  color: { type: String, default: '#ffc65c' },
  appearance: {
    palette: { type: String, enum: ['random', ...OPTIONS.palette], default: 'random' },
    background: { type: String, enum: ['random', ...OPTIONS.background], default: 'random' },
    pattern: { type: String, enum: ['random', ...OPTIONS.pattern], default: 'random' },
    finish: { type: String, enum: ['random', ...OPTIONS.finish], default: 'random' }
  },
  rule: { type: String, enum: ['manual', 'registered_before', 'visited_before'], default: 'manual' },
  cutoff: { type: Date, default: null },
  enabled: { type: Boolean, default: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
module.exports = mongoose.model('Award', schema);
