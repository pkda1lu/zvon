const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const PAGE_SIZE = 25;
const MAX_MESSAGE_SIZE = 5 * 1024 * 1024;

async function withInbox(read) {
  const { IMAP_HOST, IMAP_USER, IMAP_PASS, IMAP_PORT } = process.env;
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    throw Object.assign(new Error('Входящая почта ещё не настроена'), { status: 503 });
  }

  const client = new ImapFlow({
    host: IMAP_HOST, port: Number(IMAP_PORT || 993), secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
    maxLiteralSize: MAX_MESSAGE_SIZE
  });
  client.on('error', () => {});
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
    return await read(client, mailbox);
  } finally {
    client.close();
  }
}

function summary(message) {
  return {
    uid: message.uid,
    subject: message.envelope?.subject || 'Без темы',
    from: (message.envelope?.from || []).map(({ name, address }) => name ? name + ' <' + address + '>' : address).join(', '),
    date: message.internalDate,
    unread: !message.flags?.has('\\Seen')
  };
}

function listInbox(page) {
  return withInbox(async (client, mailbox) => {
    const end = mailbox.exists - (page - 1) * PAGE_SIZE;
    const start = Math.max(1, end - PAGE_SIZE + 1);
    const messages = end > 0 ? await client.fetchAll(start + ':' + end, {
      uid: true, envelope: true, flags: true, internalDate: true
    }) : [];
    return {
      items: messages.reverse().map(summary),
      validity: String(mailbox.uidValidity),
      hasMore: start > 1
    };
  });
}

function readMessage(uid, validity) {
  return withInbox(async (client, mailbox) => {
    if (String(mailbox.uidValidity) !== validity) {
      throw Object.assign(new Error('Папка изменилась. Обновите список писем.'), { status: 409 });
    }
    const query = { uid: true };
    const header = await client.fetchOne(uid, { size: true }, query);
    if (!header) throw Object.assign(new Error('Письмо не найдено'), { status: 404 });
    if (header.size > MAX_MESSAGE_SIZE) {
      throw Object.assign(new Error('Письмо превышает лимит просмотра в 5 МБ'), { status: 413 });
    }
    const message = await client.fetchOne(uid, {
      uid: true, envelope: true, flags: true, internalDate: true,
      source: { start: 0, maxLength: MAX_MESSAGE_SIZE }
    }, query);
    if (!message?.source) throw Object.assign(new Error('Письмо не найдено'), { status: 404 });
    const mail = await simpleParser(message.source, { skipImageLinks: true, skipTextToHtml: true });
    return {
      ...summary(message),
      text: (mail.text || '').slice(0, 200000),
      attachments: mail.attachments.map(({ filename, size }) => ({ filename: filename || 'Вложение', size }))
    };
  });
}

module.exports = { listInbox, readMessage };
