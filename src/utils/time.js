
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

// ---------------- BUAK Kurz-/Langwochen (vorbereitet) ----------------
// Quelle: BUAK Kalender 2026 (KW 1–53 mit K/L Kennzeichnung)
export const BUAK_WEEK_TYPES = {
  2026: {
    1: 'K',
    2: 'K',
    3: 'L',
    4: 'K',
    5: 'L',
    6: 'L',
    7: 'K',
    8: 'K',
    9: 'L',
    10: 'L',
    11: 'L',
    12: 'K',
    13: 'L',
    14: 'L',
    15: 'L',
    16: 'L',
    17: 'K',
    18: 'L',
    19: 'L',
    20: 'K',
    21: 'K',
    22: 'L',
    23: 'K',
    24: 'L',
    25: 'K',
    26: 'K',
    27: 'K',
    28: 'L',
    29: 'K',
    30: 'L',
    31: 'K',
    32: 'L',
    33: 'K',
    34: 'L',
    35: 'K',
    36: 'L',
    37: 'K',
    38: 'L',
    39: 'K',
    40: 'L',
    41: 'K',
    42: 'L',
    43: 'K',
    44: 'L',
    45: 'K',
    46: 'L',
    47: 'K',
    48: 'L',
    49: 'K',
    50: 'K',
    51: 'K',
    52: 'L',
    53: 'L'
  }
};

// ISO-Kalenderwoche (Mo–So) für YYYY-MM-DD
export function isoWeekNumber(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;

  // ISO week date weeks start on Monday
  const dayNum = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - dayNum + 3); // Thu of current week
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);

  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return week;
}

export function getBuakWeekType(dateStr) {
  if (!dateStr) return null;
  const year = Number(String(dateStr).slice(0, 4));
  const wk = isoWeekNumber(dateStr);
  const map = BUAK_WEEK_TYPES[year];
  if (!map || !wk) return null;
  const t = map[wk];
  if (!t) return null;
  return t === 'K' ? 'kurz' : t === 'L' ? 'lang' : null;
}

export function getBuakWeekSollHours(dateStr) {
  const t = getBuakWeekType(dateStr);
  if (t === 'kurz') return 36;
  if (t === 'lang') return 42;
  return null;
}
