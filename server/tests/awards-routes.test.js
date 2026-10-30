const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../models/User');

// Exercise the HTTP contract with authenticated identities; no live DB is needed.
const authPath = require.resolve('../middleware/auth');
require(authPath);
const originalAuth = require.cache[authPath].exports;
require.cache[authPath].exports = (req, res, next) => { req.user = { _id: '507f1f77bcf86cd799439011', role: req.header('test-role') || 'user' }; next(); };
const router = require('../routes/awards');
require.cache[authPath].exports = originalAuth;

test('award management rejects ordinary users and invalid moderator input', async t => {
  const app = express(); app.use(express.json()); app.use('/api/awards', router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/awards`;
  for (const [method, path] of [['GET', ''], ['POST', ''], ['POST', '/507f1f77bcf86cd799439012/apply'], ['PATCH', '/507f1f77bcf86cd799439012'], ['POST', '/507f1f77bcf86cd799439012/grant']]) {
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
