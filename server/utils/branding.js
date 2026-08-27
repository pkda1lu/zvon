
const BRANDS = {
  zvon: {
    id: 'zvon',
    name: 'Zvon',
    domain: 'zvonserver.ru',
    supportEmail: 'support@zvonserver.ru',
    logo: 'zvonlogonew.png',
    favicon: 'icon.png',
    color: '#5865f2'
  },
  maxcord: {
    id: 'maxcord',
    name: 'MAXCORD',
    domain: 'maxcord.fun',
    supportEmail: 'support@zvonserver.ru',
    logo: 'maxcord/logo.png',
    favicon: 'maxcord/logo.png',
    color: '#ff5722'
  }
};

const getBrand = (req) => {
  if (!req) return BRANDS.zvon;

  const clientType = (req.header?.('x-zvon-client') || req.headers?.['x-zvon-client'] || '').toLowerCase();
  const ua = req.header?.('user-agent') || req.headers?.['user-agent'] || '';

  // Заход с приложения/exe всегда считается как Zvon
  if (clientType === 'desktop' || /Electron|Zvon/i.test(ua)) {
    return BRANDS.zvon;
  }

  const host = (req.get ? req.get('host') : req.headers?.host) || '';
  const origin = (req.get ? req.get('origin') : req.headers?.origin) || '';
  const referer = (req.get ? req.get('referer') : req.headers?.referer) || '';
  const xForwardedHost = (req.get ? req.get('x-forwarded-host') : req.headers?.['x-forwarded-host']) || '';

  const fullHeaderStr = `${host} ${origin} ${referer} ${xForwardedHost}`.toLowerCase();

  // localhost и 127.0.0.1 всегда относятся к Zvon
  if (fullHeaderStr.includes('localhost') || fullHeaderStr.includes('127.0.0.1')) {
    return BRANDS.zvon;
  }

  const brandHeader = (req.header?.('x-brand') || req.headers?.['x-brand'] || '').toLowerCase();
  if (brandHeader && BRANDS[brandHeader]) {
    return BRANDS[brandHeader];
  }
  
  // Проверяем все существующие бренды по домену
  for (const [key, brand] of Object.entries(BRANDS)) {
    if (key !== 'zvon' && brand.domain && fullHeaderStr.includes(brand.domain.toLowerCase())) {
      return brand;
    }
  }

  return BRANDS.zvon;
};

module.exports = {
  BRANDS,
  getBrand
};
