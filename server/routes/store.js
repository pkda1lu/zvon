// VPN-магазин: платежи (YooKassa/CryptoBot) и выдача ключей напрямую из zvon.
// Пользователь определяется по JWT (middleware auth) — мини-апп вызывает эти
// эндпоинты через хост (MiniAppWindow) с авторизацией текущего пользователя.

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const VpnOrder = require('../models/VpnOrder');
const { config, paymentMethods, priceWithPromo } = require('../utils/vpnConfig');
const payments = require('../utils/vpnPayments');
const { provision } = require('../utils/vpnProvisioner');

function planOrNull(code) { return config.plans[code] || null; }

// Выдать ключ для оплаченного/бесплатного заказа и сохранить результат.
async function fulfill(order) {
  const plan = config.plans[order.plan];
  const result = await provision(order.plan, plan.days, String(order._id));
  order.status = 'paid';
  order.subUrl = result.sub_url || null;
  order.link = result.link || null;
  order.expiryMs = result.expiry_ms || (Date.now() + plan.days * 86400000);
  order.fulfilledAt = new Date();
  await order.save();
  return order;
}

// ---------- Каталог ----------
router.get('/catalog', auth, (req, res) => {
  const plans = Object.values(config.plans).map(p => ({
    code: p.code, title: p.title, days: p.days, price: p.price,
    whitelist: p.whitelist, trial: p.trial,
  }));
  res.json({ ok: true, plans, paymentMethods: paymentMethods(), currency: config.currency });
});

// ---------- Проверка промокода ----------
router.post('/promo/check', auth, (req, res) => {
  const { code, plan } = req.body || {};
  if (!planOrNull(plan)) return res.status(400).json({ ok: false, error: 'Некорректный план' });
  const pr = priceWithPromo(plan, code);
  if (!pr.discountPercent) return res.json({ ok: false, error: 'Промокод недействителен' });
  res.json({ ok: true, discountPercent: pr.discountPercent, basePrice: pr.base, finalPrice: pr.finalPrice });
});

// ---------- Оформление заказа ----------
router.post('/order', auth, async (req, res) => {
  try {
    const { plan, os = 'windows', promo, paymentMethod = 'yookassa' } = req.body || {};
    const p = planOrNull(plan);
    if (!p) return res.status(400).json({ ok: false, error: 'Некорректный план' });

    // Пробный тариф — один раз на пользователя
    if (p.trial) {
      const hasPaid = await VpnOrder.exists({ user: req.user._id, status: 'paid' });
      if (hasPaid) return res.status(400).json({ ok: false, error: 'Пробный доступ доступен один раз' });
    }

    const pr = priceWithPromo(plan, promo);
    const order = await VpnOrder.create({
      user: req.user._id, plan, os, amount: pr.finalPrice, currency: 'RUB',
      promocode: pr.promo, status: 'pending',
    });

    // Бесплатно (пробный / 100% промокод) — выдаём сразу
    if (pr.finalPrice === 0) {
      order.provider = 'free';
      await fulfill(order);
      return res.json({
        ok: true, status: 'done', orderId: order._id, subUrl: order.subUrl,
        expiryMs: order.expiryMs, instructions: config.osInstructions[os] || '',
      });
    }

    const desc = `${p.title} (VLESS) — zvon:${req.user._id}`;
    if (paymentMethod === 'cryptobot') {
      if (!(config.cryptobot.enabled && config.cryptobot.apiToken)) {
        return res.status(400).json({ ok: false, error: 'Криптоплатежи недоступны' });
      }
      const pay = await payments.cryptobotCreate({
        amountRub: pr.finalPrice, description: desc, payload: `order=${order._id}`,
      });
      order.provider = 'cryptobot'; order.paymentId = `cryptobot_${pay.id}`; await order.save();
      return res.json({ ok: true, status: 'pending', orderId: order._id, payUrl: pay.url, amount: pr.finalPrice, amountUsd: pay.amountUsd });
    }

    // YooKassa по умолчанию
    const pay = await payments.yookassaCreate({
      amountRub: pr.finalPrice, description: desc,
      metadata: { order_id: String(order._id), zvon_id: String(req.user._id), plan },
      username: req.user.username,
    });
    order.provider = 'yookassa'; order.paymentId = pay.id; await order.save();
    res.json({ ok: true, status: 'pending', orderId: order._id, payUrl: pay.url, amount: pr.finalPrice });
  } catch (e) {
    console.error('[Store] order error:', e.message);
    res.status(500).json({ ok: false, error: 'Не удалось оформить заказ: ' + e.message });
  }
});

// ---------- Проверка оплаты + выдача ключа ----------
router.post('/order/check', auth, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const order = await VpnOrder.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ ok: false, error: 'Заказ не найден' });

    if (order.status === 'paid') {
      return res.json({ ok: true, status: 'paid', subUrl: order.subUrl, expiryMs: order.expiryMs,
        instructions: config.osInstructions[order.os] || '' });
    }
    if (!order.paymentId) return res.status(400).json({ ok: false, error: 'Платёж не создан' });

    let status = null;
    if (order.paymentId.startsWith('cryptobot_')) {
      status = await payments.cryptobotStatus(order.paymentId.split('_')[1]);
    } else {
      status = await payments.yookassaStatus(order.paymentId);
    }

    if (status === 'succeeded' || status === 'paid') {
      await fulfill(order);
      return res.json({ ok: true, status: 'paid', subUrl: order.subUrl, expiryMs: order.expiryMs,
        instructions: config.osInstructions[order.os] || '' });
    }
    if (['pending', 'active', 'waiting_for_capture'].includes(status)) {
      return res.json({ ok: true, status: 'pending' });
    }
    if (['canceled', 'cancelled', 'expired'].includes(status)) {
      order.status = 'canceled'; await order.save();
      return res.json({ ok: true, status: 'canceled' });
    }
    res.json({ ok: true, status: status || 'pending' });
  } catch (e) {
    console.error('[Store] check error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Кабинет ----------
router.get('/cabinet', auth, async (req, res) => {
  const orders = await VpnOrder.find({ user: req.user._id, status: 'paid' }).sort({ createdAt: -1 }).lean();
  const subscriptions = orders.map(o => ({
    orderId: String(o._id), plan: o.plan, planTitle: config.plans[o.plan]?.title || o.plan,
    createdAt: o.createdAt ? new Date(o.createdAt).getTime() : null,
    expiryMs: o.expiryMs, subUrl: o.subUrl,
  }));
  res.json({ ok: true, subscriptions });
});

module.exports = router;
