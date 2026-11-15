function createStatsCalendar(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) {
    throw new RangeError('Invalid time zone');
  }
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  function dayKey(date) {
    const parts = {};
    for (const { type, value } of formatter.formatToParts(date)) parts[type] = value;
    return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  }

  function parseDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new RangeError('Invalid date');
    }
    const date = new Date(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== day) {
      throw new RangeError('Invalid date');
    }
    return date;
  }

  function addDays(day, count) {
    const date = parseDay(day);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }

  function startOfDay(day) {
    const midnight = +parseDay(day);
    const dayMs = 24 * 60 * 60 * 1000;
    let low = midnight - dayMs;
    let high = midnight + dayMs;
    // Find the first instant in this local day, including days that skip midnight.
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (dayKey(new Date(mid)) < day) low = mid + 1;
      else high = mid;
    }
    return new Date(low);
  }

  return { timeZone: formatter.resolvedOptions().timeZone, dayKey, parseDay, addDays, startOfDay };
}

module.exports = { createStatsCalendar };
