/**
 * Генерация пары VAPID-ключей для Web Push.
 *
 *   node server/scripts/generateVapidKeys.js
 *
 * Полученные значения кладём в server/.env. Генерировать нужно ОДИН раз:
 * публичный ключ вшивается в подписки браузеров, и если поменять пару, все
 * существующие подписки станут недействительными — пользователям придётся
 * заново включать уведомления.
 */
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('Добавьте в server/.env:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_CONTACT=mailto:you@example.com');
console.log('\nПриватный ключ не коммитить и никому не передавать.');
