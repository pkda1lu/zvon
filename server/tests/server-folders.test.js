const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the real settings handler with an authenticated in-memory user.
// No database, uploads, or network side effects are needed for these cases.
const routes = [];
const router = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method,
  (route, ...handlers) => routes.push({ method, route, handler: handlers.at(-1) })]));
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/users.js'), 'utf8'), {
  module: { exports: {} }, console,
  require: name => name === 'express' ? { Router: () => router } : {},
});
const handler = routes.find(route => route.method === 'put' && route.route === '/settings').handler;

async function update(serverFolders) {
  let saved = false;
  const user = { settings: { appearance: { theme: 'amoled' } }, markModified() {}, async save() { saved = true; } };
  const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: { settings: { serverFolders } }, user }, response);
  return { ...response, saved, user };
}

const folder = (patch = {}) => ({ id: 'work', name: ' Work ', serverIds: ['server-one'], isolated: true, ...patch });

test('stores folders and isolation without replacing other account settings', async () => {
  const result = await update([folder()]);
  assert.equal(result.code, 200);
  assert.equal(result.saved, true);
  assert.equal(result.user.settings.serverFolders[0].name, 'Work');
  assert.equal(result.user.settings.serverFolders[0].isolated, true);
  assert.equal(result.user.settings.appearance.theme, 'amoled');
});

test('deleting all folders stores an empty list', async () => {
  const result = await update([]);
  assert.equal(result.code, 200);
  assert.equal(result.user.settings.serverFolders.length, 0);
});

test('rejects duplicate membership, duplicate IDs, and malformed input before saving', async () => {
  const invalid = [
    {}, [folder(), folder()],
    [folder(), folder({ id: 'games' })],
    [folder({ name: ' ' })], [folder({ isolated: 'yes' })],
    [folder({ serverIds: [null] })], [folder({ serverIds: ['same', 'same'] })],
    Array.from({ length: 51 }, (_, i) => folder({ id: String(i), serverIds: [] })),
  ];
  for (const value of invalid) {
    const result = await update(value);
    assert.equal(result.code, 400);
    assert.equal(result.saved, false);
  }
});
