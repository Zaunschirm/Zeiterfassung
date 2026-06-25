import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { getEmployeeWorkDay, getBuakWeekType, getHolidayName, hmToMinutes } from "../utils/time";
import { ensureMonthUnlocked } from "../utils/monthLock";
import {
  calculateVacationBalanceDelta,
  deleteTimeOffEntriesSafely,
  replaceTimeOffEntriesSafely,
} from "../lib/timeOffTransactions";
import {
  isSickEntry,
  isTimeCompEntry,
  isVacationEntry,
} from "../utils/timeEntryAbsences";
import { collectSupabaseRows } from "../utils/pagination";

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

const isZaEntry = isTimeCompEntry;

function isTimeOffEntry(row) {
  return isVacationEntry(row) || isSickEntry(row) || isZaEntry(row);
}

function getEntryKind(row) {
  if (isZaEntry(row)) return "za";
  if (isSickEntry(row)) return "krank";
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
    .replace(/^\s*\[Krank\]\s*/i, "")
    .replace(/^\s*\[Zeitausgleich\]\s*/i, "")
    .trim();
}

function fmtHours(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} h`;
}

function fmtDays(value) {
  const n = Number(value || 0);
  const whole = n >= 0 ? Math.floor(n + 1e-9) : Math.ceil(n - 1e-9);
  return `${whole} ${Math.abs(whole) === 1 ? "Tag" : "Tage"}`;
}

const VACATION_ANNUAL_DAYS = 25;
const VACATION_MONTHLY_DAYS = VACATION_ANNUAL_DAYS / 12;
// Deine übergebenen Urlaubsstände sind Stand 31.03.2026.
// Der Anspruch für einen Monat wird immer erst am folgenden 01. gutgeschrieben.
// Daher wird April 2026 am 01.05.2026 gebucht, Mai am 01.06.2026 usw.
const VACATION_ACCRUAL_FIRST_EARNED_MONTH = "2026-04-01";

function monthKeyISO(dateStr = todayISO()) {
  return `${String(dateStr || todayISO()).slice(0, 7)}-01`;
}

function addMonthsISO(monthStartIso, months) {
  const d = parseDateLocal(monthStartIso);
  if (!d) return monthStartIso;
  return formatISODate(new Date(d.getFullYear(), d.getMonth() + months, 1, 12));
}

function monthStartNumber(monthStartIso) {
  const d = parseDateLocal(monthStartIso);
  if (!d) return 0;
  return d.getFullYear() * 12 + d.getMonth();
}

function listMonthStarts(fromMonthIso, toMonthIso) {
  const start = monthKeyISO(fromMonthIso);
  const end = monthKeyISO(toMonthIso);
  if (monthStartNumber(end) < monthStartNumber(start)) return [];
  const months = [];
  for (let cur = start; monthStartNumber(cur) <= monthStartNumber(end); cur = addMonthsISO(cur, 1)) {
    months.push(cur);
  }
  return months;
}

function monthLabelAT(monthStartIso) {
  const d = parseDateLocal(monthStartIso);
  if (!d) return String(monthStartIso || "");
  return d.toLocaleDateString("de-AT", { month: "long", year: "numeric" });
}

function roundVacationDays(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
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
  const [timeOffRequests, setTimeOffRequests] = useState([]);
  const [timeOffRequestEmployees, setTimeOffRequestEmployees] = useState([]);
  const [timeOffRequestsLoading, setTimeOffRequestsLoading] = useState(false);
  const [timeOffRequestBusyId, setTimeOffRequestBusyId] = useState("");
  const monthlyAccrualDoneRef = useRef(false);

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

  const timeOffRequestEmployeeById = useMemo(() => {
    const map = new Map(employeeById);
    timeOffRequestEmployees.forEach((e) => map.set(String(e.id), e));
    return map;
  }, [employeeById, timeOffRequestEmployees]);

  const targetEmployee = useMemo(() => {
    if (isAdmin) return employeeById.get(String(selectedEmployeeId)) || null;
    return ownEmployee;
  }, [employeeById, isAdmin, ownEmployee, selectedEmployeeId]);

  async function loadTimeOff() {
    setCalendarLoading(true);
    try {
      const data = await collectSupabaseRows(() => supabase
        .from("time_entries")
        .select("*")
        .gte("work_date", calendarFrom)
        .lte("work_date", calendarTo)
        .order("work_date", { ascending: true })
        .order("id", { ascending: true }));
      setTimeOffRows(data.filter(isTimeOffEntry));
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

  async function loadTimeOffRequests() {
    if (!targetEmployee?.id && !isAdmin) {
      setTimeOffRequests([]);
      return;
    }

    try {
      setTimeOffRequestsLoading(true);
      let query = supabase
        .from("time_off_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);

      if (isAdmin) {
        query = query.eq("status", "pending");
      } else {
        query = query
          .eq("employee_id", String(targetEmployee.id))
          .in("status", ["pending", "approved", "rejected"]);
      }

      const { data, error: requestError } = await query;
      if (requestError) throw requestError;
      const rows = data || [];
      const missingEmployeeIds = [
        ...new Set(
          rows
            .map((request) => String(request.employee_id || ""))
            .filter((id) => id && !employeeById.has(id))
        ),
      ];

      if (missingEmployeeIds.length > 0) {
        const { data: extraEmployees, error: employeeError } = await supabase
          .from("employees")
          .select("id, name, code, active, disabled, role, vacation_entitlement_days, za_start_date")
          .in("id", missingEmployeeIds);
        if (employeeError) throw employeeError;
        setTimeOffRequestEmployees(extraEmployees || []);
      } else {
        setTimeOffRequestEmployees([]);
      }

      setTimeOffRequests(rows);
    } catch (e) {
      // Nicht blockierend: Falls die Migration noch fehlt, bleibt die Seite bedienbar.
      console.warn("[VacationEntry] Freigabe-Anträge konnten nicht geladen werden", e?.message || e);
      setTimeOffRequests([]);
      setTimeOffRequestEmployees([]);
    } finally {
      setTimeOffRequestsLoading(false);
    }
  }

  useEffect(() => {
    if (employees.length === 0) return;
    loadTimeOffRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length, isAdmin, targetEmployee?.id]);

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
        .select("*")
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

    // Wichtig: vacation_entitlement_days ist bei uns der aktuelle Urlaubsstand
    // laut deiner Liste/BUAK, nicht ein theoretischer Jahresanspruch.
    // Darum werden bereits vorhandene Urlaubseinträge hier nicht nochmals abgezogen.
    const currentDays = vacationEntitlementDays(targetEmployee);
    return { currentDays };
  }, [targetEmployee]);

  function updateEmployeeVacationInState(employeeId, nextDays) {
    setEmployees((list) =>
      (list || []).map((emp) =>
        String(emp.id) === String(employeeId)
          ? { ...emp, vacation_entitlement_days: nextDays }
          : emp
      )
    );
    setOwnEmployee((emp) =>
      emp && String(emp.id) === String(employeeId)
        ? { ...emp, vacation_entitlement_days: nextDays }
        : emp
    );
  }

  async function refreshEmployeeVacationBalances() {
    const { data, error: refreshError } = await supabase
      .from("employees")
      .select("id, vacation_entitlement_days");
    if (refreshError) throw refreshError;

    const balanceByEmployee = new Map(
      (data || []).map((row) => [String(row.id), vacationEntitlementDays(row)])
    );
    setEmployees((list) =>
      (list || []).map((employee) => {
        const nextDays = balanceByEmployee.get(String(employee.id));
        return typeof nextDays === "undefined"
          ? employee
          : { ...employee, vacation_entitlement_days: nextDays };
      })
    );
    setOwnEmployee((employee) => {
      if (!employee) return employee;
      const nextDays = balanceByEmployee.get(String(employee.id));
      return typeof nextDays === "undefined"
        ? employee
        : { ...employee, vacation_entitlement_days: nextDays };
    });
  }

  async function ensureMonthlyVacationAccrual() {
    if (monthlyAccrualDoneRef.current || employees.length === 0) return;
    monthlyAccrualDoneRef.current = true;

    // Monatsanspruch wird immer erst am folgenden 01. gutgeschrieben.
    // Beispiel: Stand per 31.03.2026 -> April wird am 01.05.2026 gutgeschrieben,
    // Mai am 01.06.2026. Der laufende Monat wird noch nicht vorab gebucht.
    const currentMonth = monthKeyISO(todayISO());
    const latestEarnedMonth = addMonthsISO(currentMonth, -1);
    const earnedMonthsToBook = listMonthStarts(VACATION_ACCRUAL_FIRST_EARNED_MONTH, latestEarnedMonth);
    if (earnedMonthsToBook.length === 0) return;

    const activeEmployees = (employees || []).filter((emp) => emp?.active !== false && emp?.disabled !== true);
    if (activeEmployees.length === 0) return;

    try {
      const { error: rpcError } = await supabase.rpc(
        "apply_monthly_vacation_accruals",
        { p_as_of: todayISO() }
      );
      if (!rpcError) {
        await refreshEmployeeVacationBalances();
        return;
      }

      console.warn(
        "[VacationEntry] Serverseitige Urlaubsgutschrift nicht verfügbar; verwende kompatiblen Fallback",
        rpcError
      );

      const { data: existingRows, error: existingError } = await supabase
        .from("vacation_monthly_accruals")
        .select("employee_id, accrual_month")
        .in("accrual_month", earnedMonthsToBook);
      if (existingError) throw existingError;

      const alreadyBooked = new Set(
        (existingRows || []).map((row) => `${String(row.employee_id)}|${String(row.accrual_month).slice(0, 10)}`)
      );

      for (const emp of activeEmployees) {
        const missingMonths = earnedMonthsToBook.filter((m) => !alreadyBooked.has(`${String(emp.id)}|${m}`));
        if (missingMonths.length === 0) continue;

        const before = vacationEntitlementDays(emp);
        const deltaDays = roundVacationDays(VACATION_MONTHLY_DAYS * missingMonths.length);
        const nextDays = roundVacationDays(before + deltaDays);

        const { error: updateError } = await supabase
          .from("employees")
          .update({ vacation_entitlement_days: nextDays })
          .eq("id", emp.id);
        if (updateError) throw updateError;

        const rowsToInsert = missingMonths.map((earnedMonth) => ({
          employee_id: String(emp.id),
          accrual_month: earnedMonth,
          days: VACATION_MONTHLY_DAYS,
          note: `Automatischer Monatsanspruch Urlaub für ${monthLabelAT(earnedMonth)}; Gutschrift am 01. des Folgemonats`,
        }));

        const { error: accrualError } = await supabase
          .from("vacation_monthly_accruals")
          .insert(rowsToInsert);
        if (accrualError) throw accrualError;

        updateEmployeeVacationInState(emp.id, nextDays);
      }
    } catch (e) {
      // Nicht blockierend: Urlaub/ZA soll trotzdem bedienbar bleiben.
      monthlyAccrualDoneRef.current = false;
      console.warn("[VacationEntry] Monatsanspruch Urlaub konnte nicht automatisch gebucht werden", e);
      setError(e?.message || "Monatlicher Urlaubsanspruch konnte nicht automatisch hinzugefügt werden.");
    }
  }

  useEffect(() => {
    if (employees.length > 0) ensureMonthlyVacationAccrual();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length]);

  async function recordVacationAdjustment(employee, deltaDays, auditNote) {
    try {
      const { error: auditError } = await supabase.from("vacation_adjustments").insert({
        employee_id: String(employee.id),
        adjustment_date: todayISO(),
        days: Number(deltaDays),
        note: auditNote,
      });
      if (auditError) throw auditError;
    } catch (auditError) {
      console.warn("[VacationEntry] Urlaubskorrektur-Audit konnte nicht gespeichert werden", auditError);
    }
  }

  async function changeVacationCurrentDays(
    employee,
    deltaDays,
    auditNote = "Urlaubskorrektur",
    { recordAudit = true } = {}
  ) {
    if (!employee?.id || !Number.isFinite(Number(deltaDays)) || Number(deltaDays) === 0) return;
    const current = vacationEntitlementDays(employee);
    const nextDays = roundVacationDays(current + Number(deltaDays));

    const { error: updateError } = await supabase
      .from("employees")
      .update({ vacation_entitlement_days: nextDays })
      .eq("id", employee.id);
    if (updateError) throw updateError;

    updateEmployeeVacationInState(employee.id, nextDays);
    if (recordAudit) {
      await recordVacationAdjustment(employee, deltaDays, auditNote);
    }
  }

  async function saveVacationAdjustment() {
    if (!isAdmin || !targetEmployee?.id) return;
    const days = Number(String(vacationAdjustDays).replace(",", "."));
    if (!Number.isFinite(days) || days === 0) {
      setError("Bitte Korrektur in Tagen eingeben, z. B. +2 oder -1.");
      return;
    }
    try {
      setVacationAdjustSaving(true);
      setError("");
      await changeVacationCurrentDays(targetEmployee, days, vacationAdjustNote.trim() || "Manuelle Urlaubskorrektur");
      setVacationAdjustDays("");
      setVacationAdjustNote("");
      setMessage("Urlaubsstand korrigiert.");
      await loadVacationAccount();
    } catch (e) {
      console.error("[VacationEntry] Urlaubskorrektur speichern fehlgeschlagen", e);
      setError(e?.message || "Urlaubsstand konnte nicht korrigiert werden.");
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
      const sick = entries.filter((r) => r.kind === "krank");
      const za = entries.filter((r) => r.kind === "za");
      return {
        date,
        kw: getWeekNumber(date),
        weekType: getBuakWeekType(date),
        holidayName: getHolidayName(date),
        entries,
        vacation,
        sick,
        za,
      };
    });
  }, [calendarFrom, calendarTo, timeOffRows, employeeById]);

  const visibleTimeOffRequests = useMemo(() => {
    return (timeOffRequests || []).map((request) => ({
      ...request,
      employee: timeOffRequestEmployeeById.get(String(request.employee_id)) || null,
      daysCount: Array.isArray(request.days) ? request.days.length : 0,
    }));
  }, [timeOffRequests, timeOffRequestEmployeeById]);

  const timeOffRequestSummary = useMemo(() => {
    return visibleTimeOffRequests.reduce(
      (summary, request) => {
        summary.total += 1;
        if (request.entry_type === "za") summary.za += 1;
        else summary.vacation += 1;
        return summary;
      },
      { total: 0, vacation: 0, za: 0 }
    );
  }, [visibleTimeOffRequests]);

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

    if (!isAdmin) {
      try {
        setSaving(true);
        const requestDays = preview.map((item) => ({
          date: item.date,
          requiredMinutes: Number(item.requiredMinutes || 0),
          startMin: Number(item.startMin || 0),
          weekType: item.weekType || "",
          holidayName: item.holidayName || "",
          autoShortFriday: !!item.autoShortFriday,
        }));

        const { error: requestError } = await supabase.from("time_off_requests").insert({
          employee_id: String(targetEmployee.id),
          requested_by: String(session?.id || targetEmployee.id),
          entry_type: entryType,
          from_date: fromDate,
          to_date: toDate,
          days: requestDays,
          note: note.trim() || null,
          status: "pending",
        });
        if (requestError) throw requestError;

        setMessage(`${entryType === "za" ? "ZA" : "Urlaub"}-Antrag wurde an den Admin gesendet.`);
        setNote("");
        await loadTimeOffRequests();
        window.dispatchEvent(new CustomEvent("hbz-time-off-requests-changed"));
      } catch (e) {
        console.error("[VacationEntry] request save error", e);
        setError(e?.message || "Antrag konnte nicht gespeichert werden.");
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const monthsToCheck = Array.from(new Set(preview.map((item) => String(item.date).slice(0, 7))));
      for (const ym of monthsToCheck) {
        await ensureMonthUnlocked(supabase, ym);
      }
    } catch (lockErr) {
      setError(lockErr?.message || "Dieser Monat ist gesperrt.");
      return;
    }

    try {
      setSaving(true);

      const previewDates = preview.map((item) => item.date).sort();
      const existingFrom = previewDates[0] || fromDate;
      const existingTo = previewDates[previewDates.length - 1] || toDate;

      const { data: existing, error: existingError } = await supabase
        .from("time_entries")
        .select("*")
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
      const replacedRows = [];
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
            replacedRows.push(...existingRows.map((r) => ({ ...r, kind: getEntryKind(r) })));
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
          absence_type: entryType === "za" ? "za" : "urlaub",
          za_hours: zaHours,
          bad_weather: false,
          bad_weather_minutes: 0,
          weather_auto: null,
          weather_manual: null,
          weather_final: null,
          note: `${prefix}${note.trim() ? ` ${note.trim()}` : ""}`,
        });
      }

      if (rowsToInsert.length > 0) {
        const vacationDelta = calculateVacationBalanceDelta({
          entryType,
          insertedCount: rowsToInsert.length,
          replacedRows,
        });
        let transactionVacationDays = vacationEntitlementDays(targetEmployee);
        const applyVacationDelta = async (deltaDays) => {
          const employeeAtCurrentBalance = {
            ...targetEmployee,
            vacation_entitlement_days: transactionVacationDays,
          };
          await changeVacationCurrentDays(employeeAtCurrentBalance, deltaDays, "", { recordAudit: false });
          transactionVacationDays = roundVacationDays(transactionVacationDays + deltaDays);
        };

        await replaceTimeOffEntriesSafely({
          client: supabase,
          rowsToInsert,
          deleteIds,
          vacationDelta,
          applyVacationDelta,
        });

        if (vacationDelta) {
          const changedDays = Math.abs(vacationDelta);
          const auditLabel = vacationDelta < 0 ? "Urlaub eingetragen" : "Urlaub ersetzt/gelöscht";
          await recordVacationAdjustment(
            targetEmployee,
            vacationDelta,
            `${auditLabel}: ${changedDays} Tag${changedDays === 1 ? "" : "e"}`
          );
        }
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

  async function approveTimeOffRequest(request) {
    if (!isAdmin || !request?.id) return;
    const employee = timeOffRequestEmployeeById.get(String(request.employee_id));
    if (!employee) {
      setError("Mitarbeiter zum Antrag wurde nicht gefunden.");
      return;
    }

    const requestDays = Array.isArray(request.days) ? request.days : [];
    if (requestDays.length === 0) {
      setError("Der Antrag enthält keine Tage.");
      return;
    }

    const requestType = request.entry_type === "za" ? "za" : "urlaub";
    const requestDates = requestDays.map((item) => String(item.date || "").slice(0, 10)).filter(Boolean).sort();
    const existingFrom = requestDates[0];
    const existingTo = requestDates[requestDates.length - 1];
    const adminNote = "";

    try {
      setTimeOffRequestBusyId(String(request.id));
      setError("");
      setMessage("");

      const monthsToCheck = Array.from(new Set(requestDates.map((dateValue) => String(dateValue).slice(0, 7))));
      for (const ym of monthsToCheck) {
        await ensureMonthUnlocked(supabase, ym);
      }

      const { data: existing, error: existingError } = await supabase
        .from("time_entries")
        .select("*")
        .eq("employee_id", employee.id)
        .gte("work_date", existingFrom)
        .lte("work_date", existingTo);
      if (existingError) throw existingError;

      const existingDates = new Set(
        (existing || [])
          .filter((row) => requestDates.includes(String(row.work_date || "").slice(0, 10)))
          .map((row) => String(row.work_date || "").slice(0, 10))
      );
      if (existingDates.size > 0) {
        throw new Error(`Freigabe nicht möglich: Für ${Array.from(existingDates).map(formatDateAT).join(", ")} gibt es bereits Einträge.`);
      }

      const prefix = requestType === "za" ? "[Zeitausgleich]" : "[Urlaub]";
      const rowsToInsert = requestDays.map((item) => {
        const requiredMinutes = Number(item.requiredMinutes || 0);
        return {
          employee_id: employee.id,
          work_date: String(item.date).slice(0, 10),
          project_id: null,
          project: null,
          start_min: 0,
          end_min: 0,
          break_min: 0,
          travel_minutes: 0,
          travel_cost_center: "FAHRZEIT",
          crane_hours: 0,
          private_pkw_km: 0,
          absence_type: requestType === "za" ? "za" : "urlaub",
          za_hours: requestType === "za" ? requiredMinutes / 60 : 0,
          bad_weather: false,
          bad_weather_minutes: 0,
          weather_auto: null,
          weather_manual: null,
          weather_final: null,
          note: `${prefix}${String(request.note || "").trim() ? ` ${String(request.note).trim()}` : ""}`,
        };
      });

      const vacationDelta = calculateVacationBalanceDelta({
        entryType: requestType,
        insertedCount: rowsToInsert.length,
        replacedRows: [],
      });
      let transactionVacationDays = vacationEntitlementDays(employee);
      const applyVacationDelta = async (deltaDays) => {
        const employeeAtCurrentBalance = {
          ...employee,
          vacation_entitlement_days: transactionVacationDays,
        };
        await changeVacationCurrentDays(employeeAtCurrentBalance, deltaDays, "", { recordAudit: false });
        transactionVacationDays = roundVacationDays(transactionVacationDays + deltaDays);
      };

      await replaceTimeOffEntriesSafely({
        client: supabase,
        rowsToInsert,
        deleteIds: [],
        vacationDelta,
        applyVacationDelta,
      });

      if (vacationDelta) {
        const changedDays = Math.abs(vacationDelta);
        await recordVacationAdjustment(
          employee,
          vacationDelta,
          `Urlaub freigegeben: ${changedDays} Tag${changedDays === 1 ? "" : "e"}`
        );
      }

      const { error: updateError } = await supabase
        .from("time_off_requests")
        .update({
          status: "approved",
          decided_by: String(session?.id || ""),
          decided_at: new Date().toISOString(),
          admin_note: adminNote.trim() || null,
        })
        .eq("id", request.id);
      if (updateError) throw updateError;

      setMessage(`${requestType === "za" ? "ZA" : "Urlaub"}-Antrag freigegeben.`);
      await loadTimeOff();
      await loadVacationAccount();
      await loadTimeOffRequests();
      window.dispatchEvent(new CustomEvent("hbz-time-off-requests-changed"));
    } catch (e) {
      console.error("[VacationEntry] approve request error", e);
      setError(e?.message || "Antrag konnte nicht freigegeben werden.");
    } finally {
      setTimeOffRequestBusyId("");
    }
  }

  async function rejectTimeOffRequest(request) {
    if (!isAdmin || !request?.id) return;
    if (!window.confirm("Antrag wirklich ablehnen?")) return;

    try {
      setTimeOffRequestBusyId(String(request.id));
      setError("");
      setMessage("");
      const { error: updateError } = await supabase
        .from("time_off_requests")
        .update({
          status: "rejected",
          decided_by: String(session?.id || ""),
          decided_at: new Date().toISOString(),
          admin_note: null,
        })
        .eq("id", request.id);
      if (updateError) throw updateError;

      setMessage("Antrag abgelehnt.");
      await loadTimeOffRequests();
      window.dispatchEvent(new CustomEvent("hbz-time-off-requests-changed"));
    } catch (e) {
      console.error("[VacationEntry] reject request error", e);
      setError(e?.message || "Antrag konnte nicht abgelehnt werden.");
    } finally {
      setTimeOffRequestBusyId("");
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
      const vacationDelta = getEntryKind(row) === "urlaub" && emp ? ids.length : 0;
      let transactionVacationDays = emp ? vacationEntitlementDays(emp) : 0;
      const applyVacationDelta = async (deltaDays) => {
        const employeeAtCurrentBalance = {
          ...emp,
          vacation_entitlement_days: transactionVacationDays,
        };
        await changeVacationCurrentDays(employeeAtCurrentBalance, deltaDays, "", { recordAudit: false });
        transactionVacationDays = roundVacationDays(transactionVacationDays + deltaDays);
      };

      await deleteTimeOffEntriesSafely({
        client: supabase,
        ids,
        vacationDelta,
        applyVacationDelta,
      });

      if (vacationDelta) {
        await recordVacationAdjustment(
          emp,
          vacationDelta,
          `Urlaub gelöscht: ${ids.length} Tag${ids.length === 1 ? "" : "e"}`
        );
      }

      setMessage(`${kind}-Eintrag gelöscht.`);
      await loadTimeOff();
      await loadVacationAccount();
    } catch (e) {
      console.error("[VacationEntry] delete error", e);
      setError(e?.message || "Eintrag konnte nicht gelöscht werden.");
    }
  }

  return (
    <div className="page-wrap vacation-page">
      <section className="hero-card vacation-hero">
        <div className="vacation-hero-content">
          <div>
            <div className="eyebrow">Urlaub / Zeitausgleich</div>
            <h1>Abwesenheiten planen</h1>
            <p>
              Urlaub und Zeitausgleich eintragen, Resturlaub prüfen und die Planung des Teams im Blick behalten.
            </p>
          </div>
          <div className="vacation-legend" aria-label="Farblegende">
            <span className="vacation-legend-item vacation-legend-item--vac"><i />Urlaub</span>
            <span className="vacation-legend-item vacation-legend-item--sick"><i />Krank</span>
            <span className="vacation-legend-item vacation-legend-item--za"><i />Zeitausgleich</span>
          </div>
        </div>
      </section>

      <section className="month-card vacation-panel vacation-entry-panel" style={{ marginTop: 18 }}>
        <div className="vacation-section-head">
          <span className="vacation-section-icon" aria-hidden="true">＋</span>
          <div><div className="month-card-title">Abwesenheit eintragen</div><p className="hint">Zeitraum, Art und Mitarbeiter auswählen</p></div>
        </div>

        {error && <div className="hbz-alert hbz-alert-error">{error}</div>}
        {message && <div className="hbz-alert hbz-alert-ok">{message}</div>}

        {(isAdmin || visibleTimeOffRequests.length > 0) && (
          <div className="vacation-request-panel">
            <div className="vacation-request-head">
              <div>
                <div className="month-card-title">{isAdmin ? "Offene Freigaben" : "Meine Anträge"}</div>
                <p className="hint">
                  {isAdmin
                    ? "Urlaub und ZA werden erst nach deiner Freigabe in Zeiterfassung und Konto übernommen."
                    : "Deine Anträge werden vom Admin geprüft und danach freigegeben oder abgelehnt."}
                </p>
              </div>
              <div className="vacation-request-summary" aria-label="Antragsübersicht">
                {timeOffRequestsLoading ? (
                  <span className="badge-soft">lädt…</span>
                ) : (
                  <>
                    <span className="vacation-request-count strong">{timeOffRequestSummary.total}</span>
                    <span className="vacation-request-count vac">{timeOffRequestSummary.vacation} Urlaub</span>
                    <span className="vacation-request-count za">{timeOffRequestSummary.za} ZA</span>
                  </>
                )}
              </div>
            </div>

            {visibleTimeOffRequests.length === 0 ? (
              <div className="hint">Keine offenen Anträge.</div>
            ) : (
              <div className="vacation-request-list">
                {visibleTimeOffRequests.map((request) => {
                  const requestTypeLabel = request.entry_type === "za" ? "Zeitausgleich" : "Urlaub";
                  const busy = String(timeOffRequestBusyId) === String(request.id);
                  const requestStatusLabel =
                    request.status === "approved" ? "Freigegeben" :
                    request.status === "rejected" ? "Abgelehnt" :
                    "Offen";
                  return (
                    <div key={request.id} className={`vacation-request-row status-${request.status}`}>
                      <div className="vacation-request-body">
                        <div className="vacation-request-title">
                          <span className={`vac-pill ${request.entry_type === "za" ? "za" : "vac"}`}>{requestTypeLabel}</span>
                          <span className={`vacation-request-status status-${request.status}`}>{requestStatusLabel}</span>
                          <b>{request.employee ? getEmployeeLabel(request.employee) : `MA ${request.employee_id}`}</b>
                          {request.employee && (request.employee.active === false || request.employee.disabled === true) ? (
                            <span className="vacation-request-inactive">inaktiv</span>
                          ) : null}
                          <span className="vacation-request-date">{formatDateRangeAT(request.from_date, request.to_date)}</span>
                        </div>
                        <div className="hint">
                          <span className="vacation-request-meta-item">{request.daysCount} Tag{request.daysCount === 1 ? "" : "e"}</span>
                          {request.note ? ` · ${request.note}` : ""}
                          {request.admin_note ? ` · Admin: ${request.admin_note}` : ""}
                        </div>
                      </div>
                      {isAdmin && request.status === "pending" && (
                        <div className="vacation-request-actions">
                          <button type="button" className="hbz-chip active" onClick={() => approveTimeOffRequest(request)} disabled={busy}>
                            {busy ? "Läuft…" : "Freigeben"}
                          </button>
                          <button type="button" className="hbz-chip" onClick={() => rejectTimeOffRequest(request)} disabled={busy}>
                            Ablehnen
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="vacation-form-grid" style={{ marginTop: 12 }}>
          <label className="hbz-field">
            <span className="hbz-label">Von</span>
            <input className="hbz-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="hbz-field">
            <span className="hbz-label">Bis</span>
            <input className="hbz-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
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

        <details className="vacation-advanced">
          <summary>Notiz und weitere Optionen</summary>
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
        </details>
        <div className="vacation-primary-action">
          <span>
            {preview.length} {entryType === "za" ? "ZA-Tag" : "Urlaubstag"}{preview.length === 1 ? "" : "e"} vorbereitet
          </span>
          <button type="button" className="save-btn lg" onClick={saveTimeOff} disabled={saving || preview.length === 0 || !targetEmployee}>
            {saving
              ? "Speichere…"
              : isAdmin
                ? (entryType === "za" ? "Zeitausgleich eintragen" : "Urlaub eintragen")
                : (entryType === "za" ? "ZA-Antrag senden" : "Urlaubsantrag senden")}
          </button>
        </div>
      </section>

      {targetEmployee && vacationAccount && (
        <section className="month-card vacation-panel vacation-account-panel" style={{ marginTop: 18 }}>
          <div className="vacation-section-head">
            <span className="vacation-section-icon vacation-section-icon--account" aria-hidden="true">◎</span>
            <div><div className="month-card-title">Urlaubsstand {vacationAccountYear}</div><p className="hint">Aktueller Reststand des ausgewählten Mitarbeiters</p></div>
          </div>
          <p className="hint">Urlaub wird hier als aktueller Reststand in ganzen Tagen geführt. Beim Eintragen von Urlaub wird der Stand reduziert.</p>
          <div className="vac-account-grid simple" style={{ marginTop: 10 }}>
            <div className="vac-account-box"><span>Mitarbeiter</span><b>{getEmployeeLabel(targetEmployee)}</b></div>
            <div className="vac-account-box strong"><span>Urlaubsanspruch aktuell</span><b>{vacationAccountLoading ? "lädt…" : fmtDays(vacationAccount.currentDays)}</b></div>
          </div>
          {isAdmin && (
            <details className="vac-admin-details" style={{ marginTop: 12 }}>
              <summary>Admin: Urlaubsstand korrigieren</summary>
              <div className="hbz-grid-2" style={{ marginTop: 12 }}>
                <label className="hbz-field">
                  <span className="hbz-label">Korrektur Tage</span>
                  <input className="hbz-input" value={vacationAdjustDays} onChange={(e) => setVacationAdjustDays(e.target.value)} placeholder="z. B. +2 oder -1" />
                </label>
                <label className="hbz-field">
                  <span className="hbz-label">Notiz</span>
                  <input className="hbz-input" value={vacationAdjustNote} onChange={(e) => setVacationAdjustNote(e.target.value)} placeholder="z. B. BUAK-Stand korrigiert" />
                </label>
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" className="hbz-chip active" onClick={saveVacationAdjustment} disabled={vacationAdjustSaving}>
                    {vacationAdjustSaving ? "Speichere…" : "Urlaubsstand korrigieren"}
                  </button>
                </div>
              </div>
            </details>
          )}
        </section>
      )}

      <details className="month-card vacation-panel vacation-collapsible" style={{ marginTop: 18 }}>
        <summary>
          <span className="vacation-section-icon vacation-section-icon--calendar" aria-hidden="true">▦</span>
          <span><b>BUAK-Arbeitsmodell</b><small>Kurze und lange Wochen anzeigen</small></span>
        </summary>
        <div className="vacation-collapsible-body">
          <p className="hint">Kurze Freitage sind frei/0 h, Feiertage werden markiert.</p>
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
        </div>
      </details>

      <section className="month-card vacation-panel vacation-preview-panel" style={{ marginTop: 18 }}>
        <div className="vacation-section-head">
          <span className="vacation-section-icon vacation-section-icon--preview" aria-hidden="true">✓</span>
          <div><div className="month-card-title">Vorschau</div><p className="hint">Vor dem Speichern nochmals kontrollieren</p></div>
        </div>
        <p className="hint">
          Es werden {preview.length} {entryType === "za" ? "ZA-Tag" : "Urlaubstag"}{preview.length === 1 ? "" : "e"} vorbereitet.
          Bestehende Einträge werden nicht überschrieben, außer es ist ausdrücklich aktiviert.
        </p>
        <details className="vacation-preview-details">
          <summary>{previewDisplayRows.length} Wochenblock{previewDisplayRows.length === 1 ? "" : "e"} im Detail prüfen</summary>
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
        </details>
        {preview.length > previewDisplayRows.reduce((sum, row) => sum + row.rows.length, 0) && <p className="hint">Vorschau gekürzt. Gespeichert werden trotzdem alle vorbereiteten Tage.</p>}
      </section>

      <section className="month-card vacation-panel vacation-calendar-panel" style={{ marginTop: 18 }}>
        <div className="vacation-calendar-head">
          <div>
            <div className="month-card-title">Abwesenheitskalender</div>
            <p className="hint" style={{ marginTop: 4 }}>
              Urlaub, Krankenstand und Zeitausgleich aller Mitarbeiter auf einen Blick.
            </p>
          </div>
          <div className="vac-month-controls">
            <button type="button" className="hbz-chip" aria-label="Vorherigen Monat anzeigen" onClick={() => shiftCalendarMonth(-1)}>← Monat</button>
            <input
              className="hbz-input vac-month-input"
              type="month"
              aria-label="Kalendermonat auswählen"
              value={calendarMonth}
              onChange={(e) => setCalendarMonth(e.target.value)}
            />
            <button type="button" className="hbz-chip" aria-label="Nächsten Monat anzeigen" onClick={() => shiftCalendarMonth(1)}>Monat →</button>
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
                    {day.sick.length > 0 && (
                      <div className="vac-month-line">
                        <span className="vac-pill sick">Krank</span>
                        <strong>{day.sick.map((r) => r.employee?.name).filter(Boolean).join(", ")}</strong>
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

      <details className="month-card vacation-panel vacation-collapsible vacation-table-panel" style={{ marginTop: 18 }}>
        <summary>
          <span className="vacation-section-icon vacation-section-icon--team" aria-hidden="true">●</span>
          <span><b>Listenansicht und Verwaltung</b><small>Einträge prüfen oder löschen</small></span>
        </summary>
        <div className="vacation-collapsible-body">
          <p className="hint">Löschen ist nur beim eigenen Eintrag möglich; Admin kann alle Einträge löschen.</p>
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
                <tr><td colSpan={7}>In diesem Zeitraum ist keine Abwesenheit eingetragen.</td></tr>
              ) : (
                timeOffDisplayRows.map((row) => {
                  const own = sameEmployee(row.employee, session);
                  const kind = row.kind || getEntryKind(row);
                  const allowed = kind !== "krank" && (isAdmin || own);
                  const weekLabel = weekRangeLabel(row.from_date || row.work_date, row.to_date || row.work_date);
                  const mixed = weekLabel === "gemischt";
                  return (
                    <tr key={`${row.employee_id}-${kind}-${row.from_date}-${row.to_date}-${row.cleanNote || ""}`} className={own ? "vac-own-row" : ""}>
                      <td>{formatDateRangeAT(row.from_date || row.work_date, row.to_date || row.work_date)}</td>
                      <td>{row.employee?.name || "—"}</td>
                      <td><span className={`vac-pill ${kind === "za" ? "za" : kind === "krank" ? "sick" : "vac"}`}>{kind === "za" ? "Zeitausgleich" : kind === "krank" ? "Krank" : "Urlaub"}</span></td>
                      <td><span className={`vac-pill ${mixed ? "mixed" : weekLabel === "Kurzwoche" ? "short" : "long"}`}>{weekLabel}</span></td>
                      <td>{kind === "za" ? fmtHours(row.za_hours) : "—"}</td>
                      <td>{row.cleanNote || "—"}</td>
                      <td>
                        {allowed ? (
                          <button type="button" className="hbz-mini-danger" onClick={() => deleteTimeOff(row)}>{isAdmin && !own ? "Eintrag löschen" : "Eigenen Eintrag löschen"}</button>
                        ) : (
                          <span className="hint">{kind === "krank" ? "über Zeiterfassung verwalten" : "nur Anzeige"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            </table>
          </div>
        </div>
      </details>

      <style>{`
        .vacation-page { --vac-blue: #426ca9; --vac-blue-soft: #edf3ff; --vac-sick: #a54f5f; --vac-sick-soft: #fff0f3; --vac-gold: #a97924; --vac-gold-soft: #fff6dc; display: flex; flex-direction: column; gap: 2px; }
        .vacation-hero { position: relative; overflow: hidden; padding-top: 18px; padding-bottom: 18px; background: linear-gradient(135deg, #6f4327 0%, #a36f47 58%, #c29669 100%); color: #fffaf4; border: 0; box-shadow: 0 18px 34px rgba(97,60,36,.22); }
        .vacation-hero::after { content: ""; position: absolute; width: 270px; height: 270px; right: -70px; top: -165px; border: 46px solid rgba(255,255,255,.08); border-radius: 50%; pointer-events: none; }
        .vacation-hero-content { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
        .vacation-hero h1 { margin: 3px 0 6px; color: #fff; font-size: 26px; }
        .vacation-hero p { max-width: 680px; margin: 0; color: rgba(255,250,244,.88); font-size: 14px; line-height: 1.55; }
        .vacation-legend { display: flex; gap: 8px; flex-wrap: wrap; }
        .vacation-legend-item { display: inline-flex; align-items: center; gap: 7px; padding: 8px 11px; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; font-size: 12px; font-weight: 800; backdrop-filter: blur(8px); }
        .vacation-legend-item i { width: 9px; height: 9px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px rgba(255,255,255,.15); }
        .vacation-legend-item--vac { color: #dbe8ff; }
        .vacation-legend-item--sick { color: #ffd8df; }
        .vacation-legend-item--za { color: #ffe8a4; }
        .vacation-panel { position: relative; overflow: hidden; border: 1px solid rgba(190,164,136,.36); box-shadow: 0 12px 30px rgba(71,46,27,.07); background: rgba(255,255,255,.94); }
        .vacation-panel::before { width: 4px; background: linear-gradient(180deg, #9b6b45, #d0ab82); }
        .vacation-entry-panel::before { background: linear-gradient(180deg, var(--vac-blue), var(--vac-gold)); }
        .vacation-account-panel::before { background: #4f8a64; }
        .vacation-preview-panel::before { background: #637b9b; }
        .vacation-calendar-panel::before, .vacation-table-panel::before { background: #8c684d; }
        .vacation-section-head { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
        .vacation-section-head .month-card-title { margin: 0 0 2px; }
        .vacation-section-head .hint { margin: 0; }
        .vacation-section-icon { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; border-radius: 12px; color: var(--vac-blue); background: var(--vac-blue-soft); border: 1px solid rgba(66,108,169,.18); font-size: 20px; font-weight: 900; }
        .vacation-section-icon--account { color: #39734d; background: #edf8f0; border-color: rgba(57,115,77,.18); }
        .vacation-section-icon--calendar { color: #8b5f36; background: #fff5e8; border-color: rgba(139,95,54,.18); }
        .vacation-section-icon--preview { color: #506b91; background: #edf2f8; border-color: rgba(80,107,145,.18); }
        .vacation-section-icon--team { color: #6f503a; background: #f5ece4; border-color: rgba(111,80,58,.18); font-size: 12px; }
        .vacation-calendar-head { display: flex; justify-content: space-between; gap: 14px; align-items: center; flex-wrap: wrap; }
        .vacation-form-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .vacation-advanced, .vacation-preview-details { margin-top: 14px; border: 1px solid rgba(92,68,45,.14); border-radius: 14px; background: rgba(250,246,240,.72); }
        .vacation-advanced > summary, .vacation-preview-details > summary { padding: 10px 12px; cursor: pointer; color: #6b4b34; font-size: 12px; font-weight: 900; list-style-position: inside; }
        .vacation-advanced[open], .vacation-preview-details[open] { padding-bottom: 12px; }
        .vacation-advanced[open] > :not(summary), .vacation-preview-details[open] > :not(summary) { margin-left: 12px; margin-right: 12px; }
        .vacation-collapsible { padding: 0; }
        .vacation-collapsible > summary { display: flex; align-items: center; gap: 11px; padding: 14px 16px; cursor: pointer; list-style: none; }
        .vacation-collapsible > summary::-webkit-details-marker { display: none; }
        .vacation-collapsible > summary::after { content: "+"; margin-left: auto; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #f3e8dc; color: #6f4a30; font-size: 18px; font-weight: 800; }
        .vacation-collapsible[open] > summary::after { content: "−"; }
        .vacation-collapsible > summary span:nth-child(2) { min-width: 0; }
        .vacation-collapsible > summary b, .vacation-collapsible > summary small { display: block; }
        .vacation-collapsible > summary b { color: #493321; font-size: 14px; }
        .vacation-collapsible > summary small { margin-top: 2px; color: #806957; font-size: 11px; }
        .vacation-collapsible-body { padding: 0 16px 16px; border-top: 1px solid rgba(92,68,45,.1); }
        .vacation-primary-action { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(92,68,45,.12); }
        .vacation-primary-action span { color: #75604f; font-size: 12px; font-weight: 800; }
        .hbz-alert { border-radius: 12px; padding: 10px 12px; margin: 10px 0; font-weight: 700; }
        .hbz-alert-error { border: 1px solid #ff8b8b; background: #fff5f5; color: #8a1f1f; }
        .hbz-alert-ok { border: 1px solid #9bd3a6; background: #f2fff5; color: #1d6a30; }
        .vacation-request-panel { margin: 12px 0 16px; padding: 14px; border: 1px solid rgba(91,126,166,.24); border-radius: 18px; background: linear-gradient(180deg, #f8fbff, #f1f6fb); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); }
        .vacation-request-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
        .vacation-request-summary { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; min-width: 150px; }
        .vacation-request-count { display: inline-flex; align-items: center; justify-content: center; min-height: 26px; padding: 4px 9px; border-radius: 999px; border: 1px solid rgba(91,126,166,.16); background: #fff; color: #526980; font-size: 12px; font-weight: 900; white-space: nowrap; }
        .vacation-request-count.strong { min-width: 32px; background: #456f9d; color: #fff; border-color: rgba(69,111,157,.2); }
        .vacation-request-count.vac { background: var(--vac-blue-soft); color: #294f88; }
        .vacation-request-count.za { background: var(--vac-gold-soft); color: #795100; }
        .vacation-request-list { display: grid; gap: 9px; }
        .vacation-request-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 11px 12px; border: 1px solid rgba(91,126,166,.18); border-radius: 14px; background: #fff; box-shadow: 0 8px 18px rgba(61,82,105,.06); }
        .vacation-request-row.status-approved { border-color: rgba(60,140,80,.28); background: #f7fff8; }
        .vacation-request-row.status-rejected { border-color: rgba(170,80,80,.28); background: #fff8f8; }
        .vacation-request-body { min-width: 0; }
        .vacation-request-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #493321; }
        .vacation-request-status { display: inline-flex; align-items: center; min-height: 22px; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 900; letter-spacing: .01em; }
        .vacation-request-status.status-pending { background: #fff8e8; color: #8b5f00; border: 1px solid rgba(139,95,0,.14); }
        .vacation-request-status.status-approved { background: #eaf8ee; color: #236b36; border: 1px solid rgba(35,107,54,.16); }
        .vacation-request-status.status-rejected { background: #fff0f0; color: #943030; border: 1px solid rgba(148,48,48,.16); }
        .vacation-request-inactive { display: inline-flex; align-items: center; min-height: 21px; padding: 3px 7px; border-radius: 999px; background: #f1eee9; color: #7d6756; border: 1px solid rgba(125,103,86,.16); font-size: 11px; font-weight: 900; }
        .vacation-request-date { color: #6f5745; font-size: 12px; font-weight: 800; }
        .vacation-request-meta-item { font-weight: 900; color: #5d7287; }
        .vacation-request-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .hint { color: #7d6756; font-size: 12px; }
        .hbz-info-line { border: 1px solid rgba(92, 68, 45, 0.16); background: rgba(255,255,255,0.62); border-radius: 12px; padding: 10px 12px; color: #4c3727; }
        .table-scroll { overflow-x: auto; }
        .hbz-table.compact th, .hbz-table.compact td { padding: 8px 10px; white-space: nowrap; }
        .vac-week-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-top: 12px; }
        .vac-week-card { border: 1px solid rgba(92, 68, 45, 0.14); border-radius: 16px; padding: 12px; background: rgba(255,255,255,0.78); box-shadow: 0 5px 14px rgba(63,42,27,.04); }
        .vac-week-card.short { background: linear-gradient(180deg, #f7fffa, #edf8f1); border-color: rgba(79,138,100,.22); }
        .vac-week-card.long { background: linear-gradient(180deg, #fffcf8, #fff3e8); border-color: rgba(169,121,36,.2); }
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
        .vac-pill.vac { background: var(--vac-blue-soft); color: #294f88; border: 1px solid rgba(66,108,169,.16); }
        .vac-pill.sick { background: var(--vac-sick-soft); color: #8b3546; border: 1px solid rgba(165,79,95,.2); }
        .vac-pill.za { background: var(--vac-gold-soft); color: #795100; border: 1px solid rgba(169,121,36,.18); }
        .vac-pill.mixed { background: #f1edf8; color: #573a7d; }
        .vac-own-row { background: rgba(222, 242, 232, 0.62); }
        .hbz-mini-danger { border: 1px solid #d88; background: #fff4f4; color: #8a1f1f; border-radius: 999px; padding: 6px 10px; font-weight: 800; cursor: pointer; }
        .vac-month-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .vac-month-input { min-width: 150px; }
        .vac-month-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 8px; }
        .vac-month-day { border: 1px solid rgba(92, 68, 45, 0.12); border-radius: 16px; padding: 12px; background: rgba(255,255,255,0.78); display: grid; grid-template-columns: 130px 1fr; gap: 12px; align-items: start; transition: transform .16s ease, box-shadow .16s ease; }
        .vac-month-day:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(63,42,27,.07); }
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
        .vac-account-grid.simple { grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.2fr); }
        .vac-account-box { border: 1px solid rgba(92, 68, 45, 0.14); border-radius: 16px; background: rgba(255,255,255,0.78); padding: 13px 14px; }
        .vac-account-box span { display: block; color: #7d6756; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; }
        .vac-account-box b { display: block; margin-top: 4px; color: #2f2118; font-size: 16px; }
        .vac-account-box.strong { background: #f2fff5; border-color: #9bd3a6; }
        .vac-admin-details { border: 1px dashed rgba(92, 68, 45, 0.22); border-radius: 12px; padding: 9px 12px; background: rgba(255,255,255,0.45); }
        .vac-admin-details summary { cursor: pointer; color: #7d4a25; font-weight: 900; }
        @media (max-width: 720px) {
          .vacation-hero-content, .vacation-calendar-head { align-items: flex-start; flex-direction: column; }
          .vacation-legend, .vac-month-controls { width: 100%; }
          .vac-month-controls .hbz-chip { flex: 1; }
          .vac-month-input { flex: 1 1 100%; width: 100%; }
          .vac-account-grid.simple { grid-template-columns: 1fr; }
          .vacation-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .vacation-primary-action { align-items: stretch; flex-direction: column; }
          .vacation-primary-action .save-btn { width: 100%; }
          .vacation-request-head, .vacation-request-row { align-items: stretch; flex-direction: column; }
          .vacation-request-summary, .vacation-request-actions { justify-content: flex-start; width: 100%; }
          .vacation-request-actions .hbz-chip { flex: 1; justify-content: center; }
          .vac-month-day { grid-template-columns: 1fr; }
          .vac-day-row { gap: 4px; }
          .vac-day { min-height: 50px; padding: 6px 3px; font-size: 12px; }
        }

        @media (max-width: 480px) {
          .vacation-form-grid { grid-template-columns: 1fr; }
          .vacation-hero p { display: none; }
          .vacation-panel { padding: 14px; }
          .vacation-collapsible { padding: 0; }
        }

        .hbz-mini-danger:hover { background: #ffe8e8; }
      `}</style>
    </div>
  );
}
