const mongoose = require('mongoose');

const themeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 32
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  theme: {
    type: String,
    enum: ['dark', 'amoled'],
    default: 'dark'
  },
  customColors: {
    primary: { type: String, default: '#006aff' },
    secondary: { type: String, default: '#7000ff' },
    accent: { type: String, default: '#ff00c8' }
  },
  customBackground: {
    type: String,
    default: ''
  },
  backgroundDim: {
    type: Number,
    default: 40,
    min: 0,
    max: 100
  },
  backgroundBlur: {
    type: Number,
    default: 0,
    min: 0,
    max: 20
  },
  messageSpacing: {
    type: Number,
    default: 2,
    min: 0,
    max: 24
  },
  groupSpacing: {
    type: Number,
    default: 16,
    min: 0,
    max: 48
  },
  interfaceScale: {
    type: Number,
    default: 1.0,
    min: 0.5,
    max: 2.0
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Theme', themeSchema);
