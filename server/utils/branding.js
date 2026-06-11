
const BRANDS = {
  zvon: {
    id: 'zvon',
    name: 'Zvon',
    domain: 'zvonserver.ru',
    supportEmail: 'support@zvonserver.ru'
  },
  maxcord: {
    id: 'maxcord',
    name: 'MAXCORD',
    domain: 'maxcord.fun',
    supportEmail: 'support@zvonserver.ru'
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
