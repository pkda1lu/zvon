const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ headless: true, executablePath: process.env.MOBILE_CHROMIUM });
 try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  const css = ['src/index.css', 'src/styles/buttons.css', 'src/pages/settings/Settings.css'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/^@import[^;]+;/gm, '')).join('\n');
  for (const width of [320, 375, 430, 768]) {
   await page.setViewportSize({ width, height: 700 });
   await page.setContent(`<style>${css}</style><main class="admin-users-settings" style="padding:16px"><form class="admin-users-search" style="display:flex;gap:10px"><input style="flex:1"><button>Поиск</button></form><div class="settings-list-row"><div class="settings-list-row-icon"></div><div class="settings-list-row-body"><div class="settings-list-row-title">ОченьДлинноеИмяПользователяБезПробелов</div><div class="settings-list-row-meta">longlonglonglonglonglonglong@example.com</div></div><div class="settings-list-row-actions"><button class="settings-btn">Редактировать</button><button class="settings-btn">Разблокировать</button><button class="settings-btn">Удалить</button></div></div></main>`);
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
   assert.ok(await page.evaluate(() => [...document.querySelectorAll('.settings-list-row-actions button')].every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })), `Clipped action at ${width}`);
  }
  console.log('Mobile moderation layout: 4 viewport checks passed');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
