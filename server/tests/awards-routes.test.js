const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../models/User');
const Award = require('../models/Award');
const Grant = require('../models/AwardGrant');

// Exercise the HTTP contract with authenticated identities; no live DB is needed.
const authPath = require.resolve('../middleware/auth');
require(authPath);
const originalAuth = require.cache[authPath].exports;
require.cache[authPath].exports = (req, res, next) => { req.user = { _id: '507f1f77bcf86cd799439011', role: req.header('test-role') || 'user' }; next(); };
const auditPath = require.resolve('../utils/globalAuditLogger');
require(auditPath);
const originalAudit = require.cache[auditPath].exports;
require.cache[auditPath].exports = { logGlobalAction: async () => {} };
const router = require('../routes/awards');
require.cache[authPath].exports = originalAuth;
require.cache[auditPath].exports = originalAudit;

test('award management rejects ordinary users and invalid moderator input', async t => {
  const app = express(); app.use(express.json()); app.use('/api/awards', router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/awards`;
  for (const [method, path] of [['GET', ''], ['GET', '/recipients?q=test'], ['POST', ''], ['POST', '/507f1f77bcf86cd799439012/apply'], ['PATCH', '/507f1f77bcf86cd799439012'], ['POST', '/507f1f77bcf86cd799439012/grant']]) {
    assert.equal((await fetch(url + path, { method })).status, 403);
  }
  const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'test-role': 'moderator' }, body: JSON.stringify(body) });
  const valid = { name: 'Ранний участник', description: '', model: 'medal', color: '#ffc65c', rule: 'registered_before', date: '2026-01-01' };
  for (const invalid of [{ date: '2026-02-30' }, { rule: 'unknown' }, { name: '' }, { color: 'url(evil)' }, { model: 'unknown' }, { appearance: { palette: 'invalid' } }, { appearance: { background: { $ne: null } } }]) assert.equal((await post('', { ...valid, ...invalid })).status, 400);
  assert.equal((await post('/507f1f77bcf86cd799439012/grant', { username: { $ne: null } })).status, 400);
  assert.equal((await post('/bad-id/apply', {})).status, 400);
  t.mock.method(User, 'findById', async () => ({ _id: '507f1f77bcf86cd799439012', settings: { whoCanSeeFullProfile: ['nobody'] } }));
  // Self can inspect own awards; another target with nobody privacy is hidden.
  // Block state performs a separate query; stub only its data source.
  t.mock.method(User, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const response = await fetch(url + '/user/507f1f77bcf86cd799439012');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('recipient search is bounded, escapes regex and projects public identity fields only', async t => {
  const app = express(); app.use(express.json()); app.use('/api/awards', router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise(resolve => server.once('listening', resolve));
  let filter, projection, limit;
  t.mock.method(User, 'find', value => {
    filter = value;
    const query = { select(value) { projection = value; return query; }, sort() { return query; }, limit(value) { limit = value; return query; }, lean: async () => [{ _id: '507f1f77bcf86cd799439012', username: 'test.user', displayName: 'Test' }] };
    return query;
  });
  const url = `http://127.0.0.1:${server.address().port}/api/awards/recipients`;
  const response = await fetch(url + '?q=test.', { headers: { 'test-role': 'moderator' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].username, 'test.user');
  assert.equal(filter.$or[0].username.test('TEST.user'), true);
  assert.equal(filter.$or[0].username.test('testXuser'), false);
  assert.equal(filter.isDeleted.$ne, true); assert.equal(filter.isBot.$ne, true);
  assert.equal(limit, 20);
  assert.equal(projection, '_id username displayName avatar');
  assert.equal((await fetch(url + '?q=' + 'x'.repeat(81), { headers: { 'test-role': 'moderator' } })).status, 400);
});

test('grant accepts selected user IDs and legacy usernames with trimmed case-insensitive matching', async t => {
  const app = express(); app.use(express.json()); app.use('/api/awards', router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise(resolve => server.once('listening', resolve));
  const awardId = '507f1f77bcf86cd799439012', userId = '507f1f77bcf86cd799439013';
  let filter, update;
  t.mock.method(Award, 'findById', async () => ({ _id: awardId }));
  t.mock.method(User, 'findOne', async value => { filter = value; return { _id: userId }; });
  t.mock.method(Grant, 'updateOne', async (where, value) => { update = { where, value }; });
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/awards/${awardId}/grant`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'test-role': 'moderator' }, body: JSON.stringify(body) });
  assert.equal((await post({ userId })).status, 200);
  assert.equal(filter._id, userId); assert.equal(filter.isDeleted.$ne, true);
  assert.equal(update.where.user, userId); assert.equal(update.value.$set.revoked, false);
  assert.equal((await post({ userId, revoke: true })).status, 200);
  assert.equal(update.value.$set.revoked, true);
  assert.equal((await post({ username: '  @Test.User  ' })).status, 200);
  assert.equal(filter.username.test('test.user'), true);
  assert.equal(filter.username.test('testXuser'), false);
  assert.equal((await post({ userId: 'bad-id' })).status, 400);
});
