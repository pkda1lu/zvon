
const BRANDS = {
  zvon: {
    id: 'zvon',
    name: 'Zvon',
    domain: 'zvonserver.ru',
    supportEmail: 'support@zvonserver.ru',
    logo: 'zvonlogonew.png',
    favicon: 'icon.png'
  },
  maxcord: {
    id: 'maxcord',
    name: 'MAXCORD',
    domain: 'maxcord.fun',
    supportEmail: 'support@zvonserver.ru',
    logo: 'maxcord/logo.png',
    favicon: 'maxcord/logo.png'
  }
};

const getBrand = (req) => {
  if (!req) return BRANDS.zvon;
  const host = req.get('host');
  if (host && host.includes('maxcord.fun')) {
    return BRANDS.maxcord;
  }
  return BRANDS.zvon;
};

module.exports = {
  BRANDS,
  getBrand
};
