export const MIN_START = 5*60
export const MAX_END   = 19*60+30
export const DEFAULT_START = 6*60+45
export const DEFAULT_END   = 16*60+30
export function clamp15(min) { return Math.max(0, Math.round(min/15)*15) }
export function toLabel(min) {
  const h = Math.floor(min/60).toString().padStart(2,'0')
  const m = Math.floor(min%60).toString().padStart(2,'0')
  return `${h}:${m}`
}
export function todayISO() { return new Date().toISOString().slice(0,10) }

// --------------------------------------------------
// BUAK Kalender (Kurz-/Langwoche) – vorbereitet (Jahre erweiterbar)
// Kurzwoche = 36 Sollstunden, Langwoche = 42 Sollstunden
// Datenquelle: BUAK Kalender-PDF (A4) – Jahr 2026
// --------------------------------------------------

export const BUAK_WEEK_TYPES = {
  2026: {
    1: 'kurz',
    2: 'kurz',
    3: 'lang',
    4: 'kurz',
    5: 'lang',
    6: 'kurz',
    7: 'lang',
    8: 'kurz',
    9: 'lang',
    10: 'kurz',
    11: 'lang',
    12: 'kurz',
    13: 'lang',
    14: 'kurz',
    15: 'lang',
    16: 'lang',
    17: 'kurz',
    18: 'lang',
    19: 'lang',
    20: 'kurz',
    21: 'kurz',
    22: 'lang',
    23: 'kurz',
    24: 'lang',
    25: 'kurz',
    26: 'lang',
    27: 'kurz',
    28: 'lang',
    29: 'kurz',
    30: 'lang',
    31: 'kurz',
    32: 'lang',
    33: 'kurz',
    34: 'lang',
    35: 'kurz',
    36: 'lang',
    37: 'kurz',
    38: 'lang',
    39: 'kurz',
    40: 'lang',
    41: 'kurz',
    42: 'lang',
    43: 'kurz',
    44: 'lang',
    45: 'kurz',
    46: 'lang',
    47: 'kurz',
    48: 'lang',
    49: 'kurz',
    50: 'kurz',
    51: 'kurz',
    52: 'lang',
    53: 'lang'
  },
};

export const BUAK_SOLL_HOURS = {
  kurz: 36,
  lang: 42,
};

// ISO-Woche (1–53) + ISO-Wochenjahr
export function getISOWeek(dateStr) {
  const d0 = new Date(`${dateStr}T00:00:00Z`);
  const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()));
  // Donnerstag bestimmt das ISO-Wochenjahr
  const dayNum = (d.getUTCDay() + 6) % 7; // Mo=0..So=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return { isoYear, week };
}

export function getBuakWeekTypeByISO(isoYear, week) {
  const y = BUAK_WEEK_TYPES[isoYear];
  if (!y) return 'lang';
  return y[week] || 'lang';
}

export function getBuakWeekType(dateStr) {
  const { isoYear, week } = getISOWeek(dateStr);
  return getBuakWeekTypeByISO(isoYear, week);
}

export function getBuakSollHoursForWeek(dateStr) {
  const t = getBuakWeekType(dateStr);
  return BUAK_SOLL_HOURS[t] ?? BUAK_SOLL_HOURS.lang;
}

// Monat (YYYY-MM) → Sollstunden (Summe der Wochen, die im Monat vorkommen)
export function calcBuakSollHoursForMonth(monthStr) {
  if (!monthStr || monthStr.length < 7) return 0;
  const y = parseInt(monthStr.slice(0, 4), 10);
  const m = parseInt(monthStr.slice(5, 7), 10) - 1;
  if (isNaN(y) || isNaN(m)) return 0;

  const weeks = new Set();
  // alle Tage im Monat durchgehen
  const d = new Date(Date.UTC(y, m, 1));
  while (d.getUTCMonth() === m) {
    const iso = d.toISOString().slice(0, 10);
    const { isoYear, week } = getISOWeek(iso);
    weeks.add(`${isoYear}-${week}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }

  let sum = 0;
  weeks.forEach((key) => {
    const [isoYearStr, wkStr] = key.split('-');
    const isoYear = parseInt(isoYearStr, 10);
    const week = parseInt(wkStr, 10);
    const t = getBuakWeekTypeByISO(isoYear, week);
    sum += BUAK_SOLL_HOURS[t] ?? BUAK_SOLL_HOURS.lang;
  });

  return sum;
}

// Jahr → Sollstunden (Summe aller Kalenderwochen laut BUAK-Mapping)
export function calcBuakSollHoursForYear(year) {
  const y = BUAK_WEEK_TYPES[year];
  if (!y) return 0;
  let sum = 0;
  Object.keys(y).forEach((wk) => {
    const t = y[wk];
    sum += BUAK_SOLL_HOURS[t] ?? BUAK_SOLL_HOURS.lang;
  });
  return sum;
}
