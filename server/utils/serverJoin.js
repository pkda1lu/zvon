const User = require('../models/User');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const { logAction } = require('./auditLogger');

// Проверяет бан (с учётом истёкшего срока — снимает лениво) и кидает Error с .status, если пользователь забанен.
async function assertNotBanned(server, userId) {
  const ban = server.bans.find(b => String(b.user) === String(userId));
  if (!ban) return;
  if (ban.expiresAt && new Date(ban.expiresAt) <= new Date()) {
    server.bans = server.bans.filter(b => String(b.user) !== String(userId));
    return;
  }
  const err = new Error('You are banned from this server');
  err.status = 403;
  throw err;
}

// Добавляет участника, логирует MEMBER_JOIN и отправляет приветствие в welcomeChannel (если настроен).
async function handleMemberJoin(server, userId, io) {
  await assertNotBanned(server, userId);

  server.members.push({ user: userId });
  await server.save();

  const user = await User.findById(userId);
  if (user) {
    if (!user.servers) user.servers = [];
    if (!user.servers.includes(server._id)) { user.servers.push(server._id); await user.save(); }
  }

  await logAction({
    serverId: server._id,
    executorId: userId,
    targetId: userId,
    targetModel: 'User',
    action: 'MEMBER_JOIN'
  });

  if (server.welcomeEnabled !== false && server.welcomeChannel && (server.welcomeMessages || []).length > 0 && user) {
    try {
      const channel = await Channel.findById(server.welcomeChannel);
      if (channel && String(channel.server) === String(server._id)) {
        const template = server.welcomeMessages[Math.floor(Math.random() * server.welcomeMessages.length)];
        const content = template.replace(/\{user\}/g, user.displayName || user.username);
        const welcomeMsg = new Message({ content, author: userId, channel: channel._id, mentions: [userId] });
        await welcomeMsg.save();
        await welcomeMsg.populate('author', 'username avatar badges');
        if (io) io.to(`channel-${channel._id}`).emit('new-message', welcomeMsg);
      }
    } catch (e) {
      console.error('[Welcome message] failed:', e);
    }
  }
}

async function logMemberLeave(server, userId) {
  await logAction({
    serverId: server._id,
    executorId: userId,
    targetId: userId,
    targetModel: 'User',
    action: 'MEMBER_LEAVE'
  });
}

module.exports = { assertNotBanned, handleMemberJoin, logMemberLeave };
