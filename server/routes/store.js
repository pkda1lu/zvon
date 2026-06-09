// Магазин Zvon: каталог товаров (VPN + мерч), оплата (YooKassa/CryptoBot),
// выдача ключей через провижинер, оформление мерча, и админка (CRUD + заказы).
// Пользователь определяется по JWT (middleware auth); мини-апп вызывает эти
// эндпоинты через хост (MiniAppWindow) с авторизацией текущего пользователя.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../middleware/auth');
const StoreProduct = require('../models/StoreProduct');
const StoreOrder = require('../models/StoreOrder');
const { config, paymentMethods } = require('../utils/vpnConfig');
const payments = require('../utils/vpnPayments');
const { provision } = require('../utils/vpnProvisioner');

const uploadsDir = path.join(__dirname, '../uploads');

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Только для администратора' });
  next();
}

function promoDiscount(code) {
  if (!code) return 0;
  return config.promos[String(code).trim().toUpperCase()] || 0;
}

function publicProduct(p) {
  return {
    id: String(p._id), type: p.type, title: p.title, description: p.description,
    price: p.price, currency: p.currency, images: p.images || [], sortOrder: p.sortOrder,
    vpn: p.type === 'vpn' ? { days: p.vpn?.days, whitelist: !!p.vpn?.whitelist, trialOnce: !!p.vpn?.trialOnce } : undefined,
    merch: p.type === 'merch' ? { stock: p.merch?.stock ?? null, requiresShipping: p.merch?.requiresShipping !== false, options: p.merch?.options || [] } : undefined,
  };
}

// Выдать товар по оплаченному/бесплатному заказу.
async function fulfill(order, product) {
  if (order.type === 'vpn') {
    const provisionPlan = (product.vpn?.whitelist || product.vpn?.trialOnce) ? '30d_whitelist' : '30d';
    const days = product.vpn?.days || 30;
    const result = await provision(provisionPlan, days, String(order._id));
    order.subUrl = result.sub_url || null;
    order.link = result.link || null;
    order.expiryMs = result.expiry_ms || (Date.now() + days * 86400000);
  } else {
    // мерч: уменьшаем сток, ставим в очередь на отправку
    if (product.merch && typeof product.merch.stock === 'number') {
      product.merch.stock = Math.max(0, product.merch.stock - (order.qty || 1));
      await product.save();
    }
    order.fulfillment = 'new';
  }
  order.status = 'paid';
  order.fulfilledAt = new Date();
  await order.save();
  return order;
}

// ===================== Каталог =====================
router.get('/catalog', auth, async (req, res) => {
  const products = await StoreProduct.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
  res.json({
    ok: true,
    products: products.map(publicProduct),
    paymentMethods: paymentMethods(),
    currency: config.currency,
    isAdmin: req.user.role === 'admin',
  });
});

router.post('/promo/check', auth, async (req, res) => {
  const { code, productId } = req.body || {};
  const product = await StoreProduct.findById(productId).lean();
  if (!product) return res.status(400).json({ ok: false, error: 'Товар не найден' });
  const pct = promoDiscount(code);
  if (!pct) return res.json({ ok: false, error: 'Промокод недействителен' });
  const finalPrice = Math.max(0, product.price - Math.floor(product.price * pct / 100));
  res.json({ ok: true, discountPercent: pct, basePrice: product.price, finalPrice });
});

// ===================== Оформление =====================
router.post('/order', auth, async (req, res) => {
  try {
    const { productId, os = 'windows', promo, paymentMethod = 'yookassa', qty = 1, shipping } = req.body || {};
    const product = await StoreProduct.findById(productId);
    if (!product || !product.active) return res.status(404).json({ ok: false, error: 'Товар недоступен' });

    const quantity = Math.max(1, parseInt(qty, 10) || 1);

    // Мерч: проверка стока и доставки
    if (product.type === 'merch') {
      if (typeof product.merch?.stock === 'number' && product.merch.stock < quantity) {
        return res.status(400).json({ ok: false, error: 'Недостаточно товара на складе' });
      }
      if (product.merch?.requiresShipping !== false) {
        if (!shipping || !shipping.name || !shipping.phone || !shipping.address) {
          return res.status(400).json({ ok: false, error: 'Укажите имя, телефон и адрес доставки' });
        }
      }
    }

    // VPN trialOnce — один раз на пользователя по этому товару
    if (product.type === 'vpn' && product.vpn?.trialOnce) {
      const had = await StoreOrder.exists({ user: req.user._id, product: product._id, status: 'paid' });
      if (had) return res.status(400).json({ ok: false, error: 'Этот пробный тариф доступен один раз' });
    }

    const pct = promoDiscount(promo);
    const unit = Math.max(0, product.price - Math.floor(product.price * pct / 100));
    const amount = product.type === 'merch' ? unit * quantity : unit;

    const order = await StoreOrder.create({
      user: req.user._id, product: product._id, type: product.type, title: product.title,
      amount, currency: 'RUB', qty: quantity, promocode: pct ? String(promo).toUpperCase() : null,
      status: 'pending', os,
      shipping: product.type === 'merch' ? {
        name: shipping?.name || '', phone: shipping?.phone || '', address: shipping?.address || '',
        comment: shipping?.comment || '', option: shipping?.option || '',
      } : undefined,
    });

    // Бесплатно (VPN-триал / 100% промокод) — выдаём сразу
    if (amount === 0) {
      order.provider = 'free';
      await fulfill(order, product);
      return res.json({
        ok: true, status: 'done', orderId: order._id, type: order.type, subUrl: order.subUrl,
        expiryMs: order.expiryMs, instructions: config.osInstructions[os] || '',
      });
    }

    const desc = `${product.title} — zvon:${req.user._id}`;
    if (paymentMethod === 'cryptobot') {
      if (!(config.cryptobot.enabled && config.cryptobot.apiToken)) {
        return res.status(400).json({ ok: false, error: 'Криптоплатежи недоступны' });
      }
      const pay = await payments.cryptobotCreate({ amountRub: amount, description: desc, payload: `order=${order._id}` });
      order.provider = 'cryptobot'; order.paymentId = `cryptobot_${pay.id}`; await order.save();
      return res.json({ ok: true, status: 'pending', orderId: order._id, payUrl: pay.url, amount, amountUsd: pay.amountUsd });
    }

    const pay = await payments.yookassaCreate({
      amountRub: amount, description: desc,
      metadata: { order_id: String(order._id), zvon_id: String(req.user._id) },
      username: req.user.username,
    });
    order.provider = 'yookassa'; order.paymentId = pay.id; await order.save();
    res.json({ ok: true, status: 'pending', orderId: order._id, payUrl: pay.url, amount });
  } catch (e) {
    console.error('[Store] order error:', e.message);
    res.status(500).json({ ok: false, error: 'Не удалось оформить заказ: ' + e.message });
  }
});

router.post('/order/check', auth, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const order = await StoreOrder.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ ok: false, error: 'Заказ не найден' });

    if (order.status === 'paid') {
      return res.json({ ok: true, status: 'paid', type: order.type, subUrl: order.subUrl, expiryMs: order.expiryMs,
        instructions: config.osInstructions[order.os] || '' });
    }
    if (!order.paymentId) return res.status(400).json({ ok: false, error: 'Платёж не создан' });

    let status = null;
    if (order.paymentId.startsWith('cryptobot_')) status = await payments.cryptobotStatus(order.paymentId.split('_')[1]);
    else status = await payments.yookassaStatus(order.paymentId);

    if (status === 'succeeded' || status === 'paid') {
      const product = await StoreProduct.findById(order.product);
      await fulfill(order, product);
      return res.json({ ok: true, status: 'paid', type: order.type, subUrl: order.subUrl, expiryMs: order.expiryMs,
        instructions: config.osInstructions[order.os] || '' });
    }
    if (['pending', 'active', 'waiting_for_capture'].includes(status)) return res.json({ ok: true, status: 'pending' });
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

// ===================== Кабинет =====================
router.get('/cabinet', auth, async (req, res) => {
  const orders = await StoreOrder.find({ user: req.user._id, status: 'paid' }).sort({ createdAt: -1 }).lean();
  res.json({
    ok: true,
    subscriptions: orders.filter(o => o.type === 'vpn').map(o => ({
      orderId: String(o._id), title: o.title, createdAt: o.createdAt ? new Date(o.createdAt).getTime() : null,
      expiryMs: o.expiryMs, subUrl: o.subUrl,
    })),
    merch: orders.filter(o => o.type === 'merch').map(o => ({
      orderId: String(o._id), title: o.title, qty: o.qty, amount: o.amount,
      createdAt: o.createdAt ? new Date(o.createdAt).getTime() : null,
      fulfillment: o.fulfillment, shipping: o.shipping,
    })),
  });
});

// ===================== Админка =====================
function parseProductBody(b) {
  const out = {
    type: b.type === 'merch' ? 'merch' : 'vpn',
    title: String(b.title || '').trim(),
    description: String(b.description || ''),
    price: Math.max(0, parseInt(b.price, 10) || 0),
    images: Array.isArray(b.images) ? b.images.filter(Boolean).slice(0, 8) : [],
    active: b.active !== false,
    sortOrder: parseInt(b.sortOrder, 10) || 0,
  };
  if (out.type === 'vpn') {
    out.vpn = {
      days: Math.max(1, parseInt(b.vpn?.days, 10) || 30),
      whitelist: !!b.vpn?.whitelist,
      trialOnce: !!b.vpn?.trialOnce,
    };
  } else {
    out.merch = {
      stock: (b.merch?.stock === null || b.merch?.stock === '' || b.merch?.stock === undefined) ? null : Math.max(0, parseInt(b.merch.stock, 10) || 0),
      requiresShipping: b.merch?.requiresShipping !== false,
      options: typeof b.merch?.options === 'string'
        ? b.merch.options.split(',').map(s => s.trim()).filter(Boolean)
        : (Array.isArray(b.merch?.options) ? b.merch.options : []),
    };
  }
  return out;
}

router.get('/admin/products', auth, requireAdmin, async (req, res) => {
  const products = await StoreProduct.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
  res.json({ ok: true, products: products.map(p => ({ ...publicProduct(p), active: p.active })) });
});

router.post('/admin/product', auth, requireAdmin, async (req, res) => {
  try {
    const data = parseProductBody(req.body || {});
    if (!data.title) return res.status(400).json({ ok: false, error: 'Укажите название' });
    const product = await StoreProduct.create(data);
    res.json({ ok: true, product: publicProduct(product) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.put('/admin/product/:id', auth, requireAdmin, async (req, res) => {
  try {
    const data = parseProductBody(req.body || {});
    if (!data.title) return res.status(400).json({ ok: false, error: 'Укажите название' });
    const product = await StoreProduct.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!product) return res.status(404).json({ ok: false, error: 'Товар не найден' });
    res.json({ ok: true, product: publicProduct(product) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.delete('/admin/product/:id', auth, requireAdmin, async (req, res) => {
  const r = await StoreProduct.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return res.status(404).json({ ok: false, error: 'Товар не найден' });
  res.json({ ok: true });
});

// Загрузка картинки товара (base64 data URL -> файл в uploads).
router.post('/admin/upload', auth, requireAdmin, async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = /^data:(image\/(png|jpe?g|gif|webp|svg\+xml));base64,(.+)$/.exec(dataUrl || '');
    if (!m) return res.status(400).json({ ok: false, error: 'Ожидается image data URL' });
    const buf = Buffer.from(m[3], 'base64');
    if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Картинка больше 8 МБ' });
    const ext = m[2] === 'jpeg' ? 'jpg' : (m[2] === 'svg+xml' ? 'svg' : m[2]);
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `product-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buf);
    res.json({ ok: true, url: `/api/uploads/${filename}` });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/admin/orders', auth, requireAdmin, async (req, res) => {
  const orders = await StoreOrder.find().sort({ createdAt: -1 }).limit(200)
    .populate('user', 'username').lean();
  res.json({ ok: true, orders: orders.map(o => ({
    orderId: String(o._id), type: o.type, title: o.title, amount: o.amount, qty: o.qty,
    status: o.status, fulfillment: o.fulfillment, provider: o.provider,
    username: o.user?.username || null,
    createdAt: o.createdAt ? new Date(o.createdAt).getTime() : null,
    shipping: o.type === 'merch' ? o.shipping : undefined,
  })) });
});

router.post('/admin/order/fulfill', auth, requireAdmin, async (req, res) => {
  const { orderId, fulfillment } = req.body || {};
  if (!['new', 'processing', 'shipped', 'done'].includes(fulfillment)) {
    return res.status(400).json({ ok: false, error: 'Некорректный статус' });
  }
  const order = await StoreOrder.findByIdAndUpdate(orderId, { fulfillment }, { new: true });
  if (!order) return res.status(404).json({ ok: false, error: 'Заказ не найден' });
  res.json({ ok: true });
});

module.exports = router;
