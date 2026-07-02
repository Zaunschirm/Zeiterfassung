import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { deleteTimeEntry } from "../lib/timeEntries";
import {
  getBuakWeekType,
  getBuakSollHoursForWeek,
  calcBuakSollHoursForMonth,
  getBuakSollHoursForDay,
  getHolidayName,
  getEmployeeSollHoursForDay,
  calcEmployeeSollHoursForRange,
} from "../utils/time";
import {
  getMonthLock,
  setMonthLocked,
  ensureMonthUnlocked,
  formatYearMonthAT,
} from "../utils/monthLock";
import {
  isAbsenceEntry,
  isSickEntry,
  isTimeCompEntry,
  isVacationEntry,
} from "../utils/timeEntryAbsences";
import {
  auditDisplayValue,
  auditFieldLabel,
  buildAuditEntrySummary,
  buildDeleteAuditRows,
  buildUpdateAuditRows,
} from "../utils/timeAudit";
import { filterVisibleEmployeesForRole, isTestEmployee } from "../utils/employeeVisibility";
import { calculateZaBalanceDelta, calculateZaBalanceForEmployee, isOfficialZaStartAdjustment } from "../utils/overtime";
import { collectSupabaseRows } from "../utils/pagination";

async function loadPdfLibs() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const autoTable = autoTableModule.default || autoTableModule.autoTable;
  if (typeof jsPDF !== "function" || typeof autoTable !== "function") {
    throw new Error("PDF-Bibliothek konnte nicht vollständig geladen werden.");
  }
  return { jsPDF, autoTable };
}

// ---------- Utils ----------
const toHM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(
    2,
    "0"
  )}`;

const hmToMin = (hm) => {
  if (!hm) return 0;
  const [h, m] = String(hm)
    .split(":")
    .map((x) => parseInt(x || "0", 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

const h2 = (m) => Math.round((m / 60) * 100) / 100;

const getTravel = (e) => e.travel_minutes ?? e.travel_min ?? 0;

const parsePrivatePkwKm = (value) => {
  const normalized = String(value ?? "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 10) / 10;
};

const formatPrivatePkwKm = (value) => {
  const km = parsePrivatePkwKm(value);
  return km > 0 ? `${km.toLocaleString("de-AT")} km` : "—";
};


function parseHoursValue(value) {
  if (value === null || typeof value === "undefined") return 0;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatSignedHours(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function formatNumberAT(value, digits = 2) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  return n.toLocaleString("de-AT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatHoursAT(value) {
  return `${formatNumberAT(value)} h`;
}

function formatSignedHoursAT(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatNumberAT(n)} h`;
}

function formatDaysAT(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function dateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function dateToDayNumber(value) {
  const d = dateOnly(value);
  const parts = d.split("-").map((v) => Number(v));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return NaN;
  const [year, month, day] = parts;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dayNumberToDate(dayNumber) {
  return new Date(dayNumber * 86400000).toISOString().slice(0, 10);
}

function isOnOrAfterStartDate(dateValue, startDate) {
  if (!startDate) return true;
  if (!dateValue) return true;
  return String(dateValue).slice(0, 10) >= String(startDate).slice(0, 10);
}

const parseZaHours = (value) => {
  const normalized = String(value ?? "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
};

const formatZaHours = (value) => {
  const hrs = parseZaHours(value);
  return hrs > 0 ? `${hrs.toFixed(2).replace(".", ",")} h` : "—";
};

const entryMinutes = (e) => {
  const start = e.start_min ?? e.from_min ?? 0;
  const end = e.end_min ?? e.to_min ?? 0;
  const pause = e.break_min || 0;
  const work = Math.max(end - start - pause, 0);
  const travel = getTravel(e);
  return work + (travel || 0);
};

function parseYMD(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return { week: weekNo, year: dt.getUTCFullYear() };
}

const weekKey = (ymd) => {
  const id = isoWeek(parseYMD(ymd));
  return `${id.year}-W${String(id.week).padStart(2, "0")}`;
};

function getMonthRange(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  const lastDay = new Date(y, m, 0).getDate();
  return {
    year: y,
    month: m,
    from: `${y}-${ym.slice(5)}-01`,
    to: `${y}-${ym.slice(5)}-${String(lastDay).padStart(2, "0")}`,
  };
}

function compareMonthStrings(a, b) {
  if (!a || !b) return 0;
  return a.localeCompare(b);
}

function getMonthListBetween(fromYm, toYm) {
  if (!fromYm || !toYm) return [];

  const [fromY, fromM] = fromYm.split("-").map(Number);
  const [toY, toM] = toYm.split("-").map(Number);

  const out = [];
  let y = fromY;
  let m = fromM;

  while (y < toY || (y === toY && m <= toM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out;
}

function getRangeFromFilters(year, monthFilter, rangeFromMonth, rangeToMonth) {
  const fromRange = getMonthRange(rangeFromMonth);
  const toRange = getMonthRange(rangeToMonth);
  const singleMonth = getMonthRange(monthFilter);

  if (fromRange && toRange) {
    const isNormalOrder = compareMonthStrings(rangeFromMonth, rangeToMonth) <= 0;
    const useFrom = isNormalOrder ? fromRange : toRange;
    const useTo = isNormalOrder ? toRange : fromRange;
    const fromYm = isNormalOrder ? rangeFromMonth : rangeToMonth;
    const toYm = isNormalOrder ? rangeToMonth : rangeFromMonth;

    return {
      mode: "range",
      from: useFrom.from,
      to: useTo.to,
      label: `${fromYm} bis ${toYm}`,
      yearForBuak: null,
      monthList: getMonthListBetween(fromYm, toYm),
    };
  }

  if (singleMonth) {
    return {
      mode: "month",
      from: singleMonth.from,
      to: singleMonth.to,
      label: `Monat ${monthFilter}`,
      yearForBuak: singleMonth.year,
      monthList: [monthFilter],
    };
  }

  return {
    mode: "year",
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    label: `Jahr ${year}`,
    yearForBuak: year,
    monthList: Array.from(
      { length: 12 },
      (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`
    ),
  };
}


function getDatesBetweenInclusive(from, to) {
  const out = [];
  const start = parseYMD(from);
  const end = parseYMD(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return out;

  const d = new Date(start);
  while (d <= end) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function safePdfText(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function formatDateAT(ymd) {
  if (!ymd) return "";
  const parts = String(ymd).split("-");
  if (parts.length !== 3) return String(ymd);
  const [y, m, d] = parts;
  if (!y || !m || !d) return String(ymd);
  return `${d}.${m}.${y}`;
}

function formatDateTimeAT(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

const asAuditIdOrNull = (value) => {
  const text = value == null ? "" : String(value).trim();
  return text || null;
};

function uniqueSortedDates(arr) {
  return Array.from(new Set(arr || []))
    .filter(Boolean)
    .sort();
}

const isAbsenceRow = isAbsenceEntry;

const isPayrollCheckEmployee = () => true;

const isBadWeatherRow = (r) => r?.bad_weather === true || r?.bad_weather === "true";
const stripAbsencePrefix = (note) =>
  String(note || "")
    .replace(/^\s*\[(Urlaub|Krank|Zeitausgleich|Schlechtwetter)\]\s*/i, "")
    .trim();
const rowWorkMinutes = (r) => Math.max((r.start_min ?? r.from_min ?? 0) - 0, 0) && Math.max((r.end_min ?? r.to_min ?? 0) - (r.start_min ?? r.from_min ?? 0) - (r.break_min || 0), 0);
const getProjectAddress = (r, projects = []) => {
  const prj = projects.find((p) => String(p.id) === String(r.project_id));
  return r.project_address || r.address || r.project_address_text || prj?.address || prj?.adresse || prj?.site_address || "—";
};

const isVacationRow = isVacationEntry;
const isSickRow = isSickEntry;
const isTimeCompRow = isTimeCompEntry;

const getPureWorkMinutes = (r) => {
  const total = r?._mins ?? entryMinutes(r);
  const travel = r?._travel ?? getTravel(r);
  return Math.max(total - travel, 0);
};

const isActiveEmployee = (e) => e?.disabled !== true && e?.active !== false;

// ---------- Component ----------
export default function MonthlyOverview() {
  const session = getSession()?.user || null;
  const role = (session?.role || "mitarbeiter").toLowerCase();
  const isAdmin = role === "admin";
  const isManager = role === "admin" || role === "teamleiter";
  const isStaff = !isManager;
  const isBuVwRole = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return ["buchhaltung", "verwaltung", "bu/vw", "bu_vw", "buvw"].includes(normalized);
  };
  const filterEmployeesForCurrentUser = (list = []) => {
    const visibleWithoutTests = filterVisibleEmployeesForRole(list, role);
    if (isAdmin) return list;
    if (isBuVwRole(role)) {
      return visibleWithoutTests.filter((emp) =>
        (session?.id != null && String(emp.id) === String(session.id)) ||
        (session?.code && String(emp.code) === String(session.code))
      );
    }
    return visibleWithoutTests.filter((emp) => !isBuVwRole(emp?.role));
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
  const previousMonthStr = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const [year, setYear] = useState(currentYear);
  const [monthFilter, setMonthFilter] = useState(currentMonthStr);
  const [rangeFromMonth, setRangeFromMonth] = useState("");
  const [rangeToMonth, setRangeToMonth] = useState("");
  const [monthLockMonth, setMonthLockMonth] = useState(previousMonthStr);

  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState(
    isStaff ? [session?.code].filter(Boolean) : []
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editState, setEditState] = useState(null);
  const [showMissingDialog, setShowMissingDialog] = useState(false);
  const [missingEntries, setMissingEntries] = useState(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [showPayrollCheck, setShowPayrollCheck] = useState(false);
  const [payrollCheck, setPayrollCheck] = useState(null);
  const [payrollCheckLoading, setPayrollCheckLoading] = useState(false);
  const [showPayrollEmployeeDialog, setShowPayrollEmployeeDialog] = useState(false);
  const [payrollCheckEmployeeIds, setPayrollCheckEmployeeIds] = useState([]);
  const [showPayrollExportDialog, setShowPayrollExportDialog] = useState(false);
  const [payrollExportEmployeeIds, setPayrollExportEmployeeIds] = useState([]);
  const [payrollExportLoading, setPayrollExportLoading] = useState(false);
  const [monthLockInfo, setMonthLockInfo] = useState(null);
  const [monthLockLoading, setMonthLockLoading] = useState(false);
  const [payrollCloseout, setPayrollCloseout] = useState(null);
  const [payrollCloseoutLoading, setPayrollCloseoutLoading] = useState(false);
  const [payrollCloseoutBusy, setPayrollCloseoutBusy] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const selectedEmployees = useMemo(
    () => employees.filter((e) => selectedCodes.includes(e.code)),
    [employees, selectedCodes]
  );

  const employeesById = useMemo(() => {
    const map = {};
    employees.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [employees]);

  const payrollCandidateEmployees = useMemo(
    () =>
      employees
        .filter(isActiveEmployee)
        .filter((employee) => !isTestEmployee(employee))
        .sort((a, b) => (a.name || a.code || "").localeCompare(b.name || b.code || "")),
    [employees]
  );


  useEffect(() => {
    (async () => {
      if (isManager) {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .order("name", { ascending: true });

        if (!error) {
          const visibleEmployees = filterEmployeesForCurrentUser(data || []);
          setEmployees(visibleEmployees);
          if (visibleEmployees.length && selectedCodes.length === 0) {
            if (session?.code) {
              const me = visibleEmployees.find((e) => e.code === session.code);
              if (me) {
                setSelectedCodes([me.code]);
              } else {
                setSelectedCodes(visibleEmployees.map((e) => e.code));
              }
            } else {
              setSelectedCodes(visibleEmployees.map((e) => e.code));
            }
          }
        }
      } else {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .eq("code", session?.code)
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          setEmployees([data]);
          setSelectedCodes([data.code]);
        }
      }

      const tryList = async (source) => {
        const { data, error } = await supabase
          .from(source)
          .select("*")
          .order("name", { ascending: true });
        if (error) return { ok: false, data: [] };
        return { ok: true, data: data || [] };
      };

      let prj = await tryList("projects");
      if (!prj.ok || prj.data.length === 0) {
        for (const fb of ["v_projects", "projects_view", "projects_all"]) {
          const r = await tryList(fb);
          if (r.ok && r.data.length > 0) {
            prj = r;
            break;
          }
        }
      }
      setProjects((prj.data || []).filter((p) => p?.disabled !== true));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, role, session?.id, session?.code]);

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthFilter, rangeFromMonth, rangeToMonth, selectedCodes, selectedProjectId, isManager, employees.length]);

  async function loadMonth() {
    try {
      setLoading(true);

      const range = getRangeFromFilters(
        year,
        monthFilter,
        rangeFromMonth,
        rangeToMonth
      );
      const from = range.from;
      const to = range.to;

      let ids = [];
      if (isManager) {
        ids = employees
          .filter((e) => selectedCodes.includes(e.code))
          .map((e) => e.id);

        if (!ids.length) {
          setRows([]);
          setLoading(false);
          return;
        }
      }

      const buildMonthQuery = (withEmployeeName = true) => {
        let query = supabase
          .from("v_time_entries_expanded")
          .select("*")
          .gte("work_date", from)
          .lte("work_date", to);

        if (isManager) {
          query = query.in("employee_id", ids);
        } else {
          const me = employees[0];
          if (me?.id) query = query.eq("employee_id", me.id);
        }
        if (selectedProjectId) query = query.eq("project_id", selectedProjectId);
        if (withEmployeeName) query = query.order("employee_name", { ascending: true });
        return query.order("work_date", { ascending: true }).order("id", { ascending: true });
      };

      let loadedRows;
      try {
        loadedRows = await collectSupabaseRows(() => buildMonthQuery(true));
      } catch (error) {
        if (error?.code !== "42703") throw error;
        loadedRows = await collectSupabaseRows(() => buildMonthQuery(false));
      }
      setRows(loadedRows);
    } catch (e) {
      console.error("month load error:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadMonth();
      }
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRange = useMemo(
    () => getRangeFromFilters(year, monthFilter, rangeFromMonth, rangeToMonth),
    [year, monthFilter, rangeFromMonth, rangeToMonth]
  );

  const payrollCheckRange = useMemo(() => {
    const ym = previousMonthStr;
    const range = getMonthRange(ym);
    return {
      ...range,
      mode: "month",
      label: `Vormonat ${ym}`,
      yearForBuak: range?.year || currentYear,
      monthList: [ym],
    };
  }, [previousMonthStr, currentYear]);

  const monthLockRange = useMemo(() => {
    const range = getMonthRange(monthLockMonth);
    return range
      ? { ...range, mode: "month", label: `Monat ${monthLockMonth}`, monthList: [monthLockMonth] }
      : null;
  }, [monthLockMonth]);

  async function refreshMonthLockInfo() {
    try {
      if (!monthLockRange?.from) return;
      const info = await getMonthLock(supabase, monthLockRange.from);
      setMonthLockInfo(info);
    } catch (err) {
      console.warn("[MonthlyOverview] Monatssperre laden:", err);
      setMonthLockInfo(null);
    }
  }

  useEffect(() => {
    refreshMonthLockInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthLockRange?.from]);

  useEffect(() => {
    if (!isAdmin || payrollCandidateEmployees.length === 0) return;
    loadPayrollCloseoutStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, payrollCheckRange?.from, payrollCandidateEmployees.length]);

  function useVisibleMonthForLock() {
    const ym = monthFilter || activeRange?.from?.slice(0, 7) || previousMonthStr;
    if (getMonthRange(ym)) setMonthLockMonth(ym);
  }

  async function toggleMonthLock() {
    if (!isAdmin || !monthLockRange?.from) return;

    const isLocked = !!monthLockInfo?.locked;
    const ym = monthLockRange.from.slice(0, 7);
    const question = isLocked
      ? `Monat ${formatYearMonthAT(ym)} wirklich entsperren? Danach sind Änderungen wieder möglich.`
      : `Monat ${formatYearMonthAT(ym)} wirklich sperren? Danach können Mitarbeiter/Teamleiter keine Einträge mehr ändern.`;

    if (!window.confirm(question)) return;

    try {
      setMonthLockLoading(true);
      const actorId = typeof session?.id === "string" && session.id.includes("-") ? session.id : null;
      const info = await setMonthLocked(
        supabase,
        ym,
        !isLocked,
        actorId,
        !isLocked ? "Monat durch Admin abgeschlossen" : "Monat durch Admin entsperrt"
      );
      setMonthLockInfo(info);
      alert(!isLocked ? `Monat ${formatYearMonthAT(ym)} wurde gesperrt.` : `Monat ${formatYearMonthAT(ym)} wurde entsperrt.`);
    } catch (err) {
      console.error("Monatssperre Fehler:", err);
      alert(`Monatssperre Fehler:\n${err?.message || err}`);
    } finally {
      setMonthLockLoading(false);
    }
  }


  const rangeLabel = useMemo(() => activeRange.label, [activeRange]);

  function handleCurrentMonth() {
    setYear(currentYear);
    setRangeFromMonth("");
    setRangeToMonth("");
    setMonthFilter(currentMonthStr);
  }

  function handleLastMonth() {
    const d = new Date(currentYear, currentMonth - 1, 1);
    d.setMonth(d.getMonth() - 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setYear(d.getFullYear());
    setRangeFromMonth("");
    setRangeToMonth("");
    setMonthFilter(ym);
  }

  function handleLast3Months() {
    const end = currentMonthStr;
    const d = new Date(currentYear, currentMonth - 1, 1);
    d.setMonth(d.getMonth() - 2);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setYear(d.getFullYear());
    setMonthFilter("");
    setRangeFromMonth(start);
    setRangeToMonth(end);
  }

  function handleCurrentYear() {
    setYear(currentYear);
    setMonthFilter("");
    setRangeFromMonth("");
    setRangeToMonth("");
  }

  const grouped = useMemo(() => {
    const g = {};
    for (const r of rows) {
      const key = `${r.employee_name || r.employee_id}||${r.work_date}`;
      const mins = entryMinutes(r);
      const travel = getTravel(r);

      if (!g[key]) {
        g[key] = {
          ...r,
          _mins: 0,
          _travel: 0,
          _zaHours: 0,
          items: [],
        };
      }

      g[key]._mins += mins;
      g[key]._travel += travel || 0;
      g[key]._zaHours += parseZaHours(r.za_hours);
      g[key].items.push(r);
    }

    return Object.values(g).sort(
      (a, b) =>
        (a.employee_name || "").localeCompare(b.employee_name || "") ||
        a.work_date.localeCompare(b.work_date)
    );
  }, [rows]);

  const weekly = useMemo(() => {
    const w = {};
    for (const r of grouped) {
      const wk = weekKey(r.work_date);
      const emp = r.employee_name || r.employee_id;
      const key = `${emp}||${wk}`;

      if (!w[key]) {
        w[key] = {
          employee: emp,
          weekKey: wk,
          firstDate: r.work_date,
          days: [],
          _mins: 0,
          _travel: 0,
        };
      }

      w[key].days.push(r);
      w[key]._mins += r._mins;
      w[key]._travel += r._travel;

      if (!w[key].firstDate || r.work_date < w[key].firstDate) {
        w[key].firstDate = r.work_date;
      }
    }

    return Object.values(w).sort(
      (a, b) =>
        a.employee.localeCompare(b.employee) ||
        a.weekKey.localeCompare(b.weekKey)
    );
  }, [grouped]);

  const totalsByEmployee = useMemo(() => {
    const t = {};
    for (const r of grouped) {
      const name = r.employee_name || r.employee_id;
      const hrs = h2(r._mins);
      const travelHrs = h2(r._travel);
      const ot = Math.max(hrs - 9, 0);

      if (!t[name]) t[name] = { hrs: 0, travel: 0, ot: 0, _days: new Set() };

      t[name].hrs += hrs;
      t[name].travel += travelHrs;
      t[name].ot += ot;

      if (!isAbsenceRow(r) && hrs > 0) {
        t[name]._days.add(r.work_date);
      }
    }

    Object.values(t).forEach((v) => {
      v.days = v._days ? v._days.size : 0;
      delete v._days;
    });

    return t;
  }, [grouped]);

  const monthTotals = useMemo(() => {
    let workPlusTravel = 0;
    let travel = 0;
    let privatePkwKm = 0;

    for (const r of grouped) {
      workPlusTravel += r._mins;
      travel += r._travel;
      privatePkwKm += parsePrivatePkwKm(r.private_pkw_km);
    }

    return {
      totalHrs: h2(workPlusTravel),
      travelHrs: h2(travel),
      privatePkwKm: Math.round(privatePkwKm * 10) / 10,
    };
  }, [grouped]);

  const badWeatherRows = useMemo(() => {
    return (rows || [])
      .filter(isBadWeatherRow)
      .map((r) => {
        const start = r.start_min ?? r.from_min ?? 0;
        const end = r.end_min ?? r.to_min ?? 0;
        const mins = r.bad_weather_minutes || rowWorkMinutes(r);
        return {
          ...r,
          _badWeatherStart: start,
          _badWeatherEnd: end,
          _badWeatherHours: h2(mins),
          _projectAddress: getProjectAddress(r, projects),
        };
      })
      .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)) || String(a.employee_name || "").localeCompare(String(b.employee_name || "")));
  }, [rows, projects]);

  function startEdit(row) {
    if (!isManager) return;

    const start = row.start_min ?? row.from_min ?? 0;
    const end = row.end_min ?? row.to_min ?? 0;

    setEditId(row.id);
    setEditState({
      id: row.id,
      employee_name: row.employee_name,
      work_date: row.work_date,
      project_id: row.project_id,
      from_hm: toHM(start),
      to_hm: toHM(end),
      break_min: row.break_min ?? 0,
      note: row.note ?? "",
      travel_minutes: getTravel(row) || 0,
      private_pkw_km: row.private_pkw_km ?? 0,
      za_hours: row.za_hours ?? 0,
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditState(null);
  }

  const auditSummary = (row) =>
    buildAuditEntrySummary(row, {
      fallbackDate: activeRange?.from,
      getEmployeeNameById,
      getProjectNameById,
      toHM,
    });

  const auditValue = (field, value) =>
    auditDisplayValue(field, value, {
      getProjectNameById,
      toHM,
    });

  async function insertAuditRows(rowsToInsert) {
    const cleaned = (rowsToInsert || []).filter(Boolean);
    if (!cleaned.length) return;
    const { error } = await supabase.from("time_entry_audit_log").insert(cleaned);
    if (error) console.warn("[MonthlyOverview] audit log:", error?.message || error);
  }

  async function writeUpdateAudit(oldRow, update) {
    const actor = asAuditIdOrNull(session?.id);
    const auditRows = buildUpdateAuditRows(oldRow, update, {
      actor,
      asUuidOrNull: asAuditIdOrNull,
      displayValue: auditValue,
    });
    await insertAuditRows(auditRows);
  }

  async function writeDeleteAudit(oldRow) {
    const actor = asAuditIdOrNull(session?.id);
    await insertAuditRows(buildDeleteAuditRows(oldRow, {
      actor,
      asUuidOrNull: asAuditIdOrNull,
      summary: auditSummary,
    }));
  }

  async function saveEdit() {
    if (!isManager || !editId || !editState) return;
    const oldRow = rows.find((r) => String(r.id) === String(editId));

    const from_m = hmToMin(editState.from_hm);
    const to_m = hmToMin(editState.to_hm);
    const br_m = parseInt(editState.break_min || "0", 10);
    const prj = projects.find((p) => p.id === editState.project_id) || null;

    const update = {
      project_id: prj ? prj.id : null,
      start_min: from_m,
      end_min: to_m,
      break_min: isNaN(br_m) ? 0 : br_m,
      note: (editState.note || "").trim() || null,
    };

    if (typeof editState.travel_minutes !== "undefined") {
      update.travel_minutes = parseInt(editState.travel_minutes || "0", 10);
    }

    if (typeof editState.private_pkw_km !== "undefined") {
      update.private_pkw_km = parsePrivatePkwKm(editState.private_pkw_km);
    }

    if (typeof editState.za_hours !== "undefined") {
      update.za_hours = parseZaHours(editState.za_hours);
    }

    try {
      await ensureMonthUnlocked(supabase, editState?.work_date || activeRange?.from);
    } catch (lockErr) {
      alert(lockErr?.message || "Dieser Monat ist gesperrt.");
      return;
    }

    const { error } = await supabase
      .from("time_entries")
      .update(update)
      .eq("id", editId);

    if (error) {
      console.error("update error:", error);
      alert("Aktualisieren fehlgeschlagen.");
      return;
    }

    await writeUpdateAudit(oldRow, update);
    await loadMonth();
    cancelEdit();
  }

  async function deleteEntry(id) {
    if (!isManager) return;
    const targetRow = rows.find((r) => String(r.id) === String(id));
    try {
      await ensureMonthUnlocked(supabase, targetRow?.work_date || activeRange?.from);
    } catch (lockErr) {
      alert(lockErr?.message || "Dieser Monat ist gesperrt.");
      return;
    }
    if (!confirm("Eintrag wirklich löschen?")) return;

    try {
      await deleteTimeEntry(supabase, id, { entry: targetRow });
      await writeDeleteAudit(targetRow);
    } catch (error) {
      console.error("delete error:", error);
      alert("Löschen fehlgeschlagen.");
      return;
    }

    await loadMonth();
  }

  function exportCSV() {
    const headers = [
      "Datum",
      "Mitarbeiter",
      "Projekt",
      "Start",
      "Ende",
      "Pause (min)",
      "Fahrzeit (min)",
      "Privat-PKW (km)",
      "Schlechtwetter",
      "Stunden (inkl. Fahrzeit)",
      "Überstunden",
      "Notiz",
    ];

    const lines = [headers.join(";")];

    for (const r of grouped) {
      const start = r.start_min ?? r.from_min ?? 0;
      const end = r.end_min ?? r.to_min ?? 0;
      const hrs = h2(r._mins);
      const ot = Math.max(hrs - 9, 0);

      lines.push(
        [
          r.work_date,
          r.employee_name || "",
          r.project_name || "",
          toHM(start),
          toHM(end),
          r.break_min ?? 0,
          r._travel ?? 0,
          parsePrivatePkwKm(r.private_pkw_km).toString().replace(".", ","),
          isBadWeatherRow(r) ? "Ja" : "",
          hrs.toFixed(2),
          ot.toFixed(2),
          (r.note || "").replace(/[\r\n;]/g, " "),
        ].join(";")
      );
    }

    lines.push(
      [
        "",
        "",
        "",
        "",
        "",
        "Fahrzeit gesamt (h)",
        monthTotals.travelHrs.toFixed(2),
        "Gesamt inkl. Fahrzeit (h)",
        monthTotals.totalHrs.toFixed(2),
        "",
      ].join(";")
    );

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Auswertung_${rangeLabel.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function getMissingEntriesForRange(range, employeesOverride = null) {
    const activeEmployees = (employeesOverride || employees)
      .filter(isActiveEmployee)
      .sort((a, b) => (a.name || a.code || "").localeCompare(b.name || b.code || ""));

    if (!activeEmployees.length) {
      return {
        label: range?.label || "Zeitraum",
        missing: [],
        complete: true,
        error: "Keine aktiven Mitarbeiter gefunden.",
      };
    }

    const activeIds = activeEmployees.map((e) => e.id).filter(Boolean);

    const data = await collectSupabaseRows(() => supabase
      .from("v_time_entries_expanded")
      .select("id, employee_id, employee_name, work_date, note")
      .gte("work_date", range.from)
      .lte("work_date", range.to)
      .in("employee_id", activeIds)
      .order("work_date", { ascending: true })
      .order("id", { ascending: true }));

    const existing = new Set(
      (data || [])
        .filter((r) => r?.employee_id && r?.work_date)
        .map((r) => `${r.employee_id}||${r.work_date}`)
    );

    const rangeDates = getDatesBetweenInclusive(range.from, range.to);

    const missing = [];

    activeEmployees.forEach((emp) => {
      const dates = rangeDates.filter((date) => {
        const soll = Number(getEmployeeSollHoursForDay(emp, date)) || 0;
        const isHoliday = !!getHolidayName(date);

        // Feiertage sind keine fehlenden Einträge.
        // Sie werden in der Lohnverrechnung separat als bezahlt berücksichtigt.
        return soll > 0 && !isHoliday && !existing.has(`${emp.id}||${date}`);
      });

      if (dates.length) {
        missing.push({
          employee: emp.name || emp.code || "—",
          dates,
        });
      }
    });

    return {
      label: range.label,
      missing,
      complete: missing.length === 0,
      error: null,
    };
  }

  async function exportMissingEntriesPDF(result) {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      if (!result) {
        alert("Keine Prüfdaten für fehlende Einträge vorhanden.");
        return;
      }

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      doc.setFontSize(16);
      doc.text(`Fehlende Einträge ${safePdfText(result.label || "Zeitraum")}`, 40, 40);

      doc.setFontSize(10);
      doc.text(
        "Geprüft werden aktive Mitarbeiter und BUAK-Arbeitstage. Urlaub/Krankenstand/Zeitausgleich zählen als erfasst, wenn ein Eintrag vorhanden ist.",
        40,
        60
      );

      const body =
        result.complete || !(result.missing || []).length
          ? [["Alle aktiven Mitarbeiter", "vollständig", "—"]]
          : result.missing.map((item) => [
              item.employee,
              `${item.dates?.length || 0} fehlend`,
              (item.dates || []).map(formatDateAT).join(", "),
            ]);

      autoTable(doc, {
        head: [["Mitarbeiter", "Status", "Fehlende Tage"]],
        body,
        startY: 82,
        theme: "striped",
        styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
        headStyles: { fillColor: [123, 74, 45], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { cellWidth: 180 },
          1: { cellWidth: 100 },
          2: { cellWidth: 500 },
        },
        margin: { left: 40, right: 40 },
      });

      const fileLabel = safePdfText(result.label || "Zeitraum").replace(/[^\wäöüÄÖÜß-]+/g, "_");
      doc.save(`Fehlende_Eintraege_${fileLabel || "Export"}.pdf`);
    } catch (err) {
      console.error("Fehlende Einträge PDF Fehler:", err);
      alert(`Fehlende Einträge PDF Fehler:\n${err?.message || err}`);
    }
  }


  const getEmployeeNameById = (id) => {
    if (!id) return "—";
    const found = employees.find((e) => String(e.id) === String(id));
    return found?.name || found?.code || String(id).slice(0, 8);
  };

  const getProjectNameById = (id) => {
    if (!id) return "—";
    const found = projects.find((p) => String(p.id) === String(id));
    return found?.code ? `${found.code} · ${found.name}` : found?.name || String(id).slice(0, 8);
  };

  const formatAuditValueForCheck = (field, value) => {
    if (value == null || value === "") return "—";
    if (["start_min", "end_min", "from_min", "to_min"].includes(field)) return toHM(Number(value) || 0);
    if (["break_min", "travel_minutes", "travel_min"].includes(field)) return `${Number(value) || 0} min`;
    if (["private_pkw_km", "private_car_km"].includes(field)) return `${parsePrivatePkwKm(value).toLocaleString("de-AT")} km`;
    if (["za_hours"].includes(field)) return formatZaHours(value);
    if (field === "project_id") return getProjectNameById(value);
    if (field === "employee_id" || field === "changed_by") return getEmployeeNameById(value);
    return String(value);
  };

  async function buildPayrollCheck(range, selectedEmployeeIds = []) {
    const selectedSet = new Set((selectedEmployeeIds || []).map((id) => String(id)));
    const employeesForCheck = employees
      .filter(isActiveEmployee)
      .filter((emp) => selectedSet.size === 0 || selectedSet.has(String(emp.id)))
      .sort((a, b) => (a.name || a.code || "").localeCompare(b.name || b.code || ""));

    const employeeIds = employeesForCheck.map((e) => e.id).filter(Boolean);
    const missingResult = await getMissingEntriesForRange(range, employeesForCheck);

    let rawRows = [];
    if (employeeIds.length) {
      rawRows = await collectSupabaseRows(() => supabase
        .from("v_time_entries_expanded")
        .select("*")
        .gte("work_date", range.from)
        .lte("work_date", range.to)
        .in("employee_id", employeeIds)
        .order("work_date", { ascending: true })
        .order("id", { ascending: true }));
    }

    const dayMap = {};
    rawRows.forEach((r) => {
      const key = `${r.employee_id}||${r.work_date}`;
      if (!dayMap[key]) {
        dayMap[key] = {
          employee_id: r.employee_id,
          employee_name: r.employee_name || getEmployeeNameById(r.employee_id),
          work_date: r.work_date,
          minutes: 0,
          travel: 0,
          break_min: 0,
          notes: [],
          hasWork: false,
          hasVacation: false,
          hasSick: false,
          hasTimeComp: false,
          privatePkwKm: 0,
        };
      }
      const d = dayMap[key];
      const note = (r.note || "").toString();
      const vacation = isVacationRow(r);
      const sick = isSickRow(r);
      const timeComp = isTimeCompRow(r);
      const mins = entryMinutes(r);
      const pureWork = getPureWorkMinutes(r);
      d.minutes += mins;
      d.travel += getTravel(r) || 0;
      d.break_min += Number(r.break_min || 0);
      d.privatePkwKm += parsePrivatePkwKm(r.private_pkw_km);
      if (note) d.notes.push(note);
      if (vacation) d.hasVacation = true;
      if (sick) d.hasSick = true;
      if (timeComp) d.hasTimeComp = true;
      if (!vacation && !sick && !timeComp && pureWork > 0) d.hasWork = true;
    });

    const warnings = [];
    Object.values(dayMap).forEach((d) => {
      const hours = h2(d.minutes);
      const pureWorkHours = h2(Math.max(d.minutes - d.travel, 0));
      if (hours > 10) {
        warnings.push({ type: "Hohe Stunden", employee: d.employee_name, date: d.work_date, text: `${hours.toFixed(2)} h an einem Tag` });
      }
      if (pureWorkHours >= 6 && d.break_min <= 0) {
        warnings.push({ type: "Pause fehlt", employee: d.employee_name, date: d.work_date, text: `${pureWorkHours.toFixed(2)} h Arbeitszeit ohne Pause` });
      }
      if (d.travel > 150) {
        warnings.push({ type: "Fahrzeit hoch", employee: d.employee_name, date: d.work_date, text: `${d.travel} min Fahrzeit` });
      }
      if (d.privatePkwKm > 50) {
        warnings.push({ type: "Privat-PKW hoch", employee: d.employee_name, date: d.work_date, text: `${d.privatePkwKm.toLocaleString("de-AT")} km` });
      }
      if (d.hasWork && (d.hasVacation || d.hasSick || d.hasTimeComp)) {
        warnings.push({ type: "Misch-Eintrag", employee: d.employee_name, date: d.work_date, text: "Arbeitszeit und Abwesenheit am selben Tag" });
      }
    });

    const special = {
      vacation: rawRows.filter(isVacationRow).length,
      sick: rawRows.filter(isSickRow).length,
      timeComp: rawRows.filter(isTimeCompRow).length,
      privatePkw: rawRows.filter((r) => parsePrivatePkwKm(r.private_pkw_km) > 0).length,
      travel: rawRows.filter((r) => (getTravel(r) || 0) > 0).length,
    };

    let auditRows = [];
    try {
      const since = new Date();
      since.setDate(since.getDate() - 45);
      let q = supabase
        .from("time_entry_audit_log")
        .select("*")
        .gte("changed_at", since.toISOString())
        .order("changed_at", { ascending: false })
        .limit(250);
      if (employeeIds.length) q = q.in("employee_id", employeeIds);
      const { data, error } = await q;
      if (!error) auditRows = data || [];
    } catch (err) {
      console.warn("Audit-Log für Lohncheck konnte nicht geladen werden:", err);
    }

    const relevantAuditRows = auditRows.filter((a) => String(a.change_type || "").toLowerCase() !== "create");

    const missingCount = (missingResult.missing || []).reduce((sum, item) => sum + (item.dates?.length || 0), 0);
    const statusOk = missingCount === 0 && warnings.length === 0 && relevantAuditRows.length === 0;

    return {
      label: range.label,
      from: range.from,
      to: range.to,
      checkedAt: new Date().toISOString(),
      employeesCount: employeesForCheck.length,
      entriesCount: rawRows.length,
      missingResult,
      missingCount,
      warnings,
      special,
      auditRows: relevantAuditRows,
      statusOk,
    };
  }

  function openPayrollCheckDialog() {
    if (!isAdmin) return;
    setPayrollCheckEmployeeIds(payrollCandidateEmployees.map((e) => e.id).filter(Boolean));
    setShowPayrollEmployeeDialog(true);
  }

  function togglePayrollCheckEmployee(employeeId) {
    setPayrollCheckEmployeeIds((prev) =>
      prev.some((id) => String(id) === String(employeeId))
        ? prev.filter((id) => String(id) !== String(employeeId))
        : [...prev, employeeId]
    );
  }

  function openPayrollExportDialog() {
    const activeIds = payrollCandidateEmployees.map((e) => e.id).filter(Boolean);
    if (!activeIds.length) {
      alert("Keine aktiven Mitarbeiter für die Lohnverrechnung vorhanden.");
      return;
    }
    setPayrollExportEmployeeIds(activeIds);
    setShowPayrollExportDialog(true);
  }

  function togglePayrollExportEmployee(employeeId) {
    setPayrollExportEmployeeIds((prev) =>
      prev.some((id) => String(id) === String(employeeId))
        ? prev.filter((id) => String(id) !== String(employeeId))
        : [...prev, employeeId]
    );
  }

  async function runPayrollExport(employeeIdsForExport = payrollExportEmployeeIds) {
    const selectedSet = new Set((employeeIdsForExport || []).map((id) => String(id)));
    const selectedEmployeesForExport = payrollCandidateEmployees.filter((emp) =>
      selectedSet.has(String(emp.id))
    );

    if (!selectedEmployeesForExport.length) {
      alert("Bitte mindestens einen Mitarbeiter für die Lohnverrechnung auswählen.");
      return;
    }

    try {
      setPayrollExportLoading(true);
      await exportLohnverrechnungPDF(payrollCheckRange, selectedEmployeesForExport);
      setShowPayrollExportDialog(false);
    } finally {
      setPayrollExportLoading(false);
    }
  }

  async function runPayrollCheck(employeeIdsForCheck = payrollCheckEmployeeIds) {
    if (!isAdmin) return;
    const cleanedIds = (employeeIdsForCheck || []).filter(Boolean);
    if (!cleanedIds.length) {
      alert("Bitte mindestens einen Mitarbeiter für den Lohncheck auswählen.");
      return;
    }
    try {
      setPayrollCheckLoading(true);
      setShowPayrollEmployeeDialog(false);
      setShowPayrollCheck(true);
      const result = await buildPayrollCheck(payrollCheckRange, cleanedIds);
      setPayrollCheck(result);
    } catch (err) {
      console.error("Lohncheck Fehler:", err);
      setPayrollCheck({
        label: payrollCheckRange?.label || "Vormonat",
        error: err?.message || String(err),
        statusOk: false,
      });
    } finally {
      setPayrollCheckLoading(false);
    }
  }

  async function loadPayrollCloseoutStatus() {
    if (!isAdmin || !payrollCheckRange?.from) return;
    try {
      setPayrollCloseoutLoading(true);
      const employeeIds = payrollCandidateEmployees.map((e) => e.id).filter(Boolean);
      const check = employeeIds.length
        ? await buildPayrollCheck(payrollCheckRange, employeeIds)
        : null;

      const lock = await getMonthLock(supabase, payrollCheckRange.from);

      let pendingRequests = [];
      try {
        const { data, error } = await supabase
          .from("time_off_requests")
          .select("id, employee_id, entry_type, from_date, to_date, note, status")
          .eq("status", "pending")
          .lte("from_date", payrollCheckRange.to)
          .gte("to_date", payrollCheckRange.from);
        if (error) throw error;
        pendingRequests = data || [];
      } catch (requestError) {
        console.warn("[MonthlyOverview] offene Freigaben konnten nicht geladen werden:", requestError?.message || requestError);
      }

      let afterLockAuditRows = [];
      if (lock?.locked_at) {
        try {
          const { data, error } = await supabase
            .from("time_entry_audit_log")
            .select("*")
            .gte("changed_at", lock.locked_at)
            .order("changed_at", { ascending: false })
            .limit(120);
          if (error) throw error;
          afterLockAuditRows = (data || []).filter((row) => {
            const empId = String(row.employee_id || "");
            return employeeIds.some((id) => String(id) === empId);
          });
        } catch (auditError) {
          console.warn("[MonthlyOverview] Audit nach Monatsabschluss konnte nicht geladen werden:", auditError?.message || auditError);
        }
      }

      setPayrollCloseout({
        range: payrollCheckRange,
        checkedAt: new Date().toISOString(),
        lock,
        check,
        pendingRequests,
        afterLockAuditRows,
      });
    } finally {
      setPayrollCloseoutLoading(false);
    }
  }

  async function closePayrollMonth() {
    if (!isAdmin || !payrollCheckRange?.from) return;
    try {
      setPayrollCloseoutBusy(true);
      const employeeIds = payrollCandidateEmployees.map((e) => e.id).filter(Boolean);
      const check = await buildPayrollCheck(payrollCheckRange, employeeIds);
      let pendingRequests = payrollCloseout?.pendingRequests || [];
      try {
        const { data, error } = await supabase
          .from("time_off_requests")
          .select("id, employee_id, entry_type, from_date, to_date, note, status")
          .eq("status", "pending")
          .lte("from_date", payrollCheckRange.to)
          .gte("to_date", payrollCheckRange.from);
        if (error) throw error;
        pendingRequests = data || [];
      } catch (requestError) {
        console.warn("[MonthlyOverview] offene Freigaben vor Monatsabschluss konnten nicht geladen werden:", requestError?.message || requestError);
      }
      const pendingCount = pendingRequests.length;
      const missingCount = check?.missingCount || 0;
      const warningCount = check?.warnings?.length || 0;
      const auditCount = check?.auditRows?.length || 0;
      const hasIssues = missingCount > 0 || warningCount > 0 || auditCount > 0 || pendingCount > 0;

      const issueText = hasIssues
        ? `\n\nAchtung:\n- Fehlende Einträge: ${missingCount}\n- Warnungen: ${warningCount}\n- Änderungen/Audit: ${auditCount}\n- Offene Urlaub/ZA-Freigaben: ${pendingCount}\n\nTrotzdem abschließen?`
        : "";

      if (!window.confirm(`Monat ${payrollCheckRange.label} abschließen, sperren und Lohn-PDF erstellen?${issueText}`)) return;

      const actorId = asAuditIdOrNull(session?.id);
      await setMonthLocked(
        supabase,
        payrollCheckRange.from,
        true,
        actorId,
        `Lohnverrechnung abgeschlossen: ${payrollCheckRange.label}`
      );

      await refreshMonthLockInfo();
      await loadPayrollCloseoutStatus();
      await exportLohnverrechnungPDF(payrollCheckRange, payrollCandidateEmployees);
    } catch (err) {
      console.error("Monatsabschluss Fehler:", err);
      alert(`Monatsabschluss Fehler:\n${err?.message || err}`);
    } finally {
      setPayrollCloseoutBusy(false);
    }
  }

  async function exportPayrollCheckPDF() {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const now = new Date();
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = lastMonthDate.getFullYear();
      const m = String(lastMonthDate.getMonth() + 1).padStart(2, "0");
      const ym = `${y}-${m}`;
      const range = getMonthRange(ym);

      if (!range) {
        alert("Prüfzeitraum konnte nicht ermittelt werden.");
        return;
      }

      const result = await getMissingEntriesForRange({
        ...range,
        label: `Monat ${ym}`,
      });

      exportMissingEntriesPDF({
        ...result,
        label: `Lohnverrechnung ${result.label}`,
      });
    } catch (err) {
      console.error("Prüfliste PDF Fehler:", err);
      alert(`Prüfliste PDF Fehler:\n${err?.message || err}`);
    }
  }

  async function checkMissingEntriesLastMonth() {
    try {
      setMissingLoading(true);
      setShowMissingDialog(true);

      const now = new Date();
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = lastMonthDate.getFullYear();
      const m = String(lastMonthDate.getMonth() + 1).padStart(2, "0");
      const ym = `${y}-${m}`;
      const range = getMonthRange(ym);

      if (!range) {
        setMissingEntries({
          label: "Letztes Monat",
          missing: [],
          complete: false,
          error: "Zeitraum konnte nicht ermittelt werden.",
        });
        return;
      }

      const result = await getMissingEntriesForRange({
        ...range,
        label: `Monat ${ym}`,
      });

      setMissingEntries(result);
    } catch (err) {
      console.error("Fehlende Einträge prüfen Fehler:", err);
      setMissingEntries({
        label: "Letztes Monat",
        missing: [],
        complete: false,
        error: err?.message || String(err),
      });
    } finally {
      setMissingLoading(false);
    }
  }

  async function getZaBalancesAtMonthEnd(employeesForExport, targetEndDate) {
    const out = new Map();
    const employeeIds = (employeesForExport || []).map((e) => e.id).filter(Boolean);

    employeesForExport.forEach((emp) => {
      out.set(String(emp.id), {
        balance: 0,
        endDate: targetEndDate,
        included: emp?.include_in_za_account !== false,
        source: "calculated",
      });
    });

    if (!employeeIds.length || !targetEndDate) return out;

    let zaRows;
    try {
      zaRows = await collectSupabaseRows(() => supabase
        .from("time_entries")
        .select("*")
        .lte("work_date", targetEndDate)
        .in("employee_id", employeeIds)
        .order("work_date", { ascending: true })
        .order("id", { ascending: true }));
    } catch (zaError) {
      console.warn("ZA-Stand konnte nicht geladen werden:", zaError);
      return out;
    }

    let adjustments = [];
    try {
      const adjustmentLookupTo = Number.isFinite(dateToDayNumber(targetEndDate))
        ? dayNumberToDate(dateToDayNumber(targetEndDate) + 1)
        : targetEndDate;

      adjustments = await collectSupabaseRows(() => supabase
        .from("overtime_adjustments")
        .select("id, employee_id, adjustment_date, hours, note")
        .lte("adjustment_date", adjustmentLookupTo)
        .in("employee_id", employeeIds)
        .order("adjustment_date", { ascending: true })
        .order("id", { ascending: true }));
    } catch (adjError) {
      console.warn("ZA-Korrekturen konnten nicht geladen werden:", adjError);
    }

    for (const emp of employeesForExport || []) {
      const empId = String(emp.id || "");
      const current = out.get(empId) || { balance: 0, endDate: targetEndDate, included: true };
      if (emp?.include_in_za_account === false) {
        out.set(empId, { ...current, balance: 0, included: false, source: "not_included" });
        continue;
      }

      const empRows = zaRows.filter((row) => String(row.employee_id || "") === empId);
      const firstEntryDate = empRows
        .map((row) => dateOnly(row.work_date))
        .filter(Boolean)
        .sort()[0] || "";
      const startDate = emp.za_start_date || emp.entry_date || firstEntryDate || targetEndDate;
      const startDay = dateToDayNumber(startDate);
      const targetDay = dateToDayNumber(targetEndDate);
      if (Number.isFinite(startDay) && Number.isFinite(targetDay) && targetDay < startDay) {
        const dayBeforeStart = dayNumberToDate(startDay - 1);
        const officialStartAdjustment = (adjustments || []).find(
          (adj) =>
            String(adj.employee_id || "") === empId &&
            dateOnly(adj.adjustment_date) === dateOnly(startDate) &&
            isOfficialZaStartAdjustment(adj)
        );

        if (targetEndDate === dayBeforeStart && officialStartAdjustment) {
          out.set(empId, {
            ...current,
            balance: parseHoursValue(officialStartAdjustment.hours),
            included: true,
            source: "official_start",
            sourceDate: dayBeforeStart,
          });
        } else {
          out.set(empId, { ...current, balance: 0, included: true, source: "before_start" });
        }
        continue;
      }

      const empAdjustments = (adjustments || []).filter(
        (adj) => String(adj.employee_id || "") === empId && isOnOrAfterStartDate(adj.adjustment_date, emp.za_start_date)
      );
      const result = calculateZaBalanceForEmployee({
        employee: emp,
        entries: empRows,
        adjustments: empAdjustments,
        from: startDate,
        to: targetEndDate,
        adjustmentFrom: startDate,
        adjustmentTo: targetEndDate,
        neutralizeHolidays: true,
      });

      out.set(empId, { ...current, balance: result.balance, included: true, source: "calculated" });
    }

    return out;
  }

  async function exportLohnverrechnungPDF(exportRange = payrollCheckRange, selectedEmployeesForExport = null) {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const targetRange = exportRange || payrollCheckRange || activeRange;
      const employeesForExport = (selectedEmployeesForExport || employees.filter(isActiveEmployee))
        .filter(isActiveEmployee)
        .sort((a, b) => (a.name || a.code || "").localeCompare(b.name || b.code || ""));

      if (!employeesForExport.length) {
        alert("Keine aktiven Mitarbeiter für den Export vorhanden.");
        return;
      }

      const missingResult = await getMissingEntriesForRange({
        from: targetRange.from,
        to: targetRange.to,
        label: targetRange.label,
      }, employeesForExport);

      const missingDays = (missingResult?.missing || []).reduce(
        (sum, item) => sum + (item.dates?.length || 0),
        0
      );

      if (missingDays > 0) {

        const exportList = confirm(
          `Achtung: Für die Lohnverrechnung fehlen noch ${missingDays} Einträge bei ${missingResult.missing.length} aktiven Mitarbeiter(n).\n\nSoll eine Liste mit den fehlenden Einträgen als PDF exportiert werden?`
        );

        if (exportList) {
          exportMissingEntriesPDF(missingResult);
        }

        const proceed = confirm(
          "Trotz fehlender Einträge die Lohnverrechnung trotzdem exportieren?"
        );

        if (!proceed) {
          setMissingEntries(missingResult);
          setShowMissingDialog(true);
          return;
        }
      }

      const employeeIds = employeesForExport.map((e) => e.id).filter(Boolean);
      const payrollValidation = await buildPayrollCheck(targetRange, employeeIds);
      const payrollWarningCount = payrollValidation?.warnings?.length || 0;

      const payrollRawRows = await collectSupabaseRows(() => supabase
        .from("v_time_entries_expanded")
        .select("*")
        .gte("work_date", targetRange.from)
        .lte("work_date", targetRange.to)
        .in("employee_id", employeeIds)
        .order("work_date", { ascending: true })
        .order("id", { ascending: true }));

      const zaBalancesAtMonthEnd = await getZaBalancesAtMonthEnd(employeesForExport, targetRange.to);
      const dayBeforeRangeStart = Number.isFinite(dateToDayNumber(targetRange.from))
        ? dayNumberToDate(dateToDayNumber(targetRange.from) - 1)
        : "";
      const zaBalancesBeforeMonth = await getZaBalancesAtMonthEnd(employeesForExport, dayBeforeRangeStart);

      const rangeDates = getDatesBetweenInclusive(targetRange.from, targetRange.to);
      const holidaysInRange = rangeDates
        .map((date) => ({ date, name: getHolidayName(date) }))
        .filter((h) => !!h.name);

      const payrollByEmployee = {};
      employeesForExport.forEach((emp) => {
        payrollByEmployee[emp.id] = {
          emp,
          name: emp.name || emp.code || "—",
          recordedMinutes: 0,
          travelMinutes: 0,
          workDays: new Set(),
          vacationDates: [],
          sickDates: [],
          timeCompDates: [],
          timeCompHours: 0,
          sickHours: 0,
          badWeatherRows: [],
          badWeatherHours: 0,
          holidayRows: [],
          holidayHours: 0,
          rows: [],
          datesWithAnyEntry: new Set(),
          datesWithWorkEntry: new Set(),
        };
      });

      payrollRawRows.forEach((r) => {
        const d = payrollByEmployee[r.employee_id];
        if (!d) return;

        const note = (r.note || "").toString();
        const isVacation = isVacationRow(r);
        const isSick = isSickRow(r);
        const isTimeComp = isTimeCompRow(r);
        const mins = entryMinutes(r);
        const travel = getTravel(r) || 0;

        d.rows.push(r);
        d.datesWithAnyEntry.add(r.work_date);

        if (isVacation) {
          d.vacationDates.push(r.work_date);
          return;
        }

        if (isSick) {
          if (!d.sickDates.includes(r.work_date)) {
            d.sickDates.push(r.work_date);
          }
          return;
        }

        if (isTimeComp) {
          if (!d.timeCompDates.includes(r.work_date)) {
            d.timeCompDates.push(r.work_date);
          }
          const za = parseZaHours(r.za_hours) || (Number(getEmployeeSollHoursForDay(d.emp, r.work_date)) || 0);
          d.timeCompHours += za;
          return;
        }

        if (isBadWeatherRow(r)) {
          const badWeatherMinutes = Number(r.bad_weather_minutes || 0) || Math.max(mins - travel, 0);
          if (badWeatherMinutes > 0) {
            d.badWeatherRows.push({
              date: r.work_date,
              minutes: badWeatherMinutes,
              note: stripAbsencePrefix(r.note || ""),
            });
            d.badWeatherHours += h2(badWeatherMinutes);
          }
        }

        d.recordedMinutes += mins;
        d.travelMinutes += travel;
        d.datesWithWorkEntry.add(r.work_date);

        if (mins > 0) {
          d.workDays.add(r.work_date);
        }
      });

      Object.values(payrollByEmployee).forEach((d) => {
        d.vacationDates = uniqueSortedDates(d.vacationDates);
        d.sickDates = uniqueSortedDates(d.sickDates);
        d.timeCompDates = uniqueSortedDates(d.timeCompDates);

        d.sickHours = d.sickDates.reduce(
          (sum, date) => sum + (Number(getEmployeeSollHoursForDay(d.emp, date)) || 0),
          0
        );

        holidaysInRange.forEach((h) => {
          const soll = Number(getEmployeeSollHoursForDay(d.emp, h.date)) || 0;
          if (soll <= 0) return;
          const hasWorkEntry = d.datesWithWorkEntry.has(h.date);
          const isVacation = d.vacationDates.includes(h.date);
          const isSick = d.sickDates.includes(h.date);
          const isTimeComp = d.timeCompDates.includes(h.date);

          // Feiertag wird bezahlt, wenn er auf einen Arbeitstag laut Arbeitszeitmodell fällt
          // und für diesen Tag keine echte Arbeitsbuchung, kein Urlaub, kein Krankenstand und kein Zeitausgleich eingetragen ist.
          if (!hasWorkEntry && !isVacation && !isSick && !isTimeComp) {
            d.holidayRows.push({ ...h, soll });
            d.holidayHours += soll;
          }
        });
      });

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 38;
      const brown = [123, 74, 45];
      const lightGray = [245, 245, 245];
      const midGray = [210, 210, 210];
      const green = [48, 112, 68];
      const blue = [55, 92, 135];

      const addFooter = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i += 1) {
          doc.setPage(i);
          doc.setFontSize(7.5);
          doc.text(
            "Lohnverrechnung: Arbeit inkl. Fahrzeit + Feiertag + Krankenstand + ZA laut Sollzeit. Urlaub wird mit 0,00 h geführt.",
            marginX,
            pageHeight - 18
          );
          doc.text(`Seite ${i}/${pageCount}`, pageWidth - marginX, pageHeight - 18, {
            align: "right",
          });
        }
      };

      doc.setFillColor(...brown);
      doc.rect(0, 0, pageWidth, 54, "F");
      doc.setTextColor(255);
      doc.setFontSize(18);
      doc.text(`Lohnverrechnung ${safePdfText(targetRange.label)}`, marginX, 28);
      doc.setFontSize(9.5);
      doc.text(`Ausdruck für Steuerberatung - erstellt am ${new Date().toLocaleDateString("de-AT")}`, marginX, 43);
      doc.setTextColor(45, 36, 29);

      const hintLines = [
        "Diese Übersicht enthält alle für die Lohnverrechnung relevanten Summen je Mitarbeiter.",
        "Lohnstunden gesamt = Arbeit inkl. Fahrzeit + bezahlte Feiertage + Krankenstand + ZA laut Sollzeit. Urlaub wird als Tage ausgewiesen und mit 0,00 h gerechnet. Diäten Tage = tatsächliche Arbeitstage.",
      ];

      let hintY = 74;
      if (missingDays > 0 || payrollWarningCount > 0) {
        const warningLines = doc.splitTextToSize(
          `ACHTUNG: UNVOLLSTAENDIGER PRUEFSTAND - ${missingDays} fehlende Arbeitstage, ${payrollWarningCount} Auffaelligkeiten. Vor Weitergabe an die Steuerberatung pruefen.`,
          pageWidth - marginX * 2 - 18
        );
        const warningHeight = Math.max(30, warningLines.length * 10 + 12);
        doc.setFillColor(255, 239, 235);
        doc.setDrawColor(180, 55, 45);
        doc.roundedRect(marginX, hintY - 11, pageWidth - marginX * 2, warningHeight, 3, 3, "FD");
        doc.setTextColor(145, 35, 30);
        doc.setFontSize(9);
        doc.setFont(undefined, "bold");
        doc.text(warningLines, marginX + 9, hintY + 1);
        doc.setFont(undefined, "normal");
        doc.setTextColor(45, 36, 29);
        hintY += warningHeight + 5;
      }

      hintLines.forEach((line) => {
        const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
        doc.setFontSize(9);
        doc.text(wrapped, marginX, hintY);
        hintY += wrapped.length * 10;
      });

      const employeeNamesLine = employeesForExport
        .map((e) => safePdfText(e.name || e.code))
        .filter(Boolean)
        .join(", ");

      const wrappedEmployees = doc.splitTextToSize(
        `Mitarbeiter im Export (${employeesForExport.length}): ${employeeNamesLine || "—"}`,
        pageWidth - marginX * 2
      );
      doc.setFontSize(9);
      doc.text(wrappedEmployees, marginX, hintY + 5);

      let startY = hintY + 5 + wrappedEmployees.length * 11 + 12;

      const detailRows = [];
      const zaReconcileRows = [];
      const totals = {
        recordedHours: 0,
        travelHours: 0,
        holidayHours: 0,
        sickHours: 0,
        zaTaken: 0,
        vacationDays: 0,
        sickDays: 0,
        dietDays: 0,
        badWeatherHours: 0,
        paidHours: 0,
        sollHours: 0,
        privatePkwKm: 0,
      };

      const employeeBody = employeesForExport.map((emp) => {
        const d = payrollByEmployee[emp.id];
        const recordedHours = h2(d.recordedMinutes);
        const travelHours = h2(d.travelMinutes);
        const privatePkwKm = (d.rows || []).reduce((sum, row) => sum + parsePrivatePkwKm(row.private_pkw_km), 0);
        const zaTaken = d.timeCompHours || 0;
        const paidHours = recordedHours + d.holidayHours + d.sickHours + zaTaken;
        const sollHoursInRange = calcEmployeeSollHoursForRange(d.emp, targetRange.from, targetRange.to, true);
        const zaBalanceBeforeInfo = zaBalancesBeforeMonth.get(String(emp.id));
        const zaBalanceEndInfo = zaBalancesAtMonthEnd.get(String(emp.id));
        const zaBalanceBefore = zaBalanceBeforeInfo?.balance ?? 0;
        const zaBalanceEnd = zaBalanceEndInfo?.balance ?? 0;
        const zaKontoChange = calculateZaBalanceDelta(zaBalanceBefore, zaBalanceEnd);
        const zaExpectedEnd = Math.round((zaBalanceBefore + zaKontoChange) * 100) / 100;
        const zaDiff = Math.round((zaBalanceEnd - zaExpectedEnd) * 100) / 100;
        const zaIsOfficialStart = zaBalanceEndInfo?.source === "official_start";
        const zaHint = zaIsOfficialStart
          ? `Startwert ${formatDateAT(zaBalanceEndInfo.sourceDate || targetRange.to)} lt. Mai-Lohnzettel`
          : Math.abs(zaDiff) > 0.01
            ? `Differenz ${formatSignedHoursAT(zaDiff)}`
            : "OK";

        zaReconcileRows.push([
          safePdfText(d.name),
          formatSignedHoursAT(zaBalanceBefore),
          zaIsOfficialStart ? "Startwert" : formatSignedHoursAT(zaKontoChange),
          formatSignedHoursAT(zaBalanceEnd),
          zaHint,
        ]);

        if (d.vacationDates.length) {
          detailRows.push([
            safePdfText(d.name),
            "Urlaub",
            d.vacationDates.map(formatDateAT).join(", "),
            "0,00 h",
          ]);
        }

        if (d.sickDates.length) {
          detailRows.push([
            safePdfText(d.name),
            "Krankenstand",
            d.sickDates.map(formatDateAT).join(", "),
            `${formatHoursAT(d.sickHours)} bezahlt`,
          ]);
        }

        if (d.timeCompDates.length) {
          detailRows.push([
            safePdfText(d.name),
            "Zeitausgleich",
            d.timeCompDates.map(formatDateAT).join(", "),
            `${formatHoursAT(d.timeCompHours || 0)} ZA-Verbrauch`,
          ]);
        }

        if (d.holidayRows.length) {
          detailRows.push([
            safePdfText(d.name),
            "Feiertag",
            d.holidayRows
              .map((h) => `${formatDateAT(h.date)} ${h.name}`)
              .join(", "),
            `${formatHoursAT(d.holidayHours)} bezahlt`,
          ]);
        }

        if (d.badWeatherRows.length) {
          detailRows.push([
            safePdfText(d.name),
            "Schlechtwetter",
            d.badWeatherRows
              .map((row) => `${formatDateAT(row.date)} (${formatHoursAT(h2(row.minutes))}${row.note ? `, ${safePdfText(row.note)}` : ""})`)
              .join(", "),
            `${formatHoursAT(d.badWeatherHours)} Schlechtwetter`,
          ]);
        }

        totals.recordedHours += recordedHours;
        totals.travelHours += travelHours;
        totals.holidayHours += d.holidayHours;
        totals.sickHours += d.sickHours;
        totals.zaTaken += zaTaken;
        totals.vacationDays += d.vacationDates.length;
        totals.sickDays += d.sickDates.length;
        totals.dietDays += d.workDays.size;
        totals.badWeatherHours += d.badWeatherHours;
        totals.paidHours += paidHours;
        totals.sollHours += sollHoursInRange;
        totals.privatePkwKm += privatePkwKm;

        return [
          safePdfText(d.name),
          formatHoursAT(recordedHours),
          formatHoursAT(travelHours),
          formatHoursAT(d.holidayHours),
          formatHoursAT(d.sickHours),
          formatHoursAT(zaTaken),
          formatDaysAT(d.vacationDates.length),
          formatDaysAT(d.sickDates.length),
          formatDaysAT(d.workDays.size),
          formatHoursAT(d.badWeatherHours),
          formatHoursAT(sollHoursInRange),
          formatHoursAT(paidHours),
          privatePkwKm > 0 ? `${formatNumberAT(privatePkwKm, 1)} km` : "—",
        ];
      });

      employeeBody.push([
        "GESAMT",
        formatHoursAT(totals.recordedHours),
        formatHoursAT(totals.travelHours),
        formatHoursAT(totals.holidayHours),
        formatHoursAT(totals.sickHours),
        formatHoursAT(totals.zaTaken),
        formatDaysAT(totals.vacationDays),
        formatDaysAT(totals.sickDays),
        formatDaysAT(totals.dietDays),
        formatHoursAT(totals.badWeatherHours),
        formatHoursAT(totals.sollHours),
        formatHoursAT(totals.paidHours),
        totals.privatePkwKm > 0 ? `${formatNumberAT(totals.privatePkwKm, 1)} km` : "—",
      ]);

      const showPrivatePkwColumn = totals.privatePkwKm > 0;
      const showBadWeatherColumn = totals.badWeatherHours > 0;
      const payrollHead = [
        "Mitarbeiter",
        "Arbeit inkl. Fahrzeit",
        "davon Fahrzeit",
        "Feiertag",
        "Krank",
        "ZA",
        "Urlaub Tage",
        "Krank Tage",
        "Diäten Tage",
        ...(showBadWeatherColumn ? ["Schlechtwetter"] : []),
        "Sollstunden",
        "Lohnstunden gesamt",
        ...(showPrivatePkwColumn ? ["Privat-PKW"] : []),
      ];

      const payrollBody = employeeBody.map((row) => {
        const base = [
          ...row.slice(0, 9),
          ...(showBadWeatherColumn ? [row[9]] : []),
          row[10],
          row[11],
          ...(showPrivatePkwColumn ? [row[12]] : []),
        ];
        return base;
      });
      const paidHoursColumnIndex = payrollHead.indexOf("Lohnstunden gesamt");

      autoTable(doc, {
        head: [payrollHead],
        body: payrollBody,
        startY,
        tableWidth: "wrap",
        theme: "striped",
        styles: {
          fontSize: 7,
          cellPadding: { top: 4, right: 2, bottom: 4, left: 2 },
          overflow: "linebreak",
          valign: "middle",
          lineColor: [230, 230, 230],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: brown,
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
          fontSize: 7,
        },
        alternateRowStyles: { fillColor: lightGray },
        columnStyles: {
          0: { cellWidth: showPrivatePkwColumn ? 116 : 132, halign: "left" },
          1: { cellWidth: showPrivatePkwColumn ? 72 : 78, halign: "right" },
          2: { cellWidth: showPrivatePkwColumn ? 58 : 62, halign: "right" },
          3: { cellWidth: showPrivatePkwColumn ? 54 : 58, halign: "right" },
          4: { cellWidth: showPrivatePkwColumn ? 54 : 58, halign: "right" },
          5: { cellWidth: showPrivatePkwColumn ? 50 : 54, halign: "right" },
          6: { cellWidth: showPrivatePkwColumn ? 50 : 54, halign: "right" },
          7: { cellWidth: showPrivatePkwColumn ? 50 : 54, halign: "right" },
          8: { cellWidth: showPrivatePkwColumn ? 52 : 56, halign: "right" },
          9: { cellWidth: showPrivatePkwColumn ? 64 : 70, halign: "right" },
          10: { cellWidth: showPrivatePkwColumn ? 76 : 84, halign: "right" },
          11: { cellWidth: 60, halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === employeeBody.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [239, 232, 224];
          }
          if (data.section === "body" && data.column.index === paidHoursColumnIndex) {
            data.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: marginX, right: marginX },
      });

      let currentY = (doc.lastAutoTable?.finalY || startY) + 18;

      if (currentY > pageHeight - 150) {
        doc.addPage();
        currentY = 38;
      }

      doc.setFontSize(13);
      doc.text(`ZA-Konto Abgleich (${dayBeforeRangeStart ? formatDateAT(dayBeforeRangeStart) : "—"} bis ${formatDateAT(targetRange.to)})`, marginX, currentY);
      currentY += 10;

      autoTable(doc, {
        head: [[
          "Mitarbeiter",
          "ZA Stand vorher",
          "ZA Änderung",
          "ZA Stand Ende",
          "Hinweis",
        ]],
        body: zaReconcileRows,
        startY: currentY + 6,
        tableWidth: "wrap",
        theme: "striped",
        styles: {
          fontSize: 7.5,
          cellPadding: { top: 4, right: 2, bottom: 4, left: 2 },
          overflow: "linebreak",
          valign: "middle",
          lineColor: [230, 230, 230],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: blue,
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
          fontSize: 7.2,
        },
        alternateRowStyles: { fillColor: lightGray },
        columnStyles: {
          0: { cellWidth: 175, halign: "left" },
          1: { cellWidth: 105, halign: "right" },
          2: { cellWidth: 105, halign: "right" },
          3: { cellWidth: 105, halign: "right" },
          4: { cellWidth: 235, halign: "left" },
        },
        margin: { left: marginX, right: marginX },
      });

      currentY = (doc.lastAutoTable?.finalY || currentY) + 18;

      if (detailRows.length > 0) {
        if (currentY > pageHeight - 130) {
          doc.addPage();
          currentY = 38;
        }

        doc.setFontSize(13);
        doc.text("Details Abwesenheiten & bezahlte Feiertage", marginX, currentY);
        currentY += 10;

        autoTable(doc, {
          head: [["Mitarbeiter", "Art", "Datum / Zeitraum", "Berechnung"]],
          body: detailRows,
          startY: currentY + 6,
          tableWidth: "wrap",
          theme: "striped",
          styles: {
            fontSize: 7.8,
            cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
            overflow: "linebreak",
            valign: "top",
            lineColor: [230, 230, 230],
            lineWidth: 0.2,
          },
          headStyles: {
            fillColor: green,
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7.5,
          },
          alternateRowStyles: { fillColor: lightGray },
          columnStyles: {
            0: { cellWidth: 145 },
            1: { cellWidth: 105 },
            2: { cellWidth: 390 },
            3: { cellWidth: 90, halign: "right" },
          },
          margin: { left: marginX, right: marginX },
        });

        currentY = (doc.lastAutoTable?.finalY || currentY) + 16;
      } else {
        doc.setFontSize(10);
        doc.text("Details Abwesenheiten & bezahlte Feiertage: keine Einträge im Zeitraum.", marginX, currentY);
        currentY += 18;
      }

      if (currentY > pageHeight - 52) {
        doc.addPage();
        currentY = 38;
      }

      doc.setFontSize(8.5);
      const calcText =
        "Berechnung für die Steuerberatung: Lohnstunden gesamt = Arbeit inkl. Fahrzeit + Feiertag + Krankenstand + ZA laut Sollzeit. Urlaubstage werden separat als Tage ausgewiesen und mit 0,00 h gerechnet. Diäten Tage = tatsächliche Arbeitstage. ZA-Abgleich: Stand vorher + Änderung = Stand Monatsende.";
      doc.text(doc.splitTextToSize(calcText, pageWidth - marginX * 2), marginX, currentY);

      addFooter();

      const fileLabel = safePdfText(targetRange.label).replace(/[^\wäöüÄÖÜß-]+/g, "_");
      doc.save(`Lohnverrechnung_${fileLabel || "Export"}.pdf`);
    } catch (err) {
      console.error("Lohnverrechnung PDF Fehler:", err);
      alert(
        `Lohnverrechnung PDF Fehler:\n${err?.message || err}\n\nBitte Screenshot der Konsole schicken.`
      );
    }
  }

  async function exportAbrechnungPDF() {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      if (!grouped.length) {
        alert("Keine Daten für den Export vorhanden.");
        return;
      }

      const rowsForExport = grouped.filter((r) => !isAbsenceRow(r));
      if (!rowsForExport.length) {
        alert("Keine Arbeitsdaten für die Abrechnung vorhanden.");
        return;
      }

      const perProject = new Map();
      rowsForExport.forEach((r) => {
        const key = String(r.project_id || r.project_name || "ohne");
        const name = String(r.project_name || "Ohne Projekt");
        const project = projects.find((item) => String(item.id) === String(r.project_id));
        const current =
          perProject.get(key) || {
            name,
            costCenter: project?.cost_center || "",
            externalCostCenter: project?.external_cost_center || "",
            address: project?.address || "",
            clientName: project?.client_name || "",
            clientContact: project?.client_contact || "",
            work: 0,
            travel: 0,
            total: 0,
            days: new Set(),
          };

        const workMinutes = getPureWorkMinutes(r);
        current.work += workMinutes;
        current.travel += r._travel || 0;
        current.total += r._mins || 0;
        if (r.work_date) current.days.add(r.work_date);

        perProject.set(key, current);
      });

      const projectValues = Array.from(perProject.values())
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
      const projectInfoFields = [
        { key: "costCenter", label: "Kostenstelle" },
        { key: "externalCostCenter", label: "Externe Kostenstelle" },
        { key: "address", label: "Adresse" },
        { key: "clientName", label: "Auftraggeber" },
        { key: "clientContact", label: "Bauleiter / Kontakt" },
      ].filter((field) => projectValues.some((project) => String(project[field.key] || "").trim()));
      const projectBody = projectValues.map((p) => [
        p.name,
        `${h2(p.work).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`,
        `${h2(p.travel).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`,
        `${h2(p.total).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`,
        String(p.days.size),
      ]);

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const brown = [123, 74, 45];
      const darkBrown = [70, 43, 29];
      const warm = [247, 243, 239];
      const gray = [102, 94, 88];
      const formatHours = (value) => `${Number(value || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
      const formatDate = (value) => {
        const [y, m, d] = String(value || "").slice(0, 10).split("-");
        return y && m && d ? `${d}.${m}.${y}` : "-";
      };
      const selectedProjectName = projects.find((project) => String(project.id) === String(selectedProjectId))?.name || "Alle Projekte";
      const employeeCount = new Set(rowsForExport.map((row) => String(row.employee_id || row.employee_name || "")).filter(Boolean)).size;
      const totalWorkMinutes = rowsForExport.reduce((sum, row) => sum + getPureWorkMinutes(row), 0);
      const totalTravelMinutes = rowsForExport.reduce((sum, row) => sum + (row._travel || 0), 0);
      const totalMinutes = rowsForExport.reduce((sum, row) => sum + (row._mins || 0), 0);

      doc.setFillColor(...darkBrown); doc.rect(0, 0, pageWidth, 78, "F");
      doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("HOLZBAU ZAUNSCHIRM", 40, 25);
      doc.setFontSize(22); doc.text("Projektabrechnung", 40, 53);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(`Zeitraum ${rangeLabel}`, pageWidth - 40, 30, { align: "right" });
      doc.text(`Erstellt am ${new Date().toLocaleDateString("de-AT")}`, pageWidth - 40, 49, { align: "right" });

      doc.setTextColor(...darkBrown); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("AUSWERTUNG", 40, 101);
      doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text(`${selectedProjectName}  |  ${employeeCount} Mitarbeiter im Export`, 40, 119);

      const cards = [
        ["Arbeitszeit", formatHours(h2(totalWorkMinutes))],
        ["Fahrzeit", formatHours(h2(totalTravelMinutes))],
        ["Gesamtstunden", formatHours(h2(totalMinutes))],
        ["Mitarbeiter", String(employeeCount)],
      ];
      const cardGap = 10; const cardWidth = (pageWidth - 80 - cardGap * 3) / 4;
      cards.forEach(([label, value], index) => {
        const x = 40 + index * (cardWidth + cardGap);
        doc.setFillColor(...warm); doc.roundedRect(x, 135, cardWidth, 50, 5, 5, "F");
        doc.setTextColor(...gray); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(label.toUpperCase(), x + 12, 153);
        doc.setTextColor(...darkBrown); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(value, x + 12, 174);
      });

      doc.setTextColor(...darkBrown); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Projektübersicht", 40, 210);

      autoTable(doc, {
        head: [["Projekt", "Arbeitszeit", "Fahrzeit", "Gesamtstunden", "Arbeitstage"]],
        body: projectBody,
        startY: 220,
        styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", textColor: darkBrown, lineColor: [231, 224, 218], lineWidth: 0.35 },
        headStyles: { fillColor: brown, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: warm },
        columnStyles: { 0: { cellWidth: 290 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "right" } },
        margin: { left: 40, right: 40 },
      });

      let currentY = (doc.lastAutoTable?.finalY || 220) + 28;
      if (projectInfoFields.length) {
        if (currentY > pageHeight - 130) { doc.addPage(); currentY = 48; }
        doc.setTextColor(...darkBrown); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Projektdaten", 40, currentY);
        autoTable(doc, {
          head: [["Projekt", ...projectInfoFields.map((field) => field.label)]],
          body: projectValues.map((project) => [project.name, ...projectInfoFields.map((field) => project[field.key] || "-")]),
          startY: currentY + 10,
          styles: { fontSize: projectInfoFields.length >= 4 ? 7.5 : 8.5, cellPadding: 5, overflow: "linebreak", textColor: darkBrown, lineColor: [231, 224, 218], lineWidth: 0.25 },
          headStyles: { fillColor: [146, 103, 76], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: warm },
          columnStyles: { 0: { cellWidth: 145, fontStyle: "bold" } },
          margin: { left: 40, right: 40 },
        });
        currentY = (doc.lastAutoTable?.finalY || currentY) + 28;
      }
      if (currentY > pageHeight - 130) {
        doc.addPage();
        currentY = 48;
      }

      doc.setTextColor(...darkBrown); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Tagesdetails", 40, currentY);
      currentY += 10;

      const body = rowsForExport.map((r) => {
        const totalHours = h2(r._mins);
        const travelHours = h2(r._travel);
        const pureWorkHours = h2(getPureWorkMinutes(r));

        return [
          formatDate(r.work_date),
          String(r.employee_name || ""),
          String(r.project_name || "—"),
          formatHours(pureWorkHours),
          formatHours(travelHours),
          formatHours(totalHours),
        ];
      });

      autoTable(doc, {
        head: [["Datum", "Mitarbeiter", "Projekt", "Arbeitszeit", "Fahrzeit", "Gesamtstunden"]],
        body,
        startY: currentY,
        styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak", textColor: darkBrown, lineColor: [231, 224, 218], lineWidth: 0.25 },
        headStyles: { fillColor: brown, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: warm },
        columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 145 }, 2: { cellWidth: 235 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
        margin: { left: 40, right: 40 },
      });

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        if (page > 1) { doc.setFillColor(...brown); doc.rect(0, 0, pageWidth, 5, "F"); }
        doc.setDrawColor(220, 212, 206); doc.line(40, pageHeight - 27, pageWidth - 40, pageHeight - 27);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...gray);
        doc.text("Holzbau Zaunschirm GmbH | Projektabrechnung", 40, pageHeight - 14);
        doc.text(`Seite ${page} von ${pageCount}`, pageWidth - 40, pageHeight - 14, { align: "right" });
      }

      doc.save(`Abrechnung_${rangeLabel.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("Abrechnung PDF Fehler:", err);
      alert(`Abrechnung PDF Fehler:\n${err?.message || err}`);
    }
  }

  async function exportNachkalkulationPDF() {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      if (!grouped.length) {
        alert("Keine Daten für den Export vorhanden.");
        return;
      }

      const rowsForExport = grouped.filter((r) => !isAbsenceRow(r));
      const totalTravelMinutes = rowsForExport.reduce((sum, r) => sum + (r._travel || 0), 0);
      const totalAllMinutes = rowsForExport.reduce((sum, r) => sum + (r._mins || 0), 0);
      const totalWorkMinutes = Math.max(totalAllMinutes - totalTravelMinutes, 0);
      const totalPrivatePkwKm = rowsForExport.reduce((sum, r) => sum + parsePrivatePkwKm(r.private_pkw_km), 0);

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text(`Nachkalkulation ${rangeLabel}`, 40, 40);
      doc.setFontSize(10);
      doc.text("Gesamtstunden und Fahrzeit getrennt", 40, 58);

      autoTable(doc, {
        head: [["Auswertung", "Stunden"]],
        body: [
          ["Gesamtstunden Arbeit", h2(totalWorkMinutes).toFixed(2)],
          ["Fahrzeit", h2(totalTravelMinutes).toFixed(2)],
          ["Privat-PKW km", totalPrivatePkwKm.toLocaleString("de-AT")],
          ["Gesamtstunden inkl. Fahrzeit", h2(totalAllMinutes).toFixed(2)],
        ],
        startY: 80,
        styles: { fontSize: 11, cellPadding: 5 },
        headStyles: { fillColor: [123, 74, 45] },
        margin: { left: 40, right: 40 },
      });

      const perProject = {};
      rowsForExport.forEach((r) => {
        const key = r.project_name || "Ohne Projekt";
        if (!perProject[key]) perProject[key] = { work: 0, travel: 0, privatePkwKm: 0, total: 0 };
        perProject[key].travel += r._travel || 0;
        perProject[key].privatePkwKm += parsePrivatePkwKm(r.private_pkw_km);
        perProject[key].total += r._mins || 0;
        perProject[key].work += getPureWorkMinutes(r);
      });

      const projectBody = Object.entries(perProject)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([project, vals]) => [
          project,
          h2(vals.work).toFixed(2),
          h2(vals.travel).toFixed(2),
          vals.privatePkwKm.toLocaleString("de-AT"),
          h2(vals.total).toFixed(2),
        ]);

      if (projectBody.length) {
        autoTable(doc, {
          head: [["Projekt", "Arbeitszeit", "Fahrzeit", "Privat-PKW km", "Gesamt"]],
          body: projectBody,
          startY: (doc.lastAutoTable?.finalY || 100) + 18,
          styles: { fontSize: 10, cellPadding: 4, overflow: "linebreak" },
          headStyles: { fillColor: [200, 200, 200] },
          margin: { left: 40, right: 40 },
        });
      }

      doc.save(`Nachkalkulation_${rangeLabel.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("Nachkalkulation PDF Fehler:", err);
      alert("Nachkalkulation PDF Fehler – bitte Konsole prüfen.");
    }
  }

  const summaryCards = [
    {
      label: "Fahrzeit",
      value: `${monthTotals.travelHrs.toFixed(2)} h`,
      icon: "↗",
      tone: "travel",
    },
    {
      label: "Gesamtstunden",
      value: `${monthTotals.totalHrs.toFixed(2)} h`,
      icon: "◷",
      tone: "hours",
    },
    {
      label: "Mitarbeiter",
      value: `${Object.keys(totalsByEmployee).length}`,
      icon: "♟",
      tone: "people",
    },
    {
      label: "Einträge",
      value: `${grouped.length}`,
      icon: "✓",
      tone: "entries",
    },
  ];

  return (
    <div className="month-overview">
      <div className="month-overview-hero hbz-card">
        <div className="month-overview-hero__content">
          <div>
            <div className="month-overview-kicker">Auswertung</div>
            <h2 className="month-overview-title">Monatsübersicht</h2>
            <div className="month-overview-subtitle">
              Zeitraum: <b>{rangeLabel}</b>
            </div>
          </div>
          <div className="month-overview-period" aria-label={`Ausgewählter Zeitraum: ${rangeLabel}`}>
            <span className="month-overview-period-icon" aria-hidden="true">▦</span>
            <span>
              <small>Ausgewählter Zeitraum</small>
              <strong>{rangeLabel}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="month-overview-topgrid">
        <div className="hbz-card month-filter-card">
          <div className="month-section-heading">
            <span className="month-section-icon" aria-hidden="true">⌁</span>
            <div>
              <div className="month-card-title">Filter</div>
              <div className="month-main-subtitle">Zeitraum, Projekt und Mitarbeiter eingrenzen</div>
            </div>
          </div>

          <div className="month-chip-actions">
            <button type="button" className="hbz-btn btn-small" onClick={handleCurrentMonth}>
              Aktueller Monat
            </button>
            <button type="button" className="hbz-btn btn-small" onClick={handleLastMonth}>
              Letztes Monat
            </button>
            <button type="button" className="hbz-btn btn-small" onClick={handleLast3Months}>
              Letzte 3 Monate
            </button>
            <button type="button" className="hbz-btn btn-small" onClick={handleCurrentYear}>
              Aktuelles Jahr
            </button>
          </div>

          <div className="year-range-grid">
            <div className="field-inline">
              <label className="hbz-label">Jahr</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="hbz-select"
              >
                {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="field-inline">
              <label className="hbz-label">Monat</label>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  setRangeFromMonth("");
                  setRangeToMonth("");
                  setMonthFilter(v);
                  const mr = getMonthRange(v);
                  if (mr) setYear(mr.year);
                }}
                className="hbz-input"
              />
            </div>

            <div className="field-inline">
              <label className="hbz-label">Von</label>
              <input
                type="month"
                value={rangeFromMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  setMonthFilter("");
                  setRangeFromMonth(v);
                  const mr = getMonthRange(v);
                  if (mr) setYear(mr.year);
                }}
                className="hbz-input"
              />
            </div>

            <div className="field-inline">
              <label className="hbz-label">Bis</label>
              <input
                type="month"
                value={rangeToMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  setMonthFilter("");
                  setRangeToMonth(v);
                }}
                className="hbz-input"
              />
            </div>

            <div className="field-inline">
              <label className="hbz-label">Projekt</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="hbz-select"
              >
                <option value="">Alle</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="year-range-active">
            Aktuell ausgewählt: <b>{rangeLabel}</b>
          </div>

          {isManager && (
            <div className="month-employee-block">
              <div className="month-employee-head">
                <label className="hbz-label">Mitarbeiter</label>
                <span className="badge-soft">
                  {selectedEmployees.length} / {employees.length} gewählt
                </span>
              </div>

              <div className="month-chip-actions">
                <button
                  type="button"
                  className="hbz-btn btn-small"
                  onClick={() => setSelectedCodes(employees.map((e) => e.code))}
                >
                  Alle
                </button>
                <button
                  type="button"
                  className="hbz-btn btn-small"
                  onClick={() => setSelectedCodes([])}
                >
                  Keine
                </button>
              </div>

              <div className="month-chip-list">
                {employees.map((e) => {
                  const active = selectedCodes.includes(e.code);
                  return (
                    <button
                      key={e.id}
                      className={`month-chip ${active ? "active" : ""}`}
                      onClick={() => {
                        setSelectedCodes((prev) =>
                          prev.includes(e.code)
                            ? prev.filter((c) => c !== e.code)
                            : [...prev, e.code]
                        );
                      }}
                    >
                      {e.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="hbz-card month-filter-card month-tool-card month-tool-card--check">
          <div className="month-card-title">Prüfung</div>
          <div className="month-main-subtitle">Kontrolle vor der Lohnverrechnung</div>
          <div className="month-chip-actions" style={{ marginTop: 12 }}>
            <button onClick={checkMissingEntriesLastMonth} className="hbz-btn">
              Fehlende Einträge letzter Monat
            </button>
            {isAdmin && (
              <button onClick={openPayrollCheckDialog} className="hbz-btn hbz-btn-primary">
                Lohncheck Vormonat
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="hbz-card month-filter-card month-tool-card month-tool-card--check">
            <div className="month-card-title">Monatsabschluss Lohnverrechnung</div>
            <div className="month-main-subtitle">
              Vormonat: <b>{payrollCheckRange.label}</b> · Status:{" "}
              <b>{payrollCloseout?.lock?.locked ? "abgeschlossen / gesperrt" : "offen"}</b>
              {payrollCloseout?.lock?.locked_at
                ? ` seit ${formatDateTimeAT(payrollCloseout.lock.locked_at)}`
                : ""}
            </div>

            <div className="month-summary-grid" style={{ marginTop: 12 }}>
              <div className="month-summary-card month-summary-card--entries">
                <div>
                  <div className="month-summary-label">Fehlende Einträge</div>
                  <div className="month-summary-value">
                    {payrollCloseoutLoading ? "…" : payrollCloseout?.check?.missingCount ?? "—"}
                  </div>
                </div>
              </div>
              <div className="month-summary-card month-summary-card--hours">
                <div>
                  <div className="month-summary-label">Warnungen</div>
                  <div className="month-summary-value">
                    {payrollCloseoutLoading ? "…" : payrollCloseout?.check?.warnings?.length ?? "—"}
                  </div>
                </div>
              </div>
              <div className="month-summary-card month-summary-card--people">
                <div>
                  <div className="month-summary-label">Offene Urlaub/ZA</div>
                  <div className="month-summary-value">
                    {payrollCloseoutLoading ? "…" : payrollCloseout?.pendingRequests?.length ?? "—"}
                  </div>
                </div>
              </div>
              <div className="month-summary-card month-summary-card--travel">
                <div>
                  <div className="month-summary-label">Nach Abschluss geändert</div>
                  <div className="month-summary-value">
                    {payrollCloseoutLoading ? "…" : payrollCloseout?.afterLockAuditRows?.length ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {payrollCloseout?.pendingRequests?.length > 0 && (
              <div className="hbz-alert hbz-alert-warning" style={{ marginTop: 12 }}>
                Es gibt noch offene Urlaub/ZA-Freigaben im Zeitraum. Bitte vor dem Abschluss prüfen.
              </div>
            )}

            {payrollCloseout?.afterLockAuditRows?.length > 0 && (
              <div className="hbz-alert hbz-alert-warning" style={{ marginTop: 12 }}>
                Nach dem Monatsabschluss wurden noch Stunden geändert. Bitte vor der Lohnverrechnung kontrollieren.
              </div>
            )}

            <div className="month-chip-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="hbz-btn"
                disabled={payrollCloseoutLoading || payrollCloseoutBusy}
                onClick={loadPayrollCloseoutStatus}
              >
                Status prüfen
              </button>
              <button
                type="button"
                className="hbz-btn"
                disabled={payrollCloseoutLoading || payrollCloseoutBusy}
                onClick={() => runPayrollCheck(payrollCandidateEmployees.map((e) => e.id).filter(Boolean))}
              >
                Lohncheck öffnen
              </button>
              <button
                type="button"
                className="hbz-btn hbz-btn-primary"
                disabled={payrollCloseoutLoading || payrollCloseoutBusy || !payrollCandidateEmployees.length}
                onClick={closePayrollMonth}
              >
                {payrollCloseoutBusy ? "Schließe ab…" : "Abschließen, sperren & PDF"}
              </button>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="hbz-card month-filter-card month-tool-card month-tool-card--lock">
            <div className="month-card-title">Monatssperre</div>
            <div className="month-main-subtitle">
              Sperrmonat {formatYearMonthAT(monthLockMonth)}: <b>{monthLockInfo?.locked ? "gesperrt" : "offen"}</b>
            </div>
            <div className="year-range-grid" style={{ marginTop: 12 }}>
              <div className="field-inline">
                <label className="hbz-label">Sperrmonat</label>
                <input
                  type="month"
                  value={monthLockMonth}
                  onChange={(e) => setMonthLockMonth(e.target.value)}
                  className="hbz-input"
                  title="Monat für Sperre auswählen"
                />
              </div>
            </div>
            <div className="month-chip-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={useVisibleMonthForLock}
                className="hbz-btn"
                title="Aktuell angezeigten Monat für die Sperre übernehmen"
              >
                Auswahl übernehmen
              </button>
              <button
                onClick={toggleMonthLock}
                disabled={monthLockLoading || !monthLockRange}
                className={monthLockInfo?.locked ? "hbz-btn" : "hbz-btn hbz-btn-primary"}
                title="Sperrt oder entsperrt den ausgewählten Monat"
              >
                {monthLockInfo?.locked ? "Monat entsperren" : "Monat sperren"}
              </button>
            </div>
          </div>
        )}

        <div className="hbz-card month-filter-card month-tool-card month-tool-card--export">
          <div className="month-card-title">Export</div>
          <div className="month-main-subtitle">PDF und CSV Ausgaben</div>
          <div className="month-chip-actions" style={{ marginTop: 12 }}>
            <button onClick={openPayrollExportDialog} className="hbz-btn hbz-btn-primary">
              Lohnverrechnung Vormonat
            </button>
            <button onClick={exportAbrechnungPDF} className="hbz-btn">
              Abrechnung
            </button>
            <button onClick={exportNachkalkulationPDF} className="hbz-btn">
              Nachkalkulation
            </button>
            <button onClick={exportCSV} className="hbz-btn">
              CSV export
            </button>
          </div>
        </div>

        <div className="month-summary-grid">
          {summaryCards.map((card) => (
            <div key={card.label} className={`month-summary-card month-summary-card--${card.tone}`}>
              <span className="month-summary-icon" aria-hidden="true">{card.icon}</span>
              <div>
                <div className="month-summary-label">{card.label}</div>
                <div className="month-summary-value">{card.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showPayrollExportDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowPayrollExportDialog(false)}
        >
          <div
            className="hbz-card"
            style={{ width: "min(760px, 100%)", maxHeight: "85vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="month-main-header">
              <div>
                <div className="month-card-title">Lohnverrechnung Vormonat</div>
                <div className="month-main-subtitle">
                  Zeitraum: <b>{payrollCheckRange.label}</b>. Standardmäßig sind alle aktiven Mitarbeiter ausgewählt.
                </div>
              </div>
              <button type="button" className="hbz-btn btn-small" onClick={() => setShowPayrollExportDialog(false)}>
                Schließen
              </button>
            </div>

            <div className="month-empty-state" style={{ marginTop: 12, marginBottom: 12 }}>
              Die Lohnverrechnung wird immer für den letzten abgeschlossenen Monat erstellt, nicht für den aktuell eingestellten Filter.
            </div>

            <div className="month-action-group" style={{ marginTop: 12, marginBottom: 12 }}>
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={() => setPayrollExportEmployeeIds(payrollCandidateEmployees.map((e) => e.id).filter(Boolean))}
              >
                Alle auswählen
              </button>
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={() => setPayrollExportEmployeeIds([])}
              >
                Alle abwählen
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {payrollCandidateEmployees.map((emp) => {
                const checked = payrollExportEmployeeIds.some((id) => String(id) === String(emp.id));
                return (
                  <label
                    key={emp.id || emp.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      border: "1px solid rgba(123,74,45,0.25)",
                      borderRadius: 12,
                      background: checked ? "rgba(123,74,45,0.08)" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePayrollExportEmployee(emp.id)}
                    />
                    <span>
                      <b>{emp.name || emp.code || "Mitarbeiter"}</b>
                      {emp.role ? <span style={{ opacity: 0.7 }}> · {emp.role}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="month-action-group" style={{ marginTop: 16, justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Ausgewählt: {payrollExportEmployeeIds.length} von {payrollCandidateEmployees.length}
              </div>
              <button
                type="button"
                className="hbz-btn hbz-btn-primary"
                onClick={() => runPayrollExport(payrollExportEmployeeIds)}
                disabled={payrollExportLoading || payrollExportEmployeeIds.length === 0}
              >
                {payrollExportLoading ? "Erstelle PDF…" : "PDF erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPayrollEmployeeDialog && isAdmin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowPayrollEmployeeDialog(false)}
        >
          <div
            className="hbz-card"
            style={{ width: "min(720px, 100%)", maxHeight: "85vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="month-main-header">
              <div>
                <div className="month-card-title">Lohncheck Vormonat</div>
                <div className="month-main-subtitle">
                  Wähle aus, welche aktiven Mitarbeiter geprüft werden sollen. Standardmäßig sind alle aktiven Mitarbeiter ausgewählt.
                </div>
              </div>
              <button type="button" className="hbz-btn btn-small" onClick={() => setShowPayrollEmployeeDialog(false)}>
                Schließen
              </button>
            </div>

            <div className="month-action-group" style={{ marginTop: 12, marginBottom: 12 }}>
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={() => setPayrollCheckEmployeeIds(payrollCandidateEmployees.map((e) => e.id).filter(Boolean))}
              >
                Alle auswählen
              </button>
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={() => setPayrollCheckEmployeeIds([])}
              >
                Alle abwählen
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {payrollCandidateEmployees.map((emp) => {
                const checked = payrollCheckEmployeeIds.some((id) => String(id) === String(emp.id));
                return (
                  <label
                    key={emp.id || emp.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      border: "1px solid rgba(123,74,45,0.25)",
                      borderRadius: 12,
                      background: checked ? "rgba(123,74,45,0.08)" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePayrollCheckEmployee(emp.id)}
                    />
                    <span>
                      <b>{emp.name || emp.code || "Mitarbeiter"}</b>
                      {emp.role ? <span style={{ opacity: 0.7 }}> · {emp.role}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="month-action-group" style={{ marginTop: 16, justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Ausgewählt: {payrollCheckEmployeeIds.length} von {payrollCandidateEmployees.length}
              </div>
              <button
                type="button"
                className="hbz-btn hbz-btn-primary"
                onClick={() => runPayrollCheck(payrollCheckEmployeeIds)}
                disabled={payrollCheckLoading || payrollCheckEmployeeIds.length === 0}
              >
                Lohncheck starten
              </button>
            </div>
          </div>
        </div>
      )}

      {showPayrollCheck && isAdmin && (
        <div className="hbz-card" style={{ marginTop: 16, marginBottom: 16 }}>
          <div className="month-main-header">
            <div>
              <div className="month-card-title">Lohncheck</div>
              <div className="month-main-subtitle">
                {payrollCheckLoading
                  ? "Prüfe Daten…"
                  : payrollCheck?.error
                    ? "Fehler beim Prüfen"
                    : `Prüfung für ${payrollCheck?.label || payrollCheckRange.label}`}
              </div>
            </div>
            <div className="month-action-group">
              <button type="button" className="hbz-btn btn-small" onClick={openPayrollCheckDialog} disabled={payrollCheckLoading}>
                Neu prüfen
              </button>
              <button type="button" className="hbz-btn btn-small" onClick={() => setShowPayrollCheck(false)}>
                Schließen
              </button>
            </div>
          </div>

          {payrollCheckLoading && <div className="month-empty-state">Lohncheck läuft…</div>}

          {!payrollCheckLoading && payrollCheck?.error && (
            <div className="month-empty-state">{payrollCheck.error}</div>
          )}

          {!payrollCheckLoading && payrollCheck && !payrollCheck.error && (
            <>
              <div className="month-summary-grid" style={{ marginTop: 12 }}>
                <div className="month-summary-card">
                  <div className="month-summary-label">Status</div>
                  <div className="month-summary-value">{payrollCheck.statusOk ? "Bereit" : "Prüfen"}</div>
                </div>
                <div className="month-summary-card">
                  <div className="month-summary-label">Fehlende Tage</div>
                  <div className="month-summary-value">{payrollCheck.missingCount || 0}</div>
                </div>
                <div className="month-summary-card">
                  <div className="month-summary-label">Auffälligkeiten</div>
                  <div className="month-summary-value">{payrollCheck.warnings?.length || 0}</div>
                </div>
                <div className="month-summary-card">
                  <div className="month-summary-label">Änderungen 45 Tage</div>
                  <div className="month-summary-value">{payrollCheck.auditRows?.length || 0}</div>
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: 12 }}>
                <b>Zusammenfassung:</b> {payrollCheck.entriesCount || 0} Einträge, {payrollCheck.employeesCount || 0} geprüfte Mitarbeiter, Urlaub {payrollCheck.special?.vacation || 0}, Krank {payrollCheck.special?.sick || 0}, ZA {payrollCheck.special?.timeComp || 0}, Privat-PKW {payrollCheck.special?.privatePkw || 0}, Fahrzeit {payrollCheck.special?.travel || 0}.
              </div>

              {(payrollCheck.missingResult?.missing || []).length > 0 && (
                <div className="month-table-wrap" style={{ marginTop: 14 }}>
                  <div className="month-card-title">Fehlende Einträge</div>
                  <table className="month-table">
                    <thead>
                      <tr>
                        <th>Mitarbeiter</th>
                        <th className="num">Tage</th>
                        <th>Datum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollCheck.missingResult.missing.map((item) => (
                        <tr key={`missing-${item.employee}`}>
                          <td>{item.employee}</td>
                          <td className="num">{item.dates?.length || 0}</td>
                          <td>{(item.dates || []).map(formatDateAT).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(payrollCheck.warnings || []).length > 0 && (
                <div className="month-table-wrap" style={{ marginTop: 14 }}>
                  <div className="month-card-title">Auffälligkeiten</div>
                  <table className="month-table">
                    <thead>
                      <tr>
                        <th>Art</th>
                        <th>Mitarbeiter</th>
                        <th>Datum</th>
                        <th>Hinweis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollCheck.warnings.map((w, idx) => (
                        <tr key={`warn-${idx}`}>
                          <td>{w.type}</td>
                          <td>{w.employee}</td>
                          <td>{formatDateAT(w.date)}</td>
                          <td>{w.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(payrollCheck.auditRows || []).length > 0 && (
                <div className="month-table-wrap" style={{ marginTop: 14 }}>
                  <div className="month-card-title">Änderungen der letzten 45 Tage</div>
                  <table className="month-table">
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Mitarbeiter</th>
                        <th>Geändert von</th>
                        <th>Feld</th>
                        <th>Alt</th>
                        <th>Neu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollCheck.auditRows.map((a) => (
                        <tr key={a.id || `${a.entry_id}-${a.changed_at}-${a.field_name}`}>
                          <td>{formatDateTimeAT(a.changed_at)}</td>
                          <td>{getEmployeeNameById(a.employee_id)}</td>
                          <td>{getEmployeeNameById(a.changed_by)}</td>
                          <td>{auditFieldLabel(a.field_name || a.change_type)}</td>
                          <td>{formatAuditValueForCheck(a.field_name, a.old_value)}</td>
                          <td>{formatAuditValueForCheck(a.field_name, a.new_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {payrollCheck.statusOk && (
                <div className="month-empty-state" style={{ marginTop: 14 }}>
                  Keine fehlenden Einträge, keine Auffälligkeiten und keine Änderungen der letzten 45 Tage. Der Zeitraum ist für die Lohnverrechnung bereit.
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="hbz-card month-main-card">
        <div className="month-main-header">
          <div>
            <div className="month-card-title">Einträge</div>
            <div className="month-main-subtitle">
              {loading ? "Lade…" : `Einträge für ${rangeLabel}`}
            </div>
          </div>
        </div>

        <div className="mo-wrap">
          {grouped.length === 0 ? (
            <div className="month-empty-state">Keine Einträge.</div>
          ) : (
            <div className="mo-responsive">
              {!isMobile && (
                <div className="month-table-wrap">
                  <table className="month-table">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Mitarbeiter</th>
                        <th>Projekt</th>
                        <th className="num">Start</th>
                        <th className="num">Ende</th>
                        <th className="num">Pause</th>
                        <th className="num">Fahrzeit</th>
                        <th className="num">Privat-PKW</th>
                        <th className="num">Schlechtwetter</th>
                        <th className="num">Stunden</th>
                        <th className="num">Überstunden</th>
                        <th>Notiz</th>
                        <th className="num">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((r) => {
                        const start = r.start_min ?? r.from_min ?? 0;
                        const end = r.end_min ?? r.to_min ?? 0;
                        const hrs = h2(r._mins);
                        const ot = Math.max(hrs - 9, 0);
                        const isEditing = editId === r.id;

                        if (!isEditing) {
                          return (
                            <tr key={`${r.id}-${r.work_date}`}>
                              <td>{r.work_date}</td>
                              <td>{r.employee_name}</td>
                              <td>{r.project_name || "—"}</td>
                              <td className="num">{toHM(start)}</td>
                              <td className="num">{toHM(end)}</td>
                              <td className="num">{r.break_min ?? 0} min</td>
                              <td className="num">{r._travel ?? 0} min</td>
                              <td className="num">{formatPrivatePkwKm(r.private_pkw_km)}</td>
                              <td className="num">{isBadWeatherRow(r) ? "Ja" : "—"}</td>
                              <td className="num">{hrs.toFixed(2)}</td>
                              <td className="num">{ot.toFixed(2)}</td>
                              <td>{r.note || ""}</td>
                              <td className="num">
                                {isManager ? (
                                  <div className="month-action-group">
                                    <button
                                      className="hbz-btn btn-small"
                                      onClick={() => startEdit(r)}
                                    >
                                      Bearbeiten
                                    </button>
                                    <button
                                      className="hbz-btn btn-small"
                                      onClick={() => deleteEntry(r.id)}
                                    >
                                      Löschen
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs opacity-60">
                                    nur Anzeige
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={`${r.id}-edit`}>
                            <td>{r.work_date}</td>
                            <td>{r.employee_name}</td>
                            <td>
                              <select
                                className="hbz-input"
                                value={editState.project_id ?? ""}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    project_id: e.target.value || null,
                                  }))
                                }
                              >
                                <option value="">— ohne Projekt —</option>
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.code ? `${p.code} · ${p.name}` : p.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="num">
                              <input
                                type="time"
                                className="hbz-input"
                                value={editState.from_hm}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    from_hm: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="num">
                              <input
                                type="time"
                                className="hbz-input"
                                value={editState.to_hm}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    to_hm: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="num">
                              <input
                                type="number"
                                min={0}
                                step={5}
                                className="hbz-input"
                                value={editState.break_min}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    break_min: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="num">
                              <input
                                type="number"
                                min={0}
                                step={15}
                                className="hbz-input"
                                value={editState.travel_minutes ?? 0}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    travel_minutes: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="num">
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                className="hbz-input"
                                value={editState.private_pkw_km ?? 0}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    private_pkw_km: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="num">—</td>
                            <td className="num">
                              {(() => {
                                const minsLive =
                                  Math.max(
                                    hmToMin(editState.to_hm) -
                                      hmToMin(editState.from_hm) -
                                      (parseInt(editState.break_min || "0", 10) ||
                                        0),
                                    0
                                  ) +
                                  (parseInt(
                                    editState.travel_minutes || "0",
                                    10
                                  ) || 0);
                                const hrsLive = h2(minsLive);
                                return hrsLive.toFixed(2);
                              })()}
                            </td>
                            <td className="num">
                              {(() => {
                                const minsLive =
                                  Math.max(
                                    hmToMin(editState.to_hm) -
                                      hmToMin(editState.from_hm) -
                                      (parseInt(editState.break_min || "0", 10) ||
                                        0),
                                    0
                                  ) +
                                  (parseInt(
                                    editState.travel_minutes || "0",
                                    10
                                  ) || 0);
                                const hrsLive = h2(minsLive);
                                const otLive = Math.max(hrsLive - 9, 0);
                                return otLive.toFixed(2);
                              })()}
                            </td>
                            <td>
                              <input
                                type="text"
                                className="hbz-input"
                                value={editState.note}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    note: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="num">
                              <div className="month-action-group">
                                <button
                                  className="hbz-btn btn-small"
                                  onClick={saveEdit}
                                >
                                  Speichern
                                </button>
                                <button
                                  className="hbz-btn btn-small"
                                  onClick={cancelEdit}
                                >
                                  Abbrechen
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {isMobile && (
                <div className="month-cards">
                  {grouped.map((r) => {
                    const start = r.start_min ?? r.from_min ?? 0;
                    const end = r.end_min ?? r.to_min ?? 0;
                    const hrs = h2(r._mins);
                    const ot = Math.max(hrs - 9, 0);
                    const isEditing = editId === r.id;

                    if (!isEditing) {
                      return (
                        <div
                          key={`card-${r.id}-${r.work_date}`}
                          className="month-card"
                        >
                          <div className="month-card-header">
                            <div>
                              <div className="month-card-date">{r.work_date}</div>
                              <div className="month-card-emp">{r.employee_name}</div>
                            </div>
                            <div className="month-card-hours">
                              <div className="month-card-mainhrs">
                                {hrs.toFixed(2)} h
                              </div>
                              <div className="month-card-ot">
                                Ü: {ot.toFixed(2)} h
                              </div>
                            </div>
                          </div>

                          <div className="month-card-row">
                            <strong>Projekt:</strong> {r.project_name || "—"}
                          </div>

                          <div className="month-card-meta">
                            <span>Start: {toHM(start)}</span>
                            <span>Ende: {toHM(end)}</span>
                            <span>Pause: {r.break_min ?? 0} min</span>
                            <span>Fahrzeit: {r._travel ?? 0} min</span>
                            {parsePrivatePkwKm(r.private_pkw_km) > 0 ? <span>Privat-PKW: {formatPrivatePkwKm(r.private_pkw_km)}</span> : null}
                          </div>

                          {r.note && (
                            <div className="month-card-row">
                              <strong>Notiz:</strong> {r.note}
                            </div>
                          )}

                          <div className="month-card-actions">
                            {isManager ? (
                              <>
                                <button
                                  className="hbz-btn btn-small"
                                  onClick={() => startEdit(r)}
                                >
                                  Bearbeiten
                                </button>
                                <button
                                  className="hbz-btn btn-small"
                                  onClick={() => deleteEntry(r.id)}
                                >
                                  Löschen
                                </button>
                              </>
                            ) : (
                              <span className="text-xs opacity-60">
                                nur Anzeige
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    const minsLive =
                      Math.max(
                        hmToMin(editState.to_hm) -
                          hmToMin(editState.from_hm) -
                          (parseInt(editState.break_min || "0", 10) || 0),
                        0
                      ) +
                      (parseInt(editState.travel_minutes || "0", 10) || 0);
                    const hrsLive = h2(minsLive);
                    const otLive = Math.max(hrsLive - 9, 0);

                    return (
                      <div
                        key={`card-${r.id}-edit`}
                        className="month-card month-card-edit"
                      >
                        <div className="month-card-header">
                          <div>
                            <div className="month-card-date">{r.work_date}</div>
                            <div className="month-card-emp">{r.employee_name}</div>
                          </div>
                          <div className="month-card-hours">
                            <div className="month-card-mainhrs">
                              {hrsLive.toFixed(2)} h
                            </div>
                            <div className="month-card-ot">
                              Ü: {otLive.toFixed(2)} h
                            </div>
                          </div>
                        </div>

                        <div className="month-card-field">
                          <label className="hbz-label">Projekt</label>
                          <select
                            className="hbz-input"
                            value={editState.project_id ?? ""}
                            onChange={(e) =>
                              setEditState((s) => ({
                                ...s,
                                project_id: e.target.value || null,
                              }))
                            }
                          >
                            <option value="">— ohne Projekt —</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.code ? `${p.code} · ${p.name}` : p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="month-card-edit-grid">
                          <div className="month-card-field">
                            <label className="hbz-label">Start</label>
                            <input
                              type="time"
                              className="hbz-input"
                              value={editState.from_hm}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  from_hm: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="month-card-field">
                            <label className="hbz-label">Ende</label>
                            <input
                              type="time"
                              className="hbz-input"
                              value={editState.to_hm}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  to_hm: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="month-card-edit-grid">
                          <div className="month-card-field">
                            <label className="hbz-label">Pause (min)</label>
                            <input
                              type="number"
                              min={0}
                              step={5}
                              className="hbz-input"
                              value={editState.break_min}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  break_min: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="month-card-field">
                            <label className="hbz-label">Fahrzeit (min)</label>
                            <input
                              type="number"
                              min={0}
                              step={15}
                              className="hbz-input"
                              value={editState.travel_minutes ?? 0}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  travel_minutes: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="month-card-field">
                            <label className="hbz-label">Privat-PKW (km)</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              className="hbz-input"
                              value={editState.private_pkw_km ?? 0}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  private_pkw_km: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="month-card-field">
                          <label className="hbz-label">Notiz</label>
                          <input
                            type="text"
                            className="hbz-input"
                            value={editState.note}
                            onChange={(e) =>
                              setEditState((s) => ({
                                ...s,
                                note: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="month-card-footer">
                          <span className="month-card-summary">
                            {hrsLive.toFixed(2)} h / Ü: {otLive.toFixed(2)} h
                          </span>
                          <div className="month-card-actions">
                            <button
                              className="hbz-btn btn-small"
                              onClick={saveEdit}
                            >
                              Speichern
                            </button>
                            <button
                              className="hbz-btn btn-small"
                              onClick={cancelEdit}
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showMissingDialog && (
        <div className="month-modal-backdrop">
          <div className="month-modal">
            <div className="month-modal-head">
              <div>
                <div className="month-card-title">Fehlende Einträge</div>
                <div className="month-modal-subtitle">
                  Prüfung für <b>{missingEntries?.label || "letztes Monat"}</b>
                </div>
              </div>
              <div className="month-chip-actions">
                <button className="hbz-btn" onClick={() => exportMissingEntriesPDF(missingEntries)}>
                  Fehlende Liste PDF
                </button>
                <button
                  className="hbz-btn"
                  onClick={() => setShowMissingDialog(false)}
                >
                  Schließen
                </button>
              </div>
            </div>

            <div className="month-modal-box">
              {!missingLoading && missingEntries && !missingEntries.error && (
                <div
                  className="month-empty-state"
                  style={{
                    marginBottom: 12,
                    border: missingEntries.complete ? "1px solid #4f8f4f" : "1px solid #b54848",
                    background: missingEntries.complete ? "#eef8ee" : "#fff0f0",
                  }}
                >
                  {missingEntries.complete
                    ? "Status: vollständig – Lohnverrechnung kann vorbereitet werden."
                    : `Status: unvollständig – ${missingEntries.missing?.length || 0} Mitarbeiter mit fehlenden Einträgen.`}
                </div>
              )}

              {missingLoading ? (
                <div className="month-empty-state">Prüfe fehlende Einträge…</div>
              ) : missingEntries?.error ? (
                <div className="month-empty-state">
                  Fehler: {missingEntries.error}
                </div>
              ) : missingEntries?.complete ? (
                <div className="month-empty-state">
                  Alles vollständig. Für alle aktiven Mitarbeiter sind die BUAK-Arbeitstage im letzten Monat erfasst.
                </div>
              ) : (
                <>
                  <div className="month-modal-box-title">
                    Fehlende Einträge für aktive Mitarbeiter
                  </div>
                  <div className="month-modal-subtitle">
                    Geprüft werden nur BUAK-Arbeitstage. Urlaub/Krankenstand zählen als Eintrag, wenn sie erfasst sind.
                  </div>

                  <div className="month-table-wrap" style={{ marginTop: 12 }}>
                    <table className="month-table">
                      <thead>
                        <tr>
                          <th>Mitarbeiter</th>
                          <th>Fehlende Tage</th>
                          <th className="num">Anzahl</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(missingEntries?.missing || []).map((item) => (
                          <tr key={item.employee}>
                            <td>{item.employee}</td>
                            <td>{item.dates.map(formatDateAT).join(", ")}</td>
                            <td className="num">{item.dates.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
