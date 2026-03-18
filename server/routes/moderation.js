const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Report = require('../models/Report');
const { body, validationResult } = require('express-validator');

// Middleware to check for moderator/admin roles
const isModerator = async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (user && (user.role === 'moderator' || user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Доступ запрещен' });
  }
};

const isAdmin = async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (user && user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Требуются права администратора' });
  }
};

// Create a report
router.post('/report', auth, [
  body('userId').isMongoId().withMessage('Invalid user ID'),
  body('reason').notEmpty().withMessage('Reason is required'),
], async (req, res) => {
  try {
    const { userId, reason, description, messageId } = req.body;
    const report = new Report({
      reporter: req.user._id,
      reportedUser: userId,
      reason,
      description,
      messageContext: messageId || null
    });
    await report.save();
    res.status(201).json({ message: 'Жалоба успешно отправлена' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Get all reports (Moderator only)
router.get('/reports', [auth, isModerator], async (req, res) => {
  try {
    const reports = await Report.find({ status: 'pending' })
      .populate('reporter', 'username avatar')
      .populate('reportedUser', 'username avatar')
      .populate('messageContext')
      .sort('-createdAt');
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Resolve report (Moderator only)
router.post('/reports/:id/resolve', [auth, isModerator], async (req, res) => {
  try {
    const { status, note } = req.body;
    const report = await Report.findByIdAndUpdate(req.params.id, {
      status,
      resolvedBy: req.user._id,
      resolutionNote: note
    }, { new: true });
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Ban user (Moderator only)
router.post('/ban', [auth, isModerator], async (req, res) => {
  try {
    const { userId, type, reason, durationHours } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    
    // Admins cannot be banned by moderators
    const modUser = await User.findById(req.user._id);
    if (user.role === 'admin' && modUser.role !== 'admin') {
      return res.status(403).json({ message: 'Вы не можете забанить администратора' });
    }

    user.isBanned = true;
    user.banReason = reason;
    if (type === 'temporary' && durationHours) {
      user.banExpires = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    } else {
      user.banExpires = null; // Permanent
    }
    
    await user.save();
    res.json({ message: 'Пользователь успешно забанен' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Assign roles (Admin only)
router.post('/assign-role', [auth, isAdmin], async (req, res) => {
  try {
    const { userId, role } = req.body;
    const user = await User.findByIdAndUpdate(userId, { role }, { new: true });
    res.json({ message: `Роль ${role} успешно назначена пользователю ${user.username}`, user });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
