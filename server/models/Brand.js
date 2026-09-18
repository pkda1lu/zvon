const mongoose = require('mongoose');

const appIconSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  img: { type: String, required: true },
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

const brandBannerSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  text: { type: String, default: '', trim: true },
  closable: { type: Boolean, default: true },
  bg: { type: String, default: '' },
  color: { type: String, default: '' }
}, { _id: false });

const brandSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9_-]+$/
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  domain: {
    type: String,
    default: '',
    trim: true,
    lowercase: true
  },
  domainBehavior: {
    type: String,
    enum: ['open', 'redirect', 'disabled'],
    default: 'open'
  },
  supportEmail: {
    type: String,
    default: '',
    trim: true
  },
  logo: {
    type: String,
    default: 'zvonlogonew.png',
    trim: true
  },
  favicon: {
    type: String,
    default: 'icon.png',
    trim: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  isBuiltin: {
    type: Boolean,
    default: false
  },
  banner: {
    type: brandBannerSchema,
    default: () => ({ enabled: false, text: '', closable: true, bg: '', color: '' })
  },
  appIcons: {
    type: [appIconSchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Brand', brandSchema);
