/**
 * Готовит локальную базу GeoIP «только страны».
 *
 *   node server/scripts/prepareGeoData.js
 *
 * Зачем: пакет geoip-lite поставляется с базой городов на ~106 МБ, и при первом
 * обращении она целиком загружается в память (замерено: +108 МБ RSS). Города при
 * этом для большинства адресов всё равно пустые, а для нашей задачи — показать
 * пользователю, из какой страны был вход, — нужна только страна.
 *
 * Копируем страновые файлы в отдельный каталог и указываем на него geoip-lite
 * через GEODATADIR. Расход памяти падает до ~10 МБ.
 *
 * Запускать после установки зависимостей и после обновления geoip-lite.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'node_modules', 'geoip-lite', 'data');
const DST = path.join(__dirname, '..', 'data', 'geoip');

// Только страновые файлы. Файлы контрольных сумм нужны самой библиотеке.
const FILES = ['geoip-country.dat', 'geoip-country6.dat', 'country.checksum', 'city.checksum'];

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[geoip] Не найден каталог данных geoip-lite. Установите зависимости: npm install');
    process.exit(1);
  }

  fs.mkdirSync(DST, { recursive: true });

  let copied = 0;
  for (const name of FILES) {
    const from = path.join(SRC, name);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(DST, name));
    copied++;
  }

  console.log(`[geoip] Готово: скопировано файлов — ${copied}, каталог — ${DST}`);
  console.log('[geoip] База работает офлайн, обращений к внешним сервисам нет.');
}

main();
