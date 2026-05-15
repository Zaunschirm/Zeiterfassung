import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { getUserPermissions } from "../lib/permissions";
import EmployeePicker from "./EmployeePicker.jsx";
import {
  WEATHER_MANUAL_OPTIONS,
  fetchWeatherForBooking,
  getWeatherFinalLabel,
} from "../utils/weather";

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


const PAUSE_OPTIONS = [0, 15, 30, 45, 60, 75, 90];
const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150];
const CRANE_HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);

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

function isoWeekNumber(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;

  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);

  return 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

function getBuakWeekLabel(dateStr) {
  try {
    if (!dateStr) return "";
    const wk = isoWeekNumber(String(dateStr).slice(0, 10));
    if (!wk) return "";
    const year = Number(String(dateStr).slice(0, 4));
    if (year !== 2026) return `KW ${wk}`;
    const t = BUAK_WEEK_TYPES_2026[wk];
    if (t === "K") return `KW ${wk} - Kurze Woche`;
    if (t === "L") return `KW ${wk} - Lange Woche`;
    return `KW ${wk}`;
  } catch {
    return "";
  }
}


function getBuakSollHoursForDay(dateStr) {
  try {
    if (!dateStr) return 0;
    const iso = String(dateStr).slice(0, 10);
    const d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return 0;

    const dow = d.getDay();
    if (dow === 0 || dow === 6) return 0;

    const year = Number(iso.slice(0, 4));
    if (year !== 2026) return 0;

    const wk = isoWeekNumber(iso);
    const type = BUAK_WEEK_TYPES_2026[wk];
    if (!type) return 0;

    const isFriday = dow === 5;
    if (type === "L") return isFriday ? 6 : 9;
    if (type === "K") return isFriday ? 0 : 9;

    return 0;
  } catch {
    return 0;
  }
}


function easterSundayHoliday(year) {
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

function addDaysHoliday(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function pad2Holiday(n) {
  return String(n).padStart(2, "0");
}

function formatHolidayISO(date) {
  return `${date.getFullYear()}-${pad2Holiday(date.getMonth() + 1)}-${pad2Holiday(date.getDate())}`;
}

function getAustrianHolidays(year) {
  const y = Number(year);
  if (!y) return {};
  const easter = easterSundayHoliday(y);
  return {
    [`${y}-01-01`]: "Neujahr",
    [`${y}-01-06`]: "Heilige Drei Könige",
    [formatHolidayISO(addDaysHoliday(easter, 1))]: "Ostermontag",
    [`${y}-05-01`]: "Staatsfeiertag",
    [formatHolidayISO(addDaysHoliday(easter, 39))]: "Christi Himmelfahrt",
    [formatHolidayISO(addDaysHoliday(easter, 50))]: "Pfingstmontag",
    [formatHolidayISO(addDaysHoliday(easter, 60))]: "Fronleichnam",
    [`${y}-08-15`]: "Mariä Himmelfahrt",
    [`${y}-10-26`]: "Nationalfeiertag",
    [`${y}-11-01`]: "Allerheiligen",
    [`${y}-12-08`]: "Mariä Empfängnis",
    [`${y}-12-25`]: "Christtag",
    [`${y}-12-26`]: "Stefanitag",
  };
}

function getHolidayName(dateStr) {
  if (!dateStr) return null;
  const iso = String(dateStr).slice(0, 10);
  const year = Number(iso.slice(0, 4));
  return getAustrianHolidays(year)[iso] || null;
}

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
  const [userHydrated, setUserHydrated] = useState(false);

  const normalizeRole = (value) => {
    const r = String(value || "mitarbeiter").trim().toLowerCase();
    if (r === "admin") return "admin";
    if (r === "teamleiter") return "teamleiter";
    if (r === "buchhaltung" || r === "verwaltung" || r === "bu/vw" || r === "buvw") return "verwaltung";
    return "mitarbeiter";
  };

  const role = normalizeRole(currentUser?.role || session?.role || "mitarbeiter");
  const permissions = getUserPermissions(currentUser || session);

  // Wichtig: Nur Admin und Teamleiter dürfen in der Zeiterfassung/Tageskontrolle andere MA sehen.
  // Buchhaltung/Verwaltung und normale Mitarbeiter bleiben in der ZA immer auf sich selbst beschränkt.
  const isPrivilegedRole = userHydrated && (role === "admin" || role === "teamleiter");
  const canWriteOwnTime = !!permissions.writeOwnTime;
  const canWriteAllTime = isPrivilegedRole && !!permissions.writeAllTime;
  const canEditOwnTime = !!permissions.editOwnTime;
  const canEditAllTime = isPrivilegedRole && !!permissions.editAllTime;
  const canDeleteOwnTime = !!permissions.deleteOwnTime;
  const canDeleteAllTime = isPrivilegedRole && !!permissions.deleteAllTime;
  const canSelectEmployees = isPrivilegedRole && (canWriteAllTime || canEditAllTime || canDeleteAllTime);
  const canSeeAllEntries = canSelectEmployees;
  const isStaff = !isPrivilegedRole;
  const isManager = isPrivilegedRole;

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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCurrentUser() {
      setUserHydrated(false);
      if (!session?.code && !session?.id) {
        setUserHydrated(true);
        return;
      }

      try {
        let query = supabase
          .from("employees")
          .select("id, code, name, role, active, disabled, permissions")
          .limit(1);

        if (session?.code) query = query.eq("code", session.code);
        else if (session?.id) query = query.eq("id", session.id);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!cancelled && data) setCurrentUser((prev) => ({ ...(prev || {}), ...data }));
      } catch (e) {
        logSbError("[DaySlider] current user load error:", e);
      } finally {
        if (!cancelled) setUserHydrated(true);
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
        if (isManager) {
          const { data, error } = await supabase
            .from("employees")
            .select("id, code, name, role, active, disabled, show_in_daily_check")
            .eq("active", true)
            .eq("disabled", false)
            .order("name", { ascending: true });

          if (error) throw error;
          const list = data || [];
          setEmployees(list);

          if (session?.code) {
            const me = list.find((e) => e.code === session.code);
            if (me) {
              setSelectedCodes([me.code]);
              setEmployeeRow(me);
            } else if (!selectedCodes.length) {
              setSelectedCodes([]);
            }
          } else if (!selectedCodes.length) {
            setSelectedCodes([]);
          }
        } else {
          let query = supabase
            .from("employees")
            .select("id, code, name, role, active, disabled, show_in_daily_check")
            .limit(1);

          const ownCode = currentUser?.code || session?.code;
          const ownId = currentUser?.id || session?.id;
          if (!ownCode && !ownId) {
            setEmployees([]);
            setSelectedCodes([]);
            setEmployeeRow(null);
            return;
          }
          if (ownCode) query = query.eq("code", ownCode);
          else if (ownId) query = query.eq("id", ownId);

          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          if (data) {
            setEmployees([data]);
            setSelectedCodes([data.code]);
            setEmployeeRow(data);
          }
        }
      } catch (e) {
        logSbError("[DaySlider] employees load error:", e);
      }
    }

    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, session?.code, session?.id, currentUser?.code, currentUser?.id]);

  useEffect(() => {
    if (!isStaff) return;
    if (!session?.code) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("employees")
          .select("id, code, name, role, active, disabled, show_in_daily_check")
          .eq("code", session.code)
          .limit(1)
          .maybeSingle();
        if (!error && data) setEmployeeRow(data);
      } catch (e) {
        logSbError("[DaySlider] employeeRow load error:", e);
      }
    })();
  }, [isStaff, session?.code]);

  const totalMin = useMemo(() => {
    const raw = clamp(toMin - fromMin, 0, 24 * 60);
    return clamp(raw - breakMin, 0, 24 * 60);
  }, [fromMin, toMin, breakMin]);

  const totalMinWithTravel = useMemo(
    () => totalMin + (travelMin || 0),
    [totalMin, travelMin]
  );

  const totalHours = useMemo(() => h2(totalMinWithTravel), [totalMinWithTravel]);
  const totalOvertime = useMemo(() => Math.max(totalHours - 9, 0), [totalHours]);
  const selectedProject = useMemo(
    () => projects.find((p) => String(p.id) === String(projectId)) || null,
    [projects, projectId]
  );
  const ownEmployeeLabel = employeeRow?.name || currentUser?.name || session?.name || session?.code || "Du";
  const projectAddress = selectedProject?.address || "";
  const finalWeather = weatherManual || weatherAuto || "";

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

        const relevantIds = isManager
          ? employees
              .filter((e) => selectedCodes.includes(e.code))
              .map((e) => e.id)
          : employeeRow?.id
          ? [employeeRow.id]
          : [];

        if (!date || relevantIds.length === 0) return;

        const weekDates = getWeekDays(date);
        const { data, error } = await supabase
          .from("work_assignments")
          .select("assignment_date, employee_id, project_id, projects(id, name, code)")
          .in("employee_id", relevantIds)
          .in("assignment_date", weekDates);

        if (error) throw error;

        const todayRows = (data || []).filter((row) => row.assignment_date === date);

        const uniqueProjects = [];
        const seen = new Set();
        for (const row of todayRows) {
          const prj = row.projects || null;
          const id = prj?.id || row.project_id;
          if (!id || seen.has(String(id))) continue;
          seen.add(String(id));
          uniqueProjects.push({
            id,
            name: prj?.name || projects.find((p) => String(p.id) === String(id))?.name || `Projekt ${id}`,
            code: prj?.code || projects.find((p) => String(p.id) === String(id))?.code || "",
          });
        }

        if (cancelled) return;

        setAssignmentSuggestions(uniqueProjects);

        if (todayRows.length > 0) {
          const persons = new Set(todayRows.map((row) => row.employee_id)).size;
          setAssignmentInfo(
            persons > 1
              ? `Arbeitseinteilung gefunden: ${uniqueProjects.length} Projekt${uniqueProjects.length === 1 ? "" : "e"} für ${persons} Mitarbeiter.`
              : `Arbeitseinteilung gefunden: ${uniqueProjects.length} Projekt${uniqueProjects.length === 1 ? "" : "e"} für diesen Tag.`
          );
        }

        if (!absenceType && !projectId && uniqueProjects.length > 0) {
          setProjectId(uniqueProjects[0].id);
        }
      } catch (e) {
        logSbError("[DaySlider] work assignments load error:", e);
      }
    }

    loadAssignmentSuggestions();

    return () => {
      cancelled = true;
    };
  }, [date, isManager, selectedCodes, employeeRow?.id, employees, projects, absenceType]);

  async function loadEntries() {
    try {
      setLoading(true);
      let query = supabase
        .from("v_time_entries_expanded")
        .select("*")
        .eq("work_date", date)
        .order("employee_name", { ascending: true })
        .order("start_min", { ascending: true });

      // Wichtig: Admin/Teamleiter sehen in der unteren Tagesübersicht immer ALLE Einträge
      // des ausgewählten Tages – unabhängig davon, welche Mitarbeiter oben zum Speichern
      // ausgewählt sind. Die Mitarbeiter-Auswahl steuert nur, für wen neu gespeichert wird.
      if (isStaff && employeeRow?.id) {
        query = query.eq("employee_id", employeeRow.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries(data || []);
    } catch (e) {
      logSbError("[DaySlider] entries load error:", e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDailyCheckEntries() {
    try {
      if (!isManager) {
        setDailyCheckEntries([]);
        return;
      }

      setDailyCheckLoading(true);

      const { data, error } = await supabase
        .from("v_time_entries_expanded")
        .select("*")
        .eq("work_date", date);

      if (error) throw error;
      setDailyCheckEntries(data || []);
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
  }, [date, isManager, selectedCodes, employeeRow?.id]);

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
  const isOwnEntry = (row) => String(row?.employee_id ?? "") === String(currentEmployeeId ?? "");
  const canEditEntry = (row) => !!row && (canEditAllTime || (canEditOwnTime && isOwnEntry(row)));
  const canDeleteEntry = (row) => !!row && (canDeleteAllTime || (canDeleteOwnTime && isOwnEntry(row)));

  const buakSollHoursToday = useMemo(() => getBuakSollHoursForDay(date), [date]);
  const holidayNameToday = useMemo(() => getHolidayName(date), [date]);

  const dailyCheckRows = useMemo(() => {
    if (!isManager) return [];

    const checkEmployees = (employees || [])
      // Deaktiviert = nicht mehr in der Tageskontrolle prüfen.
      // Wichtig: bestehende Stunden deaktivierter MA bleiben unten trotzdem sichtbar,
      // weil die Eintragsliste direkt aus v_time_entries_expanded kommt.
      .filter((emp) => emp?.active !== false && emp?.disabled !== true)
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

      if (buakSollHoursToday <= 0) {
        status = "not_required";
        label = "frei laut BUAK";
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
  }, [date, dailyCheckEntries, employees, isManager, buakSollHoursToday]);

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


  const getExistingEmployeeId = (row) => String(row?.employee_id ?? row?.employeeId ?? "");

  const timesOverlap = (aStart, aEnd, bStart, bEnd) => {
    const as = Number(aStart ?? 0);
    const ae = Number(aEnd ?? 0);
    const bs = Number(bStart ?? 0);
    const be = Number(bEnd ?? 0);
    return as < be && bs < ae;
  };

  const isSameBooking = (existing, next) => {
    return (
      String(existing?.work_date || existing?.date || "").slice(0, 10) === String(next.work_date || "").slice(0, 10) &&
      String(getExistingEmployeeId(existing)) === String(next.employee_id) &&
      String(existing?.project_id ?? "") === String(next.project_id ?? "") &&
      Number(existing?.start_min ?? existing?.from_min ?? 0) === Number(next.start_min ?? 0) &&
      Number(existing?.end_min ?? existing?.to_min ?? 0) === Number(next.end_min ?? 0) &&
      Number(existing?.break_min ?? 0) === Number(next.break_min ?? 0) &&
      Number(existing?.travel_minutes ?? existing?.travel_min ?? 0) === Number(next.travel_minutes ?? 0) &&
      String(existing?.absence_type ?? "") === String(next.absence_type ?? "")
    );
  };

  const isOverlappingBooking = (existing, next) => {
    if (String(existing?.work_date || existing?.date || "").slice(0, 10) !== String(next.work_date || "").slice(0, 10)) return false;
    if (String(getExistingEmployeeId(existing)) !== String(next.employee_id)) return false;
    return timesOverlap(existing?.start_min ?? existing?.from_min, existing?.end_min ?? existing?.to_min, next.start_min, next.end_min);
  };

  async function findDuplicateOrOverlap(rows) {
    const employeeIds = Array.from(new Set(rows.map((row) => String(row.employee_id)).filter(Boolean)));
    let existing = (entries || []).filter((row) =>
      String(row?.work_date || row?.date || "").slice(0, 10) === date &&
      employeeIds.includes(String(getExistingEmployeeId(row)))
    );

    try {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, work_date, employee_id, project_id, start_min, end_min, break_min, travel_minutes, absence_type")
        .eq("work_date", date)
        .in("employee_id", employeeIds);
      if (!error && Array.isArray(data)) {
        const seen = new Set(existing.map((row) => String(row.id || `${getExistingEmployeeId(row)}-${row.start_min}-${row.end_min}-${row.project_id}`)));
        for (const row of data) {
          const key = String(row.id || `${getExistingEmployeeId(row)}-${row.start_min}-${row.end_min}-${row.project_id}`);
          if (!seen.has(key)) existing.push(row);
        }
      }
    } catch (e) {
      logSbError("[DaySlider] duplicate check fallback", e);
    }

    for (const row of rows) {
      const exact = existing.find((entry) => isSameBooking(entry, row));
      if (exact) return { type: "exact", row, existing: exact };
    }

    const overlaps = [];
    for (const row of rows) {
      const hit = existing.find((entry) => !isSameBooking(entry, row) && isOverlappingBooking(entry, row));
      if (hit) overlaps.push({ row, existing: hit });
    }

    if (overlaps.length) return { type: "overlap", overlaps };
    return null;
  }

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

  async function handleSave() {
    if (saving) return;
    setError("");

    const isAbsence = absenceType === "krank" || absenceType === "urlaub";

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

    const base = {
      work_date: date,
      project_id: prj ? prj.id : null,
      start_min: fromMin,
      end_min: toMin,
      break_min: breakMin,
      travel_minutes: travelMin,
      travel_cost_center: "FAHRZEIT",
      weather_auto: weatherAuto || null,
      weather_manual: weatherManual || null,
      weather_final: finalWeather || null,
      weather_code: weatherCode,
      temperature,
      precipitation,
      weather_source: weatherSource || null,
      weather_fetched_at: weatherFetchedAt || null,
      crane_hours: craneUsed ? Number(craneHours || 0) : 0,
      bad_weather: !!badWeather,
      bad_weather_minutes: badWeather ? Math.max(toMin - fromMin - breakMin, 0) : 0,
      absence_type: absenceType || null,
      voice_note: (note || "").trim() || null,
      note: `${
        absenceType === "krank"
          ? "[Krank] "
          : absenceType === "urlaub"
          ? "[Urlaub] "
          : badWeather
          ? "[Schlechtwetter] "
          : ""
      }${(note || "").trim()}`.trim() || null,
    };

    try {
      setSaving(true);

      if (canWriteAllTime) {
        const chosen = employees.filter((e) => selectedCodes.includes(e.code));
        if (chosen.length === 0) {
          alert("Bitte mindestens einen Mitarbeiter auswählen.");
          return;
        }
        const rows = chosen.map((e) => ({ ...base, employee_id: e.id }));
        const conflict = await findDuplicateOrOverlap(rows);
        if (conflict?.type === "exact") {
          const emp = chosen.find((e) => String(e.id) === String(conflict.row.employee_id));
          setError(`Doppeleintrag verhindert: Für ${emp?.name || "diesen Mitarbeiter"} gibt es am ${date} bereits exakt diesen Eintrag.`);
          return;
        }
        if (conflict?.type === "overlap") {
          const ok = window.confirm("Achtung: Für mindestens einen Mitarbeiter gibt es am ausgewählten Tag bereits einen überschneidenden Zeiteintrag. Trotzdem speichern?");
          if (!ok) return;
        }
        const { error } = await supabase.from("time_entries").insert(rows);
        if (error) throw error;
        alert(`Gespeichert für ${rows.length} Mitarbeiter.`);
      } else {
        if (!canWriteOwnTime) {
          alert("Du hast keine Berechtigung zum Schreiben von Stunden.");
          return;
        }
        if (!employeeRow) {
          alert("Mitarbeiterdaten konnten nicht geladen werden.");
          return;
        }
        if (employeeRow.code !== session.code) {
          alert("Nicht erlaubt: Mitarbeiter dürfen nur für sich buchen.");
          return;
        }
        const rows = [{ ...base, employee_id: employeeRow.id }];
        const conflict = await findDuplicateOrOverlap(rows);
        if (conflict?.type === "exact") {
          setError(`Doppeleintrag verhindert: Für dich gibt es am ${date} bereits exakt diesen Eintrag.`);
          return;
        }
        if (conflict?.type === "overlap") {
          const ok = window.confirm("Achtung: Für dich gibt es am ausgewählten Tag bereits einen überschneidenden Zeiteintrag. Trotzdem speichern?");
          if (!ok) return;
        }
        const { error } = await supabase
          .from("time_entries")
          .insert(rows[0]);
        if (error) throw error;
        alert("Gespeichert.");
      }

      setNote("");
      setAbsenceType(null);
      setBadWeather(false);
      setBreakMin(30);
      setTravelMin(0);
      setCraneUsed(false);
      setCraneHours(1);
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

    const upd = {
      project_id: editState.project_id || null,
      start_min: from_m,
      end_min: to_m,
      break_min: parseInt(editState.break_min || "0", 10) || 0,
      travel_minutes: parseInt(editState.travel_minutes || "0", 10) || 0,
      crane_hours: parseInt(editState.crane_hours || "0", 10) || 0,
      bad_weather: !!editState.bad_weather,
      bad_weather_minutes: editState.bad_weather ? Math.max(to_m - from_m - (parseInt(editState.break_min || "0", 10) || 0), 0) : 0,
      voice_note: editState.note?.trim() || null,
      weather_manual: editState.weather_manual?.trim() || null,
      weather_final:
        (editState.weather_manual || "").trim() || editState.weather_auto || null,
      note: editState.note?.trim() || null,
    };

    try {
      const { error } = await supabase
        .from("time_entries")
        .update(upd)
        .eq("id", editId);
      if (error) throw error;
      await loadEntries();
      await loadDailyCheckEntries();
      cancelEdit();
    } catch (e) {
      logSbError("saveEdit error:", e);
      alert("Änderung konnte nicht gespeichert werden.");
    }
  }

  async function deleteEntry(id) {
    const targetRow = entries.find((row) => String(row.id) === String(id));
    if (!canDeleteEntry(targetRow)) return;
    if (!window.confirm("Eintrag wirklich löschen?")) return;
    try {
      const { error } = await supabase
        .from("time_entries")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await loadEntries();
      await loadDailyCheckEntries();
    } catch (e) {
      logSbError("deleteEntry error:", e);
      alert("Löschen fehlgeschlagen.");
    }
  }

  const summaryCards = [
    { label: "Start", value: toHM(fromMin) },
    { label: "Ende", value: toHM(toMin) },
    { label: "Pause", value: `${breakMin} min` },
    { label: "Fahrzeit", value: formatTravelLabel(travelMin) },
    { label: "Kran", value: craneUsed ? `${craneHours} h` : "—" },
    { label: "Schlechtwetter", value: badWeather ? "Ja" : "—" },
    { label: "Wetter", value: finalWeather || "—" },
  ];

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

      {isManager && (
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
            Geprüft werden nur aktive Mitarbeiter mit „In Tageskontrolle anzeigen“.
            Freie BUAK-Tage werden nicht als fehlend gewertet.
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
            {isManager ? (
              <details className="mobile-accordion" open>
                <summary>👥 Mitarbeiter <span>{selectedCodes.length} / {employees.length} gewählt</span></summary>
                <EmployeePicker employees={employees} selected={selectedCodes} onChange={setSelectedCodes} enableMulti={true} />
              </details>
            ) : (
              <div className="month-employee-block staff-employee-lock">
                <div className="month-employee-head">
                  <label className="hbz-label">Mitarbeiter</label>
                  <span className="badge-soft">1 / 1 gewählt</span>
                </div>
                <div className="hbz-chipbar">
                  <button type="button" className="hbz-chip active" disabled>{ownEmployeeLabel}</button>
                </div>
                <div className="help" style={{ marginTop: 6 }}>Du kannst nur für dich selbst erfassen.</div>
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
            <details className="mobile-accordion"><summary>👷 Abwesenheit <span>{absenceType ? (absenceType === "krank" ? "Krank" : "Urlaub") : badWeather ? "Schlechtwetter" : "Normal"}</span></summary>
              <div className="hbz-chipbar">
                <button type="button" className={`hbz-chip ${absenceType === "krank" ? "active" : ""}`} onClick={() => { setBadWeather(false); setAbsenceType("krank"); setProjectId(null); const d = new Date(`${date}T00:00:00`); const isFri = d.getDay() === 5; setFromMin(7 * 60); setToMin(isFri ? 10 * 60 : 16 * 60); setBreakMin(0); setTravelMin(0); }}>Krank</button>
                <button type="button" className={`hbz-chip ${absenceType === "urlaub" ? "active" : ""}`} onClick={() => { setBadWeather(false); setAbsenceType("urlaub"); setProjectId(null); setFromMin(7 * 60); setToMin(7 * 60 + 15); setBreakMin(15); setTravelMin(0); }}>Urlaub</button>
                <button type="button" className={`hbz-chip ${badWeather ? "active" : ""}`} onClick={() => { setAbsenceType(null); setBadWeather((v) => !v); }}>Schlechtwetter</button>
                {(absenceType || badWeather) && <button type="button" className="hbz-chip" onClick={() => { setAbsenceType(null); setBadWeather(false); }}>Normal</button>}
              </div>
            </details>
            <details className="mobile-accordion"><summary>🚙 Fahrzeit <span>{formatTravelLabel(travelMin)}</span></summary><div className="hbz-chipbar">{TRAVEL_OPTIONS.map((m) => (<button key={m} type="button" className={`hbz-chip ${travelMin === m ? "active" : ""}`} onClick={() => { if (absenceType) setAbsenceType(null); setTravelMin(m); }}>{formatTravelLabel(m)}</button>))}</div></details>
            <details className="mobile-accordion"><summary>🏗 Kranzeit <span>{craneUsed ? `${craneHours} h` : "—"}</span></summary><div className="hbz-chipbar" style={{ alignItems: "center" }}><button type="button" className={`hbz-chip ${craneUsed ? "active" : ""}`} onClick={() => setCraneUsed((v) => !v)} disabled={!!absenceType}>🏗 Kran verwendet</button>{craneUsed && (<select className="hbz-input" value={craneHours} onChange={(e) => setCraneHours(Number(e.target.value))} disabled={!!absenceType} style={{ maxWidth: 140 }}>{CRANE_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h} h</option>)}</select>)}</div></details>
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
          {isManager ? (
          <div className="month-employee-block">
            <div className="month-employee-head">
              <label className="hbz-label">Mitarbeiter</label>
              <span className="badge-soft">
                {selectedCodes.length} / {employees.length} gewählt
              </span>
            </div>

            <EmployeePicker
              employees={employees}
              selected={selectedCodes}
              onChange={setSelectedCodes}
              enableMulti={true}
            />
          </div>
          ) : (
          <div className="month-employee-block staff-employee-lock">
            <div className="month-employee-head">
              <label className="hbz-label">Mitarbeiter</label>
              <span className="badge-soft">1 / 1 gewählt</span>
            </div>
            <div className="hbz-chipbar">
              <button type="button" className="hbz-chip active" disabled>{ownEmployeeLabel}</button>
            </div>
            <div className="help" style={{ marginTop: 6 }}>Du kannst nur für dich selbst erfassen.</div>
          </div>
          )}

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
                onClick={() => {
                  setBadWeather(false);
                  setAbsenceType("krank");
                  setProjectId(null);
                  const d = new Date(`${date}T00:00:00`);
                  const isFri = d.getDay() === 5;
                  setFromMin(7 * 60);
                  setToMin(isFri ? 10 * 60 : 16 * 60);
                  setBreakMin(0);
                  setTravelMin(0);
                }}
              >
                Krank
              </button>

              <button
                type="button"
                className={`hbz-chip ${
                  absenceType === "urlaub" ? "active" : ""
                }`}
                onClick={() => {
                  setBadWeather(false);
                  setAbsenceType("urlaub");
                  setProjectId(null);
                  setFromMin(7 * 60);
                  setToMin(7 * 60 + 15);
                  setBreakMin(15);
                  setTravelMin(0);
                }}
              >
                Urlaub
              </button>

              <button type="button" className={`hbz-chip ${badWeather ? "active" : ""}`} onClick={() => { setAbsenceType(null); setBadWeather((v) => !v); }}>
                Schlechtwetter
              </button>

              {(absenceType || badWeather) && (
                <button
                  type="button"
                  className="hbz-chip"
                  onClick={() => { setAbsenceType(null); setBadWeather(false); }}
                  title="Abwesenheit zurücksetzen"
                >
                  Normal
                </button>
              )}
            </div>
          </div>

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
            <div className="month-card-title">Kranzeit</div>
            <div className="hbz-chipbar" style={{ alignItems: "center" }}>
              <button
                type="button"
                className={`hbz-chip ${craneUsed ? "active" : ""}`}
                onClick={() => setCraneUsed((v) => !v)}
                disabled={!!absenceType}
                title="Kranzeit zu diesem Zeiteintrag speichern"
              >
                🏗 Kran verwendet
              </button>

              {craneUsed && (
                <div className="month-card-field" style={{ minWidth: 180, margin: 0 }}>
                  <label className="hbz-label">Kranstunden</label>
                  <select
                    className="hbz-input"
                    value={craneHours}
                    onChange={(e) => setCraneHours(Number(e.target.value))}
                    disabled={!!absenceType}
                  >
                    {CRANE_HOUR_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {h} h
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="help" style={{ marginTop: 8 }}>
              Wird als <b>Kranzeit</b> zum Eintrag gespeichert und kann später in der Nachkalkulation ausgewertet werden.
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

      <div className="hbz-card month-main-card">
        <div className="month-main-header">
          <div>
            <div className="month-card-title">Einträge am {date}</div>
            <div className="month-main-subtitle">
              {loading ? "Lade Einträge…" : "Tagesübersicht"}
            </div>
          </div>
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
                      const isEditing = editId === r.id;

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
                            <td className="num">{hrs.toFixed(2)}</td>
                            <td className="num">{ot.toFixed(2)}</td>
                            <td>{getWeatherFinalLabel(r) || "—"}</td>
                            <td>{r.note || ""}</td>
                            <td className="num">
                              {canEditEntry(r) || canDeleteEntry(r) ? (
                                <div className="month-action-group">
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
                  const isEditing = editId === r.id;

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
                          {canEditEntry(r) || canDeleteEntry(r) ? (
                            <>
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
      </div>
    </div>
  );
}
