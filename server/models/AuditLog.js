const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    server: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Server',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        required: true
    },
    targetType: {
        type: String,
        required: true // 'server', 'channel', 'role', 'member', etc.
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId
    },
    changes: {
        type: mongoose.Schema.Types.Mixed
    },
    reason: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { strict: false });

module.exports = mongoose.model('AuditLog', auditLogSchema);
