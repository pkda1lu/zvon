const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  icon: {
    type: String,
    default: null
  },
  banner: {
    type: String,
    default: null
  },
  bannerColor: {
    type: String,
    default: '#5865f2'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    roles: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role'
    }],
    nickname: {
      type: String,
      maxlength: 100,
      default: null
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    communicationDisabledUntil: {
      type: Date,
      default: null
    },
    bio: {
      type: String,
      maxlength: 300,
      default: null
    },
    avatar: {
      type: String,
      default: null
    },
    banner: {
      type: String,
      default: null
    }
  }],
  channels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel'
  }],
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Server', serverSchema);






