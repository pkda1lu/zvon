const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCollectible, validAppearance, editionNumber, OPTIONS } = require('../utils/awardCollectibles');

test('appearance accepts only supported properties and safe enum values', () => {
  assert.equal(validAppearance(undefined), true);
  assert.equal(validAppearance({ palette: 'random', background: 'ocean', finish: 'satin' }), true);
  for (const value of [null, [], 'ocean', { palette: 'invalid' }, { background: { $ne: null } }, { unknown: 'random' }, JSON.parse('{"__proto__":"random"}'), { toString: 'random' }]) assert.equal(validAppearance(value), false);
});
test('fixed collection traits are preserved, random fields resolve to valid choices', () => {
  const collectible = createCollectible({ appearance: { palette: 'rose', background: 'random', pattern: 'zvon', finish: 'satin' } }, Buffer.alloc(32, 5));
  assert.equal(collectible.palette, 'rose'); assert.equal(collectible.pattern, 'zvon'); assert.equal(collectible.finish, 'satin');
  for (const [key, value] of Object.entries(collectible)) assert.ok(OPTIONS[key].includes(value));
});
test('legacy grants receive a deterministic appearance, different seeds vary it', () => {
  const first = createCollectible({}, '507f1f77bcf86cd799439011');
  assert.deepEqual(first, createCollectible({}, '507f1f77bcf86cd799439011'));
  const variants = new Set(Array.from({ length: 24 }, (_, i) => JSON.stringify(createCollectible({}, String(i)))));
  assert.ok(variants.size > 12);
});
test('edition numbers retain the full unique grant id without truncation', () => {
  const id = '507f1f77bcf86cd799439011';
  const number = editionNumber(id);
  assert.equal(number, editionNumber(id));
  assert.notEqual(number, editionNumber('507f1f77bcf86cd799439012'));
  let decoded = 0n;
  for (const char of number.toLowerCase()) decoded = decoded * 36n + BigInt(parseInt(char, 36));
  assert.equal(decoded.toString(16), id);
});
test('grant schema keeps collectible properties and rejects unsupported stored values', async () => {
  const Grant = require('../models/AwardGrant');
  const collectible = createCollectible({}, 'persisted-grant');
  const grant = new Grant({ user: '507f1f77bcf86cd799439011', award: '507f1f77bcf86cd799439012', source: 'manual', collectible });
  await grant.validate();
  assert.deepEqual(grant.toObject().collectible, collectible);
  grant.collectible.palette = 'unknown';
  await assert.rejects(grant.validate(), /palette/);
});
