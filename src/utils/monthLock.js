export const MONTH_LOCK_TABLE = "month_locks";

export function getYearMonthFromDate(value) {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(String(value))) return String(value).slice(0, 7);
  return "";
}

export function getPreviousMonthYm(baseDate = new Date()) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatYearMonthAT(ym) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ""))) return String(ym || "");
  const [year, month] = String(ym).split("-");
  return `${month}.${year}`;
}

export async function getMonthLock(supabase, ymOrDate) {
  const yearMonth = getYearMonthFromDate(ymOrDate);
  if (!yearMonth) return { year_month: "", locked: false };

  const { data, error } = await supabase
    .from(MONTH_LOCK_TABLE)
    .select("year_month, locked, locked_at, locked_by, unlocked_at, unlocked_by, note")
    .eq("year_month", yearMonth)
    .maybeSingle();

  if (error) throw error;
  return data || { year_month: yearMonth, locked: false };
}

export async function ensureMonthUnlocked(supabase, dateOrYm) {
  const lock = await getMonthLock(supabase, dateOrYm);
  if (lock?.locked) {
    throw new Error(`Monat ${formatYearMonthAT(lock.year_month)} ist abgeschlossen/gesperrt. Änderungen sind nur nach Entsperren durch Admin möglich.`);
  }
  return lock;
}

export async function setMonthLocked(supabase, ymOrDate, locked, actorId = null, note = null) {
  const yearMonth = getYearMonthFromDate(ymOrDate);
  if (!yearMonth) throw new Error("Ungültiger Monat für Monatssperre.");

  const now = new Date().toISOString();
  const payload = locked
    ? {
        year_month: yearMonth,
        locked: true,
        locked_by: actorId || null,
        locked_at: now,
        unlocked_by: null,
        unlocked_at: null,
        note: note || null,
      }
    : {
        year_month: yearMonth,
        locked: false,
        unlocked_by: actorId || null,
        unlocked_at: now,
        note: note || null,
      };

  const { data, error } = await supabase
    .from(MONTH_LOCK_TABLE)
    .upsert(payload, { onConflict: "year_month" })
    .select("year_month, locked, locked_at, locked_by, unlocked_at, unlocked_by, note")
    .maybeSingle();

  if (error) throw error;
  return data;
}
