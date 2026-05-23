export const MIN_START = 5 * 60;
export const MAX_END = 19 * 60 + 30;
export const DEFAULT_START = 6 * 60 + 45;
export const DEFAULT_END = 16 * 60 + 30;

export function clamp15(min) {
  return Math.max(0, Math.round(min / 15) * 15);
}

export function toLabel(min) {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor(min % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}


// ---------------- Österreichische Feiertage ----------------
// Feiertage werden erkannt und können in Auswertungen als bezahlte Feiertagsstunden ausgewiesen werden.
// Wichtig: getBuakSollHoursForDay(dateStr) bleibt die zentrale Quelle für die Stunden am Arbeitstag.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function getAustrianHolidays(year) {
  const y = Number(year);
  if (!y) return {};
  const easter = easterSunday(y);

  return {
    [`${y}-01-01`]: "Neujahr",
    [`${y}-01-06`]: "Heilige Drei Könige",
    [formatISODate(addDays(easter, 1))]: "Ostermontag",
    [`${y}-05-01`]: "Staatsfeiertag",
    [formatISODate(addDays(easter, 39))]: "Christi Himmelfahrt",
    [formatISODate(addDays(easter, 50))]: "Pfingstmontag",
    [formatISODate(addDays(easter, 60))]: "Fronleichnam",
    [`${y}-08-15`]: "Mariä Himmelfahrt",
    [`${y}-10-26`]: "Nationalfeiertag",
    [`${y}-11-01`]: "Allerheiligen",
    [`${y}-12-08`]: "Mariä Empfängnis",
    [`${y}-12-25`]: "Christtag",
    [`${y}-12-26`]: "Stefanitag",
  };
}

export function getHolidayName(dateStr) {
  const iso = normalizeDateStr(dateStr);
  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  return getAustrianHolidays(year)[iso] || null;
}

export function isHoliday(dateStr) {
  return !!getHolidayName(dateStr);
}

// ---------------- BUAK Kalender 2026 (Kurz/Lang) ----------------
// Wochen-Soll: Kurze Woche = 36h, Lange Woche = 42h
// Monats-Soll: wird aus den ARBEITSTAGEN im Monat berechnet
// - Kurzwoche: Mo–Do je 9h, Fr 0h
// - Langwoche: Mo–Do je 9h, Fr 6h
const BUAK_WEEK_TYPES_2026 = {
  1: "K",
  2: "K",
  3: "L",
  4: "K",
  5: "L",
  6: "K",
  7: "L",
  8: "K",
  9: "L",
  10: "K",
  11: "L",
  12: "K",
  13: "L",
  14: "K",
  15: "L",
  16: "L",
  17: "K",
  18: "L",
  19: "L",
  20: "K",
  21: "K",
  22: "L",
  23: "K",
  24: "L",
  25: "K",
  26: "L",
  27: "K",
  28: "L",
  29: "K",
  30: "L",
  31: "K",
  32: "L",
  33: "K",
  34: "L",
  35: "K",
  36: "L",
  37: "K",
  38: "L",
  39: "K",
  40: "L",
  41: "K",
  42: "L",
  43: "K",
  44: "L",
  45: "K",
  46: "L",
  47: "K",
  48: "L",
  49: "K",
  50: "K",
  51: "K",
  52: "L",
  53: "L",
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

// ISO Woche berechnen
export function getISOWeek(dateStr) {
  const iso = normalizeDateStr(dateStr);
  if (!iso) return null;

  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return null;

  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);

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

// Sollstunden pro Tag
export function getBuakSollHoursForDay(dateStr) {
  const iso = normalizeDateStr(dateStr);
  if (!iso) return 0;

  const t = getBuakWeekType(iso);
  if (!t) return 0;

  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return 0;

  const dow = d.getDay();

  if (dow === 0 || dow === 6) return 0;

  const isFriday = dow === 5;

  if (t === "lang") return isFriday ? 6 : 9;

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

  let soll = 0;
  const d = new Date(first);

  while (d.getMonth() === first.getMonth()) {
    const ds = `${d.getFullYear()}-${pad2(
      d.getMonth() + 1
    )}-${pad2(d.getDate())}`;

    soll += getBuakSollHoursForDay(ds);

    d.setDate(d.getDate() + 1);
  }

  return Math.round(soll * 100) / 100;
}

export function calcBuakSollHoursForYear(year) {
  const y = Number(year);

  if (!y) return 0;
  if (y !== 2026) return 0;

  let soll = 0;

  for (let wk = 1; wk <= 53; wk++) {
    const t = BUAK_WEEK_TYPES_2026[wk];

    if (t === "K") soll += 36;
    else if (t === "L") soll += 42;
  }

  return soll;
}
// ---------------- Frei einstellbare Arbeitszeitmodelle ----------------
// Speichern in employees.work_time_model (buak | verwaltung | individuell)
// und employees.work_time_settings (jsonb) mit days 1=Mo ... 7=So.
export const DEFAULT_OFFICE_WORK_TIME_SETTINGS = {
  model: "verwaltung",
  days: {
    1: { active: true, start: "07:30", end: "16:00", breakMinutes: 30 },
    2: { active: true, start: "07:30", end: "16:00", breakMinutes: 30 },
    3: { active: true, start: "07:30", end: "16:00", breakMinutes: 30 },
    4: { active: true, start: "07:30", end: "16:00", breakMinutes: 30 },
    5: { active: true, start: "07:30", end: "12:00", breakMinutes: 30 },
    6: { active: false, start: "", end: "", breakMinutes: 0 },
    7: { active: false, start: "", end: "", breakMinutes: 0 },
  },
};

export function hmToMinutes(hm) {
  if (!hm) return 0;
  const [h, m] = String(hm).split(":").map((x) => parseInt(x || "0", 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToHM(minutes) {
  const n = Math.max(0, Number(minutes) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function getIsoWeekday(dateStr) {
  const iso = normalizeDateStr(dateStr);
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return 0;
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function getEmployeeWorkTimeModel(employee) {
  const role = String(employee?.role || "").trim().toLowerCase();
  const explicit = String(employee?.work_time_model || employee?.employment_type || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (["buchhaltung", "verwaltung", "verwaltung_buchhaltung", "office"].includes(role)) return "verwaltung";
  return "buak";
}

export function normalizeWorkTimeSettings(rawSettings, model = "verwaltung") {
  let parsed = rawSettings || null;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }

  const base = JSON.parse(JSON.stringify(DEFAULT_OFFICE_WORK_TIME_SETTINGS));
  if (model && model !== "verwaltung") base.model = model;

  const srcDays = parsed?.days && typeof parsed.days === "object" ? parsed.days : {};
  for (let day = 1; day <= 7; day += 1) {
    const src = srcDays[String(day)] || srcDays[day] || {};
    base.days[day] = {
      ...base.days[day],
      ...src,
      active: typeof src.active === "boolean" ? src.active : base.days[day].active,
      start: src.start ?? base.days[day].start,
      end: src.end ?? base.days[day].end,
      breakMinutes: Number(src.breakMinutes ?? src.break_minutes ?? base.days[day].breakMinutes) || 0,
    };
  }
  return base;
}

export function getEmployeeWorkDay(employee, dateStr) {
  const model = getEmployeeWorkTimeModel(employee);
  const dow = getIsoWeekday(dateStr);

  if (model === "buak") {
    const sollHours = Number(getBuakSollHoursForDay(dateStr)) || 0;
    const breakMinutes = sollHours > 0 ? 30 : 0;
    const startMin = DEFAULT_START;
    const endMin = sollHours > 0 ? startMin + Math.round(sollHours * 60) + breakMinutes : startMin;
    return {
      model,
      active: sollHours > 0,
      start: minutesToHM(startMin),
      end: minutesToHM(endMin),
      breakMinutes,
      requiredMinutes: Math.round(sollHours * 60),
      requiredHours: sollHours,
    };
  }

  const settings = normalizeWorkTimeSettings(employee?.work_time_settings, model);
  const day = settings.days[dow] || { active: false, start: "", end: "", breakMinutes: 0 };
  const startMin = hmToMinutes(day.start);
  const endMin = hmToMinutes(day.end);
  const breakMinutes = Number(day.breakMinutes ?? day.break_minutes ?? 0) || 0;
  const requiredMinutes = day.active ? Math.max(endMin - startMin - breakMinutes, 0) : 0;

  return {
    model,
    active: !!day.active && requiredMinutes > 0,
    start: day.start || "",
    end: day.end || "",
    breakMinutes,
    requiredMinutes,
    requiredHours: Math.round((requiredMinutes / 60) * 100) / 100,
  };
}

export function getEmployeeSollHoursForDay(employee, dateStr) {
  return getEmployeeWorkDay(employee, dateStr).requiredHours || 0;
}

export function calcEmployeeSollHoursForRange(employee, from, to, includeHolidays = true) {
  if (!from || !to) return 0;
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  let minutes = 0;
  const d = new Date(start);
  while (d <= end) {
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    if (includeHolidays || !getHolidayName(iso)) {
      minutes += getEmployeeWorkDay(employee, iso).requiredMinutes || 0;
    }
    d.setDate(d.getDate() + 1);
  }
  return Math.round((minutes / 60) * 100) / 100;
}
