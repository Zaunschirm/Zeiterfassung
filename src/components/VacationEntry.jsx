import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { getEmployeeWorkDay, getBuakWeekType, getHolidayName, hmToMinutes } from "../utils/time";

const todayISO = () => new Date().toISOString().slice(0, 10);

function parseDateLocal(iso) {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatISODate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dt, days) {
  const next = new Date(dt);
  next.setDate(next.getDate() + days);
  return next;
}

function dateRange(from, to) {
  const start = parseDateLocal(from);
  const end = parseDateLocal(to);
  if (!start || !end || end < start) return [];
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(formatISODate(d));
  return out;
}

function startOfWeek(dateStr) {
  const d = parseDateLocal(dateStr) || new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function getWeekNumber(dateStr) {
  const d = parseDateLocal(dateStr) || new Date();
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4, 12, 0, 0, 0);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

function isFriday(dateStr) {
  const d = parseDateLocal(dateStr);
  return d?.getDay() === 5;
}

function isShortFridayInShortWeek(dateStr) {
  return isFriday(dateStr) && getBuakWeekType(dateStr) === "kurz";
}

function previousIsoDate(dateStr) {
  const d = parseDateLocal(dateStr);
  if (!d) return "";
  return formatISODate(addDays(d, -1));
}

function monthStart(dateStr) {
  const d = parseDateLocal(dateStr) || new Date();
  return formatISODate(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

function monthEnd(dateStr) {
  const d = parseDateLocal(dateStr) || new Date();
  return formatISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

function formatDateAT(dateStr) {
  const d = parseDateLocal(dateStr);
  if (!d) return dateStr || "—";
  return d.toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function toHM(min) {
  const m = Number(min || 0);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function isVacationEntry(row) {
  const note = String(row?.note || "").toLowerCase();
  const absence = String(row?.absence_type || row?.absenceType || "").toLowerCase();
  return absence === "urlaub" || note.includes("[urlaub]") || note.includes("urlaub");
}

function isZaEntry(row) {
  const note = String(row?.note || "").toLowerCase();
  const absence = String(row?.absence_type || row?.absenceType || "").toLowerCase();
  return absence === "zeitausgleich" || absence === "za" || Number(row?.za_hours || 0) > 0 || note.includes("[zeitausgleich]") || note.includes("zeitausgleich");
}

function isTimeOffEntry(row) {
  return isVacationEntry(row) || isZaEntry(row);
}

function getEntryKind(row) {
  if (isZaEntry(row)) return "za";
  if (isVacationEntry(row)) return "urlaub";
  return "sonstiges";
}

function getEmployeeLabel(emp) {
  return [emp?.name, emp?.code ? `(${emp.code})` : ""].filter(Boolean).join(" ");
}

function sameEmployee(emp, session) {
  if (!emp || !session) return false;

  const empId = emp?.id != null ? String(emp.id).trim() : "";
  const sessionId = session?.id != null ? String(session.id).trim() : "";
  if (empId && sessionId && empId === sessionId) return true;

  const empCode = String(emp?.code || "").trim().toLowerCase();
  const sessionCode = String(session?.code || "").trim().toLowerCase();
  if (empCode && sessionCode && empCode === sessionCode) return true;

  const empName = String(emp?.name || "").trim().toLowerCase();
  const sessionName = String(session?.name || "").trim().toLowerCase();
  if (empName && sessionName && empName === sessionName) return true;

  return false;
}

function stripTimeOffNote(note) {
  return String(note || "")
    .replace(/^\s*\[Urlaub\]\s*/i, "")
    .replace(/^\s*\[Zeitausgleich\]\s*/i, "")
    .trim();
}

function fmtHours(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} h`;
}

function fmtDays(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} Tage`;
}

function vacationEntitlementDays(emp) {
  const raw = emp?.vacation_entitlement_days ?? emp?.urlaub_anspruch_tage ?? emp?.vacation_days;
  const n = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 25;
}

function isNextIsoDate(prev, next) {
  const p = parseDateLocal(prev);
  const n = parseDateLocal(next);
  if (!p || !n) return false;
  return formatISODate(addDays(p, 1)) === String(next || '').slice(0, 10);
}

function formatDateRangeAT(from, to) {
  if (!from) return '—';
  if (!to || String(from).slice(0,10) === String(to).slice(0,10)) return formatDateAT(from);
  const a = parseDateLocal(from);
  const b = parseDateLocal(to);
  if (!a || !b) return `${from} - ${to}`;
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  if (sameMonth) {
    return `${String(a.getDate()).padStart(2, '0')}. - ${String(b.getDate()).padStart(2, '0')}.${String(b.getMonth() + 1).padStart(2, '0')}.${b.getFullYear()}`;
  }
  return `${formatDateAT(from)} - ${formatDateAT(to)}`;
}

function weekRangeLabel(from, to) {
  const days = dateRange(from, to);
  const types = Array.from(new Set(days.map((d) => getBuakWeekType(d))));
  if (types.length === 1) return types[0] === 'kurz' ? 'Kurzwoche' : 'Langwoche';
  return 'gemischt';
}

function buildPreviewHint(group, entryType) {
  const days = Array.isArray(group?.rows) ? group.rows : [];
  const holidayNames = days.map((r) => r.holidayName).filter(Boolean);
  const autoShortFridayCount = days.filter((r) => r.autoShortFriday).length;
  const parts = [];

  if (entryType === "za") {
    parts.push(`[Zeitausgleich] ${fmtHours(Number(group?.requiredMinutes || 0) / 60)} werden vom ZA-Konto abgezogen`);
  } else {
    parts.push(`[Urlaub] ${days.length} Tag${days.length === 1 ? "" : "e"} / 0,00 h Arbeitszeit`);
  }

  if (autoShortFridayCount > 0) {
    parts.push(`${autoShortFridayCount} kurzer Freitag automatisch mit eingetragen`);
  }
  if (holidayNames.length > 0) {
    parts.push(`Feiertag: ${Array.from(new Set(holidayNames)).join(", ")}`);
  }

  return parts.join(" · ");
}

export default function VacationEntry({ currentUser = null } = {}) {
  const storedSession = getSession()?.user || {};
  const session = currentUser || storedSession || {};
  const isAdmin = String(session?.role || "").toLowerCase() === "admin";

  const [employees, setEmployees] = useState([]);
  const [ownEmployee, setOwnEmployee] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [entryType, setEntryType] = useState("urlaub");
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [onlyWorkdays, setOnlyWorkdays] = useState(true);
  const [replaceExistingTimeOff, setReplaceExistingTimeOff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [timeOffRows, setTimeOffRows] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(todayISO().slice(0, 7));
  const [vacationAccountRows, setVacationAccountRows] = useState([]);
  const [vacationAdjustments, setVacationAdjustments] = useState([]);
  const [vacationAccountLoading, setVacationAccountLoading] = useState(false);
  const [vacationAdjustDays, setVacationAdjustDays] = useState("");
  const [vacationAdjustNote, setVacationAdjustNote] = useState("");
  const [vacationAdjustSaving, setVacationAdjustSaving] = useState(false);

  const calendarAnchorDate = useMemo(() => `${calendarMonth || todayISO().slice(0, 7)}-01`, [calendarMonth]);
  const calendarFrom = useMemo(() => monthStart(calendarAnchorDate), [calendarAnchorDate]);
  const calendarTo = useMemo(() => monthEnd(calendarAnchorDate), [calendarAnchorDate]);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .order("name", { ascending: true });
        if (error) throw error;

        const rows = (data || []).filter((e) => e?.active !== false && e?.disabled !== true);
        let own = rows.find((e) => sameEmployee(e, session)) || null;

        if (!own && session?.id != null) {
          own = rows.find((e) => String(e.id) === String(session.id)) || null;
        }
        if (!own && session?.code) {
          const code = String(session.code).trim().toLowerCase();
          own = rows.find((e) => String(e.code || "").trim().toLowerCase() === code) || null;
        }

        if (!cancelled) {
          setEmployees(rows);
          setOwnEmployee(own);
          if (isAdmin) {
            setSelectedEmployeeId(String(own?.id || rows[0]?.id || ""));
          } else {
            setSelectedEmployeeId(String(own?.id || ""));
            if (!own) setError("Dein Mitarbeiter-Datensatz wurde nicht gefunden. Urlaub/ZA kann nicht eingetragen werden.");
          }
        }
      } catch (e) {
        console.error("[VacationEntry] employees load error", e);
        if (!cancelled) setError("Mitarbeiter konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadEmployees();
    return () => {
      cancelled = true;
    };
  }, [session?.code, session?.id, session?.name, session?.role, isAdmin]);

  const employeeById = useMemo(() => {
    const map = new Map();
    employees.forEach((e) => map.set(String(e.id), e));
    return map;
  }, [employees]);

  const targetEmployee = useMemo(() => {
    if (isAdmin) return employeeById.get(String(selectedEmployeeId)) || null;
    return ownEmployee;
  }, [employeeById, isAdmin, ownEmployee, selectedEmployeeId]);

  async function loadTimeOff() {
    setCalendarLoading(true);
    try {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, employee_id, work_date, note, za_hours")
        .gte("work_date", calendarFrom)
        .lte("work_date", calendarTo)
        .order("work_date", { ascending: true });
      if (error) throw error;
      setTimeOffRows((data || []).filter(isTimeOffEntry));
    } catch (e) {
      console.error("[VacationEntry] time off load error", e);
      setError(e?.message || "Urlaub-/ZA-Kalender konnte nicht geladen werden.");
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    if (employees.length === 0) return;
    loadTimeOff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarFrom, calendarTo, employees.length]);

  const vacationAccountYear = useMemo(() => Number(String(fromDate || todayISO()).slice(0, 4)) || new Date().getFullYear(), [fromDate]);

  async function loadVacationAccount() {
    if (!targetEmployee?.id) {
      setVacationAccountRows([]);
      setVacationAdjustments([]);
      return;
    }
    const y = vacationAccountYear;
    const from = `${y}-01-01`;
    const to = `${y}-12-31`;

    try {
      setVacationAccountLoading(true);
      const { data: vacRows, error: vacErr } = await supabase
        .from("time_entries")
        .select("id, employee_id, work_date, note")
        .eq("employee_id", targetEmployee.id)
        .gte("work_date", from)
        .lte("work_date", to);
      if (vacErr) throw vacErr;
      setVacationAccountRows((vacRows || []).filter(isVacationEntry));

      try {
        const { data: adjRows, error: adjErr } = await supabase
          .from("vacation_adjustments")
          .select("id, employee_id, adjustment_date, days, note, created_at")
          .eq("employee_id", String(targetEmployee.id))
          .gte("adjustment_date", from)
          .lte("adjustment_date", to)
          .order("adjustment_date", { ascending: false });
        if (adjErr) throw adjErr;
        setVacationAdjustments(adjRows || []);
      } catch (adjErr) {
        console.warn("[VacationEntry] Urlaubskorrekturen konnten nicht geladen werden", adjErr);
        setVacationAdjustments([]);
      }
    } catch (e) {
      console.error("[VacationEntry] Urlaubskonto konnte nicht geladen werden", e);
      setVacationAccountRows([]);
      setVacationAdjustments([]);
    } finally {
      setVacationAccountLoading(false);
    }
  }

  useEffect(() => {
    loadVacationAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetEmployee?.id, vacationAccountYear]);

  const vacationAccount = useMemo(() => {
    if (!targetEmployee) return null;
    const entitlement = vacationEntitlementDays(targetEmployee);
    const used = vacationAccountRows.length;
    const corrections = (vacationAdjustments || []).reduce((sum, row) => {
      const n = Number(String(row?.days ?? 0).replace(",", "."));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return { entitlement, used, corrections, remaining: entitlement + corrections - used };
  }, [targetEmployee, vacationAccountRows, vacationAdjustments]);

  async function saveVacationAdjustment() {
    if (!isAdmin || !targetEmployee?.id) return;
    const days = Number(String(vacationAdjustDays).replace(",", "."));
    if (!Number.isFinite(days) || days === 0) {
      setError("Bitte Urlaubskorrektur in Tagen eingeben, z. B. +2 oder -1.");
      return;
    }
    try {
      setVacationAdjustSaving(true);
      setError("");
      const { error: insertError } = await supabase.from("vacation_adjustments").insert({
        employee_id: String(targetEmployee.id),
        adjustment_date: todayISO(),
        days,
        note: vacationAdjustNote.trim() || "Urlaubskorrektur",
      });
      if (insertError) throw insertError;
      setVacationAdjustDays("");
      setVacationAdjustNote("");
      setMessage("Urlaubskorrektur gespeichert.");
      await loadVacationAccount();
    } catch (e) {
      console.error("[VacationEntry] Urlaubskorrektur speichern fehlgeschlagen", e);
      setError(e?.message || "Urlaubskorrektur konnte nicht gespeichert werden.");
    } finally {
      setVacationAdjustSaving(false);
    }
  }

  const preview = useMemo(() => {
    if (!targetEmployee) return [];

    // Urlaub-Sonderregel:
    // 1) Wird in einer Kurzwoche ein Donnerstag als Urlaub gewählt, kommt der kurze Freitag automatisch mit.
    // 2) Wird der kurze Freitag später separat gewählt und der Donnerstag ist bereits als Urlaub vorhanden,
    //    darf der Freitag ebenfalls als Urlaub mit 0 h gespeichert werden.
    const existingVacationByDate = new Set(
      (timeOffRows || [])
        .filter((row) => String(row?.employee_id) === String(targetEmployee.id) && isVacationEntry(row))
        .map((row) => String(row.work_date || "").slice(0, 10))
        .filter(Boolean)
    );

    const baseDays = dateRange(fromDate, toDate);
    const dayItems = [];
    const seen = new Set();

    function addDay(day, autoShortFriday = false, shortFridayAfterExistingThursday = false) {
      const iso = String(day || "").slice(0, 10);
      if (!iso || seen.has(iso)) return;
      seen.add(iso);
      dayItems.push({ date: iso, autoShortFriday, shortFridayAfterExistingThursday });
    }

    for (const day of baseDays) {
      const d = parseDateLocal(day);
      const isThursday = d?.getDay() === 4;
      const shortFridayAfterExistingThursday =
        entryType === "urlaub" &&
        isShortFridayInShortWeek(day) &&
        existingVacationByDate.has(previousIsoDate(day));

      addDay(day, false, shortFridayAfterExistingThursday);

      if (entryType === "urlaub" && isThursday && getBuakWeekType(day) === "kurz") {
        addDay(formatISODate(addDays(d, 1)), true, false);
      }
    }

    dayItems.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const rows = [];
    for (const item of dayItems) {
      const day = item.date;
      const workDay = getEmployeeWorkDay(targetEmployee, day);
      const requiredMinutes = Number(workDay?.requiredMinutes || 0);
      const isActiveDay = !!workDay?.active && requiredMinutes > 0;
      const isAutoShortFriday = !!item.autoShortFriday || !!item.shortFridayAfterExistingThursday;

      if (!isAutoShortFriday && onlyWorkdays && !isActiveDay) continue;
      if (entryType === "za" && requiredMinutes <= 0) continue;

      rows.push({
        employee: targetEmployee,
        date: day,
        requiredMinutes,
        startMin: workDay?.active ? hmToMinutes(workDay.start) : 0,
        weekType: getBuakWeekType(day),
        holidayName: getHolidayName(day),
        autoShortFriday: isAutoShortFriday,
      });
    }
    return rows;
  }, [fromDate, toDate, onlyWorkdays, targetEmployee, entryType, timeOffRows]);

  const previewDisplayRows = useMemo(() => {
    const sorted = [...preview].sort((a, b) =>
      String(a.employee?.name || "").localeCompare(String(b.employee?.name || ""), "de") ||
      String(a.date).localeCompare(String(b.date))
    );

    const groups = [];
    for (const row of sorted) {
      const last = groups[groups.length - 1];
      const sameGroup =
        last &&
        String(last.employee?.id) === String(row.employee?.id) &&
        isNextIsoDate(last.to_date, row.date);

      if (sameGroup) {
        last.to_date = row.date;
        last.rows.push(row);
        last.requiredMinutes += Number(row.requiredMinutes || 0);
        last.hasHoliday = last.hasHoliday || !!row.holidayName;
        last.hasAutoShortFriday = last.hasAutoShortFriday || !!row.autoShortFriday;
      } else {
        groups.push({
          ...row,
          from_date: row.date,
          to_date: row.date,
          rows: [row],
          requiredMinutes: Number(row.requiredMinutes || 0),
          hasHoliday: !!row.holidayName,
          hasAutoShortFriday: !!row.autoShortFriday,
        });
      }
    }

    return groups.slice(0, 80);
  }, [preview]);

  const buakCalendarWeeks = useMemo(() => {
    const start = startOfWeek(calendarFrom);
    const end = parseDateLocal(calendarTo) || start;
    const rows = [];
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 7)) {
      const monday = formatISODate(cursor);
      const weekType = getBuakWeekType(monday);
      const days = Array.from({ length: 5 }, (_, idx) => {
        const d = addDays(cursor, idx);
        const iso = formatISODate(d);
        return {
          iso,
          label: d.toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", ""),
          holidayName: getHolidayName(iso),
          shortFriday: weekType === "kurz" && isFriday(iso),
        };
      });
      rows.push({ monday, kw: getWeekNumber(monday), weekType, days });
    }
    return rows;
  }, [calendarFrom, calendarTo]);

  const timeOffDisplayRows = useMemo(() => {
    const rows = timeOffRows
      .map((row) => ({
        ...row,
        employee: employeeById.get(String(row.employee_id)) || null,
        kind: getEntryKind(row),
        cleanNote: stripTimeOffNote(row.note),
      }))
      .filter((row) => row.employee)
      .sort((a, b) =>
        String(a.employee?.name || "").localeCompare(String(b.employee?.name || ""), "de") ||
        String(a.kind || "").localeCompare(String(b.kind || "")) ||
        String(a.cleanNote || "").localeCompare(String(b.cleanNote || ""), "de") ||
        String(a.work_date).localeCompare(String(b.work_date))
      );

    const groups = [];
    for (const row of rows) {
      const last = groups[groups.length - 1];
      const sameGroup =
        last &&
        String(last.employee_id) === String(row.employee_id) &&
        last.kind === row.kind &&
        String(last.cleanNote || "") === String(row.cleanNote || "") &&
        isNextIsoDate(last.to_date, row.work_date);

      if (sameGroup) {
        last.to_date = String(row.work_date).slice(0, 10);
        last.ids.push(row.id);
        last.rows.push(row);
        last.za_hours = Number(last.za_hours || 0) + Number(row.za_hours || 0);
      } else {
        groups.push({
          ...row,
          from_date: String(row.work_date).slice(0, 10),
          to_date: String(row.work_date).slice(0, 10),
          ids: [row.id],
          rows: [row],
          za_hours: Number(row.za_hours || 0),
        });
      }
    }

    return groups.sort((a, b) =>
      String(a.from_date).localeCompare(String(b.from_date)) ||
      String(a.employee?.name || "").localeCompare(String(b.employee?.name || ""), "de")
    );
  }, [timeOffRows, employeeById]);


  const monthOverviewRows = useMemo(() => {
    const days = dateRange(calendarFrom, calendarTo);
    const byDate = new Map();

    for (const row of timeOffRows || []) {
      const date = String(row.work_date || "").slice(0, 10);
      const emp = employeeById.get(String(row.employee_id));
      if (!date || !emp) continue;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push({
        ...row,
        employee: emp,
        kind: getEntryKind(row),
        cleanNote: stripTimeOffNote(row.note),
      });
    }

    return days.map((date) => {
      const entries = (byDate.get(date) || []).sort((a, b) =>
        String(a.employee?.name || "").localeCompare(String(b.employee?.name || ""), "de")
      );
      const vacation = entries.filter((r) => r.kind === "urlaub");
      const za = entries.filter((r) => r.kind === "za");
      return {
        date,
        kw: getWeekNumber(date),
        weekType: getBuakWeekType(date),
        holidayName: getHolidayName(date),
        entries,
        vacation,
        za,
      };
    });
  }, [calendarFrom, calendarTo, timeOffRows, employeeById]);

  function shiftCalendarMonth(delta) {
    const base = parseDateLocal(`${calendarMonth || todayISO().slice(0, 7)}-01`) || new Date();
    base.setMonth(base.getMonth() + delta);
    setCalendarMonth(formatISODate(base).slice(0, 7));
  }

  async function saveTimeOff() {
    setError("");
    setMessage("");

    if (!targetEmployee) {
      setError("Kein Mitarbeiter ausgewählt bzw. gefunden. Urlaub/ZA kann nicht eingetragen werden.");
      return;
    }
    if (!isAdmin && !sameEmployee(targetEmployee, session)) {
      setError("Du kannst nur deinen eigenen Urlaub/ZA eintragen.");
      return;
    }
    if (!fromDate || !toDate) {
      setError("Bitte Von- und Bis-Datum auswählen.");
      return;
    }
    if (parseDateLocal(toDate) < parseDateLocal(fromDate)) {
      setError("Bis-Datum darf nicht vor dem Von-Datum liegen.");
      return;
    }
    if (preview.length === 0) {
      setError(`Für diesen Zeitraum gibt es laut Arbeitszeitmodell keine ${entryType === "za" ? "ZA-Tage" : "Urlaubstage"} zum Eintragen.`);
      return;
    }

    try {
      setSaving(true);

      const previewDates = preview.map((item) => item.date).sort();
      const existingFrom = previewDates[0] || fromDate;
      const existingTo = previewDates[previewDates.length - 1] || toDate;

      const { data: existing, error: existingError } = await supabase
        .from("time_entries")
        .select("id, employee_id, work_date, note, za_hours")
        .eq("employee_id", targetEmployee.id)
        .gte("work_date", existingFrom)
        .lte("work_date", existingTo);
      if (existingError) throw existingError;

      const existingMap = new Map();
      for (const row of existing || []) {
        const key = String(row.work_date).slice(0, 10);
        if (!existingMap.has(key)) existingMap.set(key, []);
        existingMap.get(key).push(row);
      }

      const deleteIds = [];
      const rowsToInsert = [];
      const skipped = [];
      const prefix = entryType === "za" ? "[Zeitausgleich]" : "[Urlaub]";

      for (const item of preview) {
        const existingRows = existingMap.get(item.date) || [];
        const existingTimeOffRows = existingRows.filter(isTimeOffEntry);
        const existingWorkRows = existingRows.filter((row) => !isTimeOffEntry(row));

        if (existingRows.length > 0) {
          const mayReplace = replaceExistingTimeOff && existingWorkRows.length === 0 && existingTimeOffRows.length === existingRows.length;
          if (mayReplace) {
            deleteIds.push(...existingRows.map((r) => r.id));
          } else {
            skipped.push(item.date);
            continue;
          }
        }

        const start = 0;
        const zaHours = entryType === "za" ? Number(item.requiredMinutes || 0) / 60 : 0;
        rowsToInsert.push({
          employee_id: targetEmployee.id,
          work_date: item.date,
          project_id: null,
          project: null,
          start_min: start,
          end_min: 0,
          break_min: 0,
          travel_minutes: 0,
          travel_cost_center: "FAHRZEIT",
          crane_hours: 0,
          private_pkw_km: 0,
          za_hours: zaHours,
          bad_weather: false,
          bad_weather_minutes: 0,
          weather_auto: null,
          weather_manual: null,
          weather_final: null,
          note: `${prefix}${note.trim() ? ` ${note.trim()}` : ""}`,
        });
      }

      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase.from("time_entries").delete().in("id", deleteIds);
        if (deleteError) throw deleteError;
      }

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase.from("time_entries").insert(rowsToInsert);
        if (insertError) throw insertError;
      }

      setMessage(
        `${entryType === "za" ? "Zeitausgleich" : "Urlaub"} eingetragen für ${getEmployeeLabel(targetEmployee)}: ${rowsToInsert.length} Tag${rowsToInsert.length === 1 ? "" : "e"}.` +
          (skipped.length > 0
            ? ` Nicht gespeichert: ${skipped.length} Tag${skipped.length === 1 ? "" : "e"}, weil dort bereits ein Eintrag vorhanden ist.`
            : "")
      );
      await loadTimeOff();
      await loadVacationAccount();
    } catch (e) {
      console.error("[VacationEntry] save error", e);
      setError(e?.message || "Urlaub/ZA konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTimeOff(row) {
    const emp = employeeById.get(String(row.employee_id));
    const allowed = isAdmin || sameEmployee(emp, session);
    if (!allowed) return;
    const kind = getEntryKind(row) === "za" ? "Zeitausgleich" : "Urlaub";
    const ids = Array.isArray(row.ids) && row.ids.length ? row.ids : [row.id];
    const rangeText = row.from_date && row.to_date ? formatDateRangeAT(row.from_date, row.to_date) : formatDateAT(row.work_date);
    const ok = window.confirm(`${isAdmin ? "Diesen" : "Eigenen"} ${kind}-Eintrag für ${rangeText} wirklich löschen?`);
    if (!ok) return;
    setError("");
    setMessage("");
    try {
      const { error } = await supabase.from("time_entries").delete().in("id", ids);
      if (error) throw error;
      setMessage(`${kind}-Eintrag gelöscht.`);
      await loadTimeOff();
      await loadVacationAccount();
    } catch (e) {
      console.error("[VacationEntry] delete error", e);
      setError(e?.message || "Eintrag konnte nicht gelöscht werden.");
    }
  }

  return (
    <div className="page-wrap">
      <section className="hero-card">
        <div className="eyebrow">Urlaub / Zeitausgleich</div>
        <h1>Urlaub & ZA eintragen</h1>
        <p>
          Jeder Mitarbeiter sieht den Kalender. Mitarbeiter können nur sich selbst eintragen oder ändern.
          Admins können für alle Mitarbeiter Urlaub oder Zeitausgleich eintragen.
        </p>
      </section>

      <section className="month-card" style={{ marginTop: 18 }}>
        <div className="month-card-title">Zeitraum & Art</div>

        {error && <div className="hbz-alert hbz-alert-error">{error}</div>}
        {message && <div className="hbz-alert hbz-alert-ok">{message}</div>}

        <div className="hbz-grid-2" style={{ marginTop: 12 }}>
          <label className="hbz-field">
            <span className="hbz-label">Von</span>
            <input className="hbz-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="hbz-field">
            <span className="hbz-label">Bis</span>
            <input className="hbz-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>

        <div className="hbz-grid-2" style={{ marginTop: 12 }}>
          <label className="hbz-field">
            <span className="hbz-label">Art</span>
            <select className="hbz-input" value={entryType} onChange={(e) => setEntryType(e.target.value)}>
              <option value="urlaub">Urlaub</option>
              <option value="za">Zeitausgleich</option>
            </select>
          </label>

          {isAdmin ? (
            <label className="hbz-field">
              <span className="hbz-label">Mitarbeiter</span>
              <select className="hbz-input" value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                {employees.map((emp) => (
                  <option key={emp.id} value={String(emp.id)}>{getEmployeeLabel(emp)}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="hbz-info-line">
              Wird eingetragen für: <b>{ownEmployee ? getEmployeeLabel(ownEmployee) : "nicht gefunden"}</b>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="hbz-info-line" style={{ marginTop: 10 }}>
            Admin-Eintragung für: <b>{targetEmployee ? getEmployeeLabel(targetEmployee) : "nicht ausgewählt"}</b>
          </div>
        )}

        <label className="hbz-field" style={{ marginTop: 12 }}>
          <span className="hbz-label">Notiz optional</span>
          <input className="hbz-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={entryType === "za" ? "z. B. ZA laut Vereinbarung" : "z. B. Sommerurlaub"} />
        </label>

        <div className="hbz-chipbar" style={{ marginTop: 12 }}>
          <button type="button" className={`hbz-chip ${onlyWorkdays ? "active" : ""}`} onClick={() => setOnlyWorkdays((v) => !v)}>
            Nur Arbeitstage laut Modell
          </button>
          <button type="button" className={`hbz-chip ${replaceExistingTimeOff ? "active" : ""}`} onClick={() => setReplaceExistingTimeOff((v) => !v)}>
            vorhandenen Urlaub/ZA überschreiben
          </button>
        </div>
      </section>

      {targetEmployee && vacationAccount && (
        <section className="month-card" style={{ marginTop: 18 }}>
          <div className="month-card-title">Urlaubskonto {vacationAccountYear}</div>
          <p className="hint">Urlaub wird hier in Tagen geführt. Zeitausgleich bleibt ein Stundenkonto und wird in der Zeiterfassung angezeigt.</p>
          <div className="vac-account-grid" style={{ marginTop: 10 }}>
            <div className="vac-account-box"><span>Mitarbeiter</span><b>{getEmployeeLabel(targetEmployee)}</b></div>
            <div className="vac-account-box"><span>Jahresanspruch</span><b>{fmtDays(vacationAccount.entitlement)}</b></div>
            <div className="vac-account-box"><span>Korrekturen</span><b>{fmtDays(vacationAccount.corrections)}</b></div>
            <div className="vac-account-box"><span>Verbraucht</span><b>{vacationAccountLoading ? "lädt…" : fmtDays(vacationAccount.used)}</b></div>
            <div className="vac-account-box strong"><span>Resturlaub</span><b>{vacationAccountLoading ? "lädt…" : fmtDays(vacationAccount.remaining)}</b></div>
          </div>
          {isAdmin && (
            <div className="hbz-grid-2" style={{ marginTop: 12 }}>
              <label className="hbz-field">
                <span className="hbz-label">Urlaubskorrektur Tage</span>
                <input className="hbz-input" value={vacationAdjustDays} onChange={(e) => setVacationAdjustDays(e.target.value)} placeholder="z. B. +2 oder -1" />
              </label>
              <label className="hbz-field">
                <span className="hbz-label">Notiz</span>
                <input className="hbz-input" value={vacationAdjustNote} onChange={(e) => setVacationAdjustNote(e.target.value)} placeholder="z. B. Resturlaub Vorjahr" />
              </label>
              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className="hbz-chip active" onClick={saveVacationAdjustment} disabled={vacationAdjustSaving}>
                  {vacationAdjustSaving ? "Speichere…" : "Urlaubskorrektur speichern"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="month-card" style={{ marginTop: 18 }}>
        <div className="month-card-title">BUAK Kalender</div>
        <p className="hint">Kurze und lange Wochen laut BUAK-Modell. Kurze Freitage sind frei/0 h, Feiertage werden markiert.</p>
        <div className="vac-week-grid">
          {buakCalendarWeeks.map((week) => (
            <div key={week.monday} className={`vac-week-card ${week.weekType === "kurz" ? "short" : "long"}`}>
              <div className="vac-week-head">
                <b>KW {week.kw}</b>
                <span>{week.weekType === "kurz" ? "Kurzwoche" : "Langwoche"}</span>
              </div>
              <div className="vac-day-row">
                {week.days.map((day) => (
                  <div key={day.iso} className={`vac-day ${day.holidayName ? "holiday" : ""} ${day.shortFriday ? "shortFriday" : ""}`} title={day.holidayName || day.iso}>
                    <div>{day.label}</div>
                    {day.holidayName ? <small>Feiertag</small> : day.shortFriday ? <small>frei</small> : <small>{week.weekType === "kurz" ? "kurz" : "lang"}</small>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="month-card" style={{ marginTop: 18 }}>
        <div className="month-card-title">Vorschau</div>
        <p className="hint">
          Es werden {preview.length} {entryType === "za" ? "ZA-Tag" : "Urlaubstag"}{preview.length === 1 ? "" : "e"} vorbereitet.
          Bestehende Einträge werden nicht überschrieben, außer es ist ausdrücklich aktiviert.
        </p>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="hbz-table compact">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Zeitraum</th>
                <th>Art</th>
                <th>Woche</th>
                <th>Tage</th>
                <th>Soll gesamt</th>
                <th>Hinweis</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Lade Mitarbeiter…</td></tr>
              ) : previewDisplayRows.length === 0 ? (
                <tr><td colSpan={7}>Keine Tage in der Vorschau.</td></tr>
              ) : (
                previewDisplayRows.map((row, idx) => {
                  const weekLabel = weekRangeLabel(row.from_date, row.to_date);
                  const mixed = weekLabel === "gemischt";
                  return (
                    <tr key={`${row.employee.id}-${row.from_date}-${row.to_date}-${idx}`}>
                      <td>{row.employee.name}</td>
                      <td>{formatDateRangeAT(row.from_date, row.to_date)}</td>
                      <td><span className={`vac-pill ${entryType === "za" ? "za" : "vac"}`}>{entryType === "za" ? "Zeitausgleich" : "Urlaub"}</span></td>
                      <td><span className={`vac-pill ${mixed ? "mixed" : weekLabel === "Kurzwoche" ? "short" : "long"}`}>{weekLabel}</span></td>
                      <td>{row.rows.length}</td>
                      <td>{fmtHours(row.requiredMinutes / 60)}</td>
                      <td>{buildPreviewHint(row, entryType)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {preview.length > previewDisplayRows.reduce((sum, row) => sum + row.rows.length, 0) && <p className="hint">Vorschau gekürzt. Gespeichert werden trotzdem alle vorbereiteten Tage.</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="save-btn lg" onClick={saveTimeOff} disabled={saving || preview.length === 0 || !targetEmployee}>
            {saving ? "Speichere…" : entryType === "za" ? "Zeitausgleich eintragen" : "Urlaub eintragen"}
          </button>
        </div>
      </section>

      <section className="month-card" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="month-card-title">Monatsübersicht Urlaub / ZA</div>
            <p className="hint" style={{ marginTop: 4 }}>
              Monatsvorschau für alle Mitarbeiter. Urlaub und Zeitausgleich werden pro Tag zusammengefasst angezeigt.
            </p>
          </div>
          <div className="vac-month-controls">
            <button type="button" className="hbz-chip" onClick={() => shiftCalendarMonth(-1)}>← Monat</button>
            <input
              className="hbz-input vac-month-input"
              type="month"
              value={calendarMonth}
              onChange={(e) => setCalendarMonth(e.target.value)}
            />
            <button type="button" className="hbz-chip" onClick={() => shiftCalendarMonth(1)}>Monat →</button>
          </div>
        </div>

        <div className="vac-month-overview" style={{ marginTop: 12 }}>
          {calendarLoading ? (
            <div className="hbz-info-line">Lade Monatsübersicht…</div>
          ) : monthOverviewRows.length === 0 ? (
            <div className="hbz-info-line">Keine Tage im Monat gefunden.</div>
          ) : (
            monthOverviewRows.map((day) => {
              const hasEntries = day.entries.length > 0;
              return (
                <div key={day.date} className={`vac-month-day ${day.weekType === "kurz" ? "short" : "long"} ${day.holidayName ? "holiday" : ""} ${hasEntries ? "hasEntries" : ""}`}>
                  <div className="vac-month-date">
                    <b>{formatDateAT(day.date)}</b>
                    <span>KW {day.kw} · {day.weekType === "kurz" ? "kurz" : "lang"}</span>
                    {day.holidayName && <em>{day.holidayName}</em>}
                  </div>
                  <div className="vac-month-entries">
                    {day.vacation.length > 0 && (
                      <div className="vac-month-line">
                        <span className="vac-pill vac">Urlaub</span>
                        <strong>{day.vacation.map((r) => r.employee?.name).filter(Boolean).join(", ")}</strong>
                      </div>
                    )}
                    {day.za.length > 0 && (
                      <div className="vac-month-line">
                        <span className="vac-pill za">ZA</span>
                        <strong>{day.za.map((r) => `${r.employee?.name}${Number(r.za_hours || 0) > 0 ? ` (${fmtHours(r.za_hours)})` : ""}`).filter(Boolean).join(", ")}</strong>
                      </div>
                    )}
                    {!hasEntries && <span className="vac-empty">—</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="month-card" style={{ marginTop: 18 }}>
        <div className="month-card-title">Urlaub-/ZA-Kalender alle Mitarbeiter</div>
        <p className="hint">Alle dürfen sehen, wann Urlaub oder Zeitausgleich eingetragen ist. Löschen ist nur beim eigenen Eintrag möglich; Admin kann alle Einträge löschen.</p>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="hbz-table compact">
            <thead>
              <tr>
                <th>Zeitraum</th>
                <th>Mitarbeiter</th>
                <th>Art</th>
                <th>Woche</th>
                <th>ZA-Stunden</th>
                <th>Notiz</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {calendarLoading ? (
                <tr><td colSpan={7}>Lade Kalender…</td></tr>
              ) : timeOffDisplayRows.length === 0 ? (
                <tr><td colSpan={7}>In diesem Zeitraum ist kein Urlaub/ZA eingetragen.</td></tr>
              ) : (
                timeOffDisplayRows.map((row) => {
                  const own = sameEmployee(row.employee, session);
                  const allowed = isAdmin || own;
                  const kind = row.kind || getEntryKind(row);
                  const weekLabel = weekRangeLabel(row.from_date || row.work_date, row.to_date || row.work_date);
                  const mixed = weekLabel === "gemischt";
                  return (
                    <tr key={`${row.employee_id}-${kind}-${row.from_date}-${row.to_date}-${row.cleanNote || ""}`} className={own ? "vac-own-row" : ""}>
                      <td>{formatDateRangeAT(row.from_date || row.work_date, row.to_date || row.work_date)}</td>
                      <td>{row.employee?.name || "—"}</td>
                      <td><span className={`vac-pill ${kind === "za" ? "za" : "vac"}`}>{kind === "za" ? "Zeitausgleich" : "Urlaub"}</span></td>
                      <td><span className={`vac-pill ${mixed ? "mixed" : weekLabel === "Kurzwoche" ? "short" : "long"}`}>{weekLabel}</span></td>
                      <td>{kind === "za" ? fmtHours(row.za_hours) : "—"}</td>
                      <td>{row.cleanNote || "—"}</td>
                      <td>
                        {allowed ? (
                          <button type="button" className="hbz-mini-danger" onClick={() => deleteTimeOff(row)}>{isAdmin && !own ? "Eintrag löschen" : "Eigenen Eintrag löschen"}</button>
                        ) : (
                          <span className="hint">nur Anzeige</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style>{`
        .hbz-alert { border-radius: 12px; padding: 10px 12px; margin: 10px 0; font-weight: 700; }
        .hbz-alert-error { border: 1px solid #ff8b8b; background: #fff5f5; color: #8a1f1f; }
        .hbz-alert-ok { border: 1px solid #9bd3a6; background: #f2fff5; color: #1d6a30; }
        .hint { color: #7d6756; font-size: 12px; }
        .hbz-info-line { border: 1px solid rgba(92, 68, 45, 0.16); background: rgba(255,255,255,0.62); border-radius: 12px; padding: 10px 12px; color: #4c3727; }
        .table-scroll { overflow-x: auto; }
        .hbz-table.compact th, .hbz-table.compact td { padding: 8px 10px; white-space: nowrap; }
        .vac-week-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-top: 12px; }
        .vac-week-card { border: 1px solid rgba(92, 68, 45, 0.14); border-radius: 14px; padding: 10px; background: rgba(255,255,255,0.70); }
        .vac-week-card.short { background: #f2fff5; }
        .vac-week-card.long { background: #fff5f0; }
        .vac-week-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: #3d2a1b; }
        .vac-week-head span { font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: .02em; }
        .vac-day-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
        .vac-day { min-height: 54px; border-radius: 10px; padding: 7px 5px; text-align: center; background: rgba(255,255,255,0.78); border: 1px solid rgba(92, 68, 45, 0.12); font-weight: 800; }
        .vac-day small { display: block; margin-top: 3px; font-weight: 700; color: #7d6756; font-size: 10px; }
        .vac-day.holiday { background: #ffecec; border-color: #e29b9b; }
        .vac-day.shortFriday { background: #eaf7ef; border-color: #9bd3a6; }
        .vac-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 900; }
        .vac-pill.short { background: #e7f7ed; color: #1d6a30; }
        .vac-pill.long { background: #fff0e3; color: #85460a; }
        .vac-pill.vac { background: #eaf0ff; color: #223d8f; }
        .vac-pill.za { background: #fff2cc; color: #795100; }
        .vac-pill.mixed { background: #f1edf8; color: #573a7d; }
        .vac-own-row { background: rgba(222, 242, 232, 0.62); }
        .hbz-mini-danger { border: 1px solid #d88; background: #fff4f4; color: #8a1f1f; border-radius: 999px; padding: 6px 10px; font-weight: 800; cursor: pointer; }
        .vac-month-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .vac-month-input { min-width: 150px; }
        .vac-month-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 8px; }
        .vac-month-day { border: 1px solid rgba(92, 68, 45, 0.12); border-radius: 14px; padding: 10px; background: rgba(255,255,255,0.72); display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: start; }
        .vac-month-day.short { background: #f6fff8; }
        .vac-month-day.long { background: #fff8f2; }
        .vac-month-day.holiday { border-color: #e3a0a0; background: #fff1f1; }
        .vac-month-day.hasEntries { box-shadow: 0 0 0 1px rgba(151, 104, 64, 0.16) inset; }
        .vac-month-date b { display: block; color: #3d2a1b; }
        .vac-month-date span { display: block; margin-top: 3px; color: #7d6756; font-size: 11px; font-weight: 800; }
        .vac-month-date em { display: block; margin-top: 3px; color: #9b2b2b; font-size: 11px; font-style: normal; font-weight: 900; }
        .vac-month-entries { min-width: 0; }
        .vac-month-line { display: flex; gap: 7px; align-items: flex-start; margin-bottom: 6px; flex-wrap: wrap; }
        .vac-month-line strong { color: #2f2118; font-size: 12px; line-height: 1.35; }
        .vac-empty { color: #b3a394; font-weight: 800; }
        .vac-account-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
        .vac-account-box { border: 1px solid rgba(92, 68, 45, 0.14); border-radius: 14px; background: rgba(255,255,255,0.72); padding: 10px 12px; }
        .vac-account-box span { display: block; color: #7d6756; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; }
        .vac-account-box b { display: block; margin-top: 4px; color: #2f2118; font-size: 16px; }
        .vac-account-box.strong { background: #f2fff5; border-color: #9bd3a6; }
        @media (max-width: 720px) {
          .vac-month-day { grid-template-columns: 1fr; }
        }

        .hbz-mini-danger:hover { background: #ffe8e8; }
      `}</style>
    </div>
  );
}
