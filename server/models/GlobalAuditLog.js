const mongoose = require('mongoose');

const globalAuditLogSchema = new mongoose.Schema({
  executor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Null if system action (e.g. automated cleanup)
  },
  action: {
    type: String,
    required: true,
    enum: [
      'USER_REGISTER',
      'USER_LOGIN',
      'USER_DELETE',
      'USER_BLOCK',
      'USER_UNBLOCK',
      'USER_UPDATE',
      'SERVER_CREATE',
      'SERVER_DELETE',
      'SERVER_UPDATE',
      'MODERATION_REPORT_RESOLVE',
      'MODERATION_BAN'
    ]
  },
  target: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel',
    default: null
  },
  targetModel: {
    type: String,
    enum: ['User', 'Server', 'Report', 'MiniApp'],
    default: 'User'
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index for filtering actions by time
globalAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('GlobalAuditLog', globalAuditLogSchema);
