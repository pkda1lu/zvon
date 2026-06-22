const mongoose = require('mongoose');

// Пост-объявление: создаётся модератором/админом и всплывает у пользователя
// при следующем входе (один раз). Контент — массив блоков (текст со стилями,
// медиа, опросы, разделители). Блоки хранятся как Mixed ради гибкости редактора.
const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    default: '',
    maxlength: 200
  },
  blocks: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  active: {
    type: Boolean,
    default: true
  },
  // Кто уже видел пост (чтобы показать только один раз).
  seenBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Post', postSchema);
