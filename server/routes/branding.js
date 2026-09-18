const express = require('express');
const router = express.Router();
const adminRouter = express.Router();
const auth = require('../middleware/auth');
const Brand = require('../models/Brand');
const { getBrand, reloadBrands, BRANDS } = require('../utils/branding');
const { logGlobalAction } = require('../utils/globalAuditLogger');

// Middleware to check if user is moderator or admin
const isModerator = (req, res, next) => {
  if (req.user && (req.user.role === 'moderator' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Доступ разрешен только разработчикам и модераторам' });
  }
};

// --------------------------------------------------------------------------
// Public endpoints (mounted at /api/branding)
// --------------------------------------------------------------------------

// GET /api/branding/current - Returns resolved brand for the caller's request
router.get('/current', (req, res) => {
  try {
    const brand = getBrand(req);
    res.json(brand);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка получения бренда' });
  }
});

// GET /api/branding/public - Returns list of enabled brands
router.get('/public', (req, res) => {
  try {
    const enabledBrands = Object.values(BRANDS).filter(b => b.enabled !== false);
    res.json(enabledBrands);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка получения списка брендов' });
  }
});

// --------------------------------------------------------------------------
// Admin endpoints (mounted at /api/admin/branding)
// --------------------------------------------------------------------------

// GET /api/admin/branding - List all brands (both enabled and disabled)
adminRouter.get('/', [auth, isModerator], async (req, res) => {
  try {
    const brands = await Brand.find().sort({ isBuiltin: -1, createdAt: 1 }).lean();
    res.json(brands);
  } catch (err) {
    console.error('Error fetching admin brands:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// POST /api/admin/branding - Create a new brand
adminRouter.post('/', [auth, isModerator], async (req, res) => {
  try {
    const { id, name, domain, domainBehavior, supportEmail, logo, favicon, enabled, banner, appIcons } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Идентификатор бренда обязателен' });
    }

    const cleanId = id.trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(cleanId)) {
      return res.status(400).json({ message: 'Идентификатор может содержать только латинские буквы, цифры, дефис и подчеркивание' });
    }

    if (cleanId === 'zvon') {
      return res.status(400).json({ message: 'Бренд с идентификатором zvon уже существует' });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Название бренда обязательно' });
    }

    const existing = await Brand.findOne({ id: cleanId });
    if (existing) {
      return res.status(400).json({ message: `Бренд с идентификатором "${cleanId}" уже существует` });
    }

    let parsedIcons = Array.isArray(appIcons) && appIcons.length > 0 
      ? appIcons.filter(ic => ic && ic.id && ic.label && ic.img)
      : [{ id: `${cleanId}_default`, label: 'Стандарт', img: (favicon || 'icon.png').trim(), isPrimary: true }];

    if (parsedIcons.length > 0 && !parsedIcons.some(i => i.isPrimary)) {
      parsedIcons[0].isPrimary = true;
    }

    const primaryIcon = parsedIcons.find(i => i.isPrimary) || parsedIcons[0];

    const zvon = BRANDS.zvon || { logo: 'zvonlogonew.png', favicon: 'icon.png', supportEmail: 'support@zvonserver.ru' };
    const finalBehavior = ['open', 'redirect', 'disabled'].includes(domainBehavior) ? domainBehavior : 'open';

    const brand = await Brand.create({
      id: cleanId,
      name: name.trim(),
      domain: (domain || '').trim().toLowerCase(),
      domainBehavior: finalBehavior,
      supportEmail: (supportEmail || '').trim() || zvon.supportEmail,
      logo: (logo || '').trim() || zvon.logo,
      favicon: (primaryIcon?.img || favicon || '').trim() || zvon.favicon,
      enabled: finalBehavior !== 'disabled',
      isBuiltin: false,
      banner: {
        enabled: !!banner?.enabled,
        text: (banner?.text || '').trim(),
        closable: banner?.closable !== false,
        bg: '',
        color: ''
      },
      appIcons: parsedIcons
    });

    await reloadBrands();

    await logGlobalAction({
      executor: req.user._id,
      action: 'BRAND_CREATE',
      target: brand._id,
      targetModel: 'Brand',
      details: { brandId: cleanId, name: brand.name }
    });

    res.status(201).json(brand);
  } catch (err) {
    console.error('Error creating brand:', err);
    res.status(500).json({ message: 'Ошибка при создании бренда: ' + err.message });
  }
});

// PUT /api/admin/branding/:id - Update brand configuration
adminRouter.put('/:id', [auth, isModerator], async (req, res) => {
  try {
    const brandId = (req.params.id || '').toLowerCase().trim();
    const { name, domain, domainBehavior, supportEmail, logo, favicon, enabled, banner, appIcons } = req.body;

    const brand = await Brand.findOne({ id: brandId });
    if (!brand) {
      return res.status(404).json({ message: 'Бренд не найден' });
    }

    const zvon = BRANDS.zvon || { logo: 'zvonlogonew.png', favicon: 'icon.png', supportEmail: 'support@zvonserver.ru' };

    // Бренд Zvon всегда доступен
    if (brandId === 'zvon' && (enabled === false || domainBehavior === 'disabled')) {
      return res.status(400).json({ message: 'Основной бренд Zvon всегда доступен и не может быть отключен' });
    }

    if (name !== undefined) brand.name = String(name).trim();
    if (domain !== undefined) brand.domain = String(domain).trim().toLowerCase();
    if (domainBehavior !== undefined && brandId !== 'zvon' && ['open', 'redirect', 'disabled'].includes(domainBehavior)) {
      brand.domainBehavior = domainBehavior;
      brand.enabled = domainBehavior !== 'disabled';
    } else if (enabled !== undefined && brandId !== 'zvon') {
      brand.enabled = !!enabled;
      if (!brand.enabled && brand.domainBehavior === 'open') {
        brand.domainBehavior = 'disabled';
      }
    }

    if (supportEmail !== undefined) brand.supportEmail = String(supportEmail).trim() || zvon.supportEmail;
    if (logo !== undefined) brand.logo = String(logo).trim() || zvon.logo;
    if (favicon !== undefined) brand.favicon = String(favicon).trim() || zvon.favicon;

    if (banner !== undefined) {
      brand.banner = {
        enabled: !!banner.enabled,
        text: String(banner.text || '').trim(),
        closable: banner.closable !== false,
        bg: String(banner.bg || '').trim(),
        color: String(banner.color || '').trim()
      };
    }

    if (Array.isArray(appIcons) && appIcons.length > 0) {
      let filtered = appIcons.filter(ic => ic && ic.id && ic.label && ic.img);
      if (filtered.length > 0) {
        if (!filtered.some(i => i.isPrimary)) {
          filtered[0].isPrimary = true;
        }
        brand.appIcons = filtered;
        const primary = filtered.find(i => i.isPrimary) || filtered[0];
        if (primary && primary.img) {
          brand.favicon = primary.img;
        }
      }
    }

    await brand.save();
    await reloadBrands();

    await logGlobalAction({
      executor: req.user._id,
      action: 'BRAND_UPDATE',
      target: brand._id,
      targetModel: 'Brand',
      details: { brandId, name: brand.name, enabled: brand.enabled }
    });

    res.json(brand);
  } catch (err) {
    console.error('Error updating brand:', err);
    res.status(500).json({ message: 'Ошибка при сохранении настроек бренда: ' + err.message });
  }
});

// DELETE /api/admin/branding/:id - Delete a custom brand
adminRouter.delete('/:id', [auth, isModerator], async (req, res) => {
  try {
    const brandId = (req.params.id || '').toLowerCase().trim();

    if (brandId === 'zvon') {
      return res.status(400).json({ message: 'Основной бренд Zvon нельзя удалить' });
    }

    const brand = await Brand.findOne({ id: brandId });
    if (!brand) {
      return res.status(404).json({ message: 'Бренд не найден' });
    }

    if (brand.isBuiltin) {
      return res.status(400).json({ message: 'Встроенный системный бренд нельзя удалить, но его можно отключить' });
    }

    await Brand.deleteOne({ _id: brand._id });
    await reloadBrands();

    await logGlobalAction({
      executor: req.user._id,
      action: 'BRAND_DELETE',
      target: null,
      targetModel: 'Brand',
      details: { brandId, name: brand.name }
    });

    res.json({ message: 'Бренд успешно удален', id: brandId });
  } catch (err) {
    console.error('Error deleting brand:', err);
    res.status(500).json({ message: 'Ошибка при удалении бренда: ' + err.message });
  }
});

// GET /api/admin/branding/nginx - Generate or get current Nginx config
adminRouter.get('/nginx/config', [auth, isModerator], async (req, res) => {
  try {
    const fs = require('fs');
    const brands = await Brand.find({ domainBehavior: { $ne: 'disabled' } }).lean();
    const domains = Array.from(new Set(
      brands
        .map(b => (b.domain || '').trim().toLowerCase())
        .filter(d => d && !d.includes('localhost') && !d.includes('127.0.0.1'))
    ));
    if (!domains.includes('zvonserver.ru')) {
      domains.unshift('zvonserver.ru');
    }

    const domainList = domains.length > 0 ? domains.join(' ') : 'zvonserver.ru';
    const generatedConfig = `# Автоматически сгенерированная конфигурация Nginx для Zvon и брендов
# Сгенерировано: ${new Date().toLocaleString('ru-RU')}

server {
    listen 80;
    server_name ${domainList};

    client_max_body_size 50M;

    # Gzip сжатие
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    location /api/uploads {
        alias /var/www/zvon/server/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
`;

    const isLinux = process.platform === 'linux';
    const nginxPath = '/etc/nginx/sites-available/zvon';
    const hasNginxFile = isLinux && fs.existsSync(nginxPath);
    let serverConfig = '';
    if (hasNginxFile) {
      try {
        serverConfig = fs.readFileSync(nginxPath, 'utf8');
      } catch { /* cannot read */ }
    }

    res.json({
      domains,
      generatedConfig,
      serverConfig,
      hasServerNginx: hasNginxFile,
      nginxPath,
      platform: process.platform
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка получения Nginx конфига: ' + err.message });
  }
});

// POST /api/admin/branding/nginx - Save and apply Nginx config
adminRouter.post('/nginx/config', [auth, isModerator], async (req, res) => {
  try {
    const fs = require('fs');
    const { exec } = require('child_process');
    const { configText } = req.body;

    if (!configText || typeof configText !== 'string') {
      return res.status(400).json({ message: 'Текст конфигурации пуст' });
    }

    const isLinux = process.platform === 'linux';
    const nginxAvailableDir = '/etc/nginx/sites-available';
    const nginxPath = '/etc/nginx/sites-available/zvon';

    if (!isLinux || !fs.existsSync(nginxAvailableDir)) {
      return res.status(200).json({
        success: false,
        isLocalEnv: true,
        message: 'Проект запущен в локальной среде (без Nginx на /etc/nginx). Вы можете скопировать или скачать сгенерированный конфиг для настройки боевого сервера.'
      });
    }

    fs.writeFileSync(nginxPath, configText, 'utf8');

    exec('nginx -t && systemctl reload nginx', (error, stdout, stderr) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Ошибка проверки Nginx (nginx -t): ' + (stderr || error.message)
        });
      }
      res.json({
        success: true,
        message: 'Конфигурация Nginx успешно обновлена и перезагружена',
        output: stdout
      });
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сохранения Nginx: ' + err.message });
  }
});

module.exports = {
  router,
  adminRouter
};
