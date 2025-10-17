
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
