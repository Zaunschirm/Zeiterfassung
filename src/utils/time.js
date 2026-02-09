
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

// Anzahl gearbeiteter Tage (ein Tag zählt, wenn Arbeitszeit > 0 Minuten)
// Erwartet Rows mit Feldern: _mins (Arbeitszeit+Fahrzeit), _travel (Fahrzeit), work_date (YYYY-MM-DD)
export function countWorkedDays(rows) {
  if (!Array.isArray(rows)) return 0;

  const days = new Set(
    rows
      // Krank/Urlaub sollen NICHT als Arbeitstag zählen
      .filter((r) => !["krank", "urlaub"].includes((r?.absence_type || "").toLowerCase()))
      // Arbeitstag nur wenn echte Arbeitsminuten > 0 (ohne Fahrzeit)
      .filter((r) => Math.max((r?._mins ?? 0) - (r?._travel ?? 0), 0) > 0)
      .map((r) => r?.work_date)
      .filter(Boolean)
  );

  return days.size;
}


// Krank: Mo–Do 9h, Freitag 3h
export function isFriday(workDate) {
  if (!workDate) return false;
  const d = new Date(`${workDate}T00:00:00`);
  return d.getDay() === 5;
}

export function krankMinutesForDate(workDate) {
  return isFriday(workDate) ? 180 : 540;
}
