
// Лёгкий парсер User-Agent без внешних зависимостей.
// Возвращает { browser, os, deviceType, deviceName }.
function parseUserAgent(ua = '') {
  const s = String(ua || '');

  // Браузер (порядок важен: спецброузеры до Chrome/Safari).
  let browser = 'Неизвестно';
  if (/Electron|Zvon/i.test(s)) browser = 'Приложение Zvon';
  else if (/YaBrowser/i.test(s)) browser = 'Yandex Browser';
  else if (/Edg(A|iOS|)?\//i.test(s)) browser = 'Microsoft Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(s)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS/i.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS/i.test(s)) browser = 'Chrome';
  else if (/Safari\//i.test(s)) browser = 'Safari';
  else if (/(iPhone|iPad|iPod).*Mobile\//i.test(s)) browser = 'Safari';

  // ОС.
  let os = 'Неизвестно';
  if (/Windows NT 10/i.test(s)) os = 'Windows 10/11';
  else if (/Windows NT/i.test(s)) os = 'Windows';
  else if (/Android/i.test(s)) {
    const m = s.match(/Android\s+([\d.]+)/i);
    os = m ? `Android ${m[1]}` : 'Android';
  } else if (/(iPhone|iPad|iPod)/i.test(s)) {
    const m = s.match(/OS\s+([\d_]+)/i);
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/CrOS/i.test(s)) os = 'ChromeOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  // Тип устройства.
  let deviceType = 'desktop';
  if (/Electron|Zvon/i.test(s)) deviceType = 'app';
  else if (/iPad|Tablet/i.test(s)) deviceType = 'tablet';
  else if (/Mobi|Android|iPhone|iPod/i.test(s)) deviceType = 'mobile';

  const deviceName = browser === 'Неизвестно' && os === 'Неизвестно'
    ? 'Неизвестное устройство'
    : `${browser} · ${os}`;

  return { browser, os, deviceType, deviceName };
}

function platformToOs(p) {
  switch (String(p || '').toLowerCase()) {
    case 'win32': return 'Windows';
    case 'darwin': return 'macOS';
    case 'linux': return 'Linux';
    default: return '';
  }
}

// Возвращает описание клиента, учитывая фирменные заголовки десктоп-приложения.
// Если запрос пришёл из клиента Zvon — называем устройство «Zvon Desktop · <OS>».
function getClientInfo(req) {
  const ua = req.header?.('user-agent') || req.headers?.['user-agent'] || '';
  const clientType = (req.headers?.['x-zvon-client'] || '').toLowerCase();

  if (clientType === 'desktop') {
    const os = platformToOs(req.headers?.['x-zvon-platform']) || parseUserAgent(ua).os;
    return { browser: 'Zvon Desktop', os, deviceType: 'app', deviceName: `Zvon Desktop · ${os || 'ПК'}` };
  }
  if (clientType === 'mobile') {
    const info = parseUserAgent(ua);
    return { browser: 'Zvon Mobile', os: info.os, deviceType: 'mobile', deviceName: `Zvon Mobile · ${info.os}` };
  }

  return parseUserAgent(ua);
}

// Достаём реальный IP клиента (с учётом прокси/nginx).
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.ip || req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
}

function isPrivateIp(ip = '') {
  if (!ip) return true;
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('localhost')) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^(fc|fd)/i.test(ip)) return true; // IPv6 ULA
  return false;
}

/**
 * Локальная база GeoIP.
 *
 * Раньше здесь стоял запрос к ip-api.com — то есть IP-адрес каждого
 * пользователя отправлялся на иностранный сервис ради определения страны.
 * По 152-ФЗ это трансграничная передача персональных данных (IP-адрес относится
 * к ПД), причём совершенно необязательная: та же задача решается локальной
 * базой без единого сетевого запроса.
 *
 * GEODATADIR указывает на каталог «только страны» (см.
 * scripts/prepareGeoData.js): полная база с городами занимает +108 МБ в
 * оперативной памяти, страновая — около 10 МБ, а города для большинства адресов
 * всё равно пустые.
 *
 * Если каталог не подготовлен, geoip-lite возьмёт собственные данные пакета —
 * работать будет, просто памяти уйдёт больше.
 */
const path = require('path');
const fs = require('fs');

const COUNTRY_ONLY_DIR = path.join(__dirname, '..', 'data', 'geoip');
if (fs.existsSync(path.join(COUNTRY_ONLY_DIR, 'geoip-country.dat'))) {
  // Переменная читается geoip-lite при загрузке модуля, поэтому задаём её до require.
  process.env.GEODATADIR = COUNTRY_ONLY_DIR;
}

let geoip = null;
try {
  geoip = require('geoip-lite');
} catch (err) {
  console.warn('[geoip] Модуль geoip-lite недоступен, страна определяться не будет:', err.message);
}

// Человекочитаемое название страны средствами платформы — без словарей и
// сторонних зависимостей.
let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(['ru'], { type: 'region' });
} catch { /* на старых сборках Node — оставим код страны как есть */ }

/**
 * Геолокация по IP. Синхронная и офлайновая, но сигнатура оставлена
 * асинхронной: вызывающий код (utils/session.js) ожидает промис.
 * Никогда не бросает — при любой неудаче возвращает {}.
 */
async function lookupGeo(ip) {
  try {
    if (!geoip || !ip || isPrivateIp(ip)) return {};
    const found = geoip.lookup(ip);
    if (!found || !found.country) return {};

    const countryCode = found.country;
    let country = countryCode;
    try {
      country = regionNames ? (regionNames.of(countryCode) || countryCode) : countryCode;
    } catch { /* неизвестный код — покажем сам код */ }

    return { country, countryCode, city: found.city || '' };
  } catch {
    return {};
  }
}

module.exports = { parseUserAgent, getClientInfo, getClientIp, isPrivateIp, lookupGeo };
