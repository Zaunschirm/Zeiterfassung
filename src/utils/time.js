
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

// Anzahl gearbeiteter Tage (ein Tag zählt, wenn echte Arbeitszeit > 0)
// Krank/Urlaub werden NICHT als Arbeitstag gezählt.
// Erkennung über Notiz-Prefix: "[Krank]" / "[Urlaub]"
export function countWorkedDays(rows) {
  if (!Array.isArray(rows)) return 0;

  const isAbsence = (r) => {
    const n = String(r?.note || "").trim();
    return n.startsWith("[Krank]") || n.startsWith("[Urlaub]");
  };

  const days = new Set(
    rows
      .filter((r) => !isAbsence(r))
      .filter((r) => Math.max((r?._mins ?? 0) - (r?._travel ?? 0), 0) > 0)
      .map((r) => r?.work_date)
      .filter(Boolean)
  );

  return days.size;
}
