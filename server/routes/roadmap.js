const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const RoadmapItem = require('../models/RoadmapItem');
const User = require('../models/User');

// Middleware to check if user is moderator or admin
const isModerator = (req, res, next) => {
  if (req.user && (req.user.role === 'moderator' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Доступ разрешен только администраторам и модераторам' });
  }
};

// Optional auth to detect admins on GET requests
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.userId) {
        const user = await User.findById(decoded.userId).select('role').lean();
        if (user) req.user = user;
      }
    }
  } catch (e) {
    // Ignore invalid/expired tokens for public read
  }
  next();
};

// GET /api/roadmap - Public / Authenticated: List roadmap items
router.get('/', optionalAuth, async (req, res) => {
  try {
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'moderator');
    const filter = isAdmin ? {} : { adminOnly: { $ne: true } };

    const items = await RoadmapItem.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.json({ success: true, items });
  } catch (error) {
    console.error('Error fetching roadmap:', error);
    res.status(500).json({ message: 'Ошибка при загрузке дорожной карты' });
  }
});

// POST /api/roadmap - Admin/Moderator: Create new roadmap item
router.post('/', auth, isModerator, async (req, res) => {
  try {
    const { idea, description, targetDate, priority, adminOnly, isCompleted, completed } = req.body;

    if (!idea || typeof idea !== 'string' || !idea.trim()) {
      return res.status(400).json({ message: 'Поле "Идея" обязательно для заполнения' });
    }

    const lastItem = await RoadmapItem.findOne().sort({ order: -1 }).select('order');
    const nextOrder = lastItem && typeof lastItem.order === 'number' ? lastItem.order + 1 : 0;

    const isCompletedVal = Boolean(isCompleted !== undefined ? isCompleted : completed);

    const newItem = new RoadmapItem({
      idea: idea.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      targetDate: typeof targetDate === 'string' ? targetDate.trim() : '',
      priority: ['regular', 'major', 'massive', 'low', 'medium', 'high'].includes(priority) ? priority : '',
      adminOnly: Boolean(adminOnly),
      isCompleted: isCompletedVal,
      order: nextOrder,
      createdBy: req.user._id
    });

    await newItem.save();
    res.status(201).json({ success: true, item: newItem });
  } catch (error) {
    console.error('Error creating roadmap item:', error);
    res.status(500).json({ message: 'Не удалось создать этап дорожной карты' });
  }
});

// PUT /api/roadmap/reorder - Admin/Moderator: Reorder roadmap items
router.put('/reorder', auth, isModerator, async (req, res) => {
  try {
    const { orderedIds, items } = req.body;

    if (Array.isArray(orderedIds)) {
      const bulkOps = orderedIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { order: index, updatedAt: new Date() } }
        }
      }));
      if (bulkOps.length > 0) {
        await RoadmapItem.bulkWrite(bulkOps);
      }
    } else if (Array.isArray(items)) {
      const bulkOps = items.map((item, index) => ({
        updateOne: {
          filter: { _id: item.id || item._id },
          update: { $set: { order: typeof item.order === 'number' ? item.order : index, updatedAt: new Date() } }
        }
      }));
      if (bulkOps.length > 0) {
        await RoadmapItem.bulkWrite(bulkOps);
      }
    } else {
      return res.status(400).json({ message: 'Некорректный формат данных для сортировки' });
    }

    const updatedItems = await RoadmapItem.find().sort({ order: 1, createdAt: 1 }).lean();
    res.json({ success: true, items: updatedItems });
  } catch (error) {
    console.error('Error reordering roadmap items:', error);
    res.status(500).json({ message: 'Ошибка при изменении порядка этапов' });
  }
});

// PUT /api/roadmap/:id - Admin/Moderator: Update existing item
router.put('/:id', auth, isModerator, async (req, res) => {
  try {
    const { idea, description, targetDate, priority, adminOnly, order, isCompleted, completed } = req.body;

    const item = await RoadmapItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Этап не найден' });
    }

    if (idea !== undefined) {
      if (typeof idea !== 'string' || !idea.trim()) {
        return res.status(400).json({ message: 'Поле "Идея" обязательно для заполнения' });
      }
      item.idea = idea.trim();
    }

    if (description !== undefined) {
      item.description = typeof description === 'string' ? description.trim() : '';
    }

    if (targetDate !== undefined) {
      item.targetDate = typeof targetDate === 'string' ? targetDate.trim() : '';
    }

    if (priority !== undefined) {
      item.priority = ['regular', 'major', 'massive', 'low', 'medium', 'high'].includes(priority) ? priority : '';
    }

    if (adminOnly !== undefined) {
      item.adminOnly = Boolean(adminOnly);
    }

    if (isCompleted !== undefined || completed !== undefined) {
      item.isCompleted = Boolean(isCompleted !== undefined ? isCompleted : completed);
    }

    if (typeof order === 'number') {
      item.order = order;
    }

    item.updatedAt = new Date();
    await item.save();

    res.json({ success: true, item });
  } catch (error) {
    console.error('Error updating roadmap item:', error);
    res.status(500).json({ message: 'Не удалось обновить этап' });
  }
});

// DELETE /api/roadmap/:id - Admin/Moderator: Delete item
router.delete('/:id', auth, isModerator, async (req, res) => {
  try {
    const item = await RoadmapItem.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Этап не найден' });
    }
    res.json({ success: true, message: 'Этап успешно удален' });
  } catch (error) {
    console.error('Error deleting roadmap item:', error);
    res.status(500).json({ message: 'Не удалось удалить этап' });
  }
});

module.exports = router;
