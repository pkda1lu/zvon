/*
 * Мини-аппка TikTok.
 *
 * Сервис определяет страну зрителя по IP-адресу, поэтому задача сводится к
 * одному: выпустить трафик ИМЕННО ЭТОГО окна через зарубежный узел. Делает это
 * настольный клиент (zvon.tunnel), здесь только выбор страны и сама лента.
 *
 * В браузере точку выхода сменить нечем, поэтому там показывается честный
 * экран «только в приложении», а не молча работающая российская лента.
 */

const TIKTOK_URL = 'https://www.tiktok.com/';
const LAST_COUNTRY_KEY = 'tiktok:last-country';

const screens = {
  boot: document.getElementById('screen-boot'),
  web: document.getElementById('screen-web'),
  setup: document.getElementById('screen-setup'),
  viewer: document.getElementById('screen-viewer'),
};

const countriesBox = document.getElementById('countries');
const connectBtn = document.getElementById('connect');
const statusEl = document.getElementById('setup-status');
const countryPill = document.getElementById('country-pill');
const frame = document.getElementById('frame');

let countries = [];
let selected = null;

function show(name) {
  Object.entries(screens).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
}

function setStatus(text, isError) {
  statusEl.textContent = text || '';
  statusEl.classList.toggle('error', !!isError);
}

function renderCountries() {
  countriesBox.innerHTML = '';
  countries.forEach((c) => {
    const btn = document.createElement('button');
    btn.className = 'country';
    btn.type = 'button';
    btn.textContent = c.title;
    btn.setAttribute('aria-pressed', String(c.code === selected));
    btn.addEventListener('click', () => {
      selected = c.code;
      renderCountries();
      setStatus('');
    });
    countriesBox.appendChild(btn);
  });
}

async function rememberCountry(code) {
  try { await zvon.storage.set(LAST_COUNTRY_KEY, code); } catch { /* не критично */ }
}

async function recallCountry() {
  try { return await zvon.storage.get(LAST_COUNTRY_KEY); } catch { return null; }
}

async function connect() {
  if (!selected) { setStatus('Выберите страну.', true); return; }

  const country = countries.find((c) => c.code === selected);
  connectBtn.disabled = true;
  setStatus(`Поднимаем соединение через страну «${country.title}»…`);

  try {
    const res = await zvon.tunnel.start(selected);
    if (!res || !res.ok) throw new Error((res && res.error) || 'Не удалось поднять соединение.');

    await rememberCountry(selected);
    countryPill.textContent = res.title || country.title;
    // Кэш-бастер не нужен: окно каждый раз открывается с чистой сессией,
    // а перезагрузку ленты даёт кнопка «Обновить».
    frame.src = TIKTOK_URL;
    show('viewer');
  } catch (e) {
    setStatus(e && e.message ? e.message : 'Не удалось поднять соединение.', true);
  } finally {
    connectBtn.disabled = false;
  }
}

async function backToSetup() {
  frame.src = 'about:blank';
  try { await zvon.tunnel.stop(); } catch { /* окно всё равно закрывается */ }
  show('setup');
  setStatus('');
}

document.getElementById('reload').addEventListener('click', () => {
  // Переприсваивание src надёжнее contentWindow.location: документ чужого
  // происхождения, и напрямую в него не дотянуться.
  frame.src = 'about:blank';
  setTimeout(() => { frame.src = TIKTOK_URL; }, 50);
});

document.getElementById('change-country').addEventListener('click', backToSetup);
connectBtn.addEventListener('click', connect);

// Окно закрывают — снимаем маршрут, чтобы узел не держался зря.
window.addEventListener('pagehide', () => {
  try { zvon.tunnel.stop(); } catch { /* уже закрываемся */ }
});

(async function start() {
  try {
    await zvon.init();
  } catch {
    show('web');
    return;
  }

  let status = null;
  try { status = await zvon.tunnel.status(); } catch { status = null; }

  // available === false означает «сменить точку выхода отсюда нельзя»:
  // браузерная вкладка либо старая сборка клиента.
  if (!status || !status.available) { show('web'); return; }

  try {
    countries = await zvon.tunnel.countries();
  } catch {
    countries = [];
  }

  if (!Array.isArray(countries) || countries.length === 0) {
    show('setup');
    connectBtn.disabled = true;
    setStatus('Ни один зарубежный узел не настроен на сервере — задайте TIKTOK_OUTBOUND_DE или TIKTOK_OUTBOUND_FI.', true);
    return;
  }

  const last = await recallCountry();
  selected = countries.some((c) => c.code === last) ? last : countries[0].code;
  renderCountries();
  show('setup');
})();
