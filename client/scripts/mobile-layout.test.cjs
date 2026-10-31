// Run with Playwright installed, or point PLAYWRIGHT_MODULE at its package.
// These layout fixtures mirror the production wrappers and load production CSS.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const common = ['src/index.css', 'src/styles/buttons.css', 'src/Mobile.css', 'src/pages/Main.css', 'src/styles/dialogs.css', 'src/styles/mobile-overlays.css', 'src/components/CloseButton.css'];
const lazy = ['src/components/AttachmentsModal.css', 'src/components/VoiceChannelView.css', 'src/components/VoiceCall.css', 'src/components/Inbox.css'];
const css = files => files.map(file => fs.readFileSync(path.join(root, file), 'utf8').replace(/^@import[^;]+;/gm, '')).join('\n');
const close = '<button class="zv-close close-x-btn"><span class="zv-close__circle">×</span><span class="zv-close__label">ESC</span></button>';
const participant = '<div class="p-card">Участник</div>';
const buttons = (cls, end) => Array.from({ length: 4 }, () => `<button class="${cls}">●</button>`).join('') + `<button class="${cls} ${end}">☎</button>`;
const nav = '<nav class="mobile-bottom-nav"><button class="mbn-item">Чаты</button><button class="mbn-item">Друзья</button><button class="mbn-item">Витрина</button><button class="mbn-item">Уведомления</button><button class="mbn-item">Настройки</button></nav>';
const fixtures = {
  attachments: `<div class="attachments-modal-overlay zv-dialog-overlay"><div class="attachments-modal-container glass-panel-base zv-dialog-surface"><div class="attachments-sidebar">${['Все вложения', 'Фотографии', 'Видеофайлы', 'Аудиозаписи', 'Документы'].map(label => `<div class="sidebar-item">${label}</div>`).join('')}</div><div class="attachments-main-content"><div class="attachments-content-header"><div class="header-info"><h2>Все вложения</h2><p>45 объектов найдено</p></div>${close}</div><div class="attachments-scroll-area">${Array.from({ length: 12 }, () => '<div class="date-group"><h3>Вчера</h3><div class="attachments-grid"><div class="attachment-card">Вложение</div></div></div>').join('')}</div></div></div></div>`,
  voice: `<div class="main-container is-mobile view-content in-conversation"><div class="main-content-area"><div class="voice-chat-container"><div class="content-inner-layer"><div class="voice-channel-view"><header class="voice-hdr"><div class="hdr-left"><h1>Очень длинное название голосового канала</h1></div><div class="hdr-right"><div class="channel-topic-tag">Тема канала</div><button>Чат</button></div></header><div class="voice-body"><main class="voice-canvas"><div class="grid-wrap"><div class="v-grid count-6" style="grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr)">${participant.repeat(6)}</div></div></main></div></div></div></div></div></div><div class="voice-ctrls-anchor" style="left:900px;width:1000px;bottom:120px"><div class="voice-ctrls">${buttons('ctrl-btn', 'hangup')}</div></div>`,
  stage: `<div class="voice-channel-view" style="height:100dvh"><header class="voice-hdr">Голосовой канал</header><div class="voice-body"><main class="voice-canvas"><div class="stage-wrap"><div class="stage-primary">${participant}</div><div class="stage-aux">${participant.repeat(4)}</div></div></main></div></div>`,
  call: `<div class="voice-call-full-view group-mode"><header class="call-topbar"><button>Назад</button><div class="call-topbar-center"><div class="call-title"><span class="call-title-text">Длинное название группового звонка</span></div><div class="call-duration">12:34</div></div></header><main class="call-main"><div class="video-grid count-4">${'<div class="participant-slot">Участник</div>'.repeat(4)}</div></main><div class="call-controls-bar">${buttons('control-circle', 'end-call-circle')}</div></div>${nav}`,
  inbox: `<div class="inbox-overlay is-mobile"><div class="inbox-header"><button class="back-button">←</button><h3>Входящие</h3><div class="inbox-actions"><button class="inbox-action-btn">Прочитать все</button></div></div><div class="inbox-list">${'<div class="inbox-item">Уведомление</div>'.repeat(30)}</div></div>${nav}`,
};
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.MOBILE_CHROMIUM ? { executablePath: process.env.MOBILE_CHROMIUM } : {}) });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    let checks = 0;
    for (const order of [[...common, ...lazy], [...lazy, ...common]]) {
      for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 430, height: 932 }, { width: 640, height: 360 }]) {
        await page.setViewportSize(viewport);
        for (const [name, html] of Object.entries(fixtures)) {
          await page.setContent(`<style>${css(order)}\n*{animation:none!important;transition:none!important;box-sizing:border-box}button{font:inherit}</style>${html}`);
          const selectors = name === 'attachments' ? ['.attachments-modal-container', '.attachments-content-header', '.close-x-btn', '.attachments-scroll-area']
            : name === 'voice' ? ['.voice-channel-view', '.voice-hdr', '.grid-wrap', '.v-grid', '.voice-ctrls', '.ctrl-btn.hangup']
            : name === 'stage' ? ['.stage-wrap', '.stage-primary', '.stage-aux']
            : name === 'call' ? ['.voice-call-full-view', '.call-topbar', '.call-controls-bar', '.end-call-circle']
            : ['.inbox-overlay', '.inbox-header', '.inbox-list'];
          for (const selector of selectors) {
            const rect = await page.locator(selector).boundingBox();
            assert(rect && rect.width > 0 && rect.height > 0, `${name} ${selector} has size`);
            assert(rect.x >= -1 && rect.x + rect.width <= viewport.width + 1, `${name} ${selector} fits width ${viewport.width}: ${JSON.stringify(rect)}`);
            if (!['.v-grid', '.stage-primary', '.stage-aux'].includes(selector)) assert(rect.y >= -1 && rect.y + rect.height <= viewport.height + 1, `${name} ${selector} fits height ${viewport.height}: ${JSON.stringify(rect)}`);
          }
          if (name === 'attachments') {
            assert.equal(await page.locator('.attachments-modal-container').evaluate(el => getComputedStyle(el).flexDirection), 'column');
            assert.equal(await page.locator('.attachments-modal-container').evaluate(el => getComputedStyle(el).borderTopLeftRadius), '0px');
            assert(await page.locator('.attachments-scroll-area').evaluate(el => el.scrollHeight > el.clientHeight));
          }
          if (name === 'call' || name === 'inbox') assert.equal(await page.locator('.mobile-bottom-nav').isVisible(), false);
          if (name === 'voice') assert.equal(await page.locator('.grid-wrap').evaluate(el => getComputedStyle(el).overflowY), 'auto');
          if (name === 'stage') assert.equal(await page.locator('.stage-wrap').evaluate(el => getComputedStyle(el).overflowY), 'auto');
          if (process.env.MOBILE_SCREENSHOTS && viewport.width === 375 && checks < 20) {
            fs.mkdirSync(process.env.MOBILE_SCREENSHOTS, { recursive: true });
            await page.screenshot({ path: path.join(process.env.MOBILE_SCREENSHOTS, `${name}.png`) });
          }
          checks++;
        }
      }
    }
    console.log(`PASS: ${checks} mobile layouts, including both CSS loading orders and portrait/landscape viewports`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
