// Клиент к API Telegram-бота Vlyne (miniapp.py).
//
// VPN-подписка принадлежит телеграм-аккаунту: там живёт постоянный ключ в
// панели 3x-ui, счётчик трафика и реферальная программа. Zvon не держит свою
// копию этих данных и не провижинит собственные ключи — иначе у человека было
// бы два разных ключа и два не сходящихся баланса. Вместо этого Zvon ходит в
// бота от имени привязанного аккаунта, и любая покупка — хоть из Telegram,
// хоть отсюда — меняет одно и то же состояние.
//
// Аутентификация двухуровневая: заголовок X-Zvon-Key доказывает, что запрос
// пришёл от сервера Zvon, а поле zvonId называет пользователя. Кем этот
// пользователь приходится в Telegram, решает реестр привязок на стороне бота —
// Zvon не может объявить себя кем угодно.

const axios = require('axios');

const config = {
  url: process.env.VLYNE_BOT_URL || '',
  apiKey: process.env.ZVON_API_KEY || '',
  timeout: parseInt(process.env.VLYNE_BOT_TIMEOUT_MS || '20000', 10),
};

function enabled() {
  return !!(config.url && config.apiKey);
}

/**
 * Вызывает эндпоинт бота.
 * @param {string} path   путь вида '/api/state'
 * @param {object} body   тело запроса; zvonId подставляется вызывающим
 */
async function call(path, body = {}) {
  if (!enabled()) {
    throw new Error('Интеграция с Telegram не настроена (VLYNE_BOT_URL / ZVON_API_KEY)');
  }
  const base = config.url.replace(/\/$/, '');
  let res;
  try {
    res = await axios.post(`${base}${path}`, body, {
      timeout: config.timeout,
      headers: { 'Content-Type': 'application/json', 'X-Zvon-Key': config.apiKey },
      validateStatus: () => true,
    });
  } catch (e) {
    // Пользователю — общая формулировка: дело не в его действиях. В лог —
    // настоящая причина вместе с адресом, иначе такую ошибку не отладить:
    // ENOTFOUND (DNS), ECONNREFUSED (nginx/порт), CERT_* (сертификат),
    // ECONNABORTED (таймаут) лечатся совершенно по-разному.
    console.error(`[Vlyne] ${path} -> ${base}: ${e.code || 'ERR'} ${e.message}`);
    throw new Error('Сервис VPN временно недоступен');
  }

  const data = res.data;
  if (res.status === 401) throw new Error('Аккаунт Telegram не привязан');
  if (!data || typeof data !== 'object') throw new Error(`Сервис VPN вернул ${res.status}`);
  if (data.ok === false) throw new Error(data.error || `Сервис VPN вернул ${res.status}`);
  return data;
}

/** Вызов от имени пользователя Zvon. */
function asUser(path, zvonId, body = {}) {
  return call(path, { ...body, zvonId: String(zvonId) });
}

module.exports = {
  config,
  enabled,
  call,
  asUser,

  // ---- Привязка ----
  linkStatus: (zvonId) => call('/api/zvon/status', { zvonId: String(zvonId) }),
  link: (zvonId, code, zvonName) => call('/api/zvon/link', { zvonId: String(zvonId), code, zvonName }),
  unlink: (zvonId) => call('/api/zvon/unlink', { zvonId: String(zvonId) }),

  // ---- Подписка (те же эндпоинты, что и у мини-аппа в Telegram) ----
  state: (zvonId) => asUser('/api/state', zvonId),
  promo: (zvonId, pack, promo) => asUser('/api/promo', zvonId, { pack, promo }),
  buy: (zvonId, pack, method, promo) => asUser('/api/buy', zvonId, { pack, method, promo }),
  check: (zvonId, orderId) => asUser('/api/check', zvonId, { order_id: orderId }),
  nodes: (zvonId) => asUser('/api/nodes', zvonId),
};
