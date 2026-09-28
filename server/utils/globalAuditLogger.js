const GlobalAuditLog = require('../models/GlobalAuditLog');

/** IP клиента за nginx и строка клиента — чтобы разбирать спорные действия. */
function requestMeta(req) {
  if (!req) return null;
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers?.['x-real-ip'] || req.ip || req.socket?.remoteAddress || null;
  const ua = String(req.headers?.['user-agent'] || '').slice(0, 300) || null;
  return { ip, userAgent: ua };
}

/**
 * Запись в глобальный журнал.
 * targetName — снимок названия цели (переживает её удаление),
 * req — чтобы записать IP и клиент исполнителя.
 */
const logGlobalAction = async ({
  executorId = null,
  action,
  targetId = null,
  targetModel = 'User',
  targetName = null,
  details = {},
  req = null
}) => {
  try {
    const meta = requestMeta(req);
    const log = new GlobalAuditLog({
      executor: executorId,
      action,
      target: targetId,
      targetModel,
      details: {
        ...details,
        ...(targetName ? { targetName: String(targetName).slice(0, 200) } : {}),
        ...(meta ? { meta } : {})
      }
    });
    await log.save();
    console.log(`[GlobalAudit] ${action} logged`);
  } catch (err) {
    console.error('[GlobalAudit] Failed to log action:', err);
  }
};

module.exports = { logGlobalAction };
