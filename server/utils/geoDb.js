/**
 * Страна по IP — локальная база DB-IP «IP to Country Lite».
 *
 * Раньше страну определял geoip-lite по базе, которая лежит внутри npm-пакета
 * и не обновлялась годами. Блоки адресов с тех пор переходили из рук в руки, и
 * страны показывались неверно: финский узел — США, немецкий — Великобритания,
 * Yandex Cloud — Венесуэла, а часть российских адресов не определялась вовсе.
 *
 * DB-IP выпускает базу стран раз в месяц, бесплатно (CC BY 4.0 — упоминание
 * источника есть в «Устройствах»). Сервер сам скачивает файл, адреса
 * пользователей никуда не отправляются — требование 152-ФЗ, ради которого
 * отказались от ip-api.com, соблюдено.
 *
 * Файл: data/geoip/dbip-country-lite.csv.gz (строки «начало,конец,код»).
 * В памяти: IPv4 — Uint32Array начал/концов, IPv6 — старшие 64 бита адреса в
 * BigUint64Array (блоки мельче /64 в базе стран не встречаются). Итого ~10 МБ.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, '..', 'data', 'geoip');
const FILE = path.join(DIR, 'dbip-country-lite.csv.gz');
const MAX_AGE_MS = 32 * 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

let db = null; // { v4s, v4e, v4c, v6s, v6e, v6c, codes }

function ipv4ToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    const x = Number(part);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = n * 256 + x;
  }
  return n;
}

/** Старшие 64 бита IPv6-адреса как BigInt. */
function ipv6High(ip) {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  // IPv4 в хвосте (::ffff:1.2.3.4) на старшие 64 бита не влияет.
  if (s.includes('.')) s = s.slice(0, s.lastIndexOf(':') + 1) + '0:0';
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  let hi = 0n;
  for (let i = 0; i < 4; i++) {
    const g = parseInt(groups[i] || '0', 16);
    if (Number.isNaN(g)) return null;
    hi = (hi << 16n) | BigInt(g);
  }
  return hi;
}

/** Растущий типизированный массив: без промежуточных JS-массивов на сотни тысяч элементов. */
function grower(Type, initial) {
  let arr = new Type(initial), n = 0;
  return {
    push(v) {
      if (n === arr.length) { const next = new Type(arr.length * 2); next.set(arr); arr = next; }
      arr[n++] = v;
    },
    done() { return arr.slice(0, n); },
  };
}

/**
 * Разбор gzip-CSV по кускам: распакованный буфер декодируется в строки по 1 МБ,
 * значения сразу идут в типизированные массивы. Разбор одной строкой на весь
 * файл и JS-массивами поднимал RSS процесса на 165 МБ (V8 их потом не отдаёт),
 * так — на ~45 МБ.
 */
function parse(buf) {
  const codes = [];
  const codeIndex = new Map();
  const v4s = grower(Uint32Array, 1 << 16), v4e = grower(Uint32Array, 1 << 16), v4c = grower(Uint16Array, 1 << 16);
  const v6s = grower(BigUint64Array, 1 << 16), v6e = grower(BigUint64Array, 1 << 16), v6c = grower(Uint16Array, 1 << 16);

  const handle = (line) => {
    const c1 = line.indexOf(','), c2 = line.indexOf(',', c1 + 1);
    if (c1 === -1 || c2 === -1) return;
    const a = line.slice(0, c1), b = line.slice(c1 + 1, c2), cc = line.slice(c2 + 1).trim();
    if (!cc || cc === 'ZZ') return;
    let ci = codeIndex.get(cc);
    if (ci === undefined) { ci = codes.length; codes.push(cc); codeIndex.set(cc, ci); }
    if (a.includes(':')) {
      const s = ipv6High(a), e = ipv6High(b);
      if (s === null || e === null) return;
      v6s.push(s); v6e.push(e); v6c.push(ci);
    } else {
      const s = ipv4ToInt(a), e = ipv4ToInt(b);
      if (s === null || e === null) return;
      v4s.push(s); v4e.push(e); v4c.push(ci);
    }
  };

  // Строки собираются на стыках кусков.
  let rest = '';
  const CHUNK = 1 << 20;
  const out = zlib.gunzipSync(buf);
  for (let off = 0; off < out.length; off += CHUNK) {
    const text = rest + out.toString('latin1', off, Math.min(out.length, off + CHUNK));
    let from = 0, nl;
    while ((nl = text.indexOf('\n', from)) !== -1) {
      handle(text.slice(from, nl));
      from = nl + 1;
    }
    rest = text.slice(from);
  }
  if (rest) handle(rest);

  return {
    codes,
    v4s: v4s.done(), v4e: v4e.done(), v4c: v4c.done(),
    v6s: v6s.done(), v6e: v6e.done(), v6c: v6c.done(),
  };
}

function search(starts, ends, value) {
  let lo = 0, hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (value < starts[mid]) hi = mid - 1;
    else if (value > ends[mid]) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Код страны (ISO 3166-1 alpha-2) или null. */
function lookupCountry(ip) {
  if (!db || !ip) return null;
  if (ip.includes(':')) {
    const v = ipv6High(ip);
    if (v === null) return null;
    const i = search(db.v6s, db.v6e, v);
    return i === -1 ? null : db.codes[db.v6c[i]];
  }
  const v = ipv4ToInt(ip);
  if (v === null) return null;
  const i = search(db.v4s, db.v4e, v);
  return i === -1 ? null : db.codes[db.v4c[i]];
}

function load() {
  try {
    if (!fs.existsSync(FILE)) return false;
    const t0 = Date.now();
    db = parse(fs.readFileSync(FILE));
    console.log(`[geoip] DB-IP: ${db.v4s.length} IPv4 и ${db.v6s.length} IPv6 диапазонов, ${Date.now() - t0} мс`);
    return true;
  } catch (e) {
    console.warn('[geoip] база DB-IP не прочиталась:', e.message);
    return false;
  }
}

function monthTag(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Скачать свежий выпуск (текущий месяц, иначе прошлый) и подменить базу. */
async function update() {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  for (const tag of [monthTag(now), monthTag(prev)]) {
    const url = `https://download.db-ip.com/free/dbip-country-lite-${tag}.csv.gz`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const fresh = parse(buf); // битый файл не должен заменить рабочий
      fs.mkdirSync(DIR, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, FILE);
      db = fresh;
      console.log(`[geoip] база DB-IP обновлена: ${tag}`);
      return true;
    } catch (e) {
      console.warn(`[geoip] не удалось скачать ${url}:`, e.message);
    }
  }
  return false;
}

function isStale() {
  try { return Date.now() - fs.statSync(FILE).mtimeMs > MAX_AGE_MS; }
  catch { return true; }
}

let started = false;
/** Загрузить базу и держать её свежей. Вызывается один раз при старте сервера. */
function start() {
  if (started) return;
  started = true;
  load();
  const check = () => { if (isStale()) update().catch(() => { }); };
  check();
  setInterval(check, CHECK_EVERY_MS).unref();
}

module.exports = { start, load, update, lookupCountry, isReady: () => !!db };
