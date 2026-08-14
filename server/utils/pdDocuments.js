const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Версии документов об обработке персональных данных.
 *
 * Согласие по ст. 9 152-ФЗ должно быть информированным: человек соглашается не
 * «вообще», а с конкретным текстом. Поэтому вместе с согласием сохраняется
 * версия документа и хеш его текста — тогда при изменении политики видно, с чем
 * именно соглашался каждый пользователь, и понятно, у кого нужно запросить
 * согласие заново.
 *
 * ВАЖНО: версию нужно поднимать при КАЖДОМ изменении текста, затрагивающем
 * состав данных, цели или условия обработки. Правки опечаток версию не меняют.
 */

// Формат: ГГГГ-ММ-ДД. Дата утверждения редакции.
const POLICY_VERSION = '2026-08-14';
const CONSENT_VERSION = '2026-08-14';

const DOCS_DIR = path.join(__dirname, '..', '..', 'docs', '152-fz');

const hashCache = new Map();

/**
 * Хеш текста документа. Считается один раз и кэшируется: файл на диске меняется
 * только при выкладке новой версии.
 */
function documentHash(fileName) {
  if (hashCache.has(fileName)) return hashCache.get(fileName);
  let hash = '';
  try {
    const text = fs.readFileSync(path.join(DOCS_DIR, fileName), 'utf8');
    hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  } catch {
    // Документа может не быть в окружении, где раскатан только сервер, —
    // это не повод ронять регистрацию. Согласие сохранится без хеша, версия
    // всё равно зафиксируется.
    hash = '';
  }
  hashCache.set(fileName, hash);
  return hash;
}

const getPolicyMeta = () => ({
  version: POLICY_VERSION,
  hash: documentHash('02-politika-obrabotki-pd.md'),
});

const getConsentMeta = () => ({
  version: CONSENT_VERSION,
  hash: documentHash('03-soglasie-na-obrabotku.md'),
});

module.exports = { POLICY_VERSION, CONSENT_VERSION, getPolicyMeta, getConsentMeta };
