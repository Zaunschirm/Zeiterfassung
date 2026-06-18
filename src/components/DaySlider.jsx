import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { canEditTimeEntry, getUserPermissions } from "../lib/permissions";
import {
  createTimeEntries,
  deleteTimeEntry,
  updateTimeEntry,
} from "../lib/timeEntries";
import PushSettings from "./PushSettings.jsx";
import TimeEntryEditDialog from "./TimeEntryEditDialog.jsx";
import TimeEntryEmployeePicker from "./TimeEntryEmployeePicker.jsx";
import TimeValidationDialog from "./TimeValidationDialog.jsx";
import {
  WEATHER_MANUAL_OPTIONS,
  fetchWeatherForBooking,
  getWeatherFinalLabel,
} from "../utils/weather";
import { getBuakWeekLabel, getEmployeeWorkDay, getHolidayName, hmToMinutes } from "../utils/time";
import { calculateZaBalanceForEmployee } from "../utils/overtime";
import { formatValidationMessages, validateTimeEntry } from "../utils/timeValidation";
import {
  auditDisplayValue,
  auditFieldLabel,
  buildAuditEntrySummary,
  buildCreateAuditRows,
  buildDeleteAuditRows,
  buildUpdateAuditRows,
} from "../utils/timeAudit";
import {
  buildEditedTimeEntryPayload,
  buildNewTimeEntryPayload,
} from "../utils/timeEntryPayload";
import { ensureMonthUnlocked } from "../utils/monthLock";
import {
  getAssignedEmployeeCodes,
  getAssignmentProjects,
} from "../utils/timeEntryAssignments";

// Utils
const toHM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(
    2,
    "0"
  )}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hmToMin = (hm) => {
  if (!hm) return 0;
  const [h, m] = String(hm).split(":").map((x) => parseInt(x || "0", 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};
const h2 = (m) => Math.round((m / 60) * 100) / 100;
const formatTravelLabel = (m) => {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")} h`;
  return `${m} min`;
};

const formatTemp = (value) =>
  typeof value === "number" && !Number.isNaN(value) ? `${value.toFixed(1)} °C` : "—";

const formatPrecip = (value) =>
  typeof value === "number" && !Number.isNaN(value) ? `${value.toFixed(1)} mm` : "—";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const asUuidOrNull = (value) => {
  const text = value == null ? "" : String(value);
  return UUID_RE.test(text) ? text : null;
};

const formatDateTimeAT = (value) => {
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
};

const formatSignedHours = (value) => {
  const n = Number(value || 0);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toFixed(2).replace(".", ",")} h`;
};

const isZaAccountEnabled = (emp) => {
  if (!emp) return false;
  if (emp.include_in_za_account === false) return false;
  const role = String(emp.role || emp.rolle || emp.user_role || emp.type || "").trim().toLowerCase();
  if (["admin", "buchhaltung", "verwaltung", "buchhaltung/verwaltung"].includes(role)) return false;
  return true;
};

const addDaysIso = (dateStr, days) => {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const todayIso = () => new Date().toISOString().slice(0, 10);


const PAUSE_OPTIONS = [0, 15, 30, 45, 60, 75, 90];
const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150];
const CRANE_HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);

function isAbsenceEntry(row, type) {
  const note = String(row?.note || "").toLowerCase();
  const absenceType = String(row?.absence_type || row?.absenceType || "").toLowerCase();

  if (type === "urlaub") {
    return absenceType === "urlaub" || note.includes("[urlaub]") || note.includes("urlaub");
  }

  if (type === "krank") {
    return (
      absenceType === "krank" ||
      absenceType === "krankenstand" ||
      note.includes("[krank]") ||
      note.includes("krank") ||
      note.includes("krankenstand")
    );
  }

  return false;
}

const logSbError = (prefix, error) =>
  console.error(prefix, error?.message || error);

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekDays(dateStr, count = 5) {
  const start = startOfWeek(dateStr);
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return d.toISOString().slice(0, 10);
  });
}

export default function DaySlider() {
  const session = getSession()?.user || null;
  const [currentUser, setCurrentUser] = useState(session);
  const role = (currentUser?.role || session?.role || "mitarbeiter").toLowerCase();
  const canViewAllTeamStatus = role === "admin" || role === "teamleiter";
  const permissions = getUserPermissions(currentUser || session);
  const canWriteOwnTime = !!permissions.writeOwnTime;
  const canWriteAllTime = !!permissions.writeAllTime;
  const canEditOwnTime = !!permissions.editOwnTime;
  const canCreateTimeEntries = canWriteOwnTime || canWriteAllTime;
  const isManager = canViewAllTeamStatus;
  const isAdmin = role === "admin";

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditEntry, setAuditEntry] = useState(null);
  const [auditRecentOpen, setAuditRecentOpen] = useState(false);
  const [auditRecentRows, setAuditRecentRows] = useState([]);
  const [auditRecentBusy, setAuditRecentBusy] = useState(false);

  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const buakWeekLabel = getBuakWeekLabel(date);

  const [fromMin, setFromMin] = useState(7 * 60);
  const [toMin, setToMin] = useState(16 * 60 + 30);
  const [breakMin, setBreakMin] = useState(30);
  const [travelMin, setTravelMin] = useState(0);
  const [note, setNote] = useState("");
  const [craneUsed, setCraneUsed] = useState(false);
  const [craneHours, setCraneHours] = useState(1);
  const [privatePkwUsed, setPrivatePkwUsed] = useState(false);
  const [privatePkwKm, setPrivatePkwKm] = useState(0);
  const [zaUsed, setZaUsed] = useState(false);
  const [zaHours, setZaHours] = useState(0);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  });
  const [weatherAuto, setWeatherAuto] = useState("");
  const [weatherManual, setWeatherManual] = useState("");
  const [weatherCode, setWeatherCode] = useState(null);
  const [temperature, setTemperature] = useState(null);
  const [precipitation, setPrecipitation] = useState(null);
  const [weatherSource, setWeatherSource] = useState("");
  const [weatherFetchedAt, setWeatherFetchedAt] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const [absenceType, setAbsenceType] = useState(null);
  const [badWeather, setBadWeather] = useState(false);

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [projectLoadNote, setProjectLoadNote] = useState(null);
  const [assignmentSuggestions, setAssignmentSuggestions] = useState([]);
  const [assignmentInfo, setAssignmentInfo] = useState("");
  const [assignmentRows, setAssignmentRows] = useState([]);

  const [employees, setEmployees] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState(
    session?.code ? [session.code] : []
  );
  const [employeeRow, setEmployeeRow] = useState(null);

  const [entries, setEntries] = useState([]);
  const [dailyCheckEntries, setDailyCheckEntries] = useState([]);
  const [dailyCheckLoading, setDailyCheckLoading] = useState(false);
  const [dailyCheckStatusFilter, setDailyCheckStatusFilter] = useState("all");
  const [dailyCheckEmployeeCodes, setDailyCheckEmployeeCodes] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editState, setEditState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [error, setError] = useState("");
  const [ownZaBalance, setOwnZaBalance] = useState(null);
  const [ownZaLoading, setOwnZaLoading] = useState(false);
  const validationDialogResolver = useRef(null);
  const assignmentLoadedDateRef = useRef(null);
  const [validationDialog, setValidationDialog] = useState(null);

  function confirmValidationWarnings(warnings) {
    return new Promise((resolve) => {
      validationDialogResolver.current = resolve;
      setValidationDialog({ warnings });
    });
  }

  function closeValidationDialog(proceed) {
    const resolve = validationDialogResolver.current;
    validationDialogResolver.current = null;
    setValidationDialog(null);
    if (resolve) resolve(proceed);
  }


  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCurrentUser() {
      if (!session?.code && !session?.id) return;

      try {
        let query = supabase
          .from("employees")
          .select("*")
          .limit(1);

        if (session?.code) query = query.eq("code", session.code);
        else if (session?.id) query = query.eq("id", session.id);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!cancelled && data) setCurrentUser((prev) => ({ ...(prev || {}), ...data }));
      } catch (e) {
        logSbError("[DaySlider] current user load error:", e);
      }
    }

    hydrateCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [session?.code, session?.id]);

  useEffect(() => {
    async function loadProjects() {
      try {
        const tryList = async (source) => {
          const { data, error } = await supabase
            .from(source)
            .select("*")
            .order("name", { ascending: true });
          if (error) return { ok: false, data: [] };
          return { ok: true, data: data || [] };
        };

        let res = await tryList("projects");
        if (!res.ok || res.data.length === 0) {
          for (const fb of ["v_projects", "projects_view", "projects_all"]) {
            const r = await tryList(fb);
            if (r.ok && r.data.length > 0) {
              res = r;
              break;
            }
          }
        }

        if (!res.ok) {
          setProjects([]);
          setProjectLoadNote(
            "Projekte konnten nicht geladen werden. Siehe Konsole."
          );
          return;
        }

        const list = (res.data || []).filter(
          (p) => p?.disabled !== true && p?.active !== false
        );
        setProjects(list);
        if (!projectId && list.length === 1) {
          setProjectId(list[0].id);
        }
      } catch (e) {
        logSbError("[DaySlider] projects load error:", e);
        setProjectLoadNote(
          "Projekte konnten nicht geladen werden (Fehler, siehe Konsole)."
        );
      }
    }

    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadEmployees() {
      try {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .eq("active", true)
          .eq("disabled", false)
          .order("name", { ascending: true });

        if (error) throw error;
        const list = data || [];
        const me = list.find((employee) => employee.code === session?.code) || null;
        const validCodes = new Set(list.map((employee) => employee.code));

        setEmployees(list);
        setEmployeeRow(me);
        setSelectedCodes((current) => {
          const validSelection = current.filter((code) => validCodes.has(code));
          if (validSelection.length) return validSelection;
          return me?.code ? [me.code] : [];
        });
      } catch (e) {
        logSbError("[DaySlider] employees load error:", e);
      }
    }

    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.code]);

  const totalMin = useMemo(() => {
    const raw = clamp(toMin - fromMin, 0, 24 * 60);
    return clamp(raw - breakMin, 0, 24 * 60);
  }, [fromMin, toMin, breakMin]);

  const totalMinWithTravel = useMemo(
    () => totalMin + (travelMin || 0),
    [totalMin, travelMin]
  );

  const totalHours = useMemo(() => h2(totalMinWithTravel), [totalMinWithTravel]);
  const selectedProject = useMemo(
    () => projects.find((p) => String(p.id) === String(projectId)) || null,
    [projects, projectId]
  );
  const projectAddress = selectedProject?.address || "";
  const finalWeather = weatherManual || weatherAuto || "";
  const assignedEmployeeCodes = useMemo(
    () =>
      getAssignedEmployeeCodes({
        assignments: assignmentRows,
        date,
        projectId,
        employees,
      }),
    [assignmentRows, date, projectId, employees]
  );
  const assignmentSelectionLabel = assignedEmployeeCodes.length
    ? `Arbeitseinteilung · ${date}`
    : "";
  const defaultTimeEmployee = useMemo(() => {
    if (selectedCodes.length === 1) {
      const selected = employees.find((e) => e.code === selectedCodes[0]);
      if (selected) return selected;
    }
    if (employeeRow) return employeeRow;
    return currentUser || session || null;
  }, [selectedCodes, employees, employeeRow, currentUser, session]);

  const selectedWorkDayDefaults = useMemo(
    () => getEmployeeWorkDay(defaultTimeEmployee, date),
    [defaultTimeEmployee, date]
  );

  const totalOvertime = useMemo(() => {
    const requiredHours = Number(selectedWorkDayDefaults?.requiredHours || 0);
    if (requiredHours <= 0) return totalHours > 0 ? totalHours : 0;
    return Math.max(totalHours - requiredHours, 0);
  }, [totalHours, selectedWorkDayDefaults?.requiredHours]);

  function applySelectedEmployeeDefaults(force = false) {
    if (absenceType && !force) return;
    const d = selectedWorkDayDefaults;
    if (!d || !d.active) return;
    const start = hmToMinutes(d.start);
    const end = hmToMinutes(d.end);
    if (end <= start) return;
    setFromMin(start);
    setToMin(end);
    setBreakMin(d.breakMinutes || 0);
  }

  useEffect(() => {
    applySelectedEmployeeDefaults(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, defaultTimeEmployee?.id, defaultTimeEmployee?.code]);

  function applyKrankDefaults() {
    const d = getEmployeeWorkDay(defaultTimeEmployee, date);
    const start = d?.active ? hmToMinutes(d.start) : 7 * 60;
    const mins = d?.requiredMinutes || 0;
    setBadWeather(false);
    setAbsenceType("krank");
    setProjectId(null);
    setFromMin(start);
    setToMin(start + mins);
    setBreakMin(0);
    setTravelMin(0);
  }

  function applyUrlaubDefaults() {
    const d = getEmployeeWorkDay(defaultTimeEmployee, date);
    const start = d?.active ? hmToMinutes(d.start) : 7 * 60;
    setBadWeather(false);
    setZaUsed(false);
    setZaHours(0);
    setAbsenceType("urlaub");
    setProjectId(null);
    setFromMin(start);
    setToMin(start + 15);
    setBreakMin(15);
    setTravelMin(0);
  }

  function applyZeitausgleichDefaults() {
    const d = getEmployeeWorkDay(defaultTimeEmployee, date);
    const start = d?.active ? hmToMinutes(d.start) : 7 * 60;
    const hours = d?.requiredHours ?? ((d?.requiredMinutes || 0) / 60);
    setBadWeather(false);
    setAbsenceType(null);
    setProjectId(null);
    setFromMin(start);
    setToMin(start + 15);
    setBreakMin(15);
    setTravelMin(0);
    setCraneUsed(false);
    setPrivatePkwUsed(false);
    setPrivatePkwKm(0);
    setZaUsed(true);
    setZaHours(Number(hours || 0));
  }

  function clearAbsenceAndZa() {
    setAbsenceType(null);
    setBadWeather(false);
    setZaUsed(false);
    setZaHours(0);
  }


  async function loadWeatherForCurrentBooking(force = false) {
    if (absenceType === "krank" || absenceType === "urlaub") {
      setWeatherAuto("");
      setWeatherCode(null);
      setTemperature(null);
      setPrecipitation(null);
      setWeatherSource("");
      setWeatherFetchedAt(null);
      setWeatherError("");
      if (!weatherManual) setWeatherManual("");
      return;
    }

    if (!projectAddress) {
      setWeatherAuto("");
      setWeatherCode(null);
      setTemperature(null);
      setPrecipitation(null);
      setWeatherSource("");
      setWeatherFetchedAt(null);
      setWeatherError("Beim Projekt ist keine Baustellenadresse hinterlegt.");
      return;
    }

    try {
      setWeatherLoading(true);
      setWeatherError("");
      const weather = await fetchWeatherForBooking({
        address: projectAddress,
        date,
        startMin: fromMin,
        endMin: toMin,
      });

      if (!weather?.ok && !force) {
        setWeatherAuto("");
        setWeatherCode(null);
        setTemperature(null);
        setPrecipitation(null);
        setWeatherSource("");
        setWeatherFetchedAt(null);
        setWeatherError("Wetter konnte nicht automatisch geladen werden.");
        return;
      }

      setWeatherAuto(weather?.weather_auto || "");
      setWeatherCode(
        typeof weather?.weather_code !== "undefined" ? weather.weather_code : null
      );
      setTemperature(
        typeof weather?.temperature === "number" ? weather.temperature : null
      );
      setPrecipitation(
        typeof weather?.precipitation === "number" ? weather.precipitation : null
      );
      setWeatherSource(weather?.weather_source || "");
      setWeatherFetchedAt(weather?.weather_fetched_at || null);
    } catch (e) {
      logSbError("[DaySlider] weather load error:", e);
      setWeatherAuto("");
      setWeatherCode(null);
      setTemperature(null);
      setPrecipitation(null);
      setWeatherSource("");
      setWeatherFetchedAt(null);
      setWeatherError("Wetter konnte nicht geladen werden.");
    } finally {
      setWeatherLoading(false);
    }
  }

  useEffect(() => {
    if (!projectId || absenceType) return;
    loadWeatherForCurrentBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, date, fromMin, toMin, absenceType]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignmentSuggestions() {
      try {
        setAssignmentSuggestions([]);
        setAssignmentInfo("");

        const relevantIds = employees.map((employee) => employee.id).filter(Boolean);

        if (!date || relevantIds.length === 0) return;

        const weekDates = getWeekDays(date);
        const { data, error } = await supabase
          .from("work_assignments")
          .select("assignment_date, employee_id, project_id, sort_order, projects(id, name, code)")
          .in("employee_id", relevantIds)
          .in("assignment_date", weekDates)
          .order("sort_order", { ascending: true });

        if (error) throw error;

        if (cancelled) return;
        setAssignmentRows(data || []);

        const todayRows = (data || []).filter((row) => row.assignment_date === date);
        const uniqueProjects = getAssignmentProjects({
          assignments: data || [],
          date,
          projects,
        });

        setAssignmentSuggestions(uniqueProjects);

        if (todayRows.length > 0) {
          const persons = new Set(todayRows.map((row) => row.employee_id)).size;
          setAssignmentInfo(
            persons > 1
              ? `Arbeitseinteilung gefunden: ${uniqueProjects.length} Projekt${uniqueProjects.length === 1 ? "" : "e"} für ${persons} Mitarbeiter.`
              : `Arbeitseinteilung gefunden: ${uniqueProjects.length} Projekt${uniqueProjects.length === 1 ? "" : "e"} für diesen Tag.`
          );
        }

        if (!absenceType && uniqueProjects.length > 0) {
          const dateChanged = assignmentLoadedDateRef.current !== date;
          assignmentLoadedDateRef.current = date;
          setProjectId((current) =>
            dateChanged || !current ? uniqueProjects[0].id : current
          );
        }
      } catch (e) {
        logSbError("[DaySlider] work assignments load error:", e);
        if (!cancelled) setAssignmentRows([]);
      }
    }

    loadAssignmentSuggestions();

    return () => {
      cancelled = true;
    };
  }, [date, employees, projects, absenceType]);

  useEffect(() => {
    if (!projectId || absenceType) return;

    const assignedCodes = getAssignedEmployeeCodes({
      assignments: assignmentRows,
      date,
      projectId,
      employees,
    });

    setSelectedCodes(assignedCodes.length ? assignedCodes : employeeRow?.code ? [employeeRow.code] : []);
  }, [assignmentRows, date, projectId, employees, employeeRow?.code, absenceType]);

  async function enrichTimeEntryRows(rows) {
    const list = rows || [];
    if (!list.length) return [];

    const employeeIds = [...new Set(list.map((r) => r.employee_id).filter(Boolean))];
    const projectIds = [...new Set(list.map((r) => r.project_id).filter(Boolean))];

    let empMap = new Map();
    let projectMap = new Map();

    try {
      if (employeeIds.length) {
        const { data: empRows, error: empError } = await supabase
          .from("employees")
          .select("id,name,code,role")
          .in("id", employeeIds);
        if (!empError) {
          empMap = new Map((empRows || []).map((e) => [String(e.id), e]));
        }
      }
    } catch (e) {
      logSbError("[DaySlider] employee enrichment error:", e);
    }

    try {
      if (projectIds.length) {
        const { data: projectRows, error: projectError } = await supabase
          .from("projects")
          .select("id,name,code")
          .in("id", projectIds);
        if (!projectError) {
          projectMap = new Map((projectRows || []).map((p) => [String(p.id), p]));
        }
      }
    } catch (e) {
      logSbError("[DaySlider] project enrichment error:", e);
    }

    return list
      .map((r) => {
        const emp = empMap.get(String(r.employee_id));
        const project = projectMap.get(String(r.project_id));
        return {
          ...r,
          employee_name: r.employee_name || emp?.name || r.employee_id,
          employee_code: r.employee_code || emp?.code || "",
          employee_role: r.employee_role || emp?.role || "",
          project_name: r.project_name || project?.name || r.project || "—",
          project_code: r.project_code || project?.code || "",
        };
      })
      .sort((a, b) => {
        const an = String(a.employee_name || "");
        const bn = String(b.employee_name || "");
        if (an !== bn) return an.localeCompare(bn, "de");
        return Number(a.start_min || 0) - Number(b.start_min || 0);
      });
  }

  async function loadEntries() {
    try {
      setLoading(true);
      let query = supabase
        .from("time_entries")
        .select("*")
        .eq("work_date", date)
        .order("start_min", { ascending: true });

      // Datenschutz: Nur Admin und Teamleiter sehen alle Einträge.
      // Mitarbeiter sehen unten immer nur eigene Einträge, auch wenn sie Sonderrechte haben.
      if (!canViewAllTeamStatus && employeeRow?.id) {
        query = query.eq("employee_id", employeeRow.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries(await enrichTimeEntryRows(data || []));
    } catch (e) {
      logSbError("[DaySlider] entries load error:", e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDailyCheckEntries() {
    try {
      setDailyCheckLoading(true);

      let query = supabase
        .from("time_entries")
        .select("*")
        .eq("work_date", date);

      // Datenschutz: Mitarbeiter laden für die Tageskontrolle nur eigene Einträge.
      if (!canViewAllTeamStatus && employeeRow?.id) {
        query = query.eq("employee_id", employeeRow.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setDailyCheckEntries(await enrichTimeEntryRows(data || []));
    } catch (e) {
      logSbError("[DaySlider] daily check entries load error:", e);
      setDailyCheckEntries([]);
    } finally {
      setDailyCheckLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
    loadDailyCheckEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, employeeRow?.id, canViewAllTeamStatus]);

  const shiftDate = (days) => {
    setDate((old) => {
      const d = new Date(old);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    });
  };


  useEffect(() => {
    function handlePrevDay() {
      shiftDate(-1);
    }

    function handleNextDay() {
      shiftDate(1);
    }

    window.addEventListener("hbz-prev-day", handlePrevDay);
    window.addEventListener("hbz-next-day", handleNextDay);

    return () => {
      window.removeEventListener("hbz-prev-day", handlePrevDay);
      window.removeEventListener("hbz-next-day", handleNextDay);
    };
  }, []);

  const currentEmployeeId = employeeRow?.id || employees.find((e) => e.code === session?.code)?.id || null;
  const ownZaEmployee = useMemo(() => {
    return employeeRow || employees.find((e) => String(e?.code || "") === String(session?.code || "")) || currentUser || session || null;
  }, [employeeRow, employees, currentUser, session]);

  const ownZaEnabled = useMemo(() => isZaAccountEnabled(ownZaEmployee), [ownZaEmployee]);

  useEffect(() => {
    let cancelled = false;
    async function loadOwnZaBalance() {
      const emp = ownZaEmployee;
      const empId = emp?.id;
      if (!empId || !isZaAccountEnabled(emp)) {
        setOwnZaBalance(null);
        setOwnZaLoading(false);
        return;
      }

      const today = todayIso();
      const endDate = addDaysIso(today, -1);
      const startDate = String(emp?.za_start_date || emp?.entry_date || `${today.slice(0, 4)}-01-01`).slice(0, 10);
      const hasEntryRange = startDate <= endDate;

      setOwnZaLoading(true);
      try {
        const rowsPromise = hasEntryRange
          ? supabase
              .from("time_entries")
              .select("work_date,start_min,end_min,break_min,travel_minutes,note,za_hours")
              .eq("employee_id", empId)
              .gte("work_date", startDate)
              .lte("work_date", endDate)
          : Promise.resolve({ data: [], error: null });

        // Korrekturen/Startwerte dürfen bis heute zählen.
        // Die eigentlichen Tagesstunden werden nur bis gestern gerechnet,
        // damit der aktuelle Arbeitstag nicht vorzeitig Minus macht.
        const correctionsPromise = supabase
          .from("overtime_adjustments")
          .select("hours,adjustment_date")
          .eq("employee_id", String(empId))
          .gte("adjustment_date", startDate)
          .lte("adjustment_date", today);

        const [{ data: rows, error: rowsError }, { data: corrections, error: corrError }] = await Promise.all([
          rowsPromise,
          correctionsPromise,
        ]);

        if (rowsError) throw rowsError;
        if (corrError) throw corrError;

        const balance = calculateZaBalanceForEmployee({
          employee: emp,
          entries: rows || [],
          adjustments: corrections || [],
          from: startDate,
          to: endDate,
          adjustmentFrom: startDate,
          adjustmentTo: today,
        }).balance;

        if (!cancelled) setOwnZaBalance(balance);
      } catch (e) {
        console.error("[DaySlider] ZA-Konto konnte nicht geladen werden:", e?.message || e);
        if (!cancelled) setOwnZaBalance(null);
      } finally {
        if (!cancelled) setOwnZaLoading(false);
      }
    }

    loadOwnZaBalance();
    return () => {
      cancelled = true;
    };
  }, [ownZaEmployee?.id, ownZaEmployee?.za_start_date, ownZaEmployee?.entry_date, ownZaEmployee?.include_in_za_account, ownZaEmployee?.role, ownZaEmployee?.rolle]);

  const canEditEntry = (row) =>
    canEditTimeEntry({
      entry: row,
      currentEmployeeId,
      isManager,
      canEditOwnTime,
    });
  const canDeleteEntry = (row) => !!row && isManager;

  const buakSollHoursToday = selectedWorkDayDefaults?.requiredHours || 0;
  const holidayNameToday = useMemo(() => getHolidayName(date), [date]);

  const dailyCheckRows = useMemo(() => {
    const ownId = employeeRow?.id || currentEmployeeId;

    const checkEmployees = (employees || [])
      // Deaktiviert = nicht mehr in der Tageskontrolle prüfen.
      // Mitarbeiter sehen aus Datenschutzgründen nur ihren eigenen Status.
      .filter((emp) => emp?.active !== false && emp?.disabled !== true)
      .filter((emp) => canViewAllTeamStatus || String(emp?.id || "") === String(ownId || ""))
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "de"));

    const rowsForDay = (dailyCheckEntries || []).filter(
      (row) => String(row?.work_date || row?.date || "").slice(0, 10) === date
    );

    return checkEmployees.map((emp) => {
      const empEntries = rowsForDay.filter(
        (row) => String(row?.employee_id || "") === String(emp.id || "")
      );

      const hasUrlaub = empEntries.some((row) => isAbsenceEntry(row, "urlaub"));
      const hasKrank = empEntries.some((row) => isAbsenceEntry(row, "krank"));
      const hasEntry = empEntries.length > 0;

      let status = "missing";
      let label = "Fehlt";
      let icon = "❌";

      const empSollHours = getEmployeeWorkDay(emp, date)?.requiredHours || 0;

      if (empSollHours <= 0) {
        status = "not_required";
        label = "frei laut Modell";
        icon = "⚪";
      } else if (hasUrlaub) {
        status = "urlaub";
        label = "Urlaub";
        icon = "🟡";
      } else if (hasKrank) {
        status = "krank";
        label = "Krank";
        icon = "🔵";
      } else if (hasEntry) {
        status = "ok";
        label = "Eingetragen";
        icon = "✅";
      }

      return {
        ...emp,
        status,
        statusLabel: label,
        statusIcon: icon,
        entryCount: empEntries.length,
      };
    });
  }, [date, dailyCheckEntries, employees, employeeRow?.id, currentEmployeeId, canViewAllTeamStatus]);

  const dailyCheckSummary = useMemo(() => {
    const count = (status) => dailyCheckRows.filter((row) => row.status === status).length;
    return {
      ok: count("ok"),
      missing: count("missing"),
      urlaub: count("urlaub"),
      krank: count("krank"),
      notRequired: count("not_required"),
      total: dailyCheckRows.length,
    };
  }, [dailyCheckRows]);

  const filteredDailyCheckRows = useMemo(() => {
    let rows = dailyCheckRows;

    if (dailyCheckStatusFilter === "missing") {
      rows = rows.filter((row) => row.status === "missing");
    } else if (dailyCheckStatusFilter === "ok") {
      rows = rows.filter((row) => row.status === "ok");
    } else if (dailyCheckStatusFilter === "absence") {
      rows = rows.filter((row) => row.status === "urlaub" || row.status === "krank");
    } else if (dailyCheckStatusFilter === "not_required") {
      rows = rows.filter((row) => row.status === "not_required");
    }

    if (dailyCheckEmployeeCodes.length > 0) {
      const selected = new Set(dailyCheckEmployeeCodes.map(String));
      rows = rows.filter((row) => selected.has(String(row.code || row.id || "")));
    }

    return rows;
  }, [dailyCheckEmployeeCodes, dailyCheckRows, dailyCheckStatusFilter]);

  const toggleDailyCheckEmployee = (code) => {
    const key = String(code || "");
    if (!key) return;
    setDailyCheckEmployeeCodes((old) =>
      old.includes(key) ? old.filter((x) => x !== key) : [...old, key]
    );
  };


  function startVoiceNote() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceSupported(false);
      alert("Spracherkennung wird von diesem Browser leider nicht unterstützt. Am iPhone bitte Safari bzw. die Tastatur-Diktierfunktion verwenden.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "de-AT";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setVoiceListening(true);
      recognition.onerror = () => setVoiceListening(false);
      recognition.onend = () => setVoiceListening(false);

      recognition.onresult = (event) => {
        const spokenText = Array.from(event.results || [])
          .map((result) => result?.[0]?.transcript || "")
          .join(" ")
          .trim();

        if (spokenText) {
          setNote((prev) => {
            const base = (prev || "").trim();
            return base ? `${base}\n${spokenText}` : spokenText;
          });
        }
      };

      recognition.start();
    } catch (e) {
      console.error("[DaySlider] voice note error:", e);
      setVoiceListening(false);
      alert("Sprachnotiz konnte nicht gestartet werden.");
    }
  }

  const getActorId = () =>
    asUuidOrNull(currentUser?.id || employeeRow?.id || session?.id);

  const getEmployeeNameById = (id) =>
    employees.find((e) => String(e.id) === String(id))?.name ||
    employees.find((e) => String(e.id) === String(id))?.full_name ||
    id ||
    "—";

  const getAuditActorName = (id) => {
    if (!id) return "—";
    const found = employees.find((e) => String(e.id) === String(id));
    if (found) {
      const code = found.code ? `${found.code} · ` : "";
      return `${code}${found.name || found.full_name || found.email || id}`;
    }
    if (String(currentUser?.id || "") === String(id)) return currentUser?.name || currentUser?.full_name || currentUser?.code || "Admin";
    if (String(session?.id || "") === String(id)) return session?.name || session?.full_name || session?.code || "Admin";
    return id;
  };

  const getProjectNameById = (id) => {
    if (!id) return "—";
    const p = projects.find((x) => String(x.id) === String(id));
    if (!p) return id;
    return p.code ? `${p.code} · ${p.name}` : p.name || id;
  };

  const auditSummary = (row) =>
    buildAuditEntrySummary(row, {
      fallbackDate: date,
      getEmployeeNameById,
      getProjectNameById,
      toHM,
    });

  const displayAuditValue = (field, value) =>
    auditDisplayValue(field, value, {
      getProjectNameById,
      toHM,
    });

  async function insertAuditRows(rows) {
    const cleaned = (rows || []).filter((row) => row?.entry_id && row?.field_name);
    if (cleaned.length === 0) return;

    const { error } = await supabase.from("time_entry_audit_log").insert(cleaned);
    if (error) console.warn("[DaySlider] audit log:", error?.message || error);
  }

  async function writeCreateAudit(savedRows) {
    const rows = buildCreateAuditRows(savedRows, {
      actor: getActorId(),
      asUuidOrNull,
      summary: auditSummary,
    });

    await insertAuditRows(rows);
  }

  async function writeUpdateAudit(oldRow, upd) {
    const rows = buildUpdateAuditRows(oldRow, upd, {
      actor: getActorId(),
      asUuidOrNull,
      displayValue: displayAuditValue,
    });

    await insertAuditRows(rows);
  }

  async function writeDeleteAudit(oldRow) {
    await insertAuditRows(buildDeleteAuditRows(oldRow, {
      actor: getActorId(),
      asUuidOrNull,
      summary: auditSummary,
    }));
  }

  async function openAuditLog(row) {
    if (!isAdmin || !row?.id) return;

    setAuditEntry(row);
    setAuditRows([]);
    setAuditOpen(true);
    setAuditBusy(true);

    try {
      const { data, error } = await supabase
        .from("time_entry_audit_log")
        .select("*")
        .eq("entry_id", row.id)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      setAuditRows(data || []);
    } catch (e) {
      console.warn("[DaySlider] audit load:", e?.message || e);
      setAuditRows([]);
    } finally {
      setAuditBusy(false);
    }
  }

  async function openRecentAuditLog() {
    if (!isAdmin) return;

    setAuditRecentOpen(true);
    setAuditRecentRows([]);
    setAuditRecentBusy(true);

    try {
      const since = new Date();
      since.setDate(since.getDate() - 45);

      const { data, error } = await supabase
        .from("time_entry_audit_log")
        .select("*")
        .gte("changed_at", since.toISOString())
        .neq("change_type", "create")
        .order("changed_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setAuditRecentRows(data || []);
    } catch (e) {
      console.warn("[DaySlider] recent audit load:", e?.message || e);
      setAuditRecentRows([]);
    } finally {
      setAuditRecentBusy(false);
    }
  }

  async function handleSave() {
    setError("");

    const isAbsence = absenceType === "krank" || absenceType === "urlaub" || zaUsed;

    if (!isAbsence && !projectId) {
      setError("Bitte Projekt auswählen.");
      return;
    }

    const prj = projectId
      ? projects.find((p) => p.id === projectId) || null
      : null;

    if (projectId && !prj) {
      setError("Ungültiges Projekt.");
      return;
    }

    if (toMin <= fromMin) {
      setError("Ende muss nach Start liegen.");
      return;
    }

    try {
      await ensureMonthUnlocked(supabase, date);
    } catch (lockErr) {
      setError(lockErr?.message || "Dieser Monat ist gesperrt.");
      return;
    }

    const base = buildNewTimeEntryPayload({
      date,
      projectId: prj?.id,
      fromMin,
      toMin,
      breakMin,
      travelMin,
      weatherAuto,
      weatherManual,
      finalWeather,
      weatherCode,
      temperature,
      precipitation,
      weatherSource,
      weatherFetchedAt,
      craneUsed,
      craneHours,
      privatePkwUsed,
      privatePkwKm,
      zaUsed,
      zaHours,
      badWeather,
      note,
      absenceType,
    });

    if (!canCreateTimeEntries) {
      setError("Du hast keine Berechtigung zum Schreiben von Stunden.");
      return;
    }

    const targetEmployees = employees.filter((employee) =>
      selectedCodes.includes(employee.code)
    );

    if (targetEmployees.length === 0) {
      setError("Bitte mindestens einen Mitarbeiter auswählen.");
      return;
    }

    const validationResults = targetEmployees.map((emp) => ({
      employee: emp,
      result: validateTimeEntry({
        date,
        employee: emp,
        entry: { ...base, employee_id: emp.id },
        existingEntries: entries,
      }),
    }));

    const validationErrors = validationResults
      .filter(({ result }) => result.errors.length > 0)
      .flatMap(({ employee, result }) =>
        result.errors.map((message) => `${employee?.name || employee?.code || "Mitarbeiter"}: ${message}`)
      );

    if (validationErrors.length) {
      setError(validationErrors.join("\n"));
      return;
    }

    const validationWarnings = validationResults
      .filter(({ result }) => result.warnings.length > 0)
      .map(({ employee, result }) => `${employee?.name || employee?.code || "Mitarbeiter"}:\n${formatValidationMessages({ warnings: result.warnings })}`);

    if (validationWarnings.length) {
      const proceed = await confirmValidationWarnings(validationWarnings);
      if (!proceed) return;
    }

    try {
      setSaving(true);

      const rows = targetEmployees.map((employee) => ({
        ...base,
        employee_id: employee.id,
      }));
      const savedRows = await createTimeEntries(supabase, rows);
      await writeCreateAudit(savedRows);
      alert(
        rows.length === 1
          ? "Gespeichert."
          : `Gespeichert für ${rows.length} Mitarbeiter.`
      );

      setNote("");
      setAbsenceType(null);
      setBadWeather(false);
      setBreakMin(30);
      setTravelMin(0);
      setCraneUsed(false);
      setCraneHours(1);
      setPrivatePkwUsed(false);
      setPrivatePkwKm(0);
      setZaUsed(false);
      setZaHours(0);
      setWeatherManual("");
      await loadEntries();
      await loadDailyCheckEntries();
    } catch (err) {
      logSbError("save error:", err);
      alert("Speichern fehlgeschlagen. Siehe Konsole.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    if (!canEditEntry(row)) return;
    setEditId(row.id);
    setEditState({
      project_id: row.project_id,
      from_hm: toHM(row.start_min ?? row.from_min ?? 0),
      to_hm: toHM(row.end_min ?? row.to_min ?? 0),
      break_min: row.break_min ?? 0,
      travel_minutes: row.travel_minutes ?? row.travel_min ?? 0,
      crane_hours: row.crane_hours ?? 0,
      private_pkw_km: row.private_pkw_km ?? 0,
      za_hours: row.za_hours ?? 0,
      bad_weather: !!row.bad_weather,
      weather_manual: row.weather_manual || "",
      weather_auto: row.weather_auto || "",
      weather_final: getWeatherFinalLabel(row),
      note: row.note || "",
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditState(null);
  }

  async function saveEdit() {
    if (!editId || !editState) return;

    const targetRow = entries.find((row) => String(row.id) === String(editId));
    if (!canEditEntry(targetRow)) return;

    const from_m = hmToMin(editState.from_hm);
    const to_m = hmToMin(editState.to_hm);
    if (to_m <= from_m) {
      alert("Ende muss nach Start liegen.");
      return;
    }

    try {
      await ensureMonthUnlocked(supabase, targetRow?.work_date || date);
    } catch (lockErr) {
      alert(lockErr?.message || "Dieser Monat ist gesperrt.");
      return;
    }

    const upd = buildEditedTimeEntryPayload({
      editState,
      fromMin: from_m,
      toMin: to_m,
    });

    const editEmployee =
      employees.find((emp) => String(emp.id) === String(targetRow?.employee_id)) ||
      employeeRow ||
      null;
    const editValidation = validateTimeEntry({
      date: targetRow?.work_date || date,
      employee: editEmployee,
      entry: { ...targetRow, ...upd },
      existingEntries: entries.filter((row) => String(row.id) !== String(editId)),
    });

    if (editValidation.errors.length) {
      setError(editValidation.errors.join("\n"));
      return;
    }

    if (editValidation.warnings.length) {
      const label = editEmployee?.name || editEmployee?.code || "Mitarbeiter";
      const proceed = await confirmValidationWarnings([
        `${label}:\n${formatValidationMessages({ warnings: editValidation.warnings })}`,
      ]);
      if (!proceed) return;
    }

    try {
      await updateTimeEntry(supabase, editId, upd);
      await writeUpdateAudit(targetRow, upd);
      await loadEntries();
      await loadDailyCheckEntries();
      cancelEdit();
    } catch (e) {
      logSbError("saveEdit error:", e);
      alert(e?.message || "Änderung konnte nicht gespeichert werden.");
    }
  }

  async function deleteEntry(id) {
    const targetRow = entries.find((row) => String(row.id) === String(id));
    if (!canDeleteEntry(targetRow)) return;
    try {
      await ensureMonthUnlocked(supabase, targetRow?.work_date || date);
    } catch (lockErr) {
      alert(lockErr?.message || "Dieser Monat ist gesperrt.");
      return;
    }
    if (!window.confirm("Eintrag wirklich löschen?")) return;
    try {
      await writeDeleteAudit(targetRow);
      await deleteTimeEntry(supabase, id);
      await loadEntries();
      await loadDailyCheckEntries();
    } catch (e) {
      logSbError("deleteEntry error:", e);
      alert(e?.message || "Löschen fehlgeschlagen.");
    }
  }

  const summaryCards = [
    { label: "Start", value: toHM(fromMin) },
    { label: "Ende", value: toHM(toMin) },
    { label: "Pause", value: `${breakMin} min` },
    { label: "Fahrzeit", value: formatTravelLabel(travelMin) },
    ...(craneUsed ? [{ label: "Kran", value: `${craneHours} h` }] : []),
    ...(privatePkwUsed && Number(privatePkwKm || 0) > 0 ? [{ label: "Privat-PKW", value: `${Number(privatePkwKm || 0).toLocaleString("de-AT")} km` }] : []),
    ...(zaUsed ? [{ label: "Zeitausgleich", value: `${Number(zaHours || 0).toFixed(2).replace(".", ",")} h` }] : []),
    ...(badWeather ? [{ label: "Schlechtwetter", value: "Ja" }] : []),
    { label: "Wetter", value: finalWeather || "—" },
  ];
  const editEntry = entries.find((row) => String(row.id) === String(editId)) || null;

  return (
    <div className="month-overview">
      <style>{`
        .mobile-time-entry { display: none; }
        @media (max-width: 768px) {
          .mobile-time-entry { display: block; padding-bottom: 92px; }
          .month-overview { padding-left: 8px; padding-right: 8px; }
          .month-main-card { padding: 14px !important; border-radius: 20px; }
          .mobile-time-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
          .mobile-time-card { border: 1px solid #ead7c5; background: #fffdfb; border-radius: 16px; padding: 14px 12px; display: flex; gap: 10px; align-items: center; min-height: 78px; box-shadow: 0 8px 22px rgba(88, 54, 30, .07); }
          .mobile-time-icon { width: 30px; height: 30px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 13px; flex: 0 0 auto; }
          .mobile-time-icon.start { background: #42a66b; } .mobile-time-icon.end { background: #df5b55; } .mobile-time-icon.pause { background: #e89539; } .mobile-time-icon.travel { background: #4b79a8; }
          .mobile-time-label { font-size: 12px; color: #7a5b44; font-weight: 800; }
          .mobile-time-value { font-size: 22px; font-weight: 900; color: #2d1e15; line-height: 1.05; margin-top: 3px; }
          .mobile-accordion { border: 1px solid #ead7c5; border-radius: 16px; background: #fffdfb; overflow: hidden; margin: 10px 0; box-shadow: 0 8px 22px rgba(88, 54, 30, .06); }
          .mobile-accordion summary { list-style: none; cursor: pointer; padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 900; color: #2d1e15; }
          .mobile-accordion summary::-webkit-details-marker { display: none; }
          .mobile-accordion summary span { font-size: 12px; font-weight: 800; color: #8b6b54; background: #f5eadf; padding: 4px 8px; border-radius: 999px; white-space: nowrap; }
          .mobile-accordion[open] { padding-bottom: 12px; }
          .mobile-accordion[open] > :not(summary) { margin-left: 14px; margin-right: 14px; }
          .mobile-chip-section { margin-top: 12px; }
          .mobile-voice-btn { width: 100%; border: 1px solid #9a603b; background: #9a603b; color: #fff; border-radius: 14px; padding: 13px 14px; font-weight: 900; font-size: 15px; box-shadow: 0 8px 18px rgba(123, 74, 45, .2); }
          .mobile-voice-btn.active { background: #6f3f25; }
          .mobile-total-box { margin-top: 14px; }
          .mobile-sticky-save { position: sticky; bottom: 8px; z-index: 30; padding: 10px; background: rgba(244, 236, 225, .88); backdrop-filter: blur(10px); border-radius: 20px; box-shadow: 0 -6px 24px rgba(88, 54, 30, .12); margin-top: 12px; }
          .mobile-sticky-save .save-btn { width: 100%; min-height: 52px; font-size: 16px; border-radius: 16px; }
        }
      `}</style>
      <TimeValidationDialog
        warnings={validationDialog?.warnings || []}
        onCancel={() => closeValidationDialog(false)}
        onConfirm={() => closeValidationDialog(true)}
      />
      <TimeEntryEditDialog
        entry={editEntry}
        editState={editState}
        setEditState={setEditState}
        projects={projects}
        craneHourOptions={CRANE_HOUR_OPTIONS}
        weatherOptions={WEATHER_MANUAL_OPTIONS}
        onCancel={cancelEdit}
        onSave={saveEdit}
      />
      <div className="month-overview-hero hbz-card">
        <div className="month-overview-hero__content">
          <div>
            <div className="month-overview-kicker">Zeiterfassung</div>
            <h2 className="month-overview-title">Tageserfassung</h2>
            <div className="month-overview-subtitle">
              Datum: <b>{date}</b>
            </div>
            {buakWeekLabel && (
              <div className="month-overview-subtitle">
                <b>{buakWeekLabel}</b>
              </div>
            )}
            {holidayNameToday && (
              <div className="month-overview-subtitle">
                Feiertag: <b>{holidayNameToday}</b> · Soll bleibt <b>{buakSollHoursToday} h</b>
              </div>
            )}
            <div className="month-overview-subtitle" style={{ marginTop: 6 }}>
              ZA-Konto: {ownZaEnabled ? (
                <>
                  <b>{ownZaLoading ? "lädt…" : ownZaBalance == null ? "—" : formatSignedHours(ownZaBalance)}</b>
                  <span style={{ opacity: 0.75 }}> · Stand bis gestern</span>
                </>
              ) : (
                <b>nicht geführt</b>
              )}
            </div>
          </div>

          <div className="month-overview-actions">
            <button
              className="hbz-btn"
              type="button"
              onClick={() => shiftDate(-1)}
            >
              ← Tag zurück
            </button>
            <button
              className="hbz-btn"
              type="button"
              onClick={() => shiftDate(1)}
            >
              Tag vor →
            </button>
          </div>
        </div>
      </div>

      {dailyCheckRows.length > 0 && (
        <div className="hbz-card month-main-card daily-check-card">
          <div className="month-main-header">
            <div>
              <div className="month-card-title">📊 Tageskontrolle</div>
              <div className="month-main-subtitle">
                {dailyCheckLoading
                  ? "Prüfe Einträge…"
                  : holidayNameToday
                  ? `Feiertag: ${holidayNameToday} · BUAK Soll heute: ${buakSollHoursToday} h`
                  : buakSollHoursToday > 0
                  ? `BUAK Soll heute: ${buakSollHoursToday} h`
                  : "Laut BUAK heute kein Pflicht-Eintrag"}
              </div>
            </div>

            <div className="daily-check-summary">
              <span className="badge-soft">✅ {dailyCheckSummary.ok}</span>
              <span className="badge-soft">❌ {dailyCheckSummary.missing}</span>
              <span className="badge-soft">🟡 {dailyCheckSummary.urlaub}</span>
              <span className="badge-soft">🔵 {dailyCheckSummary.krank}</span>
            </div>
          </div>


          {canViewAllTeamStatus && (
          <div className="daily-check-controls">
            <div className="daily-check-filter-row">
              <button type="button" className={`daily-check-filter-btn ${dailyCheckStatusFilter === "all" ? "active" : ""}`} onClick={() => setDailyCheckStatusFilter("all")}>
                Alle ({dailyCheckSummary.total})
              </button>
              <button type="button" className={`daily-check-filter-btn ${dailyCheckStatusFilter === "missing" ? "active" : ""}`} onClick={() => setDailyCheckStatusFilter("missing")}>
                ❌ Fehlt ({dailyCheckSummary.missing})
              </button>
              <button type="button" className={`daily-check-filter-btn ${dailyCheckStatusFilter === "ok" ? "active" : ""}`} onClick={() => setDailyCheckStatusFilter("ok")}>
                ✅ Eingetragen ({dailyCheckSummary.ok})
              </button>
              <button type="button" className={`daily-check-filter-btn ${dailyCheckStatusFilter === "absence" ? "active" : ""}`} onClick={() => setDailyCheckStatusFilter("absence")}>
                🟡/🔵 Urlaub/Krank ({dailyCheckSummary.urlaub + dailyCheckSummary.krank})
              </button>
              {dailyCheckSummary.notRequired > 0 && (
                <button type="button" className={`daily-check-filter-btn ${dailyCheckStatusFilter === "not_required" ? "active" : ""}`} onClick={() => setDailyCheckStatusFilter("not_required")}>
                  ⚪ frei ({dailyCheckSummary.notRequired})
                </button>
              )}
            </div>

            <div className="daily-check-employee-filter">
              <div className="daily-check-filter-label">Mitarbeiter oben anzeigen:</div>
              <div className="daily-check-filter-row">
                <button type="button" className={`daily-check-filter-btn ${dailyCheckEmployeeCodes.length === 0 ? "active" : ""}`} onClick={() => setDailyCheckEmployeeCodes([])}>
                  Alle MA
                </button>
                {dailyCheckRows.map((emp) => {
                  const key = String(emp.code || emp.id || "");
                  const active = dailyCheckEmployeeCodes.includes(key);
                  return (
                    <button key={emp.id || emp.code} type="button" className={`daily-check-filter-btn ${active ? "active" : ""}`} onClick={() => toggleDailyCheckEmployee(key)}>
                      {emp.name || emp.code}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          )}
          {dailyCheckRows.length === 0 ? (
            <div className="month-empty-state">
              Keine Mitarbeiter für die Tageskontrolle gefunden.
            </div>
          ) : filteredDailyCheckRows.length === 0 ? (
            <div className="month-empty-state">
              Für diese Auswahl gibt es keine Mitarbeiter.
            </div>
          ) : (
            <div className="daily-check-grid">
              {filteredDailyCheckRows.map((emp) => (
                <div
                  key={emp.id || emp.code}
                  className={`daily-check-pill daily-check-${emp.status}`}
                  title={emp.entryCount > 1 ? `${emp.entryCount} Einträge vorhanden` : ""}
                >
                  <span className="daily-check-name">{emp.name || emp.code}</span>
                  <span className="daily-check-state">
                    {emp.statusIcon} {emp.statusLabel}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="help" style={{ marginTop: 10 }}>
            {canViewAllTeamStatus
              ? "Geprüft werden nur aktive Mitarbeiter mit „In Tageskontrolle anzeigen“. Freie BUAK-Tage werden nicht als fehlend gewertet."
              : "Aus Datenschutzgründen wird hier nur dein eigener Status angezeigt."}
          </div>
        </div>
      )}

      <div className="hbz-card month-main-card">
        <div className="month-card-title">Zeiten erfassen</div>

        <div className="month-filter-grid">
          <div className="field-inline">
            <label className="hbz-label">Datum</label>
            <input
              type="date"
              className="hbz-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="field-inline">
            <label className="hbz-label">Projekt</label>
            <select
              className="hbz-select"
              value={projectId ?? ""}
              disabled={absenceType === "krank" || absenceType === "urlaub"}
              onChange={(e) => setProjectId(e.target.value || null)}
            >
              <option value="">— ohne Projekt —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {assignmentSuggestions.length > 0 && absenceType !== "krank" && absenceType !== "urlaub" && (
          <div className="assignment-prefill-box">
            <div className="assignment-prefill-head">
              <strong>Arbeitseinteilung</strong>
              {assignmentInfo ? <span className="badge-soft">{assignmentInfo}</span> : null}
            </div>

            <div className="assignment-chip-list">
              {assignmentSuggestions.map((item) => {
                const active = String(projectId || "") === String(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`assignment-chip${active ? " active" : ""}`}
                    onClick={() => setProjectId(item.id)}
                  >
                    {item.code ? `${item.code} · ${item.name}` : item.name}
                  </button>
                );
              })}
            </div>

            <div className="help" style={{ marginTop: 8 }}>
              Das erste eingeteilte Projekt wird automatisch vorgeschlagen, du kannst es aber jederzeit ändern.
            </div>
          </div>
        )}

        {canCreateTimeEntries ? (
          <TimeEntryEmployeePicker
            employees={employees}
            selected={selectedCodes}
            onChange={setSelectedCodes}
            ownCode={employeeRow?.code || session?.code}
            assignmentLabel={assignmentSelectionLabel}
          />
        ) : null}

        {projectAddress && absenceType !== "krank" && absenceType !== "urlaub" && (
          <div
            className="help"
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>
              Baustelle: <b>{projectAddress}</b>
            </span>

            <button
              type="button"
              className="hbz-btn btn-small"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    projectAddress
                  )}`,
                  "_blank"
                )
              }
            >
              Route öffnen
            </button>

            <button
              type="button"
              className="hbz-btn btn-small"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(projectAddress);
                  alert("Adresse kopiert.");
                } catch {
                  alert("Adresse konnte nicht kopiert werden.");
                }
              }}
            >
              Adresse kopieren
            </button>
          </div>
        )}

        {(absenceType === "krank" || absenceType === "urlaub") && (
          <div className="help" style={{ marginTop: 8 }}>
            Bei Krank/Urlaub ist kein Projekt nötig.
          </div>
        )}

        {projectLoadNote && (
          <div className="year-error-box" style={{ marginTop: 12 }}>
            {projectLoadNote}
          </div>
        )}

        {isMobile && (
          <div className="mobile-time-entry">
            {selectedWorkDayDefaults?.active && (
            <div className="help" style={{ margin: "8px 0" }}>
              Standard: <b>{selectedWorkDayDefaults.start}–{selectedWorkDayDefaults.end}</b>, Pause <b>{selectedWorkDayDefaults.breakMinutes} min</b>, Soll <b>{selectedWorkDayDefaults.requiredHours} h</b>
              <button type="button" className="hbz-btn btn-small" style={{ marginLeft: 8 }} onClick={() => applySelectedEmployeeDefaults(true)}>Standard übernehmen</button>
            </div>
          )}
          <div className="mobile-time-grid">
              <div className="mobile-time-card"><span className="mobile-time-icon start">▶</span><div><div className="mobile-time-label">Start</div><div className="mobile-time-value">{toHM(fromMin)}</div></div></div>
              <div className="mobile-time-card"><span className="mobile-time-icon end">■</span><div><div className="mobile-time-label">Ende</div><div className="mobile-time-value">{toHM(toMin)}</div></div></div>
              <div className="mobile-time-card"><span className="mobile-time-icon pause">☕</span><div><div className="mobile-time-label">Pause</div><div className="mobile-time-value">{formatTravelLabel(breakMin)}</div></div></div>
              <div className="mobile-time-card"><span className="mobile-time-icon travel">🚙</span><div><div className="mobile-time-label">Fahrzeit</div><div className="mobile-time-value">{formatTravelLabel(travelMin)}</div></div></div>
            </div>
            <details className="mobile-accordion"><summary>⏱ Zeiten anpassen <span>{toHM(fromMin)} – {toHM(toMin)}</span></summary>
              <div className="month-card-edit-grid" style={{ marginTop: 10 }}>
                <div className="month-card-field"><label className="hbz-label">Start</label><input type="range" min={5 * 60} max={19 * 60 + 30} step={15} value={fromMin} onChange={(e) => { if (absenceType) setAbsenceType(null); setFromMin(Number(e.target.value)); }} style={{ width: "100%" }} /><div className="month-card-mainhrs" style={{ marginTop: 8 }}>{toHM(fromMin)}</div></div>
                <div className="month-card-field"><label className="hbz-label">Ende</label><input type="range" min={5 * 60} max={19 * 60 + 30} step={15} value={toMin} onChange={(e) => { if (absenceType) setAbsenceType(null); setToMin(Number(e.target.value)); }} style={{ width: "100%" }} /><div className="month-card-mainhrs" style={{ marginTop: 8 }}>{toHM(toMin)}</div></div>
              </div>
              <div className="mobile-chip-section"><div className="month-card-title">Pause</div><div className="hbz-chipbar">{PAUSE_OPTIONS.map((m) => (<button key={m} type="button" className={`hbz-chip ${breakMin === m ? "active" : ""}`} onClick={() => { if (absenceType) setAbsenceType(null); setBreakMin(m); }}>{formatTravelLabel(m)}</button>))}</div></div>
            </details>
            <details className="mobile-accordion"><summary>👷 Abwesenheit <span>{zaUsed ? "Zeitausgleich" : absenceType ? (absenceType === "krank" ? "Krank" : "Urlaub") : badWeather ? "Schlechtwetter" : "Normal"}</span></summary>
              <div className="hbz-chipbar">
                <button type="button" className={`hbz-chip ${absenceType === "krank" ? "active" : ""}`} onClick={applyKrankDefaults}>Krank</button>
                <button type="button" className={`hbz-chip ${absenceType === "urlaub" ? "active" : ""}`} onClick={applyUrlaubDefaults}>Urlaub</button>
                <button type="button" className={`hbz-chip ${zaUsed ? "active" : ""}`} onClick={applyZeitausgleichDefaults}>Zeitausgleich</button>
                <button type="button" className={`hbz-chip ${badWeather ? "active" : ""}`} onClick={() => { setAbsenceType(null); setZaUsed(false); setZaHours(0); setBadWeather((v) => !v); }}>Schlechtwetter</button>
                {(absenceType || badWeather || zaUsed) && <button type="button" className="hbz-chip" onClick={clearAbsenceAndZa}>Normal</button>}
              </div>
            </details>
            <details className="mobile-accordion"><summary>🚙 Fahrzeit <span>{formatTravelLabel(travelMin)}</span></summary><div className="hbz-chipbar">{TRAVEL_OPTIONS.map((m) => (<button key={m} type="button" className={`hbz-chip ${travelMin === m ? "active" : ""}`} onClick={() => { if (absenceType) setAbsenceType(null); setTravelMin(m); }}>{formatTravelLabel(m)}</button>))}</div></details>
            <details className="mobile-accordion"><summary>🏗 Kran / Privat-PKW <span>{craneUsed ? `${craneHours} h` : privatePkwUsed ? `${privatePkwKm || 0} km` : "—"}</span></summary><div className="hbz-chipbar" style={{ alignItems: "center" }}><button type="button" className={`hbz-chip ${craneUsed ? "active" : ""}`} onClick={() => setCraneUsed((v) => !v)} disabled={!!absenceType || zaUsed}>🏗 Kran verwendet</button>{craneUsed && (<select className="hbz-input" value={craneHours} onChange={(e) => setCraneHours(Number(e.target.value))} disabled={!!absenceType || zaUsed} style={{ maxWidth: 140 }}>{CRANE_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h} h</option>)}</select>)}<button type="button" className={`hbz-chip ${privatePkwUsed ? "active" : ""}`} onClick={() => { const value = prompt("Wie viele Kilometer mit Privat-PKW?", String(privatePkwKm || "")); if (value === null) return; const km = Number(String(value).replace(",", ".")); if (!Number.isFinite(km) || km < 0) { alert("Bitte gültige Kilometer eingeben."); return; } setPrivatePkwKm(km); setPrivatePkwUsed(km > 0); }} disabled={!!absenceType || zaUsed}>🚗 Privat-PKW</button>{privatePkwUsed && <button type="button" className="hbz-chip" onClick={() => { setPrivatePkwUsed(false); setPrivatePkwKm(0); }}>PKW löschen</button>}</div></details>
            <details className="mobile-accordion"><summary>☁ Wetter <span>{finalWeather || "—"}</span></summary>
              <div className="month-card-field"><label className="hbz-label">Automatisch von Baustelle + Buchung</label><div className="hbz-input" style={{ display: "flex", alignItems: "center", gap: 8 }}><span>{weatherLoading ? "Lade Wetter…" : weatherAuto || "—"}</span><button type="button" className="hbz-btn btn-small" onClick={() => loadWeatherForCurrentBooking(true)} disabled={weatherLoading || !projectAddress || !!absenceType}>Aktualisieren</button></div></div>
              <div className="month-card-field" style={{ marginTop: 10 }}><label className="hbz-label">Manuell ändern</label><select className="hbz-input" value={weatherManual || "Automatisch"} disabled={!!absenceType} onChange={(e) => { const value = e.target.value; setWeatherManual(value === "Automatisch" ? "" : value); }}>{WEATHER_MANUAL_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select></div>
            </details>
            <details className="mobile-accordion" open><summary>🎤 Notiz / Tätigkeit <span>{note ? "ausgefüllt" : "leer"}</span></summary>
              <button type="button" className={`mobile-voice-btn ${voiceListening ? "active" : ""}`} onClick={startVoiceNote} disabled={!voiceSupported || voiceListening}>{voiceListening ? "🎤 Aufnahme läuft…" : "🎤 Notiz sprechen"}</button>
              {!voiceSupported && <div className="help" style={{ marginTop: 6 }}>Spracherkennung ist in diesem Browser nicht verfügbar. Am iPhone kannst du alternativ die Diktierfunktion der Tastatur verwenden.</div>}
              <textarea className="hbz-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Tätigkeit, Besonderheiten…" style={{ marginTop: 10 }} />
            </details>
            <div className="year-range-active mobile-total-box"><strong>Arbeitszeit heute:</strong> {totalHours.toFixed(2)} h{totalOvertime > 0 ? ` | Ü: ${totalOvertime.toFixed(2)} h` : " | keine Überstunden"}</div>
            {error && <div className="year-error-box" style={{ marginTop: 12 }}><b>Hinweis:</b> {error}</div>}
            <div className="mobile-sticky-save"><button type="button" className="save-btn lg" onClick={handleSave} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button></div>
          </div>
        )}

        {!isMobile && (
          <>
        <div className="month-summary-grid" style={{ marginTop: 16 }}>
          {summaryCards.map((card) => (
            <div key={card.label} className="month-summary-card">
              <div className="month-summary-label">{card.label}</div>
              <div className="month-summary-value">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="year-sections" style={{ marginTop: 18 }}>
          <div className="year-section">
            <div className="month-card-title">Arbeitszeit</div>
            {selectedWorkDayDefaults?.active && (
              <div className="help" style={{ marginTop: 6 }}>
                Standard: <b>{selectedWorkDayDefaults.start}–{selectedWorkDayDefaults.end}</b>, Pause <b>{selectedWorkDayDefaults.breakMinutes} min</b>, Soll <b>{selectedWorkDayDefaults.requiredHours} h</b>
                <button type="button" className="hbz-btn btn-small" style={{ marginLeft: 8 }} onClick={() => applySelectedEmployeeDefaults(true)}>Standard übernehmen</button>
              </div>
            )}

            <div className="month-card-edit-grid" style={{ marginTop: 10 }}>
              <div className="month-card-field">
                <label className="hbz-label">Start</label>
                <input
                  type="range"
                  min={5 * 60}
                  max={19 * 60 + 30}
                  step={15}
                  value={fromMin}
                  onChange={(e) => {
                    if (absenceType) setAbsenceType(null);
                    setFromMin(Number(e.target.value));
                  }}
                  style={{ width: "100%" }}
                />
                <div className="month-card-mainhrs" style={{ marginTop: 8 }}>
                  {toHM(fromMin)}
                </div>
              </div>

              <div className="month-card-field">
                <label className="hbz-label">Ende</label>
                <input
                  type="range"
                  min={5 * 60}
                  max={19 * 60 + 30}
                  step={15}
                  value={toMin}
                  onChange={(e) => {
                    if (absenceType) setAbsenceType(null);
                    setToMin(Number(e.target.value));
                  }}
                  style={{ width: "100%" }}
                />
                <div className="month-card-mainhrs" style={{ marginTop: 8 }}>
                  {toHM(toMin)}
                </div>
              </div>
            </div>
          </div>

          <div className="year-section">
            <div className="month-card-title">Pause</div>
            <div className="hbz-chipbar">
              {PAUSE_OPTIONS.map((m) => {
                const active = breakMin === m;
                const label = formatTravelLabel(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`hbz-chip ${active ? "active" : ""}`}
                    onClick={() => {
                      if (absenceType) setAbsenceType(null);
                      setBreakMin(m);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="year-section">
            <div className="month-card-title">Abwesenheit</div>
            <div className="hbz-chipbar">
              <button
                type="button"
                className={`hbz-chip ${
                  absenceType === "krank" ? "active" : ""
                }`}
onClick={applyKrankDefaults}
              >
                Krank
              </button>

              <button
                type="button"
                className={`hbz-chip ${
                  absenceType === "urlaub" ? "active" : ""
                }`}
onClick={applyUrlaubDefaults}
              >
                Urlaub
              </button>

              <button
                type="button"
                className={`hbz-chip ${zaUsed ? "active" : ""}`}
                onClick={applyZeitausgleichDefaults}
              >
                Zeitausgleich
              </button>

              <button type="button" className={`hbz-chip ${badWeather ? "active" : ""}`} onClick={() => { setAbsenceType(null); setZaUsed(false); setZaHours(0); setBadWeather((v) => !v); }}>
                Schlechtwetter
              </button>

              {(absenceType || badWeather || zaUsed) && (
                <button
                  type="button"
                  className="hbz-chip"
                  onClick={clearAbsenceAndZa}
                  title="Abwesenheit zurücksetzen"
                >
                  Normal
                </button>
              )}
            </div>
          </div>

          {zaUsed && (
            <div className="year-section">
              <div className="month-card-title">Zeitausgleich</div>
              <div className="month-card-field" style={{ maxWidth: 220 }}>
                <label className="hbz-label">ZA-Stunden</label>
                <input
                  type="number"
                  className="hbz-input"
                  min="0"
                  step="0.25"
                  value={zaHours}
                  onChange={(e) => setZaHours(Number(String(e.target.value).replace(",", ".")) || 0)}
                />
              </div>
              <div className="help" style={{ marginTop: 8 }}>
                Wird als <b>Zeitausgleich</b> gespeichert und vom ZA-Konto abgezogen.
              </div>
            </div>
          )}

          <div className="year-section">
            <div className="month-card-title">Fahrzeit</div>
            <div className="hbz-chipbar">
              {TRAVEL_OPTIONS.map((m) => {
                const active = travelMin === m;
                const label = formatTravelLabel(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`hbz-chip ${active ? "active" : ""}`}
                    onClick={() => {
                      if (absenceType) setAbsenceType(null);
                      setTravelMin(m);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="help" style={{ marginTop: 8 }}>
              Kostenstelle: <b>FAHRZEIT</b> – wird zur Arbeitszeit dazugerechnet
              und in den Auswertungen separat ausgewiesen.
            </div>
          </div>

          <div className="year-section">
            <div className="month-card-title">Kranzeit / Privat-PKW</div>
            <div className="hbz-chipbar" style={{ alignItems: "center" }}>
              <button
                type="button"
                className={`hbz-chip ${craneUsed ? "active" : ""}`}
                onClick={() => setCraneUsed((v) => !v)}
                disabled={!!absenceType || zaUsed}
                title="Kranzeit zu diesem Zeiteintrag speichern"
              >
                🏗 Kran verwendet
              </button>

              <button
                type="button"
                className={`hbz-chip ${privatePkwUsed ? "active" : ""}`}
                onClick={() => {
                  if (privatePkwUsed) {
                    setPrivatePkwUsed(false);
                    setPrivatePkwKm(0);
                    return;
                  }
                  const value = prompt("Wie viele Kilometer mit Privat-PKW?", String(privatePkwKm || ""));
                  if (value === null) return;
                  const km = Number(String(value).replace(",", "."));
                  if (!Number.isFinite(km) || km < 0) {
                    alert("Bitte gültige Kilometer eingeben.");
                    return;
                  }
                  setPrivatePkwKm(km);
                  setPrivatePkwUsed(km > 0);
                }}
                disabled={!!absenceType || zaUsed}
                title="Private PKW-Kilometer zu diesem Eintrag speichern"
              >
                🚗 Privat-PKW
              </button>

              {craneUsed && (
                <div className="month-card-field" style={{ minWidth: 160, margin: 0 }}>
                  <label className="hbz-label">Kranstunden</label>
                  <select
                    className="hbz-input"
                    value={craneHours}
                    onChange={(e) => setCraneHours(Number(e.target.value))}
                    disabled={!!absenceType || zaUsed}
                  >
                    {CRANE_HOUR_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {h} h
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {privatePkwUsed && (
                <div className="month-card-field" style={{ minWidth: 160, margin: 0 }}>
                  <label className="hbz-label">Kilometer</label>
                  <input
                    type="number"
                    className="hbz-input"
                    min="0"
                    step="0.5"
                    value={privatePkwKm}
                    onChange={(e) => {
                      const km = Number(String(e.target.value).replace(",", "."));
                      setPrivatePkwKm(Number.isFinite(km) ? km : 0);
                    }}
                    disabled={!!absenceType || zaUsed}
                  />
                </div>
              )}
            </div>
            <div className="help" style={{ marginTop: 8 }}>
              Wird als <b>Kranzeit</b> bzw. <b>Privat-PKW km</b> zum Eintrag gespeichert.
            </div>
          </div>

          <div className="year-section">
            <div className="month-card-title">Wetter</div>
            <div className="month-card-field">
              <label className="hbz-label">Automatisch von Baustelle + Buchung</label>
              <div className="hbz-input" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{weatherLoading ? "Lade Wetter…" : weatherAuto || "—"}</span>
                <button
                  type="button"
                  className="hbz-btn btn-small"
                  onClick={() => loadWeatherForCurrentBooking(true)}
                  disabled={weatherLoading || !projectAddress || !!absenceType}
                >
                  Aktualisieren
                </button>
              </div>
            </div>

            <div className="month-card-edit-grid" style={{ marginTop: 10 }}>
              <div className="month-card-field">
                <label className="hbz-label">Manuell ändern</label>
                <select
                  className="hbz-input"
                  value={weatherManual || "Automatisch"}
                  disabled={!!absenceType}
                  onChange={(e) => {
                    const value = e.target.value;
                    setWeatherManual(value === "Automatisch" ? "" : value);
                  }}
                >
                  {WEATHER_MANUAL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="month-card-field">
                <label className="hbz-label">Finales Wetter</label>
                <div className="hbz-input">{finalWeather || "—"}</div>
              </div>
            </div>

            <div className="month-card-meta" style={{ marginTop: 10 }}>
              <span>Temperatur: {formatTemp(temperature)}</span>
              <span>Niederschlag: {formatPrecip(precipitation)}</span>
              <span>Quelle: {weatherSource || "—"}</span>
            </div>

            {weatherError && <div className="help" style={{ marginTop: 8 }}>{weatherError}</div>}
          </div>
        </div>

        <div className="year-range-active" style={{ marginTop: 16 }}>
          <strong>Arbeitszeit heute:</strong> {totalHours.toFixed(2)} h
          {totalOvertime > 0
            ? ` | Ü: ${totalOvertime.toFixed(2)} h`
            : " | keine Überstunden"}
        </div>

        <div className="month-card-field" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
            <label className="hbz-label" style={{ margin: 0 }}>Notiz / Tätigkeit</label>
            <button
              type="button"
              className={`hbz-btn btn-small ${voiceListening ? "hbz-btn-primary" : ""}`}
              onClick={startVoiceNote}
              disabled={!voiceSupported || voiceListening}
              title={voiceSupported ? "Notiz per Sprache aufnehmen" : "Spracherkennung wird nicht unterstützt"}
            >
              {voiceListening ? "🎤 Höre zu…" : "🎤 Notiz sprechen"}
            </button>
          </div>
          <textarea
            className="hbz-textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Tätigkeit, Besonderheiten…"
          />
          {!voiceSupported && (
            <div className="help" style={{ marginTop: 6 }}>
              Spracherkennung ist in diesem Browser nicht verfügbar. Am iPhone kannst du alternativ die Diktierfunktion der Tastatur verwenden.
            </div>
          )}
        </div>

        {error && (
          <div className="year-error-box" style={{ marginTop: 12 }}>
            <b>Hinweis:</b> {error}
          </div>
        )}

        <div className="save-bar">
          <button
            type="button"
            className="save-btn lg"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
        </>
        )}
      </div>

      <PushSettings currentUser={currentUser || employeeRow || session} />

      <div className="hbz-card month-main-card">
        <div className="month-main-header">
          <div>
            <div className="month-card-title">Einträge am {date}</div>
            <div className="month-main-subtitle">
              {loading ? "Lade Einträge…" : "Tagesübersicht"}
            </div>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="hbz-btn btn-small"
              onClick={openRecentAuditLog}
              title="Nur für Admin sichtbar"
            >
              Änderungen letzte 45 Tage
            </button>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <div className="month-empty-state">Keine Einträge.</div>
        ) : (
          <>
            {!isMobile && (
              <div className="month-table-wrap">
                <table className="month-table">
                  <thead>
                    <tr>
                      <th>Mitarbeiter</th>
                      <th>Projekt</th>
                      <th className="num">Start</th>
                      <th className="num">Ende</th>
                      <th className="num">Pause</th>
                      <th className="num">Fahrzeit</th>
                      <th className="num">Kran</th>
                      <th className="num">Privat-PKW</th>
                      <th className="num">ZA</th>
                      <th className="num">Stunden</th>
                      <th className="num">Überstunden</th>
                      <th>Wetter</th>
                      <th>Notiz</th>
                      <th className="num">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((r) => {
                      const start = r.start_min ?? r.from_min ?? 0;
                      const end = r.end_min ?? r.to_min ?? 0;
                      const breakM = r.break_min ?? 0;
                      const travelM =
                        r.travel_minutes ?? r.travel_min ?? r.travel ?? 0;
                      const work = Math.max(end - start - breakM, 0);
                      const total = work + (travelM || 0);
                      const hrs = h2(total);
                      const ot = Math.max(hrs - 9, 0);
                      const isEditing = false;

                      if (!isEditing) {
                        return (
                          <tr key={r.id}>
                            <td>{r.employee_name || r.employee_id}</td>
                            <td>{r.project_name || "—"}</td>
                            <td className="num">{toHM(start)}</td>
                            <td className="num">{toHM(end)}</td>
                            <td className="num">{breakM} min</td>
                            <td className="num">{travelM} min</td>
                            <td className="num">{r.crane_hours ? `${r.crane_hours} h` : "—"}</td>
                            <td className="num">{Number(r.private_pkw_km || 0) > 0 ? `${Number(r.private_pkw_km || 0).toLocaleString("de-AT")} km` : "—"}</td>
                            <td className="num">{Number(r.za_hours || 0) > 0 ? `${Number(r.za_hours || 0).toLocaleString("de-AT")} h` : "—"}</td>
                            <td className="num">{hrs.toFixed(2)}</td>
                            <td className="num">{ot.toFixed(2)}</td>
                            <td>{getWeatherFinalLabel(r) || "—"}</td>
                            <td>{r.note || ""}</td>
                            <td className="num">
                              {isAdmin || canEditEntry(r) || canDeleteEntry(r) ? (
                                <div className="month-action-group">
                                  {isAdmin ? (
                                    <button
                                      className="hbz-btn btn-small"
                                      type="button"
                                      onClick={() => openAuditLog(r)}
                                      title="Nur für Admin sichtbar"
                                    >
                                      Verlauf
                                    </button>
                                  ) : null}
                                  {canEditEntry(r) ? (
                                    <button
                                      className="hbz-btn btn-small"
                                      type="button"
                                      onClick={() => startEdit(r)}
                                    >
                                      Bearbeiten
                                    </button>
                                  ) : null}
                                  {canDeleteEntry(r) ? (
                                    <button
                                      className="hbz-btn btn-small"
                                      type="button"
                                      onClick={() => deleteEntry(r.id)}
                                    >
                                      Löschen
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="help">nur Anzeige</span>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={`${r.id}-edit`}>
                          <td>{r.employee_name || r.employee_id}</td>
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
                              step={5}
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
                            <select
                              className="hbz-input"
                              value={editState.crane_hours ?? 0}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  crane_hours: e.target.value,
                                }))
                              }
                            >
                              <option value={0}>—</option>
                              {CRANE_HOUR_OPTIONS.map((h) => (
                                <option key={h} value={h}>
                                  {h} h
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min={0}
                              step={0.5}
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
                          <td className="num">
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              className="hbz-input"
                              value={editState.za_hours ?? 0}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  za_hours: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="num">
                            {(() => {
                              const startM = hmToMin(editState.from_hm);
                              const endM = hmToMin(editState.to_hm);
                              const br =
                                parseInt(editState.break_min || "0", 10) || 0;
                              const tr =
                                parseInt(editState.travel_minutes || "0", 10) ||
                                0;
                              const w = Math.max(endM - startM - br, 0) + tr;
                              const h = h2(w);
                              return h.toFixed(2);
                            })()}
                          </td>
                          <td className="num">
                            {(() => {
                              const startM = hmToMin(editState.from_hm);
                              const endM = hmToMin(editState.to_hm);
                              const br =
                                parseInt(editState.break_min || "0", 10) || 0;
                              const tr =
                                parseInt(editState.travel_minutes || "0", 10) ||
                                0;
                              const w = Math.max(endM - startM - br, 0) + tr;
                              const h = h2(w);
                              const o = Math.max(h - 9, 0);
                              return o.toFixed(2);
                            })()}
                          </td>
                          <td>
                            <select
                              className="hbz-input"
                              value={editState.weather_manual || "Automatisch"}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  weather_manual:
                                    e.target.value === "Automatisch" ? "" : e.target.value,
                                }))
                              }
                            >
                              {WEATHER_MANUAL_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
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
                                type="button"
                                onClick={saveEdit}
                              >
                                Speichern
                              </button>
                              <button
                                className="hbz-btn btn-small"
                                type="button"
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
                {entries.map((r) => {
                  const start = r.start_min ?? r.from_min ?? 0;
                  const end = r.end_min ?? r.to_min ?? 0;
                  const breakM = r.break_min ?? 0;
                  const travelM =
                    r.travel_minutes ?? r.travel_min ?? r.travel ?? 0;
                  const work = Math.max(end - start - breakM, 0);
                  const total = work + (travelM || 0);
                  const hrs = h2(total);
                  const ot = Math.max(hrs - 9, 0);
                  const isEditing = false;

                  if (!isEditing) {
                    return (
                      <div key={`card-${r.id}`} className="month-card">
                        <div className="month-card-header">
                          <div>
                            <div className="month-card-date">{date}</div>
                            <div className="month-card-emp">
                              {r.employee_name || r.employee_id}
                            </div>
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
                          <span>Pause: {breakM} min</span>
                          <span>Fahrzeit: {travelM} min</span>
                          {r.crane_hours ? <span>Kran: {r.crane_hours} h</span> : null}
                          {Number(r.private_pkw_km || 0) > 0 ? <span>Privat-PKW: {Number(r.private_pkw_km || 0).toLocaleString("de-AT")} km</span> : null}
                          {Number(r.za_hours || 0) > 0 ? <span>ZA: {Number(r.za_hours || 0).toLocaleString("de-AT")} h</span> : null}
                        </div>

                        <div className="month-card-row">
                          <strong>Wetter:</strong> {getWeatherFinalLabel(r) || "—"}
                        </div>

                        {r.note && (
                          <div className="month-card-row">
                            <strong>Notiz:</strong> {r.note}
                          </div>
                        )}

                        <div className="month-card-actions">
                          {isAdmin || canEditEntry(r) || canDeleteEntry(r) ? (
                            <>
                              {isAdmin ? (
                                <button
                                  className="hbz-btn btn-small"
                                  type="button"
                                  onClick={() => openAuditLog(r)}
                                  title="Nur für Admin sichtbar"
                                >
                                  Verlauf
                                </button>
                              ) : null}
                              {canEditEntry(r) ? (
                                <button
                                  className="hbz-btn btn-small"
                                  type="button"
                                  onClick={() => startEdit(r)}
                                >
                                  Bearbeiten
                                </button>
                              ) : null}
                              {canDeleteEntry(r) ? (
                                <button
                                  className="hbz-btn btn-small"
                                  type="button"
                                  onClick={() => deleteEntry(r.id)}
                                >
                                  Löschen
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <span className="help">nur Anzeige</span>
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
                    <div key={`card-${r.id}-edit`} className="month-card month-card-edit">
                      <div className="month-card-header">
                        <div>
                          <div className="month-card-date">{date}</div>
                          <div className="month-card-emp">
                            {r.employee_name || r.employee_id}
                          </div>
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
                            step={5}
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
                      </div>

                      <div className="month-card-edit-grid">
                        <div className="month-card-field">
                          <label className="hbz-label">Kran (h)</label>
                          <select
                            className="hbz-input"
                            value={editState.crane_hours ?? 0}
                            onChange={(e) =>
                              setEditState((s) => ({ ...s, crane_hours: e.target.value }))
                            }
                          >
                            <option value={0}>—</option>
                            {CRANE_HOUR_OPTIONS.map((h) => (
                              <option key={h} value={h}>{h} h</option>
                            ))}
                          </select>
                        </div>
                        <div className="month-card-field">
                          <label className="hbz-label">Privat-PKW (km)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            className="hbz-input"
                            value={editState.private_pkw_km ?? 0}
                            onChange={(e) =>
                              setEditState((s) => ({ ...s, private_pkw_km: e.target.value }))
                            }
                          />
                        </div>
                      </div>

                      <div className="month-card-edit-grid">
                        <div className="month-card-field">
                          <label className="hbz-label">ZA-Stunden</label>
                          <input
                            type="number"
                            min={0}
                            step={0.25}
                            className="hbz-input"
                            value={editState.za_hours ?? 0}
                            onChange={(e) =>
                              setEditState((s) => ({ ...s, za_hours: e.target.value }))
                            }
                          />
                        </div>
                        <div className="month-card-field">
                          <label className="hbz-label">Schlechtwetter</label>
                          <button
                            type="button"
                            className={`hbz-chip ${editState.bad_weather ? "active" : ""}`}
                            onClick={() => setEditState((s) => ({ ...s, bad_weather: !s.bad_weather }))}
                          >
                            {editState.bad_weather ? "Schlechtwetter aktiv" : "Schlechtwetter"}
                          </button>
                        </div>
                      </div>

                      <div className="month-card-field">
                        <label className="hbz-label">Wetter</label>
                        <select
                          className="hbz-input"
                          value={editState.weather_manual || "Automatisch"}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              weather_manual:
                                e.target.value === "Automatisch" ? "" : e.target.value,
                            }))
                          }
                        >
                          {WEATHER_MANUAL_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
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
                            type="button"
                            onClick={saveEdit}
                          >
                            Speichern
                          </button>
                          <button
                            className="hbz-btn btn-small"
                            type="button"
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
          </>
        )}

        {isAdmin && auditRecentOpen && (
          <div
            className="hbz-card tight"
            style={{
              marginTop: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
            }}
          >
            <div
              className="hbz-row"
              style={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <div className="hbz-section-title" style={{ marginBottom: 2 }}>
                  Änderungen der letzten 45 Tage
                </div>
                <div className="help">
                  Nur für Admin sichtbar · erstellt keine Benachrichtigung
                </div>
              </div>
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={() => setAuditRecentOpen(false)}
              >
                Schließen
              </button>
            </div>

            {auditRecentBusy ? (
              <div className="help" style={{ marginTop: 8 }}>Lade Änderungen…</div>
            ) : auditRecentRows.length === 0 ? (
              <div className="help" style={{ marginTop: 8 }}>
                In den letzten 45 Tagen wurden keine Änderungen gespeichert.
              </div>
            ) : (
              <div className="month-table-wrap" style={{ marginTop: 8 }}>
                <table className="month-table">
                  <thead>
                    <tr>
                      <th>Zeit</th>
                      <th>Wer</th>
                      <th>Mitarbeiter</th>
                      <th>Art</th>
                      <th>Feld</th>
                      <th>Alt</th>
                      <th>Neu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRecentRows.map((a) => (
                      <tr key={a.id}>
                        <td>{formatDateTimeAT(a.changed_at)}</td>
                        <td>{getAuditActorName(a.changed_by)}</td>
                        <td>{getEmployeeNameById(a.employee_id)}</td>
                        <td>
                          {a.change_type === "delete"
                            ? "Gelöscht"
                            : "Geändert"}
                        </td>
                        <td>{auditFieldLabel(a.field_name)}</td>
                        <td>{a.old_value || "—"}</td>
                        <td>{a.new_value || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {isAdmin && auditOpen && (
          <div
            className="hbz-card tight"
            style={{
              marginTop: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
            }}
          >
            <div
              className="hbz-row"
              style={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <div className="hbz-section-title" style={{ marginBottom: 2 }}>
                  Änderungsverlauf
                </div>
                <div className="help">
                  {auditEntry?.employee_name || getEmployeeNameById(auditEntry?.employee_id)} · {auditEntry?.project_name || getProjectNameById(auditEntry?.project_id)}
                </div>
              </div>
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={() => setAuditOpen(false)}
              >
                Schließen
              </button>
            </div>

            {auditBusy ? (
              <div className="help" style={{ marginTop: 8 }}>Lade Verlauf…</div>
            ) : auditRows.length === 0 ? (
              <div className="help" style={{ marginTop: 8 }}>
                Für diesen Eintrag gibt es noch keinen gespeicherten Verlauf.
              </div>
            ) : (
              <div className="month-table-wrap" style={{ marginTop: 8 }}>
                <table className="month-table">
                  <thead>
                    <tr>
                      <th>Zeit</th>
                      <th>Art</th>
                      <th>Feld</th>
                      <th>Alt</th>
                      <th>Neu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((a) => (
                      <tr key={a.id}>
                        <td>{formatDateTimeAT(a.changed_at)}</td>
                        <td>
                          {a.change_type === "create"
                            ? "Erstellt"
                            : a.change_type === "delete"
                            ? "Gelöscht"
                            : "Geändert"}
                        </td>
                        <td>{auditFieldLabel(a.field_name)}</td>
                        <td>{a.old_value || "—"}</td>
                        <td>{a.new_value || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
