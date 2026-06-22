const mongoose = require('mongoose');

// Жалоба на проблему/баг в самом приложении (не на пользователя/контент).
// Отправляется из кнопки «Репорт» в левом сайдбаре и уходит модераторам и админам.
const problemReportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true,
    maxlength: 200
  },
  category: {
    type: String,
    enum: ['bug', 'voice', 'performance', 'ui', 'payment', 'other'],
    default: 'other'
  },
  description: {
    type: String,
    required: true,
    maxlength: 4000
  },
  steps: {
    type: String,
    maxlength: 2000
  },
  attachments: [{
    url: String,
    // `type` — зарезервированное слово Mongoose, поэтому оборачиваем явно,
    // иначе подобъект трактуется как [String] и save() падает с CastError.
    type: { type: String },
    filename: String,
    size: Number
  }],
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

module.exports = mongoose.model('ProblemReport', problemReportSchema);
