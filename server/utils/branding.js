const DEFAULT_BRANDS = {
  zvon: {
    id: 'zvon',
    name: 'Zvon',
    domain: 'zvonserver.ru',
    domainBehavior: 'open',
    supportEmail: 'support@zvonserver.ru',
    logo: 'zvonlogonew.png',
    favicon: 'icon.png',
    enabled: true,
    isBuiltin: true,
    banner: {
      enabled: false,
      text: '',
      closable: true,
      bg: '',
      color: ''
    },
    appIcons: [
      { id: 'default', label: 'Стандарт', img: 'icon.png', isPrimary: true },
      { id: 'icon1', label: 'Неон', img: 'icon1.PNG' },
      { id: 'icon2', label: 'Лазурь', img: 'icon2.png' },
      { id: 'icon3', label: 'Аметист', img: 'icon3.png' },
      { id: 'icon4', label: 'Космос', img: 'icon4.png' },
      { id: 'legacy', label: 'Легаси', img: 'zvon_legacy.png' }
    ]
  },
  maxcord: {
    id: 'maxcord',
    name: 'MAXCORD',
    domain: 'maxcord.fun',
    domainBehavior: 'open',
    supportEmail: 'support@zvonserver.ru',
    logo: 'maxcord/logo.png',
    favicon: 'maxcord/logo.png',
    enabled: true,
    isBuiltin: false,
    banner: {
      enabled: false,
      text: '',
      closable: true,
      bg: '',
      color: ''
    },
    appIcons: [
      { id: 'max_default', label: 'Градиент', img: 'maxcord/logo.png', isPrimary: true },
      { id: 'max_white', label: 'Белый', img: 'maxcord/logo-trans.png' }
    ]
  }
};

// In-memory cache for synchronous, non-blocking brand lookups
const BRANDS = {
  ...JSON.parse(JSON.stringify(DEFAULT_BRANDS))
};

/**
 * Initializes brands from database, seeding defaults if needed
 */
const initBrands = async () => {
  try {
    const Brand = require('../models/Brand');
    
    // Seed default zvon brand if missing
    let zvon = await Brand.findOne({ id: 'zvon' });
    if (!zvon) {
      zvon = await Brand.create(DEFAULT_BRANDS.zvon);
      console.log('[Branding] Seeded default Zvon brand');
    }

    // Seed default maxcord brand if missing
    let maxcord = await Brand.findOne({ id: 'maxcord' });
    if (!maxcord) {
      maxcord = await Brand.create(DEFAULT_BRANDS.maxcord);
      console.log('[Branding] Seeded default MAXCORD brand');
    }

    await reloadBrands();
  } catch (err) {
    console.error('[Branding] Initialization error (using defaults):', err.message);
  }
};

/**
 * Reloads all brands from database into memory cache
 */
const reloadBrands = async () => {
  try {
    const Brand = require('../models/Brand');
    const dbBrands = await Brand.find().lean();
    
    const freshBrands = {};
    for (const b of dbBrands) {
      freshBrands[b.id] = {
        id: b.id,
        name: b.name,
        domain: b.domain || '',
        domainBehavior: b.domainBehavior || 'open',
        supportEmail: b.supportEmail || '',
        logo: b.logo || 'zvonlogonew.png',
        favicon: b.favicon || 'icon.png',
        enabled: b.id === 'zvon' ? true : !!b.enabled,
        isBuiltin: b.id === 'zvon' ? true : !!b.isBuiltin,
        banner: {
          enabled: !!b.banner?.enabled,
          text: b.banner?.text || '',
          closable: b.banner?.closable !== false,
          bg: b.banner?.bg || '',
          color: b.banner?.color || ''
        },
        appIcons: Array.isArray(b.appIcons) && b.appIcons.length > 0 ? b.appIcons : (DEFAULT_BRANDS[b.id]?.appIcons || [])
      };
    }

    // Guarantee Zvon always exists and is enabled
    if (!freshBrands.zvon) {
      freshBrands.zvon = JSON.parse(JSON.stringify(DEFAULT_BRANDS.zvon));
    }
    freshBrands.zvon.enabled = true;

    // Mutate existing object so external references stay valid
    for (const key of Object.keys(BRANDS)) {
      if (!freshBrands[key]) {
        delete BRANDS[key];
      }
    }
    Object.assign(BRANDS, freshBrands);
    return BRANDS;
  } catch (err) {
    console.error('[Branding] Reload failed:', err.message);
    return BRANDS;
  }
};

/**
 * Resolves current brand based on incoming Express request.
 * Zvon is always available.
 * If another brand is disabled, falls back to Zvon.
 */
const getBrand = (req) => {
  if (!req) return BRANDS.zvon || DEFAULT_BRANDS.zvon;

  const clientType = (req.header?.('x-zvon-client') || req.headers?.['x-zvon-client'] || '').toLowerCase();
  const ua = req.header?.('user-agent') || req.headers?.['user-agent'] || '';

  // Заход с приложения/exe всегда считается как Zvon
  if (clientType === 'desktop' || /Electron|Zvon/i.test(ua)) {
    return BRANDS.zvon || DEFAULT_BRANDS.zvon;
  }

  const host = (req.get ? req.get('host') : req.headers?.host) || '';
  const origin = (req.get ? req.get('origin') : req.headers?.origin) || '';
  const referer = (req.get ? req.get('referer') : req.headers?.referer) || '';
  const xForwardedHost = (req.get ? req.get('x-forwarded-host') : req.headers?.['x-forwarded-host']) || '';

  const fullHeaderStr = `${host} ${origin} ${referer} ${xForwardedHost}`.toLowerCase();

  // localhost и 127.0.0.1 всегда относятся к Zvon
  if (fullHeaderStr.includes('localhost') || fullHeaderStr.includes('127.0.0.1')) {
    return BRANDS.zvon || DEFAULT_BRANDS.zvon;
  }

  let resolved = BRANDS.zvon || DEFAULT_BRANDS.zvon;

  // Проверяем явный заголовок x-brand или query param brand
  const brandHeader = (req.header?.('x-brand') || req.headers?.['x-brand'] || req.query?.brand || '').toLowerCase();
  if (brandHeader && BRANDS[brandHeader] && BRANDS[brandHeader].enabled !== false && BRANDS[brandHeader].domainBehavior !== 'disabled') {
    resolved = BRANDS[brandHeader];
  } else {
    // Проверяем все включенные бренды по домену
    for (const [key, brand] of Object.entries(BRANDS)) {
      if (key !== 'zvon' && brand.enabled !== false && brand.domainBehavior !== 'disabled' && brand.domain && fullHeaderStr.includes(brand.domain.toLowerCase())) {
        resolved = brand;
        break;
      }
    }
  }

  // Если у бренда не заполнены logo, favicon или supportEmail — берем из Zvon
  const zvon = BRANDS.zvon || DEFAULT_BRANDS.zvon;
  return {
    ...resolved,
    logo: resolved.logo || zvon.logo,
    favicon: resolved.favicon || zvon.favicon,
    supportEmail: resolved.supportEmail || zvon.supportEmail
  };
};

module.exports = {
  BRANDS,
  DEFAULT_BRANDS,
  initBrands,
  reloadBrands,
  getBrand
};
