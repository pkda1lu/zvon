const { test } = require('node:test');
const assert = require('node:assert/strict');
const { eligible, syncAwards } = require('../utils/awards');
const Award = require('../models/Award');
const Grant = require('../models/AwardGrant');
const Visit = require('../models/AwardVisit');

test('registration rules use a strict Moscow midnight boundary', () => {
  const rule = { enabled: true, rule: 'registered_before', cutoff: new Date('2026-01-01T00:00:00+03:00') };
  assert.equal(eligible(rule, { createdAt: '2025-12-31T20:59:59.999Z' }), true);
  assert.equal(eligible(rule, { createdAt: '2025-12-31T21:00:00.000Z' }), false);
  assert.equal(eligible(rule, { createdAt: '2026-01-01T00:00:00Z' }), false);
  assert.equal(eligible({ ...rule, enabled: false }, { createdAt: '2020-01-01' }), false);
  assert.equal(eligible({ ...rule, rule: 'manual' }, { createdAt: '2020-01-01' }), false);
});
test('visits require observed activity and never infer a visit from registration', () => {
  const rule = { enabled: true, rule: 'visited_before', cutoff: new Date('2026-12-12T00:00:00+03:00') };
  assert.equal(eligible(rule, { createdAt: '2020-01-01' }, null), false);
  assert.equal(eligible(rule, {}, { firstVisitedAt: '2026-12-11T20:59:59Z' }), true);
  assert.equal(eligible(rule, {}, { firstVisitedAt: '2026-12-11T21:00:00Z' }), false);
});
test('automatic sync preserves manual revocation and uses unique upserts on repeated reads', async t => {
  t.mock.method(Award, 'find', () => ({ lean: async () => [{ _id: 'award', enabled: true, rule: 'registered_before', cutoff: new Date('2026-01-01') }] }));
  t.mock.method(Visit, 'findOne', () => ({ lean: async () => null }));
  const grants = new Map([['revoked:award', { revoked: true, source: 'manual' }]]);
  t.mock.method(Grant, 'bulkWrite', async ops => {
    for (const { updateOne: op } of ops) {
      assert.equal(op.upsert, true);
      assert.equal(op.update.$set, undefined);
      const key = `${op.filter.user}:${op.filter.award}`;
      if (!grants.has(key)) grants.set(key, op.update.$setOnInsert);
    }
  });
  const user = { _id: 'normal', createdAt: '2025-01-01' };
  await syncAwards(user); await syncAwards(user);
  await syncAwards({ ...user, _id: 'revoked' });
  assert.equal(grants.size, 2);
  assert.equal(grants.get('revoked:award').revoked, true);
  assert.equal(grants.get('normal:award').source, 'rule');
  await syncAwards({ ...user, _id: 'bot', isBot: true });
  await syncAwards({ ...user, _id: 'deleted', isDeleted: true });
  assert.equal(grants.size, 2);
});
