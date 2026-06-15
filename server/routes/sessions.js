const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const auth = require('../middleware/auth');

// Маскируем IP для отображения (не отдаём полный адрес целиком в открытую,
// но достаточно для распознавания пользователем).
function publicSession(s, currentId) {
  return {
    id: s._id,
    browser: s.browser,
    os: s.os,
    deviceType: s.deviceType,
    deviceName: s.deviceName,
    ip: s.ip,
    country: s.country,
    countryCode: s.countryCode,
    city: s.city,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    current: String(s._id) === String(currentId)
  };
}

// GET /api/sessions — список активных сессий аккаунта.
router.get('/', auth, async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.user._id })
      .sort({ lastActiveAt: -1 })
      .lean();
    res.json(sessions.map((s) => publicSession(s, req.sessionId)));
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/sessions/others — завершить все сессии, кроме текущей.
router.delete('/others', auth, async (req, res) => {
  try {
    const query = { user: req.user._id };
    if (req.sessionId) query._id = { $ne: req.sessionId };
    const result = await Session.deleteMany(query);
    res.json({ message: 'Остальные сессии завершены', revoked: result.deletedCount });
  } catch (error) {
    console.error('Revoke other sessions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/sessions/:id — завершить конкретную сессию.
router.delete('/:id', auth, async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) {
      return res.status(404).json({ message: 'Сессия не найдена' });
    }
    const isCurrent = String(session._id) === String(req.sessionId);
    await session.deleteOne();
    res.json({ message: 'Сессия завершена', current: isCurrent });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
