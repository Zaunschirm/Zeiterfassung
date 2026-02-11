
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

// ---------------- BUAK Kalender 2026 (Kurz/Lang) ----------------
// Kurze Woche = 39h, Lange Woche = 42h
const BUAK_WEEK_TYPES_2026 = {
  1:"L",2:"L",3:"L",4:"K",5:"L",6:"L",7:"L",8:"K",9:"L",10:"L",11:"L",
  12:"K",13:"L",14:"L",15:"L",16:"K",17:"L",18:"L",19:"L",20:"K",21:"L",
  22:"L",23:"L",24:"K",25:"L",26:"L",27:"L",28:"K",29:"L",30:"L",31:"L",
  32:"K",33:"L",34:"L",35:"L",36:"K",37:"L",38:"L",39:"L",40:"K",41:"L",
  42:"L",43:"L",44:"K",45:"L",46:"L",47:"L",48:"K",49:"L",50:"L",51:"L",
  52:"K",53:"L",
};

function normalizeDateStr(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

// ISO week number for a date string (YYYY-MM-DD or dd.mm.yyyy)
export function getISOWeek(dateStr) {
  const iso = normalizeDateStr(dateStr);
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;

  // ISO week: Monday = 0 ... Sunday = 6
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3); // Thursday

  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);

  return 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

export function getBuakWeekType(dateStr) {
  const iso = normalizeDateStr(dateStr);
  const year = Number(String(iso).slice(0, 4));
  if (year !== 2026) return null;
  const wk = getISOWeek(iso);
  if (!wk) return null;
  const t = BUAK_WEEK_TYPES_2026[wk];
  if (t === "K") return "kurz";
  if (t === "L") return "lang";
  return null;
}

export function getBuakSollHoursForWeek(dateStr) {
  const t = getBuakWeekType(dateStr);
  if (t === "kurz") return 39;
  if (t === "lang") return 42;
  return null;
}

export function calcBuakSollHoursForMonth(monthStr) {
  if (!monthStr) return 0;
  const [yStr, mStr] = String(monthStr).split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!year || !month) return 0;

  const first = new Date(`${yStr}-${mStr}-01T00:00:00`);
  if (isNaN(first.getTime())) return 0;

  const weeks = new Set();
  const d = new Date(first);
  while (d.getMonth() === first.getMonth()) {
    const ds = d.toISOString().slice(0, 10);
    const wk = getISOWeek(ds);
    if (wk) weeks.add(wk);
    d.setDate(d.getDate() + 1);
  }

  let soll = 0;
  weeks.forEach((wk) => {
    if (year !== 2026) return;
    const t = BUAK_WEEK_TYPES_2026[wk];
    if (t === "K") soll += 39;
    else if (t === "L") soll += 42;
  });
  return soll;
}

export function calcBuakSollHoursForYear(year) {
  const y = Number(year);
  if (!y) return 0;
  let soll = 0;
  if (y !== 2026) return 0;
  for (let wk = 1; wk <= 53; wk++) {
    const t = BUAK_WEEK_TYPES_2026[wk];
    if (t === "K") soll += 39;
    else if (t === "L") soll += 42;
  }
  return soll;
}
