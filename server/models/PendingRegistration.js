const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  verificationCode: {
    type: String,
    required: true
  },
  verificationCodeExpires: {
    type: Date,
    required: true
  },
  verificationToken: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 1800 // Automatically clean up unverified registrations after 30 minutes
  }
});

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
