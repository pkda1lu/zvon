const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportedMiniApp: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MiniApp'
  },
  reportedServer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server'
  },
  reason: {
    type: String,
    required: true,
    enum: ['harassment', 'spam', 'inappropriate_content', 'scam', 'other']
  },
  description: {
    type: String,
    maxlength: 1000
  },
  messageContext: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  // Снимок того, НА ЧТО пожаловались, на момент подачи жалобы — чтобы контент
  // оставался виден модератору, даже если сообщение/объект потом удалили.
  // { kind: 'message'|'miniapp'|'profile', text, attachments:[{url,type,filename}],
  //   authorName, appName, appUrl, appDescription, appAvatar, username, avatar, bio }
  contentSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'resolved', 'dismissed'],
    default: 'pending'
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolutionNote: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.materializedModel ? mongoose.model('Report', reportSchema) : mongoose.model('Report', reportSchema);
