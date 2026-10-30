const Award = require('../models/Award');
const Grant = require('../models/AwardGrant');
const Visit = require('../models/AwardVisit');
const { createCollectible } = require('./awardCollectibles');

function eligible(award, user, visit) {
  const date = award.rule === 'registered_before' ? user.createdAt : visit?.firstVisitedAt;
  return award.enabled && award.rule !== 'manual' && !!date && !!award.cutoff && new Date(date) < new Date(award.cutoff);
}

async function syncAwards(user) {
  if (user.isBot || user.isDeleted) return;
  const [awards, visit] = await Promise.all([
    Award.find({ enabled: true, rule: { $ne: 'manual' } }).lean(),
    Visit.findOne({ user: user._id }).lean()
  ]);
  const ops = awards.filter(a => eligible(a, user, visit)).map(a => ({ updateOne: {
    filter: { user: user._id, award: a._id },
    update: { $setOnInsert: { source: 'rule', revoked: false, collectible: createCollectible(a) } }, upsert: true
  } }));
  if (ops.length) await insertGrants(ops);
}
async function insertGrants(ops) {
  try { return await Grant.bulkWrite(ops, { ordered: false }); }
  catch (error) {
    // Concurrent profile reads can race on the unique (user, award) index.
    if (error.writeErrors?.length && error.writeErrors.every(e => e.code === 11000)) return error.result;
    throw error;
  }
}
module.exports = { eligible, syncAwards, insertGrants };
