// Клиент к тонкому Python-провижинеру (provisioner.py), который работает с
// панелью 3x-ui. Вызывается напрямую с zvon-сервера по локальной сети.

const axios = require('axios');
const { config } = require('./vpnConfig');

/**
 * Создаёт/продлевает VLESS-ключ на панели.
 * @param {string} plan  - код тарифа (для выбора inbound'ов на стороне провижинера)
 * @param {number} days  - срок в днях
 * @param {string} keyId - стабильный идентификатор ключа (обычно _id заказа);
 *                         повторный вызов с тем же keyId продлевает ключ.
 * @returns {Promise<{sub_url:string, link:string|null, expiry_ms:number}>}
 */
async function provision(plan, days, keyId) {
  const { url, apiKey } = config.provisioner;
  if (!url || !apiKey) throw new Error('Провижинер не настроен (PROVISIONER_URL / PROVISIONER_API_KEY)');
  const res = await axios.post(`${url.replace(/\/$/, '')}/provision`, {
    apiKey, plan, days, keyId,
  }, { timeout: 30000, validateStatus: () => true });

  if (!res.data || res.data.ok === false) {
    throw new Error((res.data && res.data.error) || `Провижинер вернул ${res.status}`);
  }
  return res.data;
}

module.exports = { provision };
