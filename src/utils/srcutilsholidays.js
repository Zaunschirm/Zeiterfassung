// 🇦🇹 Österreichische Feiertage inkl. bewegliche

function easterSunday(year) {
  const f = Math.floor;
  const G = year % 19;
  const C = f(year / 100);
  const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
  const I = H - f(H / 28) * (1 - f(H / 28) * f(29 / (H + 1)) * f((21 - G) / 11));
  const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
  const L = I - J;
  const month = 3 + f((L + 40) / 44);
  const day = L + 28 - 31 * f(month / 4);

  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function format(date) {
  return date.toISOString().slice(0, 10);
}

export function getHolidays(year) {
  const easter = easterSunday(year);

  return {
    // FIX
    [`${year}-01-01`]: "Neujahr",
    [`${year}-01-06`]: "Heilige Drei Könige",
    [`${year}-05-01`]: "Staatsfeiertag",
    [`${year}-08-15`]: "Mariä Himmelfahrt",
    [`${year}-10-26`]: "Nationalfeiertag",
    [`${year}-11-01`]: "Allerheiligen",
    [`${year}-12-08`]: "Mariä Empfängnis",
    [`${year}-12-25`]: "Christtag",
    [`${year}-12-26`]: "Stefanitag",

    // BEWEGLICH
    [format(addDays(easter, 1))]: "Ostermontag",
    [format(addDays(easter, 39))]: "Christi Himmelfahrt",
    [format(addDays(easter, 50))]: "Pfingstmontag",
    [format(addDays(easter, 60))]: "Fronleichnam",
  };
}

export function isHoliday(dateStr) {
  const year = new Date(dateStr).getFullYear();
  const holidays = getHolidays(year);
  return !!holidays[dateStr];
}

export function getHolidayName(dateStr) {
  const year = new Date(dateStr).getFullYear();
  const holidays = getHolidays(year);
  return holidays[dateStr] || null;
}