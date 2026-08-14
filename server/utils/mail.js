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

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true для 465, false для остальных портов
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS in .env');
  }
};

const sendVerificationEmail = async (email, token, brandName = 'Zvon') => {
  checkConfig();
  const baseUrl = process.env.API_URL || process.env.CLIENT_URL || 'http://localhost:5000';
  const url = `${baseUrl}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"${brandName}" <${process.env.SMTP_USER}>`,
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
      from: `"${brandName}" <${process.env.SMTP_USER}>`,
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
    from: `"${brandName}" <${process.env.SMTP_USER}>`,
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
    from: `"${brandName}" <${process.env.SMTP_USER}>`,
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
    from: `"${brandName}" <${process.env.SMTP_USER}>`,
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
  sendResetCode,
  sendRegistrationCode,
  sendEmailChangeCode,
};
