const mongoose = require('mongoose');

const roadmapItemSchema = new mongoose.Schema({
  idea: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 2000
  },
  targetDate: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  },
  priority: {
    type: String,
    enum: ['regular', 'major', 'massive', 'low', 'medium', 'high', ''],
    default: ''
  },
  adminOnly: {
    type: Boolean,
    default: false
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

roadmapItemSchema.index({ order: 1, createdAt: -1 });

module.exports = mongoose.model('RoadmapItem', roadmapItemSchema);
