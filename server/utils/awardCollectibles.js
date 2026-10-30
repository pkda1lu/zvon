const crypto = require('crypto');
const OPTIONS = {
  palette: ['graphite', 'cobalt', 'aurora', 'rose', 'amber', 'amethyst'],
  background: ['midnight', 'ocean', 'forest', 'sunset', 'nebula', 'pearl'],
  pattern: ['signal', 'stars', 'orbits', 'zvon'],
  finish: ['polished', 'satin', 'frosted']
};
function validAppearance(value) {
  return value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => Object.hasOwn(OPTIONS, key) && (value[key] === 'random' || OPTIONS[key].includes(value[key]))));
}
function createCollectible(award, seed = crypto.randomBytes(32)) {
  const bytes = Buffer.isBuffer(seed) ? seed : crypto.createHash('sha256').update(String(seed)).digest();
  return Object.fromEntries(Object.entries(OPTIONS).map(([key, values], i) => [key,
    values.includes(award.appearance?.[key]) ? award.appearance[key] : values[bytes[i] % values.length]
  ]));
}
// Full ObjectId encoded in base36: compact, stable and unique without a counter.
function editionNumber(id) { return BigInt(`0x${id}`).toString(36).toUpperCase(); }
module.exports = { OPTIONS, validAppearance, createCollectible, editionNumber };
