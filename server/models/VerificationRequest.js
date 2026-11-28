const mongoose = require('mongoose');

const verificationRequestSchema = new mongoose.Schema({
  _id: String,
  kind: { type: String, enum: ['profile', 'server'], required: true },
  target: { type: mongoose.Schema.Types.ObjectId, required: true },
  targetName: { type: String, required: true },
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'evidence', 'approved', 'rejected'], default: 'pending' },
  messages: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    moderator: { type: Boolean, default: false },
    action: { type: String, enum: ['reply', 'evidence', 'approved', 'rejected'], default: 'reply' },
    text: { type: String, required: true, maxlength: 4000 },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

verificationRequestSchema.index({ applicant: 1, updatedAt: -1 });
verificationRequestSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('VerificationRequest', verificationRequestSchema);
