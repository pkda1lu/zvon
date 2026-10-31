const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup({ fullscreen = false, prepare = async () => true, exit } = {}) {
  const opened = [];
  const popup = { closed: false, document: { body: {} } };
  const document = { fullscreenElement: fullscreen ? {} : null };
  document.exitFullscreen = exit || (async () => { document.fullscreenElement = null; });
  const window = { setTimeout, electron: { isTauri: true, ipc: { invoke: prepare, send() {} } }, open() { opened.push(true); return popup; } };
  const context = { exports: {}, window, document, console, setTimeout, clearTimeout, AbortController };
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/streamPip.ts'), 'utf8') + '\nexport const testHooks = { acquireDesktopWindow, setSession: (value: number) => { session = value; } };';
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return { ...context.exports.testHooks, opened, popup, document };
}

test('popup waits for both DOM fullscreen exit and native monitor restoration', async () => {
  const dom = deferred(), native = deferred();
  let prepares = 0;
  const state = setup({ fullscreen: true, exit: () => dom.promise, prepare: () => { prepares++; return native.promise; } });
  state.setSession(1);
  const opening = state.acquireDesktopWindow(1);
  await Promise.resolve();
  assert.equal(state.opened.length, 0); assert.equal(prepares, 0);
  state.document.fullscreenElement = null; dom.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prepares, 1); assert.equal(state.opened.length, 0);
  native.resolve(true);
  assert.equal(await opening, state.popup); assert.equal(state.opened.length, 1);
});

test('overlapping navigation requests create only the latest popup', async () => {
  const native = deferred();
  const state = setup({ prepare: () => native.promise });
  state.setSession(1);
  const first = state.acquireDesktopWindow(1);
  state.setSession(2);
  const second = state.acquireDesktopWindow(2);
  native.resolve(true);
  assert.equal(await first, null);
  assert.equal(await second, state.popup);
  assert.equal(state.opened.length, 1);
});

test('a failed fullscreen transition does not attempt native window creation', async () => {
  const state = setup({ fullscreen: true, exit: async () => { throw new Error('fullscreen busy'); } });
  state.setSession(1);
  await assert.rejects(state.acquireDesktopWindow(1), /fullscreen busy/);
  assert.equal(state.opened.length, 0);
});

test('an existing window is reused after the native transition is safe', async () => {
  const state = setup();
  state.setSession(1); await state.acquireDesktopWindow(1);
  state.setSession(2); assert.equal(await state.acquireDesktopWindow(2), state.popup);
  assert.equal(state.opened.length, 1);
});

test('failure to release a stale native window blocks a second WebView creation', async () => {
  const state = setup({ prepare: async channel => { if (channel === 'stream-pip:clear') throw new Error('old window still closing'); return true; } });
  state.setSession(1);
  await assert.rejects(state.acquireDesktopWindow(1), /old window still closing/);
  assert.equal(state.opened.length, 0);
});
