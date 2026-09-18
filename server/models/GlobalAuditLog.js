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
      'SERVER_MEMBER_BAN',
      'BOT_CREATE',
      'BOT_DELETE',
      'MINIAPP_CREATE',
      'MODERATION_REPORT_RESOLVE',
      'MODERATION_BAN',
      'MODERATION_NOTIFY',
      // Vlyne ID: выдача и отзыв доступа приложению экосистемы.
      'VLYNE_ID_AUTHORIZE',
      'VLYNE_ID_REVOKE',
      // Действия по 152-ФЗ. Писались и раньше (personalData.js, pdErasure.js),
      // но отсутствовали в перечне — значит, mongoose отклонял их проверкой, а
      // logGlobalAction гасил ошибку. В итоге выгрузка и обезличивание данных
      // нигде не фиксировались, хотя именно их журналировать и обязаны.
      'PD_EXPORT',
      'PD_ACCOUNT_ANONYMIZED',
      // Заявки на подключение приложений к Vlyne ID: кто подал и кто решил.
      'VLYNE_APP_SUBMIT',
      'VLYNE_APP_DECISION',
      'VLYNE_APP_DELETED',
      // Управление брендами
      'BRAND_CREATE',
      'BRAND_UPDATE',
      'BRAND_DELETE',
      'BRAND_TOGGLE'
    ]
  },
  target: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel',
    default: null
  },
  targetModel: {
    type: String,
    enum: ['User', 'Server', 'Report', 'MiniApp', 'Brand'],
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
