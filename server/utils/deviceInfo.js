const axios = require('axios');

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

// Best-effort геолокация по IP. Никогда не бросает — при ошибке возвращает {}.
async function lookupGeo(ip) {
  try {
    if (isPrivateIp(ip)) return {};
    const { data } = await axios.get(
      `http://ip-api.com/json/${encodeURIComponent(ip)}`,
      { params: { fields: 'status,country,countryCode,city' }, timeout: 2500 }
    );
    if (data && data.status === 'success') {
      return { country: data.country || '', countryCode: data.countryCode || '', city: data.city || '' };
    }
    return {};
  } catch (e) {
    return {};
  }
}

module.exports = { parseUserAgent, getClientIp, isPrivateIp, lookupGeo };
