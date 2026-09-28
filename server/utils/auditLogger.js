const AuditLog = require('../models/AuditLog');

/**
 * Название цели для снимка, если вызывающий его не передал: участник,
 * канал или сервер. Ошибки не мешают записи — снимок просто останется пустым.
 */
async function resolveTargetName(targetId, targetModel) {
  if (!targetId) return null;
  try {
    if (targetModel === 'User') {
      const User = require('../models/User');
      const u = await User.findById(targetId).select('username displayName').lean();
      return u ? (u.displayName || u.username) : null;
    }
    if (targetModel === 'Channel') {
      const Channel = require('../models/Channel');
      const c = await Channel.findById(targetId).select('name').lean();
      return c ? c.name : null;
    }
    if (targetModel === 'Server') {
      const Server = require('../models/Server');
      const s = await Server.findById(targetId).select('name').lean();
      return s ? s.name : null;
    }
  } catch { /* снимок необязателен */ }
  return null;
}

const logAction = async ({
  serverId,
  executorId,
  targetId,
  targetModel,
  action,
  changes = [],
  reason = null,
  targetName = null,
  details = {}
}) => {
  try {
    const name = targetName || await resolveTargetName(targetId, targetModel);
    const log = new AuditLog({
      server: serverId,
      executor: executorId,
      target: targetId,
      targetModel,
      targetName: name ? String(name).slice(0, 200) : null,
      action,
      changes,
      reason,
      details
    });
    await log.save();
    console.log(`[Audit] ${action} logged for server ${serverId}`);
  } catch (err) {
    console.error('[Audit] Failed to log action:', err);
  }
};

module.exports = { logAction };
