const mongoose = require('mongoose');

/**
 * Ежедневная агрегированная запись активности пользователя.
 * Хранит историю DAU и распределения по брендам без TTL и без риска потери данных при удалении сессий.
 * 
 * Уникальный составной ключ: (day, user, brand)
 * day хранится в формате "YYYY-MM-DD"
 */
const dailyUserActivitySchema = new mongoose.Schema({
  day: {
    type: String,
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  brand: {
    type: String,
    default: 'zvon',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Уникальный индекс: пользователь может быть учтён с данным брендом в данный день не более одного раза
dailyUserActivitySchema.index({ day: 1, user: 1, brand: 1 }, { unique: true });
// Индекс для быстрой фильтрации по диапазону дней
dailyUserActivitySchema.index({ day: 1, brand: 1 });

module.exports = mongoose.model('DailyUserActivity', dailyUserActivitySchema);
