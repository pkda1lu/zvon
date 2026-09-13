const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Ключи подписи Vlyne ID.
 *
 * Токены Zvon подписываются симметричным JWT_SECRET — этого достаточно, пока
 * подписывает и проверяет один и тот же сервер. Для единого входа так нельзя:
 * проверять токен будут Vlyne Client, телеграм-бот и всё, что появится потом,
 * а симметричный секрет, розданный всем проверяющим, — это секрет, которым
 * каждый из них может выпустить токен от имени любого пользователя.
 *
 * Поэтому RS256: приватный ключ не покидает эту машину, а проверяющие берут
 * публичный по /oauth/jwks.json и работают офлайн, без обращения к нам на
 * каждый запрос.
 *
 * Ключ берётся из VLYNE_ID_PRIVATE_KEY (PEM целиком) или из файла
 * VLYNE_ID_KEY_FILE. Если ни того, ни другого нет — генерируется при первом
 * запуске в server/data/vlyne-id/private.pem с правами 600.
 */

const DEFAULT_KEY_DIR = path.join(__dirname, '..', 'data', 'vlyne-id');
const DEFAULT_KEY_FILE = path.join(DEFAULT_KEY_DIR, 'private.pem');

let cached = null;

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Отпечаток ключа по RFC 7638. Служит kid — по нему проверяющий находит
 * нужный ключ в JWKS. Считается из самого ключа, поэтому при подмене файла
 * kid меняется сам, вручную ничего синхронизировать не надо.
 */
function thumbprint(jwk) {
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return base64url(crypto.createHash('sha256').update(canonical).digest());
}

function generateKeyPem() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  return privateKey;
}

function loadPrivatePem() {
  const inline = process.env.VLYNE_ID_PRIVATE_KEY;
  if (inline && inline.trim()) {
    // В .env переводы строк часто записаны как \n — приводим к настоящим.
    return inline.includes('\n') ? inline.replace(/\n/g, '\n') : inline;
  }

  const file = process.env.VLYNE_ID_KEY_FILE || DEFAULT_KEY_FILE;
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');

  const pem = generateKeyPem();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 600: ключ подписи читает только владелец процесса. Любой, кто его
  // прочитает, сможет выпускать токены от имени кого угодно.
  fs.writeFileSync(file, pem, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch (e) { /* Windows — прав POSIX нет */ }
  console.log(`[vlyne-id] Сгенерирован новый ключ подписи: ${file}`);
  return pem;
}

/** Загружает (один раз за процесс) ключи и производные от них данные. */
function keys() {
  if (cached) return cached;

  const pem = loadPrivatePem();
  const privateKey = crypto.createPrivateKey(pem);
  const publicKey = crypto.createPublicKey(privateKey);

  const jwk = publicKey.export({ format: 'jwk' });
  const kid = thumbprint(jwk);

  cached = {
    privateKey,
    publicKey,
    privatePem: pem,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
    kid,
    jwks: {
      keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig', kid }]
    }
  };
  return cached;
}

/** Публичный набор ключей для проверяющих сторон. */
function jwks() {
  return keys().jwks;
}

/** Адрес выпускающего. Должен совпадать с тем, что видят клиенты снаружи. */
function issuer() {
  const raw = process.env.VLYNE_ID_ISSUER || process.env.CLIENT_URL || 'http://localhost:5000';
  return raw.replace(/\/$/, '');
}

module.exports = { keys, jwks, issuer, base64url, DEFAULT_KEY_FILE };
