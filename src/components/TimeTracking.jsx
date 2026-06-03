import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import DaySlider from "./DaySlider";
import EntryTable from "./EntryTable";
import PushSettings from "./PushSettings";
import {
  WEATHER_MANUAL_OPTIONS,
  fetchWeatherForBooking,
} from "../utils/weather";
import { getEmployeeWorkDay, hmToMinutes } from "../utils/time";

// --------------------------------------------------
// Helfer/Format
// --------------------------------------------------
const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const toHM = (m) =>
  `${String(Math.floor((m ?? 0) / 60)).padStart(2, "0")}:${String(
    (m ?? 0) % 60
  ).padStart(2, "0")}`;
const formatTravelLabel = (m) => {
  const hh = Math.floor((m || 0) / 60);
  const mm = (m || 0) % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")} h`;
  return `${m || 0} min`;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const asUuidOrNull = (value) => {
  const text = value == null ? "" : String(value);
  return UUID_RE.test(text) ? text : null;
};

// Vorhandenes Pausenraster lassen wir wie gehabt – hier als Fallback:
const PAUSE_OPTIONS = [0, 15, 30, 45, 60, 75, 90];

// Fahrzeit-Optionen (0–90 in 15er-Schritten)
const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150];

// --------------------------------------------------
// Komponente
// --------------------------------------------------
export default function TimeTracking() {
  // Nutzerinfo (wird bei dir i. d. R. im Login gesetzt)
  const employeeFromLS = (() => {
    try {
      return JSON.parse(localStorage.getItem("employee") || "{}");
    } catch {
      return {};
    }
  })();
  const sessionUser = (() => {
    try {
      return getSession()?.user || {};
    } catch {
      return {};
    }
  })();
  const initialCurrentUser = { ...(employeeFromLS || {}), ...(sessionUser || {}) };
  const [currentUser, setCurrentUser] = useState(initialCurrentUser);

  const getRoleValue = (user) =>
    String(user?.role || user?.rolle || user?.user_role || user?.type || "")
      .trim()
      .toLowerCase();

  // Wichtig:
  // Bei manchen Browsern bleibt im localStorage noch ein alter Benutzer hängen.
  // Für die Tageskontrolle nehmen wir daher die niedrigste Berechtigung aus allen bekannten Quellen.
  // Wenn irgendwo "mitarbeiter" steht, darf die große Kontrolle NICHT angezeigt werden.
  const knownRoles = [employeeFromLS, sessionUser, currentUser]
    .map(getRoleValue)
    .filter(Boolean);
  const hasStaffRole = knownRoles.some((role) =>
    ["mitarbeiter", "employee", "arbeiter", "ma"].includes(role)
  );
  const hasAdminOrTeamleiterRole = knownRoles.some((role) =>
    role === "admin" || role === "teamleiter"
  );
  const currentRole = hasStaffRole
    ? "mitarbeiter"
    : hasAdminOrTeamleiterRole
      ? knownRoles.find((role) => role === "admin" || role === "teamleiter")
      : getRoleValue(currentUser);
  const isAdmin = currentRole === "admin";
  const isAdminOrTeamleiter = currentRole === "admin" || currentRole === "teamleiter";
  const isStaff = !isAdminOrTeamleiter;
  const canSeeAllEmployees = isAdminOrTeamleiter;


  // Stammdaten
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Form-State
  const [date, setDate] = useState(todayISO());
  const [projectId, setProjectId] = useState("");
  const [activity, setActivity] = useState("");

  const [fromMin, setFromMin] = useState(7 * 60); // 07:00
  const [toMin, setToMin] = useState(16 * 60 + 30); // 16:30

  const [breakMinutes, setBreakMinutes] = useState(0);

  // NEU: Krank / Urlaub
  const [absenceType, setAbsenceType] = useState(null); // "krank" | "urlaub" | null

  // Fahrzeit
  const [travelMinutes, setTravelMinutes] = useState(0);
  const travelCostCenter = "FAHRZEIT"; // fix

  // Mehrfachauswahl Mitarbeiter
  const [selectedEmployees, setSelectedEmployees] = useState(
    currentUser?.code
      ? [
          {
            id: currentUser.id,
            code: currentUser.code,
            name: currentUser.name,
          },
        ]
      : []
  );

  const [note, setNote] = useState("");
  const [weatherAuto, setWeatherAuto] = useState("");
  const [weatherManual, setWeatherManual] = useState("");
  const [weatherCode, setWeatherCode] = useState(null);
  const [temperature, setTemperature] = useState(null);
  const [precipitation, setPrecipitation] = useState(null);
  const [weatherSource, setWeatherSource] = useState("");
  const [weatherFetchedAt, setWeatherFetchedAt] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  // Einträge für den Tag (Tabelle unten)
  const [entriesToday, setEntriesToday] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Eingeloggten Benutzer sauber aus Supabase nachladen.
  // Wichtig: damit Mitarbeiter nicht wegen alten localStorage-Werten als Admin/Teamleiter erkannt werden.
  useEffect(() => {
    let cancelled = false;

    async function hydrateCurrentUser() {
      const lookupCode = sessionUser?.code || initialCurrentUser?.code;
      const lookupId = sessionUser?.id || initialCurrentUser?.id;
      if (!lookupCode && !lookupId) return;

      try {
        let query = supabase
          .from("employees")
          .select("*")
          .limit(1);

        if (lookupCode) query = query.eq("code", lookupCode);
        else query = query.eq("id", lookupId);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;

        if (!cancelled && data) {
          setCurrentUser((prev) => ({ ...(prev || {}), ...data }));
        }
      } catch (e) {
        console.warn("[TimeTracking] current user fallback:", e);
      }
    }

    hydrateCurrentUser();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Berechnungen
  const workMinutes = useMemo(
    () => Math.max((toMin ?? 0) - (fromMin ?? 0) - (breakMinutes || 0), 0),
    [fromMin, toMin, breakMinutes]
  );
  const totalWithTravel = useMemo(
    () => workMinutes + (travelMinutes || 0),
    [workMinutes, travelMinutes]
  );
  const selectedProject = useMemo(
    () => projects.find((p) => String(p.id) === String(projectId)) || null,
    [projects, projectId]
  );
  const projectAddress = selectedProject?.address || "";
  const finalWeather = weatherManual || weatherAuto || "";

  const getEmployeeKey = (emp) => String(emp?.id ?? emp?.code ?? emp?.name ?? "");
  const isCurrentEmployee = (emp) => {
    if (!emp) return false;
    return (
      (currentUser?.id != null && String(emp.id) === String(currentUser.id)) ||
      (currentUser?.code && String(emp.code) === String(currentUser.code)) ||
      (currentUser?.name && String(emp.name) === String(currentUser.name))
    );
  };
  const entryBelongsToEmployee = (entry, emp) => {
    if (!entry || !emp) return false;
    const empValues = [emp.id, emp.code, emp.name].filter((v) => v != null && v !== "").map(String);
    const entryValues = [
      entry.employee_id,
      entry.employee_code,
      entry.employee_name,
      entry.name,
      entry.code,
    ].filter((v) => v != null && v !== "").map(String);
    return entryValues.some((v) => empValues.includes(v));
  };

  const visibleTrackingEmployees = useMemo(() => {
    if (!isStaff) return employees;
    const own = employees.filter(isCurrentEmployee);
    if (own.length) return own;
    return currentUser?.code || currentUser?.id || currentUser?.name
      ? [{ id: currentUser.id, code: currentUser.code, name: currentUser.name || currentUser.code || "Du", role: currentUser.role }]
      : [];
  }, [employees, isStaff, currentUser?.id, currentUser?.code, currentUser?.name, currentUser?.role]);

  const defaultTimeEmployee = useMemo(() => {
    if (selectedEmployees.length === 1) return selectedEmployees[0];
    if (isStaff && visibleTrackingEmployees[0]) return visibleTrackingEmployees[0];
    if (currentUser?.id || currentUser?.code) return currentUser;
    return null;
  }, [selectedEmployees, isStaff, visibleTrackingEmployees, currentUser]);

  const selectedWorkDayDefaults = useMemo(
    () => getEmployeeWorkDay(defaultTimeEmployee, date),
    [defaultTimeEmployee, date]
  );

  function applySelectedEmployeeDefaults(force = false) {
    if (absenceType && !force) return;
    const d = selectedWorkDayDefaults;
    if (!d || !d.active) return;
    const start = hmToMinutes(d.start);
    const end = hmToMinutes(d.end);
    if (end <= start) return;
    setFromMin(start);
    setToMin(end);
    setBreakMinutes(d.breakMinutes || 0);
  }

  useEffect(() => {
    applySelectedEmployeeDefaults(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, defaultTimeEmployee?.id, defaultTimeEmployee?.code]);

  // --------------------------------------------------
  // Daten laden
  // --------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const { data: proj } = await supabase
          .from("projects")
          .select("id, name, code, active, address")
          .order("name", { ascending: true });
        setProjects((proj || []).filter((p) => p?.active !== false));

        const { data: emp } = await supabase
          .from("employees")
          .select("*")
          .eq("active", true)
          .eq("disabled", false)
          .order("name", { ascending: true });

        setEmployees(emp || []);

        // Falls noch niemand gewählt ist: eingeloggte Person vorauswählen
        if ((emp || []).length && selectedEmployees.length === 0 && currentUser?.code) {
          const me = (emp || []).find((e) => e.code === currentUser.code);
          if (me) setSelectedEmployees([me]);
        }
      } catch (e) {
        console.warn("[TimeTracking] Stammdaten-Fallback:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEntriesForDay = async () => {
    try {
      const { data, error } = await supabase
        .from("v_time_entries_expanded")
        .select("*")
        .eq("work_date", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setEntriesToday(data || []);
    } catch (e) {
      console.warn("[TimeTracking] loadEntries fallback:", e);
      // Fallback auf localStorage (falls offline)
      const raw = localStorage.getItem("hbz_entries") || "[]";
      setEntriesToday(JSON.parse(raw).filter((r) => r.work_date === date));
    }
  };
  useEffect(() => {
    loadEntriesForDay();
  }, [date]);

  useEffect(() => {
    if (!isStaff) return;
    const own = visibleTrackingEmployees[0];
    if (own) setSelectedEmployees([own]);
  }, [isStaff, visibleTrackingEmployees]);


  const loadWeatherForCurrentBooking = async () => {
    if (absenceType === "krank" || absenceType === "urlaub") {
      setWeatherAuto("");
      setWeatherManual("");
      setWeatherCode(null);
      setTemperature(null);
      setPrecipitation(null);
      setWeatherSource("");
      setWeatherFetchedAt(null);
      setWeatherError("");
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
      console.warn("[TimeTracking] weather fallback:", e);
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
  };

  useEffect(() => {
    if (!projectId || absenceType) return;
    loadWeatherForCurrentBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, date, fromMin, toMin, absenceType]);

  // --------------------------------------------------
  // UI-Interaktionen
  // --------------------------------------------------

  // NEU: Krank / Urlaub (setzt Zeiten fix, ohne bestehende Logik zu ändern)
  const krankMinutesForDate = (isoDate) => {
    const d = getEmployeeWorkDay(defaultTimeEmployee, isoDate);
    if (d?.requiredMinutes > 0) return d.requiredMinutes;
    return 0;
  };

  const applyKrank = () => {
    const mins = krankMinutesForDate(date);
    // Wir setzen Start/Ende so, dass workMinutes exakt passt (Pause 0)
    setAbsenceType((prev) => (prev === "krank" ? null : "krank"));
    const d = getEmployeeWorkDay(defaultTimeEmployee, date);
    setBreakMinutes(0);
    const start = d?.active ? hmToMinutes(d.start) : 7 * 60;
    setFromMin(start);
    setToMin(start + mins);
  };

  const applyUrlaub = () => {
    // Urlaub zählt nicht zu Stunden: workMinutes = 0, aber Zeitspanne muss gültig sein (Ende > Start)
    setAbsenceType((prev) => (prev === "urlaub" ? null : "urlaub"));
    const d = getEmployeeWorkDay(defaultTimeEmployee, date);
    const start = d?.active ? hmToMinutes(d.start) : 7 * 60;
    setFromMin(start);
    setToMin(start + 1); // 1 Minute, damit Validation OK
    setBreakMinutes(1); // ergibt 0 Arbeitsminuten
  };

  const clearAbsence = () => setAbsenceType(null);

  const toggleEmp = (emp) => {
    if (isStaff) return;
    const key = emp.id ?? emp.code ?? emp.name;
    setSelectedEmployees((prev) =>
      prev.some((e) => (e.id ?? e.code ?? e.name) === key)
        ? prev.filter((e) => (e.id ?? e.code ?? e.name) !== key)
        : [...prev, emp]
    );
  };

  const selectAllEmps = () => {
    if (isStaff) return;
    setSelectedEmployees(employees);
  };
  const selectNoneEmps = () => {
    if (isStaff) return;
    setSelectedEmployees([]);
  };

  // --------------------------------------------------
  // SPEICHERN
  // --------------------------------------------------
  const save = async () => {
    setError("");
    if (!projectId) return setError("Bitte ein Projekt auswählen.");
    if (!selectedEmployees.length)
      return setError("Bitte mindestens einen Mitarbeiter auswählen.");
    if (toMin <= fromMin) return setError("Zeitspanne ungültig.");

    const base = {
      work_date: date,
      project_id: projectId,
      // Start/Ende in Minuten
      start_min: fromMin,
      end_min: toMin,
      break_min: breakMinutes ?? 0,

      note: (note || "").trim() || null,

      // Fahrzeit
      travel_minutes: travelMinutes ?? 0,
      travel_cost_center: travelCostCenter,
      weather_auto: weatherAuto || null,
      weather_manual: weatherManual || null,
      weather_final: finalWeather || null,
      weather_code: weatherCode,
      temperature,
      precipitation,
      weather_source: weatherSource || null,
      weather_fetched_at: weatherFetchedAt || null,

      // NEU: Krank / Urlaub
      absence_type: absenceType || null,
    };

    const rows = selectedEmployees.map((emp) => ({
      ...base,
      employee_id: emp.id ?? emp.code ?? emp.name,
    }));

    setSaving(true);
    try {
      const { data: insertedRows, error } = await supabase
        .from("time_entries")
        .insert(rows)
        .select("id, employee_id, work_date, project_id, start_min, end_min, break_min, travel_minutes, absence_type");
      if (error) throw error;

      // Stilles Admin-Audit: keine Benachrichtigung, keine Mitarbeiter-Anzeige.
      // Dient nur dazu, dass du als Admin später nachvollziehen kannst, wann ein Eintrag neu angelegt wurde.
      const actorId = asUuidOrNull(currentUser?.id);
      const auditRows = (insertedRows || [])
        .filter((row) => asUuidOrNull(row?.id))
        .map((row) => ({
          entry_id: asUuidOrNull(row.id),
          employee_id: asUuidOrNull(row.employee_id),
          changed_by: actorId,
          change_type: "create",
          field_name: "Eintrag",
          old_value: null,
          new_value: `Erstellt: ${row.work_date || date}, ${toHM(row.start_min)}–${toHM(row.end_min)}, Pause ${row.break_min || 0} min, Fahrzeit ${row.travel_minutes || 0} min`,
          source: "manual",
        }));

      if (auditRows.length) {
        const { error: auditError } = await supabase
          .from("time_entry_audit_log")
          .insert(auditRows);
        if (auditError) console.warn("[TimeTracking] Audit-Log create:", auditError);
      }

      // Reset nur, was Sinn macht:
      setNote("");
      setBreakMinutes(0);
      setTravelMinutes(0);
      setWeatherManual("");

      await loadEntriesForDay();
    } catch (e) {
      // Fallback (offline) – NICHT löschen, nur ergänzen
      const raw = localStorage.getItem("hbz_entries") || "[]";
      localStorage.setItem(
        "hbz_entries",
        JSON.stringify([
          ...rows.map((r) => ({
            ...r,
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            created_at: new Date().toISOString(),
            employee_name:
              employees.find((x) => (x.id ?? x.code ?? x.name) === r.employee_id)
                ?.name || r.employee_id,
            project_name:
              projects.find((x) => x.id === r.project_id)?.name || r.project_id,
          })),
          ...JSON.parse(raw),
        ])
      );
      await loadEntriesForDay();
      console.warn("[TimeTracking] localStorage fallback:", e);
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  const buakSollForSelectedDay = selectedWorkDayDefaults?.requiredHours || 0;
  const buakWeekTypeForSelectedDay = selectedWorkDayDefaults?.model === "buak" ? "BUAK" : "Standard";
  const formatDateAT = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("de-AT");

  const dailyControlEmployees = canSeeAllEmployees ? employees : visibleTrackingEmployees;
  const dailyControlRows = dailyControlEmployees.map((employee) => {
    const employeeEntries = entriesToday.filter((entry) => entryBelongsToEmployee(entry, employee));
    const absenceEntries = employeeEntries.filter((entry) => entry.absence_type === "urlaub" || entry.absence_type === "krank");
    const hasEntries = employeeEntries.length > 0;
    const hasAbsence = absenceEntries.length > 0;
    const status = hasAbsence ? "absence" : hasEntries ? "ok" : "missing";
    return {
      employee,
      status,
      icon: hasAbsence ? "🟡" : hasEntries ? "✅" : "❌",
      label: hasAbsence ? "Urlaub/Krank" : hasEntries ? "Eingetragen" : "Fehlt",
      entryCount: employeeEntries.length,
    };
  });
  const okDailyCount = dailyControlRows.filter((row) => row.status === "ok").length;
  const missingDailyCount = dailyControlRows.filter((row) => row.status === "missing").length;
  const absenceDailyCount = dailyControlRows.filter((row) => row.status === "absence").length;
  const ownDailyStatus = dailyControlRows[0] || null;
  const ownEntriesToday = isStaff && visibleTrackingEmployees[0]
    ? entriesToday.filter((entry) => entryBelongsToEmployee(entry, visibleTrackingEmployees[0]))
    : [];
  const missingPreviousMonthDays = [];
  const missingReminderLoading = false;

  return (
    <div className="hbz-container">

      {isStaff && ownDailyStatus && (
        <div className={`hbz-card tight staff-own-status staff-own-status-${ownDailyStatus.status}`}>
          <div className="daily-control-chip" style={{ display: "inline-flex" }}>
            <span className="daily-control-name">Dein Status für {formatDateAT(date)}</span>
            <span className="daily-control-state">
              <span aria-hidden="true">{ownDailyStatus.icon}</span> {ownDailyStatus.label}
            </span>
          </div>
        </div>
      )}

      {/* Tageskontrolle: nur Admin/Teamleiter sehen alle Mitarbeiter */}
      {!isStaff && (
      <div className="hbz-card tight daily-control-card">
        <div className="daily-control-head">
          <div>
            <div className="hbz-section-title" style={{ marginBottom: 4 }}>Tageskontrolle</div>
            <div className="help">
              {buakSollForSelectedDay > 0 ? (
                <>
                  {date} · {buakWeekTypeForSelectedDay} · Soll: <b>{buakSollForSelectedDay} h</b>
                </>
              ) : (
                <>
                  {date} · laut BUAK kein prüfpflichtiger Arbeitstag
                </>
              )}
            </div>
          </div>

          <div className="daily-control-summary">
            <span className="daily-control-count ok">✅ {okDailyCount}</span>
            <span className="daily-control-count missing">❌ {missingDailyCount}</span>
            <span className="daily-control-count absence">🟡/🔵 {absenceDailyCount}</span>
          </div>
        </div>

        {dailyControlRows.length === 0 ? (
          <div className="daily-control-empty">Keine Mitarbeiter für die Tageskontrolle aktiviert.</div>
        ) : (
          <div className="daily-control-grid">
            {dailyControlRows.map((row) => {
              const emp = row.employee || {};
              const key = emp.id ?? emp.code ?? emp.name;
              return (
                <div key={key} className={`daily-control-chip daily-control-${row.status}`}>
                  <span className="daily-control-name">{emp.name ?? key}</span>
                  <span className="daily-control-state">
                    <span aria-hidden="true">{row.icon}</span> {row.label}
                    {row.entryCount > 1 ? ` (${row.entryCount})` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {!isStaff && missingPreviousMonthDays.length > 0 && (
        <div className="hbz-card tight missing-reminder-card">
          <div className="hbz-section-title" style={{ marginBottom: 4 }}>Fehlende Zeiteinträge vom Vormonat</div>
          <div className="help" style={{ marginBottom: 8 }}>
            Bitte folgende BUAK-Arbeitstage nachtragen:
          </div>
          <div className="daily-control-grid">
            {missingPreviousMonthDays.map((day) => (
              <span key={day} className="daily-control-chip daily-control-missing">
                <span className="daily-control-name">{formatDateAT(day)}</span>
                <span className="daily-control-state">❌ fehlt</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {!isStaff && missingReminderLoading && (
        <div className="hbz-card tight missing-reminder-card">
          <div className="help">Prüfe fehlende Einträge vom Vormonat…</div>
        </div>
      )}

      <div className="hbz-card tight">
        <div className="hbz-row">
          <h2
            className="hbz-title"
            style={{ color: "var(--hbz-brown)", margin: 0 }}
          >
            Zeiterfassung
          </h2>
          <div className="hbz-col-auto">
            <div className="field-inline">
              <label>Datum</label>
              <input
                type="date"
                className="hbz-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ maxWidth: 170 }}
              />
            </div>
          </div>
        </div>

        <hr className="hr-soft" />

        <div className="hbz-row">
          <div className="hbz-col">
            <label className="hbz-label">Projekt</label>
            <select
              className="hbz-input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— Projekt wählen —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="hbz-col">
            <label className="hbz-label">Tätigkeit</label>
            <input
              className="hbz-input"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="z. B. Montage (optional)"
            />
          </div>
        </div>

        {projectAddress && !absenceType && (
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

        <hr className="hr-soft" />

        <div className="hbz-section-title">Zeit</div>
        {selectedWorkDayDefaults?.active && (
          <div className="help" style={{ marginTop: 4, marginBottom: 8 }}>
            Standard laut Arbeitszeitmodell: <b>{selectedWorkDayDefaults.start}–{selectedWorkDayDefaults.end}</b>, Pause <b>{selectedWorkDayDefaults.breakMinutes} min</b>, Soll <b>{selectedWorkDayDefaults.requiredHours} h</b>
            <button type="button" className="hbz-btn btn-small" style={{ marginLeft: 8 }} onClick={() => applySelectedEmployeeDefaults(true)}>
              Standard übernehmen
            </button>
          </div>
        )}

        {/* NEU: Krank / Urlaub */}
        <div className="hbz-row" style={{ marginTop: 8, gap: 8, alignItems: "center" }}>
          <div className="hbz-chipbar">
            <button
              type="button"
              className={`hbz-chip ${absenceType === "krank" ? "active" : ""}`}
              onClick={applyKrank}
              title="Krank: Mo–Do 9h, Freitag 3h"
            >
              Krank
            </button>
            <button
              type="button"
              className={`hbz-chip ${absenceType === "urlaub" ? "active" : ""}`}
              onClick={applyUrlaub}
              title="Urlaub: zählt nicht zu Stunden"
            >
              Urlaub
            </button>
          </div>
          {absenceType && (
            <div className="text-xs opacity-70" style={{ marginLeft: 6 }}>
              Status aktiv: <b>{absenceType === "krank" ? "Krank" : "Urlaub"}</b> (Ändern von Start/Ende setzt Status zurück)
            </div>
          )}
        </div>

        <div className="hbz-row" style={{ alignItems: "flex-end" }}>
          <div className="hbz-col">
            <div className="field-inline">
              <label>Start</label>
              <input
                type="time"
                className="hbz-input"
                value={toHM(fromMin)}
                onChange={(e) => {
                  clearAbsence();
                  const [h, m] = e.target.value.split(":").map(Number);
                  setFromMin(clamp(h * 60 + m, 0, 24 * 60));
                }}
                style={{ maxWidth: 120 }}
              />
            </div>
          </div>

          <div className="hbz-col">
            <div className="field-inline">
              <label>Ende</label>
              <input
                type="time"
                className="hbz-input"
                value={toHM(toMin)}
                onChange={(e) => {
                  clearAbsence();
                  const [h, m] = e.target.value.split(":").map(Number);
                  setToMin(clamp(h * 60 + m, 0, 24 * 60));
                }}
                style={{ maxWidth: 120 }}
              />
            </div>
          </div>

          <div className="hbz-col-auto">
            <span className="kbd">Arbeitszeit heute</span>&nbsp;
            <b>{workMinutes >= 0 ? `${Math.floor(workMinutes / 60)}:${String(
              workMinutes % 60
            ).padStart(2, "0")} h` : "0:00 h"}</b>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <DaySlider
            fromMin={fromMin}
            toMin={toMin}
            step={15}
            onChange={({ from, to }) => {
              clearAbsence();
              setFromMin(clamp(from, 0, 24 * 60));
              setToMin(clamp(to, 0, 24 * 60));
            }}
          />
        </div>

        {/* PAUSE + FAHRZEIT nebeneinander */}
        <div className="hbz-row" style={{ marginTop: 10 }}>
          {/* Pause jetzt als Buttons (15-Minuten-Schritte) */}
          <div className="hbz-col" style={{ maxWidth: 220 }}>
            <label className="hbz-label">Pause (min)</label>
            <div className="hbz-chipbar">
              {PAUSE_OPTIONS.map((m) => {
                const active = breakMinutes === m;
                const label = formatTravelLabel(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`hbz-chip ${active ? "active" : ""}`}
                    onClick={() => setBreakMinutes(m)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* NEU: Fahrzeit als Buttons */}
          <div className="hbz-col" style={{ maxWidth: 260 }}>
            <label className="hbz-label">Fahrzeit</label>
            <div className="hbz-chipbar">
              {TRAVEL_OPTIONS.map((m) => {
                const active = travelMinutes === m;
                const label = formatTravelLabel(m);

                return (
                  <button
                    key={m}
                    type="button"
                    className={`hbz-chip ${active ? "active" : ""}`}
                    onClick={() => setTravelMinutes(m)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="text-xs opacity-70" style={{ marginTop: 2 }}>
              Kostenstelle: <b>FAHRZEIT</b> – wird zur Arbeitszeit dazugerechnet
              und separat ausgewiesen.
            </div>
          </div>

          <div className="hbz-col-auto" style={{ alignSelf: "flex-end" }}>
            <span className="kbd">Gesamt inkl. Fahrzeit</span>&nbsp;
            <b>{totalWithTravel >= 0
              ? `${Math.floor(totalWithTravel / 60)}:${String(
                  totalWithTravel % 60
                ).padStart(2, "0")} h`
              : "0:00 h"}</b>
          </div>
        </div>

        <div className="hbz-row" style={{ marginTop: 12 }}>
          <div className="hbz-col">
            <label className="hbz-label">Wetter automatisch</label>
            <div className="hbz-input" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{weatherLoading ? "Lade Wetter…" : weatherAuto || "—"}</span>
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={loadWeatherForCurrentBooking}
                disabled={weatherLoading || !projectAddress || !!absenceType}
              >
                Aktualisieren
              </button>
            </div>
            <div className="help" style={{ marginTop: 4 }}>
              Temperatur: {typeof temperature === "number" ? `${temperature.toFixed(1)} °C` : "—"} · Niederschlag: {typeof precipitation === "number" ? `${precipitation.toFixed(1)} mm` : "—"} · Quelle: {weatherSource || "—"}
            </div>
            {weatherError && <div className="help" style={{ marginTop: 4 }}>{weatherError}</div>}
          </div>

          <div className="hbz-col" style={{ maxWidth: 260 }}>
            <label className="hbz-label">Wetter manuell</label>
            <select
              className="hbz-input"
              value={weatherManual || "Automatisch"}
              disabled={!!absenceType}
              onChange={(e) => setWeatherManual(e.target.value === "Automatisch" ? "" : e.target.value)}
            >
              {WEATHER_MANUAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <div className="help" style={{ marginTop: 4 }}>
              Finales Wetter: <b>{finalWeather || "—"}</b>
            </div>
          </div>
        </div>

        <hr className="hr-soft" />

        <div className="hbz-section-title">Mitarbeiter</div>

        <div className="hbz-row" style={{ marginBottom: 6, gap: 8, alignItems: "center" }}>
          {!isStaff && (
            <>
              <button type="button" className="hbz-btn btn-small" onClick={selectAllEmps}>Alle</button>
              <button type="button" className="hbz-btn btn-small" onClick={selectNoneEmps}>Keine</button>
            </>
          )}
          <div className="help">
            {isStaff ? "Nur du selbst bist auswählbar." : `${selectedEmployees.length} / ${employees.length} gewählt`}
          </div>
        </div>

        <div className="hbz-chipbar">
          {visibleTrackingEmployees.map((emp) => {
            const key = emp.id ?? emp.code ?? emp.name;
            const active = selectedEmployees.some(
              (e) => (e.id ?? e.code ?? e.name) === key
            );
            return (
              <button
                key={key}
                type="button"
                className={`hbz-chip ${active ? "active" : ""}`}
                onClick={() => toggleEmp(emp)}
                disabled={isStaff}
              >
                {emp.name ?? key}
              </button>
            );
          })}
        </div>

        <hr className="hr-soft" />

        <div className="hbz-col" style={{ marginTop: 4 }}>
          <label className="hbz-label">Notiz</label>
          <textarea
            className="hbz-textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optionale Besonderheiten…"
          />
        </div>

        {error && (
          <div className="hbz-section error" style={{ marginTop: 10 }}>
            <strong>Fehler:</strong> {error}
          </div>
        )}

        <div className="save-bar">
          <button className="save-btn lg" onClick={save} disabled={saving}>
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>

        <PushSettings currentUser={currentUser} />
      </div>

      {/* Tagesliste */}
      <div className="hbz-card tight" style={{ marginTop: 12 }}>
        <div className="hbz-row" style={{ justifyContent: "space-between" }}>
          <div className="hbz-section-title" style={{ margin: 0 }}>
            Einträge {date}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          {isStaff ? (
            ownEntriesToday.length === 0 ? (
              <div className="help">Für dich ist an diesem Tag noch kein Eintrag gespeichert.</div>
            ) : (
              <div className="staff-entry-list">
                {ownEntriesToday.map((entry) => (
                  <div key={entry.id || `${entry.work_date}-${entry.project_id}-${entry.start_min}`} className="daily-control-chip daily-control-ok" style={{ marginBottom: 6 }}>
                    <span className="daily-control-name">
                      {entry.project_name || entry.project_code || entry.project_id || "Projekt"}
                    </span>
                    <span className="daily-control-state">
                      {toHM(entry.start_min)}–{toHM(entry.end_min)} · Pause {entry.break_min || 0} min · Fahrzeit {entry.travel_minutes || 0} min
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <EntryTable date={date} currentUser={currentUser} isAdmin={isAdmin} />
          )}
        </div>
      </div>
    </div>
  );
}
