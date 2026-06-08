// Платёжные провайдеры для VPN-магазина: YooKassa (карты) и CryptoBot (USDT).
// Прямые HTTP-вызовы из Node, без Telegram-бота.

const axios = require('axios');
const crypto = require('crypto');
const { config } = require('./vpnConfig');

// ---------- YooKassa ----------
async function yookassaCreate({ amountRub, description, metadata, username }) {
  const { shopId, secretKey, returnUrl, sendReceipt, taxSystemCode, vatCode } = config.yookassa;
  if (!shopId || !secretKey) throw new Error('YooKassa не настроена');

  const payload = {
    amount: { value: `${amountRub}.00`, currency: 'RUB' },
    confirmation: { type: 'redirect', return_url: returnUrl || 'https://t.me/' },
    capture: true,
    description,
    metadata: metadata || {},
  };
  if (sendReceipt) {
    payload.receipt = {
      customer: { full_name: username || 'Zvon-клиент' },
      tax_system_code: taxSystemCode,
      items: [{
        description: String(description).slice(0, 128),
        quantity: '1.00',
        amount: { value: `${amountRub}.00`, currency: 'RUB' },
        vat_code: vatCode,
        payment_mode: 'full_prepayment',
        payment_subject: 'service',
      }],
    };
  }

  const res = await axios.post('https://api.yookassa.ru/v3/payments', payload, {
    auth: { username: shopId, password: secretKey },
    headers: { 'Idempotence-Key': crypto.randomUUID(), 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  return { id: res.data.id, status: res.data.status, url: res.data.confirmation?.confirmation_url };
}

async function yookassaStatus(paymentId) {
  const { shopId, secretKey } = config.yookassa;
  const res = await axios.get(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    auth: { username: shopId, password: secretKey },
    timeout: 20000,
  });
  return res.data.status;
}

// ---------- CryptoBot ----------
function cryptoBase() {
  return config.cryptobot.testnet ? 'https://testnet-pay.crypt.bot' : 'https://pay.crypt.bot';
}

async function cryptobotCreate({ amountRub, description, payload }) {
  const { apiToken, rubPerUsd } = config.cryptobot;
  if (!apiToken) throw new Error('CryptoBot не настроен');
  const amountUsd = Math.max(0.1, amountRub / (rubPerUsd || 90));
  const res = await axios.post(`${cryptoBase()}/api/createInvoice`, {
    asset: 'USDT',
    amount: amountUsd.toFixed(2),
    description: String(description).slice(0, 1024),
    hidden: true,
    payload: payload || '',
  }, {
    headers: { 'Crypto-Pay-Api-Token': apiToken, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  if (!res.data.ok) throw new Error('CryptoBot: ' + JSON.stringify(res.data.error || {}));
  const inv = res.data.result;
  return { id: inv.invoice_id, status: 'active', url: inv.pay_url, amountUsd: Number(amountUsd.toFixed(2)) };
}

async function cryptobotStatus(invoiceId) {
  const { apiToken } = config.cryptobot;
  const res = await axios.get(`${cryptoBase()}/api/getInvoices`, {
    params: { invoice_ids: String(invoiceId) },
    headers: { 'Crypto-Pay-Api-Token': apiToken },
    timeout: 20000,
  });
  const items = res.data?.result?.items || [];
  return items.length ? items[0].status : null;
}

module.exports = { yookassaCreate, yookassaStatus, cryptobotCreate, cryptobotStatus };
