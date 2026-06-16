const GlobalAuditLog = require('../models/GlobalAuditLog');

const logGlobalAction = async ({
  executorId = null,
  action,
  targetId = null,
  targetModel = 'User',
  details = {}
}) => {
  try {
    const log = new GlobalAuditLog({
      executor: executorId,
      action,
      target: targetId,
      targetModel,
      details
    });
    await log.save();
    console.log(`[GlobalAudit] ${action} logged`);
  } catch (err) {
    console.error('[GlobalAudit] Failed to log action:', err);
  }
};

module.exports = { logGlobalAction };
