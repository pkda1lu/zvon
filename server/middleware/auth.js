const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');
const { findOrCreateSessionForToken } = require('../utils/session');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    let user;
    let sessionId = null;
    let decoded = null;
    let isBot = false;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      user = await User.findById(decoded.userId).select('-password');
      sessionId = decoded.sid || null;
    } catch (jwtError) {
      if (token.startsWith('bot_')) {
        user = await User.findOne({ botToken: token, isBot: true }).select('-password');
        isBot = true;
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    // Сессии только для обычных пользовательских токенов (не ботов).
    if (!isBot && decoded) {
      if (sessionId) {
        // Токен привязан к сессии — она должна существовать (иначе отозвана).
        const session = await Session.findById(sessionId).select('_id').lean();
        if (!session) {
          return res.status(401).json({ message: 'Session revoked', sessionRevoked: true });
        }
        req.sessionId = sessionId;
      } else {
        // Старый токен без sid — «усыновляем» по хешу, чтобы устройство было видно.
        try {
          const session = await findOrCreateSessionForToken(user, req, token, decoded.exp);
          req.sessionId = session._id.toString();
        } catch (e) {
          // не блокируем запрос, если не удалось создать сессию
        }
      }

      if (req.sessionId) {
        // Обновляем «последнюю активность» не чаще раза в 60 сек.
        Session.updateOne(
          { _id: req.sessionId, lastActiveAt: { $lt: new Date(Date.now() - 60 * 1000) } },
          { $set: { lastActiveAt: new Date() } }
        ).catch(() => {});

        // Дозаполняем deviceId для старых сессий без него — чтобы группировка
        // по устройству работала и для входов, сделанных до этого изменения.
        const deviceId = req.header('x-device-id') || '';
        if (deviceId) {
          Session.updateOne(
            { _id: req.sessionId, $or: [{ deviceId: '' }, { deviceId: { $exists: false } }] },
            { $set: { deviceId } }
          ).catch(() => {});
        }
      }
    }

    // Check ban
    if (user.isBanned) {
      if (user.banExpires && user.banExpires < Date.now()) {
        user.isBanned = false;
        user.banExpires = undefined;
        user.banReason = undefined;
        await user.save();
      } else {
        const expiresMsg = user.banExpires ? ` до ${new Date(user.banExpires).toLocaleString()}` : ' НАВСЕГДА';
        return res.status(403).json({
          message: `Ваш аккаунт заблокирован${expiresMsg}. Причина: ${user.banReason || 'Не указана'}`,
          isBanned: true,
          banReason: user.banReason,
          banExpires: user.banExpires
        });
      }
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;










