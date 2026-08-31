const mongoose = require('mongoose');

const themeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 32
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  theme: {
    type: String,
    enum: ['dark', 'amoled'],
    default: 'dark'
  },
  customColors: {
    primary: { type: String, default: '#006aff' },
    secondary: { type: String, default: '#7000ff' },
    accent: { type: String, default: '#ff00c8' }
  },
  customBackground: {
    type: String,
    default: ''
  },
  backgroundDim: {
    type: Number,
    default: 40,
    min: 0,
    max: 100
  },
  backgroundBlur: {
    type: Number,
    default: 0,
    min: 0,
    max: 20
  },
  messageSpacing: {
    type: Number,
    default: 2,
    min: 0,
    max: 24
  },
  groupSpacing: {
    type: Number,
    default: 16,
    min: 0,
    max: 48
  },
  interfaceScale: {
    type: Number,
    default: 1.0,
    min: 0.5,
    max: 2.0
  },
  /**
   * Пожелание автора опубликовать тему. Само по себе публикации не даёт —
   * решает модерация. Оставлено отдельным полем, чтобы после отклонения было
   * видно, что человек публикации хотел, и он мог отправить тему повторно.
   */
  isPublic: {
    type: Boolean,
    default: false
  },

  /*
   * Цикл модерации — тот же, что у мини-приложений и ботов (см. MiniApp,
   * routes/moderation.js). Общий вид даёт готовый раздел модерации: тема
   * добавляется третьим типом рядом с ними, а не заводит свой порядок.
   *
   *   draft     — личная тема, публиковать не просили;
   *   pending   — отправлена, ждёт проверки;
   *   approved  — одобрена, видна в общем списке (вместе с isPublished);
   *   rejected  — отклонена, причина в moderationReason.
   */
  moderationStatus: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected'],
    default: 'draft'
  },
  moderationReason: { type: String, default: null },
  moderatedAt: { type: Date, default: null },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  /** Видна ли тема в общем списке. Ставится только модерацией. */
  isPublished: {
    type: Boolean,
    default: false
  },
  /** Снята с публикации после жалоб. Отдельно от rejected: это уже про
   *  опубликованную тему, а не про заявку. */
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockReason: { type: String, default: null },

  /** Сколько раз тему применили — по нему сортируется общий список. */
  installs: {
    type: Number,
    default: 0
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Общий список: только одобренные и не заблокированные, по популярности.
themeSchema.index({ isPublished: 1, isBlocked: 1, installs: -1 });
// Свои темы и очередь модерации.
themeSchema.index({ creator: 1, createdAt: -1 });
themeSchema.index({ moderationStatus: 1 });

module.exports = mongoose.model('Theme', themeSchema);
