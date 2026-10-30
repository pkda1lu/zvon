const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Award = require('../models/Award');
const Grant = require('../models/AwardGrant');
const Visit = require('../models/AwardVisit');
const { syncAwards, insertGrants } = require('../utils/awards');
const { logGlobalAction } = require('../utils/globalAuditLogger');
const { getBlockState, asList, areFriends } = require('../utils/privacy');
const Server = require('../models/Server');
const { validAppearance, createCollectible, editionNumber } = require('../utils/awardCollectibles');

router.use(auth);
const run = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const moderator = (req, res, next) => ['admin', 'moderator'].includes(req.user.role) ? next() : res.status(403).json({ message: 'Требуются права модератора' });
const validId = id => mongoose.isValidObjectId(id);
const audit = (req, details) => logGlobalAction({ executorId: req.user._id, action: 'AWARD_MANAGE', details, req });

router.get('/user/:id', run(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Неверный ID' });
  const user = await User.findById(req.params.id);
  if (!user || user.isDeleted) return res.status(404).json({ message: 'Пользователь не найден' });
  if (String(user._id) !== String(req.user._id)) {
    const { blockedMe } = await getBlockState(req.user._id, user._id);
    if (blockedMe) return res.json([]);
    const rule = asList(user.settings?.whoCanSeeFullProfile, 'everyone');
    let visible = rule.includes('everyone');
    if (!visible && rule.includes('friends')) visible = await areFriends(req.user._id, user._id);
    if (!visible && rule.includes('small_servers')) {
      const servers = await Server.find({ 'members.user': { $all: [req.user._id, user._id] } }).select('members').lean();
      visible = servers.some(s => s.members.length <= (user.settings?.smallServerLimit || 50));
    }
    if (!visible || rule.includes('nobody')) return res.json([]);
  }
  await syncAwards(user);
  const grants = await Grant.find({ user: user._id, revoked: false }).populate('award').sort({ createdAt: -1 }).lean();
  const visible = grants.filter(g => g.award);
  const upgrades = [];
  for (const grant of visible) {
    if (!grant.collectible) {
      grant.collectible = createCollectible(grant.award, String(grant._id));
      upgrades.push({ updateOne: { filter: { _id: grant._id, collectible: null }, update: { $set: { collectible: grant.collectible } } } });
    }
    grant.edition = editionNumber(grant._id);
  }
  if (upgrades.length) await Grant.bulkWrite(upgrades, { ordered: false });
  res.json(visible);
}));
router.use(moderator);
router.get('/', run(async (req, res) => res.json(await Award.find().sort({ createdAt: -1 }).lean())));
router.post('/', run(async (req, res) => {
  const { name, description = '', model, color, rule, date, appearance } = req.body;
  const cutoff = rule === 'manual' ? null : new Date(`${date}T00:00:00+03:00`);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || typeof description !== 'string' || description.length > 500 ||
      !['trophy', 'medal', 'crystal'].includes(model) || !/^#[0-9a-f]{6}$/i.test(color || '') ||
      !['manual', 'registered_before', 'visited_before'].includes(rule) || !validAppearance(appearance) ||
      (rule !== 'manual' && (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(+cutoff) || new Date(+cutoff + 3 * 3600000).toISOString().slice(0, 10) !== date))) {
    return res.status(400).json({ message: 'Проверьте название, модель и дату условия' });
  }
  const award = await Award.create({ name: name.trim(), description, model, color, rule, cutoff, appearance, creator: req.user._id });
  await audit(req, { operation: 'create', awardId: award._id, name: award.name, rule, cutoff, appearance: award.appearance });
  res.status(201).json(award);
}));
// Apply to existing accounts in bounded batches. Unique grants make retries safe.
router.post('/:id/apply', run(async (req, res) => {
  if (!validId(req.params.id)) return res.sendStatus(400);
  const award = await Award.findById(req.params.id);
  if (!award || !award.enabled || award.rule === 'manual') return res.status(400).json({ message: 'Нет активного условия' });
  let count = 0;
  const cursor = (award.rule === 'registered_before'
    ? User.find({ createdAt: { $lt: award.cutoff }, isBot: { $ne: true }, isDeleted: { $ne: true } }).select('_id')
    : Visit.find({ firstVisitedAt: { $lt: award.cutoff } }).select('user')).lean().cursor();
  let ops = [];
  const flush = async () => { if (ops.length) { const result = await insertGrants(ops); count += result?.upsertedCount || 0; ops = []; } };
  for await (const item of cursor) {
    if (award.rule === 'visited_before' && !await User.exists({ _id: item.user, isBot: { $ne: true }, isDeleted: { $ne: true } })) continue;
    ops.push({ updateOne: { filter: { user: item.user || item._id, award: award._id }, update: { $setOnInsert: { source: 'rule', revoked: false, collectible: createCollectible(award) } }, upsert: true } });
    if (ops.length >= 200) await flush();
  }
  await flush();
  await audit(req, { operation: 'apply', awardId: award._id, count });
  res.json({ count });
}));
router.patch('/:id', run(async (req, res) => {
  if (!validId(req.params.id) || typeof req.body.enabled !== 'boolean') return res.sendStatus(400);
  const award = await Award.findByIdAndUpdate(req.params.id, { $set: { enabled: req.body.enabled } }, { new: true });
  if (!award) return res.sendStatus(404);
  await audit(req, { operation: 'toggle', awardId: award._id, enabled: award.enabled });
  res.json(award);
}));
router.post('/:id/grant', run(async (req, res) => {
  if (!validId(req.params.id) || typeof req.body.username !== 'string' || !req.body.username.trim() || (req.body.revoke !== undefined && typeof req.body.revoke !== 'boolean')) return res.sendStatus(400);
  const award = await Award.findById(req.params.id);
  const user = await User.findOne({ username: req.body.username, isBot: { $ne: true }, isDeleted: { $ne: true } });
  if (!award || !user) return res.status(404).json({ message: 'Награда или пользователь не найдены' });
  await Grant.updateOne({ user: user._id, award: award._id }, { $set: { source: 'manual', grantedBy: req.user._id, revoked: req.body.revoke === true }, $setOnInsert: { collectible: createCollectible(award) } }, { upsert: true });
  await audit(req, { operation: req.body.revoke ? 'revoke' : 'grant', awardId: award._id, userId: user._id });
  res.json({ message: req.body.revoke ? 'Награда отозвана' : 'Награда выдана' });
}));
module.exports = router;
