#!/usr/bin/env node
/**
 * Реестр приложений Vlyne ID из командной строки.
 *
 * Регистрация не самообслуживаемая: приложение, которое просит доступ к
 * аккаунту, заводится руками администратора. Список должен быть коротким и
 * проверяемым глазами — в этом и смысл.
 *
 *   node server/scripts/vlyneClient.js list
 *   node server/scripts/vlyneClient.js create --name "Vlyne Client" \
 *        --redirect vlyne://auth/callback --redirect http://127.0.0.1:7431/callback \
 *        --scopes openid,profile,email,telegram,offline_access --first-party
 *   node server/scripts/vlyneClient.js create --name "Vlyne VPN Bot" --type confidential \
 *        --redirect https://bot.vlyne.ru/oauth/callback --scopes openid,profile,telegram
 *   node server/scripts/vlyneClient.js secret <clientId>     # перевыпустить секрет
 *   node server/scripts/vlyneClient.js disable <clientId>
 *   node server/scripts/vlyneClient.js delete  <clientId>
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const VlyneClient = require('../models/VlyneClient');
const VlyneGrant = require('../models/VlyneGrant');
const VlyneRefreshToken = require('../models/VlyneRefreshToken');
const { ALL_SCOPES } = require('../utils/vlyneScopes');
const { randomToken } = require('../utils/vlyneTokens');

function parseArgs(argv) {
  const args = { _: [], redirect: [], logout: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    if (key === 'first-party') { args.firstParty = true; continue; }
    if (key === 'no-refresh') { args.noRefresh = true; continue; }
    const value = argv[++i];
    if (key === 'redirect') args.redirect.push(value);
    else if (key === 'logout-redirect') args.logout.push(value);
    else args[key] = value;
  }
  return args;
}

function printClient(c, secret) {
  console.log('');
  console.log(`  ${c.name}${c.isActive ? '' : '  [отключено]'}`);
  console.log(`  client_id:     ${c.clientId}`);
  if (secret) {
    console.log(`  client_secret: ${secret}`);
    console.log('  ^ показывается один раз: в базе хранится только хеш. Сохраните сейчас.');
  }
  console.log(`  тип:           ${c.type}${c.firstParty ? ', своё приложение (согласие спрашивается один раз)' : ''}`);
  console.log(`  права:         ${c.allowedScopes.join(' ')}`);
  console.log(`  возврат:       ${c.redirectUris.join('\n                 ')}`);
  console.log('');
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!command || command === 'help') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].split('/**')[1].replace(/^ \* ?/gm, ''));
    process.exit(0);
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zvon');

  if (command === 'list') {
    const clients = await VlyneClient.find().sort({ createdAt: -1 });
    if (!clients.length) console.log('Приложений пока нет.');
    clients.forEach((c) => printClient(c));
  }

  else if (command === 'create') {
    if (!args.name) throw new Error('Укажите --name');
    if (!args.redirect.length) throw new Error('Укажите хотя бы один --redirect');

    const scopes = (args.scopes || 'openid,profile').split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = scopes.filter((s) => !ALL_SCOPES.includes(s));
    if (unknown.length) throw new Error(`Неизвестные права: ${unknown.join(', ')}. Доступны: ${ALL_SCOPES.join(', ')}`);

    const type = args.type === 'confidential' ? 'confidential' : 'public';
    let secret = null;
    let secretHash = null;
    if (type === 'confidential') {
      secret = randomToken(32);
      secretHash = VlyneClient.hashSecret(secret);
    }

    const client = await VlyneClient.create({
      clientId: 'vlyne_' + randomToken(12),
      clientSecretHash: secretHash,
      type,
      name: args.name,
      description: args.description || '',
      logo: args.logo || null,
      homepageUrl: args.homepage || '',
      redirectUris: args.redirect,
      postLogoutRedirectUris: args.logout,
      allowedScopes: scopes,
      firstParty: !!args.firstParty,
      allowRefreshTokens: !args.noRefresh
    });

    console.log('Приложение зарегистрировано.');
    printClient(client, secret);
  }

  else if (command === 'secret') {
    const client = await VlyneClient.findOne({ clientId: args._[0] });
    if (!client) throw new Error('Приложение не найдено');
    if (client.type !== 'confidential') throw new Error('У публичного приложения секрета нет');
    const secret = randomToken(32);
    client.clientSecretHash = VlyneClient.hashSecret(secret);
    await client.save();
    console.log('Секрет перевыпущен. Старый больше не действует.');
    printClient(client, secret);
  }

  else if (command === 'disable' || command === 'enable') {
    const client = await VlyneClient.findOne({ clientId: args._[0] });
    if (!client) throw new Error('Приложение не найдено');
    client.isActive = command === 'enable';
    await client.save();
    console.log(`Приложение ${client.name} ${client.isActive ? 'включено' : 'отключено'}.`);
  }

  else if (command === 'delete') {
    const client = await VlyneClient.findOne({ clientId: args._[0] });
    if (!client) throw new Error('Приложение не найдено');
    // Удаляем вместе с согласиями и токенами: иначе в «Подключённых
    // приложениях» останутся записи, не привязанные ни к чему.
    await VlyneGrant.deleteMany({ client: client._id });
    await VlyneRefreshToken.deleteMany({ client: client._id });
    await VlyneClient.deleteOne({ _id: client._id });
    console.log(`Приложение ${client.name} удалено вместе с выданными доступами.`);
  }

  else {
    throw new Error(`Неизвестная команда: ${command}`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Ошибка:', e.message);
  try { await mongoose.disconnect(); } catch (x) {}
  process.exit(1);
});
