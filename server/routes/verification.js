const router = require('express').Router();
const auth = require('../middleware/auth');
const Server = require('../models/Server');
const VerificationRequest = require('../models/VerificationRequest');

const isModerator = user => ['admin', 'moderator'].includes(user.role);
const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const validKind = kind => kind === 'profile' || kind === 'server';
const requestId = (kind, target, applicant) => `${kind}:${target}:${applicant}`;
const openStatuses = ['pending', 'evidence'];

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'Заявка уже существует' });
      console.error('[verification]', error.name);
      res.status(500).json({ message: 'Не удалось обработать заявку' });
    }
  };
}

router.use(auth);
router.get('/badge/:kind/:target', handle(async (req, res) => {
  const { kind, target } = req.params;
  if (!validKind(kind) || !validId(target)) return res.sendStatus(400);
  const owner = kind === 'server' ? (await Server.findById(target).select('owner').lean())?.owner : target;
  const approved = owner && await VerificationRequest.exists({ _id: requestId(kind, target.toLowerCase(), owner), status: 'approved' });
  res.json({ verified: Boolean(approved) });
}));

router.get('/requests', handle(async (req, res) => {
  const moderation = req.query.moderation === '1';
  if (moderation && !isModerator(req.user)) return res.sendStatus(403);
  const query = moderation ? { status: { $in: openStatuses } } : { applicant: req.user._id };
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const items = await VerificationRequest.find(query).sort({ updatedAt: -1, _id: -1 })
    .skip((page - 1) * 20).limit(21).select('-messages')
    .populate('applicant', 'username displayName').lean();
  res.json({ items: items.slice(0, 20), hasMore: items.length > 20 });
}));

router.post('/requests', handle(async (req, res) => {
  const { kind, target: suppliedTarget, text } = req.body || {};
  const applicant = req.user._id;
  const target = kind === 'profile' ? String(applicant) : suppliedTarget;
  if (!validKind(kind) || !validId(target) || typeof text !== 'string' || !text.trim() || text.length > 4000) return res.sendStatus(400);
  if (req.user.isBot) return res.sendStatus(403);
  const server = kind === 'server' ? await Server.findOne({ _id: target, owner: applicant }).select('name') : null;
  if (kind === 'server' && !server) return res.sendStatus(403);
  const targetName = server?.name || req.user.displayName || req.user.username;
  const _id = requestId(kind, target.toLowerCase(), applicant);
  const message = { author: applicant, text: text.trim() };
  const reopened = await VerificationRequest.findOneAndUpdate({ _id, status: 'rejected' }, {
    $set: { status: 'pending', targetName }, $push: { messages: message },
  }, { new: true });
  const item = reopened || await VerificationRequest.create({ _id, kind, target, targetName, applicant, messages: [message] });
  res.status(201).json(item);
}));

router.get('/requests/:id', handle(async (req, res) => {
  const query = { _id: req.params.id };
  if (!isModerator(req.user)) query.applicant = req.user._id;
  const item = await VerificationRequest.findOne(query).populate('applicant', 'username displayName').lean();
  if (!item) return res.sendStatus(404);
  res.json(item);
}));

router.post('/requests/:id/messages', handle(async (req, res) => {
  const { text, action = 'reply' } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 || !['reply', 'evidence', 'approved', 'rejected'].includes(action)) return res.sendStatus(400);
  const query = { _id: req.params.id };
  if (!isModerator(req.user)) query.applicant = req.user._id;
  const current = await VerificationRequest.findOne(query).select('applicant status kind target');
  if (!current) return res.sendStatus(404);
  const staff = isModerator(req.user) && !current.applicant.equals(req.user._id);
  if (action !== 'reply' && !staff) return res.sendStatus(403);
  if (action === 'approved' && current.kind === 'server' && !await Server.exists({ _id: current.target, owner: current.applicant })) {
    return res.status(409).json({ message: 'Заявитель больше не владеет сервером' });
  }
  if (!openStatuses.includes(current.status)) return res.status(409).json({ message: 'Заявка закрыта' });
  const update = { $push: { messages: { author: req.user._id, moderator: staff, action, text: text.trim() } } };
  if (action !== 'reply') update.$set = { status: action };
  if (!staff && current.status === 'evidence') update.$set = { status: 'pending' };
  const item = await VerificationRequest.findOneAndUpdate({ ...query, status: current.status }, update, { new: true })
    .populate('applicant', 'username displayName');
  if (!item) return res.status(409).json({ message: 'Статус заявки изменился. Обновите переписку.' });
  res.json(item);
}));

module.exports = router;
