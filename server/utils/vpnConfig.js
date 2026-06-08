// Конфигурация VPN-магазина для zvon-сервера.
// Секреты читаются из .env (см. ключи ниже). Тарифы/промокоды/инструкции — здесь.

const PLANS = {
  trial24h:       { code: 'trial24h',       title: 'Пробный доступ',       days: 1,  price: 0,   whitelist: false, trial: true },
  '30d':          { code: '30d',            title: '1 месяц',              days: 30, price: 189, whitelist: false, trial: false },
  '30d_whitelist':{ code: '30d_whitelist',  title: 'Месяц + белые списки', days: 30, price: 289, whitelist: true,  trial: false },
};

// Промокоды: КОД -> процент скидки. Можно переопределить через env STORE_PROMOS="WELCOME:20,ZVON:15"
function loadPromos() {
  const out = { WELCOME: 20, ZVON: 15 };
  const raw = process.env.STORE_PROMOS || '';
  raw.split(',').map(s => s.trim()).filter(Boolean).forEach(pair => {
    const [code, pct] = pair.split(':');
    if (code && pct && !isNaN(parseInt(pct, 10))) out[code.trim().toUpperCase()] = parseInt(pct, 10);
  });
  return out;
}

const OS_INSTRUCTIONS = {
  windows: "🖥️ Windows:\n• Скачайте Vlyne Client: github.com/pkda1lu/vlyne-client/releases\n• Запустите, импортируйте конфигурацию ниже\n• Подключитесь 🚀",
  macos:   "🍎 macOS:\n• Установите V2rayU: github.com/yanue/V2rayU/releases\n• Импортируйте конфигурацию ниже\n• Подключитесь 🚀",
  android: "📱 Android:\n• Установите v2raytun из Google Play\n• Импортируйте конфигурацию ниже\n• Подключитесь 🚀",
  ios:     "🍎 iOS:\n• Установите v2raytun из App Store (при недоступности — смените регион)\n• Импортируйте конфигурацию ниже\n• Подключитесь 🚀",
  linux:   "🐧 Linux:\n• Установите v2ray-core: github.com/v2fly/v2ray-core/releases\n• Настройте конфигурацию ниже\n• Подключитесь 🚀",
};

const config = {
  plans: PLANS,
  promos: loadPromos(),
  osInstructions: OS_INSTRUCTIONS,
  currency: 'RUB',

  provisioner: {
    url: process.env.PROVISIONER_URL || 'http://127.0.0.1:8090',
    apiKey: process.env.PROVISIONER_API_KEY || '',
  },
  yookassa: {
    shopId: process.env.YOOKASSA_SHOP_ID || '',
    secretKey: process.env.YOOKASSA_SECRET_KEY || '',
    returnUrl: process.env.YOOKASSA_RETURN_URL || (process.env.CLIENT_URL || 'https://zvonserver.ru'),
    sendReceipt: (process.env.YOOKASSA_SEND_RECEIPT || 'false').toLowerCase() === 'true',
    taxSystemCode: parseInt(process.env.YOOKASSA_TAX_SYSTEM_CODE || '1', 10),
    vatCode: parseInt(process.env.YOOKASSA_VAT_CODE || '6', 10),
  },
  cryptobot: {
    enabled: (process.env.CRYPTOBOT_ENABLED || 'false').toLowerCase() === 'true',
    apiToken: process.env.CRYPTOBOT_API_TOKEN || '',
    testnet: (process.env.CRYPTOBOT_TESTNET || 'false').toLowerCase() === 'true',
    rubPerUsd: parseFloat(process.env.CRYPTOBOT_RUB_PER_USD || '90'),
  },
};

function paymentMethods() {
  const methods = [];
  if (config.yookassa.shopId && config.yookassa.secretKey) methods.push({ id: 'yookassa', label: '💳 Банковская карта' });
  if (config.cryptobot.enabled && config.cryptobot.apiToken) methods.push({ id: 'cryptobot', label: '₿ Криптовалюта (USDT)' });
  return methods;
}

function priceWithPromo(plan, promoCode) {
  const p = config.plans[plan];
  if (!p) return { ok: false };
  let discountPercent = 0;
  let appliedPromo = null;
  if (promoCode) {
    const pct = config.promos[String(promoCode).trim().toUpperCase()];
    if (pct) { discountPercent = pct; appliedPromo = String(promoCode).trim().toUpperCase(); }
  }
  const base = p.price;
  const finalPrice = Math.max(0, base - Math.floor(base * discountPercent / 100));
  return { ok: true, base, discountPercent, finalPrice, promo: appliedPromo };
}

module.exports = { config, paymentMethods, priceWithPromo };
