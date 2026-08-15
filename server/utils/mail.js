const nodemailer = require('nodemailer');

/**
 * Отправка почты.
 *
 * SMTP_HOST обязателен и НЕ имеет значения по умолчанию — намеренно.
 * Раньше здесь стоял фолбэк на smtp.gmail.com: если переменную забывали задать,
 * вся почта (адреса пользователей, коды подтверждения и входа) молча уходила
 * через сервер в США. Для 152-ФЗ это необъявленная трансграничная передача, и
 * самое неприятное в ней — незаметность: ничего не ломается, никто не узнаёт.
 *
 * Теперь при отсутствии настроек отправка падает с внятной ошибкой. Отказ
 * лучше тихой утечки.
 */
const SMTP_HOST = process.env.SMTP_HOST || '';

// Свой почтовый сервер на той же машине — частый и правильный случай: Postfix
// принимает почту с localhost без аутентификации (mynetworks), логина и пароля
// просто нет. Поэтому auth подставляется только когда учётные данные заданы:
// пустой блок auth заставил бы nodemailer пытаться авторизоваться и падать.
const isLocalRelay = /^(localhost|127\.0\.0\.1|::1)$/i.test(SMTP_HOST);
const hasCredentials = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || (isLocalRelay ? 25 : 587),
  secure: process.env.SMTP_SECURE === 'true', // true для 465, false для остальных портов
  // Локальный релей обычно работает без TLS — соединение не покидает машину.
  ignoreTLS: isLocalRelay && process.env.SMTP_SECURE !== 'true',
  ...(hasCredentials
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
    : {}),
});

// Предупреждаем на старте, а не в момент первой отправки: узнать о неверной
// конфигурации почты лучше при запуске, чем когда пользователь не смог войти.
if (!SMTP_HOST) {
  console.warn('[mail] SMTP_HOST не задан — отправка почты работать не будет. Укажите почтовый сервер в .env.');
} else if (/gmail\.com|googlemail\.com|outlook\.com|office365\.com|sendgrid\.net|mailgun\.org/i.test(SMTP_HOST)) {
  console.warn(
    `[mail] ВНИМАНИЕ: SMTP_HOST=${SMTP_HOST} — это иностранный почтовый сервис. ` +
    'Адреса пользователей будут передаваться за пределы РФ, что требует уведомления ' +
    'Роскомнадзора по ст. 12 152-ФЗ. Для обработки данных граждан РФ используйте ' +
    'российский сервис или собственный почтовый сервер.'
  );
}

const checkConfig = () => {
  if (!SMTP_HOST) {
    throw new Error('SMTP_HOST не настроен. Укажите почтовый сервер в .env — значения по умолчанию нет намеренно.');
  }
  // Для локального релея логин с паролем не нужны — доверие настроено на
  // уровне Postfix. Для внешнего сервера они обязательны.
  if (!isLocalRelay && !hasCredentials) {
    throw new Error('SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS in .env');
  }
  if (!process.env.MAIL_FROM && !process.env.SMTP_USER) {
    throw new Error('Не задан адрес отправителя. Укажите MAIL_FROM в .env, например noreply@вашдомен.ru');
  }
};

/**
 * Адрес в поле From.
 *
 * Раньше сюда подставлялся SMTP_USER. Для внешних сервисов это работало,
 * потому что там логин и есть адрес почты. На собственном почтовом сервере
 * логин SASL — это обычно просто имя («noreply»), и заголовок получался вида
 * `"Zvon" <noreply>`: невалидный адрес, письмо отклоняется принимающей стороной.
 *
 * Поэтому адрес отправителя задаётся отдельной переменной MAIL_FROM. Она же
 * должна совпадать с доменом, для которого настроены SPF и DKIM, иначе проверки
 * подписи не пройдут и письма уйдут в спам.
 */
const fromAddress = (brandName) => {
  const addr = process.env.MAIL_FROM || process.env.SMTP_USER || '';
  return `"${brandName}" <${addr}>`;
};

/**
 * Проверка соединения с почтовым сервером.
 *
 * Вызывается при старте: через почту идут коды входа и двухфакторной
 * аутентификации, и молчаливая поломка настроек означает, что люди не смогут
 * войти вообще. Лучше увидеть это в логе при запуске, чем по жалобам.
 */
const verifyConnection = async () => {
  if (!SMTP_HOST) return { ok: false, error: 'SMTP_HOST не задан' };
  try {
    await transporter.verify();
    console.log(`[mail] Соединение с ${SMTP_HOST} установлено, отправитель: ${process.env.MAIL_FROM || process.env.SMTP_USER || '(не задан)'}`);
    return { ok: true };
  } catch (err) {
    console.error(`[mail] Не удалось подключиться к ${SMTP_HOST}: ${err.message}`);
    return { ok: false, error: err.message };
  }
};

const sendVerificationEmail = async (email, token, brandName = 'Zvon') => {
  checkConfig();
  const baseUrl = process.env.API_URL || process.env.CLIENT_URL || 'http://localhost:5000';
  const url = `${baseUrl}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: fromAddress(brandName),
    to: email,
    subject: `Подтверждение регистрации в ${brandName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #5865F2; text-align: center;">Добро пожаловать в ${brandName}!</h2>
        <p>Для завершения регистрации, пожалуйста, подтвердите ваш адрес электронной почты, нажав на кнопку ниже:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${url}" style="background-color: #5865F2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Подтвердить почту</a>
        </div>
        <p>Если кнопка не работает, скопируйте и вставьте эту ссылку в браузер:</p>
        <p style="word-break: break-all; color: #5865F2;">${url}</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">Если вы не регистрировались в ${brandName}, просто проигнорируйте это письмо.</p>
      </div>
    `,
  });
};

const sendLoginCode = async (email, code, brandName = 'Zvon') => {
  checkConfig();
  try {
    await transporter.sendMail({
      from: fromAddress(brandName),
      to: email,
      subject: `Код подтверждения входа ${brandName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #5865F2; text-align: center;">Код подтверждения</h2>
          <p>Вы пытаетесь войти в свой аккаунт ${brandName}. Используйте следующий код для подтверждения:</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #5865F2; background: #f0f0f0; padding: 10px 20px; border-radius: 5px;">${code}</span>
          </div>
          <p>Код действителен в течение 10 минут.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">Если это были не вы, немедленно смените пароль.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Error sending login code email:', error);
    throw error;
  }
};

const sendResetCode = async (email, code, brandName = 'Zvon') => {
  checkConfig();
  await transporter.sendMail({
    from: fromAddress(brandName),
    to: email,
    subject: `Код для сброса пароля ${brandName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #5865F2; text-align: center;">Сброс пароля</h2>
        <p>Вы запросили сброс пароля для вашего аккаунта ${brandName}. Используйте следующий код для подтверждения:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #5865F2; background: #f0f0f0; padding: 10px 20px; border-radius: 5px;">${code}</span>
        </div>
        <p>Код действителен в течение 10 минут.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
      </div>
    `,
  });
};

const sendRegistrationCode = async (email, code, brandName = 'Zvon') => {
  checkConfig();
  await transporter.sendMail({
    from: fromAddress(brandName),
    to: email,
    subject: `Код регистрации в ${brandName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #5865F2; text-align: center;">Код регистрации</h2>
        <p>Для завершения регистрации в ${brandName}, пожалуйста, введите следующий код:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #5865F2; background: #f0f0f0; padding: 10px 20px; border-radius: 5px;">${code}</span>
        </div>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">Если это были не вы, проигнорируйте это письмо.</p>
      </div>
    `,
  });
};

const sendEmailChangeCode = async (email, code, brandName = 'Zvon') => {
  checkConfig();
  await transporter.sendMail({
    from: fromAddress(brandName),
    to: email,
    subject: `Код подтверждения смены почты ${brandName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #5865F2; text-align: center;">Смена почты</h2>
        <p>Вы пытаетесь привязать эту почту к вашему аккаунту ${brandName}. Используйте следующий код:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #5865F2; background: #f0f0f0; padding: 10px 20px; border-radius: 5px;">${code}</span>
        </div>
        <p>Код действителен в течение 10 минут.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">Если вы не запрашивали смену почты, немедленно смените пароль.</p>
      </div>
    `,
  });
};

module.exports = {
  sendVerificationEmail,
  sendLoginCode,
  verifyConnection,
  sendResetCode,
  sendRegistrationCode,
  sendEmailChangeCode,
};
