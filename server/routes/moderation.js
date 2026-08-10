const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Report = require('../models/Report');
const ProblemReport = require('../models/ProblemReport');
const Post = require('../models/Post');
const { body, validationResult } = require('express-validator');
const { pushToModerators, previewText } = require('../utils/webPush');

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

// Create a report — target can be a user (incl. bot) or a mini-app.
router.post('/report', auth, [
  body('reason').notEmpty().withMessage('Reason is required'),
], async (req, res) => {
  try {
    const { userId, miniAppId, reason, description, messageId } = req.body;
    if (!userId && !miniAppId) return res.status(400).json({ message: 'Нужно указать userId или miniAppId' });

    // Снимок контента, на который жалуются (переживает удаление оригинала).
    let contentSnapshot = null;
    if (messageId) {
      const Message = require('../models/Message');
      const msg = await Message.findById(messageId).populate('author', 'username avatar');
      if (msg) {
        contentSnapshot = {
          kind: 'message',
          text: msg.content || '',
          attachments: (msg.attachments || []).map(a => ({ url: a.url, type: a.type, filename: a.filename })),
          authorName: msg.author ? msg.author.username : null,
          createdAt: msg.createdAt
        };
      }
    }
    if (!contentSnapshot && miniAppId) {
      const MiniApp = require('../models/MiniApp');
      const app = await MiniApp.findById(miniAppId);
      if (app) {
        contentSnapshot = {
          kind: 'miniapp',
          appName: app.name,
          appUrl: app.url,
          appDescription: app.description || '',
          appAvatar: app.avatar || null
        };
      }
    }
    if (!contentSnapshot && userId) {
      const target = await User.findById(userId).select('username avatar bio isBot');
      if (target) {
        contentSnapshot = {
          kind: target.isBot ? 'bot' : 'profile',
          username: target.username,
          avatar: target.avatar || null,
          bio: target.bio || ''
        };
      }
    }

    const report = new Report({
      reporter: req.user._id,
      reportedUser: userId || null,
      reportedMiniApp: miniAppId || null,
      reason,
      description,
      messageContext: messageId || null,
      contentSnapshot
    });
    await report.save();

    // Оповещаем команду модерации. Жалобу разбирает любой свободный модератор,
    // поэтому шлём всем, кроме самого жалобщика (он тоже может быть модератором).
    // На кого жалуются — в заголовке, чтобы было видно с экрана блокировки.
    const targetName = contentSnapshot?.username
      || contentSnapshot?.authorName
      || contentSnapshot?.appName
      || null;
    pushToModerators(req.app.get('io'), {
      title: targetName ? `Новая жалоба: ${targetName}` : 'Новая жалоба',
      body: previewText(description || reason),
      tag: 'moderation-report',
      url: '/?settings=moderation',
      data: { type: 'report', reportId: String(report._id) }
    }, req.user._id);

    res.status(201).json({ message: 'Жалоба успешно отправлена' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Get reports (Moderator only)
router.get('/reports', [auth, isModerator], async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : { status: 'pending' };
    // Жалобы на мини-приложения сюда НЕ попадают — они живут во вкладке «Витрина»
    // (см. GET /marketplace/reports). reportedMiniApp: null матчит и отсутствие поля.
    query.reportedMiniApp = null;

    const reports = await Report.find(query)
      .populate('reporter', 'username avatar')
      .populate('reportedUser', 'username avatar')
      .populate('reportedServer', 'name icon')
      .populate('resolvedBy', 'username')
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
    }, { new: true }).populate('reportedUser').populate('reporter');
    
    // Notify the offender if resolved (meaning a violation was confirmed)
    if (status === 'resolved' && report.reportedUser) {
      const io = req.app.get('io');
      if (io) {
        io.to(`user-${report.reportedUser._id}`).emit('notification', {
          type: 'moderation_violation',
          message: `На ваш аккаунт поступила жалоба, которая была одобрена модератором: ${note}`,
          reason: report.reason,
          timestamp: new Date()
        });
      }
    }
    
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
    
    // Notify user of their ban status immediately via socket
    const io = req.app.get('io');
    if (io) {
      const expiresMsg = user.banExpires ? ` до ${new Date(user.banExpires).toLocaleString()}` : ' НАВСЕГДА';
      io.to(`user-${user._id}`).emit('account-banned', {
        type,
        reason,
        expires: user.banExpires,
        message: `Ваш аккаунт заблокирован${expiresMsg}. Причина: ${reason}`
      });
    }

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

// Unban user (Moderator only)
router.post('/unban', [auth, isModerator], async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    user.isBanned = false;
    user.banExpires = undefined;
    user.banReason = undefined;
    await user.save();

    res.json({ message: 'Пользователь успешно разбанен' });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Unresolve report (Moderator only)
router.post('/reports/:id/unresolve', [auth, isModerator], async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(req.params.id, {
      status: 'pending',
      resolvedBy: null,
      resolutionNote: null
    }, { new: true });
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// === Marketplace moderation: bots & mini-apps =============================
const MiniApp = require('../models/MiniApp');

// List all pending publication requests + currently approved (for blocking).
router.get('/marketplace', auth, isModerator, async (req, res) => {
  try {
    const status = req.query.status || 'pending'; // pending | approved | rejected | blocked
    const result = { bots: [], miniApps: [] };

    if (status === 'pending') {
      result.bots = await User.find({ isBot: true, botModerationStatus: 'pending' })
        .select('username avatar banner bio owner botModerationStatus botModerationReason')
        .populate('owner', 'username avatar');
      result.miniApps = await MiniApp.find({ moderationStatus: 'pending', isSystem: { $ne: true } })
        .populate('owner', 'username avatar');
    } else if (status === 'approved') {
      result.bots = await User.find({ isBot: true, isPublished: true, botIsBlocked: { $ne: true } })
        .select('username avatar banner bio owner botModerationStatus')
        .populate('owner', 'username avatar');
      result.miniApps = await MiniApp.find({ isPublished: true, isBlocked: { $ne: true } })
        .populate('owner', 'username avatar');
    } else if (status === 'rejected') {
      result.bots = await User.find({ isBot: true, botModerationStatus: 'rejected' })
        .select('username avatar banner bio owner botModerationStatus botModerationReason')
        .populate('owner', 'username avatar');
      result.miniApps = await MiniApp.find({ moderationStatus: 'rejected' })
        .populate('owner', 'username avatar');
    } else if (status === 'blocked') {
      result.bots = await User.find({ isBot: true, botIsBlocked: true })
        .select('username avatar banner bio owner botBlockReason')
        .populate('owner', 'username avatar');
      result.miniApps = await MiniApp.find({ isBlocked: true })
        .populate('owner', 'username avatar');
    }
    res.json(result);
  } catch (e) {
    console.error('marketplace list error:', e);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Жалобы на мини-приложения (живут во вкладке «Витрина» модерации).
router.get('/marketplace/reports', auth, isModerator, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const reports = await Report.find({ reportedMiniApp: { $ne: null }, status })
      .populate('reporter', 'username avatar')
      .populate({ path: 'reportedMiniApp', select: 'name avatar url owner isPublished isBlocked moderationStatus', populate: { path: 'owner', select: 'username avatar' } })
      .populate('resolvedBy', 'username')
      .sort('-createdAt');
    res.json(reports);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Approve a pending submission: publish it to showcase.
router.post('/marketplace/:type/:id/approve', auth, isModerator, async (req, res) => {
  try {
    const { type, id } = req.params;
    if (type === 'bot') {
      const bot = await User.findById(id);
      if (!bot || !bot.isBot) return res.status(404).json({ message: 'Бот не найден' });
      bot.botModerationStatus = 'approved';
      bot.isPublished = true;
      bot.botModerationReason = null;
      bot.botModeratedAt = new Date();
      bot.botModeratedBy = req.user._id;
      await bot.save();
    } else if (type === 'miniapp') {
      const app = await MiniApp.findById(id);
      if (!app) return res.status(404).json({ message: 'Приложение не найдено' });
      app.moderationStatus = 'approved';
      app.isPublished = true;
      app.moderationReason = null;
      app.moderatedAt = new Date();
      app.moderatedBy = req.user._id;
      await app.save();
    } else {
      return res.status(400).json({ message: 'Неверный тип' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Reject a pending submission with a reason.
router.post('/marketplace/:type/:id/reject', auth, isModerator, async (req, res) => {
  try {
    const { type, id } = req.params;
    const reason = (req.body?.reason || '').trim() || 'Не указана';
    if (type === 'bot') {
      const bot = await User.findById(id);
      if (!bot || !bot.isBot) return res.status(404).json({ message: 'Бот не найден' });
      bot.botModerationStatus = 'rejected';
      bot.isPublished = false;
      bot.botModerationReason = reason;
      bot.botModeratedAt = new Date();
      bot.botModeratedBy = req.user._id;
      await bot.save();
    } else if (type === 'miniapp') {
      const app = await MiniApp.findById(id);
      if (!app) return res.status(404).json({ message: 'Приложение не найдено' });
      app.moderationStatus = 'rejected';
      app.isPublished = false;
      app.moderationReason = reason;
      app.moderatedAt = new Date();
      app.moderatedBy = req.user._id;
      await app.save();
    } else {
      return res.status(400).json({ message: 'Неверный тип' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Force-block an already-published item (yanks it from showcase).
router.post('/marketplace/:type/:id/block', auth, isModerator, async (req, res) => {
  try {
    const { type, id } = req.params;
    const reason = (req.body?.reason || '').trim() || 'Без указания причины';
    if (type === 'bot') {
      const bot = await User.findById(id);
      if (!bot || !bot.isBot) return res.status(404).json({ message: 'Бот не найден' });
      bot.botIsBlocked = true;
      bot.botBlockReason = reason;
      bot.isPublished = false;
      bot.botModerationStatus = 'rejected';
      bot.botModeratedAt = new Date();
      bot.botModeratedBy = req.user._id;
      await bot.save();
    } else if (type === 'miniapp') {
      const app = await MiniApp.findById(id);
      if (!app) return res.status(404).json({ message: 'Приложение не найдено' });
      app.isBlocked = true;
      app.blockReason = reason;
      app.isPublished = false;
      app.moderationStatus = 'rejected';
      app.moderatedAt = new Date();
      app.moderatedBy = req.user._id;
      await app.save();
    } else {
      return res.status(400).json({ message: 'Неверный тип' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Unblock a previously-blocked item (returns to draft — author must resubmit).
router.post('/marketplace/:type/:id/unblock', auth, isModerator, async (req, res) => {
  try {
    const { type, id } = req.params;
    if (type === 'bot') {
      const bot = await User.findById(id);
      if (!bot || !bot.isBot) return res.status(404).json({ message: 'Бот не найден' });
      bot.botIsBlocked = false;
      bot.botBlockReason = null;
      bot.botModerationStatus = 'draft';
      await bot.save();
    } else if (type === 'miniapp') {
      const app = await MiniApp.findById(id);
      if (!app) return res.status(404).json({ message: 'Приложение не найдено' });
      app.isBlocked = false;
      app.blockReason = null;
      app.moderationStatus = 'draft';
      await app.save();
    } else {
      return res.status(400).json({ message: 'Неверный тип' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// === Problem reports (кнопка «Репорт» в левом сайдбаре) ===================

// Отправить жалобу на проблему в приложении. Уведомляет всех модераторов и админов.
router.post('/problem-report', auth, [
  body('subject').trim().notEmpty().withMessage('Нужен заголовок'),
  body('description').trim().notEmpty().withMessage('Нужно описание'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  try {
    const { subject, category, description, steps, attachments } = req.body;

    const cleanAttachments = Array.isArray(attachments)
      ? attachments
          .filter(a => a && a.url)
          .slice(0, 10)
          .map(a => ({ url: a.url, type: a.type, filename: a.filename, size: a.size }))
      : [];

    const report = new ProblemReport({
      reporter: req.user._id,
      subject,
      category: category || 'other',
      description,
      steps: steps || '',
      attachments: cleanAttachments
    });
    await report.save();

    // Уведомляем всех модераторов и админов.
    const staff = await User.find({ role: { $in: ['moderator', 'admin'] } }).select('_id');
    const io = req.app.get('io');
    if (io) {
      const reporter = await User.findById(req.user._id).select('username');
      const reporterName = reporter ? reporter.username : 'Пользователь';
      for (const member of staff) {
        if (String(member._id) === String(req.user._id)) continue;
        io.to(`user-${member._id}`).emit('notification', {
          type: 'problem_report',
          message: `${reporterName}: ${subject}`,
          reportId: report._id,
          timestamp: new Date()
        });
      }

      // Сокет-уведомление выше долетит только до открытого приложения.
      // Тем, у кого оно закрыто, отправляем системное.
      pushToModerators(io, {
        title: `Обращение: ${reporterName}`,
        body: previewText(subject),
        tag: 'moderation-problem',
        url: '/?settings=moderation',
        data: { type: 'problem_report', reportId: String(report._id) }
      }, req.user._id);
    }

    res.status(201).json({ message: 'Жалоба отправлена. Спасибо!' });
  } catch (err) {
    console.error('problem-report error:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Список жалоб на проблемы (модераторы/админы).
router.get('/problem-reports', [auth, isModerator], async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const reports = await ProblemReport.find({ status })
      .populate('reporter', 'username avatar')
      .populate('resolvedBy', 'username')
      .sort('-createdAt');
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Изменить статус жалобы на проблему (модераторы/админы).
router.post('/problem-reports/:id/resolve', [auth, isModerator], async (req, res) => {
  try {
    const { status, note } = req.body;
    const newStatus = status || 'resolved';
    const report = await ProblemReport.findByIdAndUpdate(req.params.id, {
      status: newStatus,
      resolvedBy: req.user._id,
      resolutionNote: note || ''
    }, { new: true });

    // Уведомляем автора жалобы о решении (но не при возврате в «ожидание»).
    if (report && report.reporter && (newStatus === 'resolved' || newStatus === 'dismissed')) {
      const io = req.app.get('io');
      if (io) {
        const verdict = newStatus === 'resolved' ? 'решена' : 'отклонена';
        const tail = note ? ` Комментарий: ${note}` : '';
        io.to(`user-${report.reporter}`).emit('notification', {
          type: 'problem_resolved',
          message: `Ваша жалоба «${report.subject}» ${verdict}.${tail}`,
          reportId: report._id,
          status: newStatus,
          timestamp: new Date()
        });
      }
    }

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// === Посты-объявления ======================================================

// Нормализуем опросы: гарантируем структуру votes и id у опций.
function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 100).map(b => {
    if (!b || typeof b !== 'object') return null;
    if (b.type === 'poll') {
      const options = Array.isArray(b.options) ? b.options.slice(0, 20).map(o => ({
        id: String(o.id || Math.random().toString(36).slice(2, 10)),
        text: String(o.text || ''),
        ...(o.custom ? { custom: true } : {})
      })) : [];
      return { ...b, allowCustom: !!b.allowCustom, options, votes: {} };
    }
    return b;
  }).filter(Boolean);
}

// Создать пост (модераторы/админы).
router.post('/posts', [auth, isModerator], async (req, res) => {
  try {
    const { title, blocks, active } = req.body;
    const post = new Post({
      author: req.user._id,
      title: title || '',
      blocks: sanitizeBlocks(blocks),
      active: active !== false
    });
    await post.save();
    // Только один активный пост одновременно — выключаем остальные.
    if (post.active) {
      await Post.updateMany({ _id: { $ne: post._id }, active: true }, { active: false });
    }
    res.status(201).json(post);
  } catch (err) {
    console.error('create post error:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Список всех постов (модераторы/админы).
router.get('/posts', [auth, isModerator], async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('author', 'username avatar')
      .sort('-createdAt');
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Редактировать пост. Сброс seenBy при включении/изменении показывает его заново.
router.put('/posts/:id', [auth, isModerator], async (req, res) => {
  try {
    const { title, blocks, active, resetSeen } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Пост не найден' });

    if (title !== undefined) post.title = title;
    if (blocks !== undefined) post.blocks = sanitizeBlocks(blocks);
    if (active !== undefined) post.active = active;
    if (resetSeen) post.seenBy = [];
    post.updatedAt = new Date();

    await post.save();
    // Только один активный пост одновременно — выключаем остальные.
    if (post.active) {
      await Post.updateMany({ _id: { $ne: post._id }, active: true }, { active: false });
    }
    res.json(post);
  } catch (err) {
    console.error('update post error:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Удалить пост (модераторы/админы).
router.delete('/posts/:id', [auth, isModerator], async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Активные посты, которые текущий пользователь ещё не видел (для всплытия).
router.get('/posts/pending', auth, async (req, res) => {
  try {
    const posts = await Post.find({ active: true, seenBy: { $ne: req.user._id } })
      .populate('author', 'username avatar')
      .sort('createdAt');
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Пометить пост просмотренным (показываем один раз).
router.post('/posts/:id/seen', auth, async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { $addToSet: { seenBy: req.user._id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Проголосовать в опросе внутри поста.
router.post('/posts/:id/vote', auth, async (req, res) => {
  try {
    const { blockId, optionIds } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Пост не найден' });

    const block = (post.blocks || []).find(b => b && b.id === blockId && b.type === 'poll');
    if (!block) return res.status(404).json({ message: 'Опрос не найден' });

    const votes = block.votes && typeof block.votes === 'object' ? block.votes : {};
    const uid = String(req.user._id);
    const validIds = new Set((block.options || []).map(o => o.id));

    // Снимаем прежние голоса пользователя.
    for (const optId of Object.keys(votes)) {
      votes[optId] = (votes[optId] || []).filter(u => String(u) !== uid);
    }
    // Добавляем новые (для одиночного опроса берём только первый).
    const chosen = Array.isArray(optionIds) ? optionIds : [optionIds];
    const toApply = block.multiple ? chosen : chosen.slice(0, 1);
    for (const optId of toApply) {
      if (!validIds.has(optId)) continue;
      if (!votes[optId]) votes[optId] = [];
      votes[optId].push(uid);
    }

    block.votes = votes;
    post.markModified('blocks');
    await post.save();
    res.json({ blockId, votes: block.votes });
  } catch (err) {
    console.error('post vote error:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Добавить свой вариант ответа в опрос поста (если разрешено) и сразу проголосовать за него.
router.post('/posts/:id/poll-option', auth, async (req, res) => {
  try {
    const { blockId, text } = req.body;
    const clean = String(text || '').trim().slice(0, 120);
    if (!clean) return res.status(400).json({ message: 'Пустой вариант' });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Пост не найден' });

    const block = (post.blocks || []).find(b => b && b.id === blockId && b.type === 'poll');
    if (!block) return res.status(404).json({ message: 'Опрос не найден' });
    if (!block.allowCustom) return res.status(403).json({ message: 'Свои варианты запрещены' });

    block.options = Array.isArray(block.options) ? block.options : [];
    if (block.options.length >= 30) return res.status(400).json({ message: 'Слишком много вариантов' });

    const uid = String(req.user._id);
    const votes = block.votes && typeof block.votes === 'object' ? block.votes : {};

    // Не плодим дубликаты — если такой вариант уже есть, просто голосуем за него.
    let option = block.options.find(o => String(o.text).toLowerCase() === clean.toLowerCase());
    if (!option) {
      option = { id: Math.random().toString(36).slice(2, 10), text: clean, custom: true };
      block.options.push(option);
    }

    if (!block.multiple) {
      for (const optId of Object.keys(votes)) votes[optId] = (votes[optId] || []).filter(u => String(u) !== uid);
    }
    if (!votes[option.id]) votes[option.id] = [];
    if (!votes[option.id].some(u => String(u) === uid)) votes[option.id].push(uid);

    block.votes = votes;
    post.markModified('blocks');
    await post.save();
    res.json({ blockId, options: block.options, votes: block.votes });
  } catch (err) {
    console.error('post poll-option error:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
