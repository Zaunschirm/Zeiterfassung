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
// Wochen-Soll: Kurze Woche = 36h, Lange Woche = 42h
// Monats-Soll: wird aus den ARBEITSTAGEN im Monat berechnet (nicht "ganze Wochen"):
//  - Kurzwoche: Mo–Do je 9.0h, Fr 0h  => 4 Arbeitstage = 36h
//  - Langwoche: Mo–Do je 9.0h, Fr 6h  => 5 Arbeitstage = 42h
const BUAK_WEEK_TYPES_2026 = {
  1:"L",2:"L",3:"L",4:"K",5:"L",6:"K",7:"L",8:"K",9:"L",10:"L",11:"L",
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

function pad2(n){ return String(n).padStart(2,"0"); }

// ISO week number for a date string (YYYY-MM-DD or dd.mm.yyyy)
export function getISOWeek(dateStr) {
  const iso = normalizeDateStr(dateStr);
  if (!iso) return null;
  // mittags verwenden = keine UTC/Zeitzonen-Verschiebung
  const d = new Date(iso + "T12:00:00");
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
  if (t === "kurz") return 36;
  if (t === "lang") return 42;
  return null;
}

// Soll je ARBEITSTAG (für Monats-Soll):
// - Langwoche: Mo–Do 9h, Fr 6h
// - Kurzwoche: Mo–Do 9h, Fr 0h
export function getBuakSollHoursForDay(dateStr) {
  const iso = normalizeDateStr(dateStr);
  if (!iso) return 0;
  const t = getBuakWeekType(iso);
  if (!t) return 0;

  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return 0;

  const dow = d.getDay(); // 0=So ... 6=Sa
  if (dow === 0 || dow === 6) return 0; // Wochenende

  const isFriday = (dow === 5);
  if (t === "lang") return isFriday ? 6 : 9;
  // kurz
  return isFriday ? 0 : 9;
}

export function calcBuakSollHoursForMonth(monthStr) {
  if (!monthStr) return 0;
  const [yStr, mStr] = String(monthStr).split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!year || !month) return 0;

  const first = new Date(`${yStr}-${mStr}-01T12:00:00`);
  if (isNaN(first.getTime())) return 0;

  // ARBEITSTAGE im Monat aufsummieren (nicht ganze Wochen)
  let soll = 0;
  const d = new Date(first);
  while (d.getMonth() === first.getMonth()) {
    const ds = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    soll += getBuakSollHoursForDay(ds);
    d.setDate(d.getDate() + 1);
  }

  return Math.round(soll * 100) / 100;
}

export function calcBuakSollHoursForYear(year) {
  const y = Number(year);
  if (!y) return 0;
  let soll = 0;
  if (y !== 2026) return 0;

  // Jahres-Soll weiterhin als Wochen-Soll Summe (BUAK-Kalender)
  for (let wk = 1; wk <= 53; wk++) {
    const t = BUAK_WEEK_TYPES_2026[wk];
    if (t === "K") soll += 36;
    else if (t === "L") soll += 42;
  }
  return soll;
}
