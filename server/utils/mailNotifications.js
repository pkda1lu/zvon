const mongoose = require('mongoose');
const { inboxHead } = require('./incomingMail');
const { notifyModerators } = require('./webPush');

function startMailNotifications(io) {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASS) return;
  let running = false;
  async function check() {
    if (running || mongoose.connection.readyState !== 1) return;
    running = true;
    try {
      const { validity, nextUid } = await inboxHead();
      if (!Number.isSafeInteger(nextUid) || nextUid < 1) return;
      const checkpoints = mongoose.connection.collection('mail_checkpoints');
      const id = process.env.IMAP_HOST + ':' + process.env.IMAP_USER + ':' + validity;
      await checkpoints.updateOne({ _id: id }, { $setOnInsert: { nextUid } }, { upsert: true });
      const updated = await checkpoints.updateOne({ _id: id, nextUid: { $lt: nextUid } }, { $max: { nextUid } });
      if (updated.modifiedCount) await notifyModerators(io, {
        category: 'modMail',
        socket: { type: 'support_mail', message: 'В ящик поддержки поступила новая почта' }
      });
    } catch (error) {
      console.error('[incoming-mail] Проверка входящих:', error.code || error.name);
    } finally {
      running = false;
    }
  }
  void check();
  setInterval(check, 60000).unref();
}

module.exports = { startMailNotifications };
