import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import DaySlider from "./DaySlider";
import EntryTable from "./EntryTable";
import {
  WEATHER_MANUAL_OPTIONS,
  fetchWeatherForBooking,
} from "../utils/weather";
import { getBuakSollHoursForDay, getBuakWeekType } from "../utils/time";

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

// Vorhandenes Pausenraster lassen wir wie gehabt – hier als Fallback:
const PAUSE_OPTIONS = [0, 15, 30, 45, 60, 75, 90];

// Fahrzeit-Optionen (0–90 in 15er-Schritten)
const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150];


const normalizeText = (value) => String(value || "").trim().toLowerCase();

function employeeKeys(emp) {
  return [emp?.id, emp?.code, emp?.name].filter(Boolean).map((v) => String(v));
}

function entryKeys(entry) {
  return [
    entry?.employee_id,
    entry?.employee_code,
    entry?.code,
    entry?.employee_name,
    entry?.name,
  ]
    .filter(Boolean)
    .map((v) => String(v));
}

function sameEmployee(emp, entry) {
  const empSet = new Set(employeeKeys(emp));
  return entryKeys(entry).some((key) => empSet.has(key));
}

function getEntryAbsenceType(entry) {
  const raw = normalizeText(entry?.absence_type || entry?.absence || entry?.type);
  const note = normalizeText(entry?.note || entry?.notes || entry?.description);

  if (raw.includes("urlaub") || note.includes("[urlaub]") || note.includes("urlaub")) return "urlaub";
  if (raw.includes("krank") || note.includes("[krank]") || note.includes("krankenstand")) return "krank";
  return null;
}

function formatDateAT(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function getPreviousMonthRange(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m - 1, 1, 12, 0, 0);
  const last = new Date(y, m, 0, 12, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: toIso(first), end: toIso(last) };
}

function eachDateISO(startIso, endIso) {
  const result = [];
  const d = new Date(`${startIso}T12:00:00`);
  const end = new Date(`${endIso}T12:00:00`);
  while (!isNaN(d.getTime()) && d <= end) {
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return result;
}

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
    employeeFromLS?.code
      ? [
          {
            id: employeeFromLS.id,
            code: employeeFromLS.code,
            name: employeeFromLS.name,
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
  const [missingPreviousMonthDays, setMissingPreviousMonthDays] = useState([]);
  const [missingReminderLoading, setMissingReminderLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
          .select("id, code, name, role, active, disabled, show_in_daily_check")
          .eq("active", true)
          .eq("disabled", false)
          .order("name", { ascending: true });

        setEmployees(emp || []);

        // Falls noch niemand gewählt ist: eingeloggte Person vorauswählen
        if ((emp || []).length && selectedEmployees.length === 0 && employeeFromLS?.code) {
          const me = (emp || []).find((e) => e.code === employeeFromLS.code);
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
    const loadMissingPreviousMonthForCurrentUser = async () => {
      const me = employeeFromLS || {};
      const role = normalizeText(me?.role);
      const today = new Date();

      if (!me?.id && !me?.code && !me?.name) {
        setMissingPreviousMonthDays([]);
        return;
      }

      if (today.getDate() < 7 || role === "admin" || role === "teamleiter") {
        setMissingPreviousMonthDays([]);
        return;
      }

      const { start, end } = getPreviousMonthRange(today);
      const checkDays = eachDateISO(start, end).filter((day) => getBuakSollHoursForDay(day) > 0);

      if (!checkDays.length) {
        setMissingPreviousMonthDays([]);
        return;
      }

      setMissingReminderLoading(true);
      try {
        const { data, error } = await supabase
          .from("v_time_entries_expanded")
          .select("*")
          .gte("work_date", start)
          .lte("work_date", end);

        if (error) throw error;

        const missing = checkDays.filter((day) => {
          const dayEntries = (data || []).filter((entry) => entry?.work_date === day);
          return !dayEntries.some((entry) => sameEmployee(me, entry));
        });

        setMissingPreviousMonthDays(missing);
      } catch (e) {
        console.warn("[TimeTracking] Monats-Erinnerung konnte nicht geladen werden:", e);
        setMissingPreviousMonthDays([]);
      } finally {
        setMissingReminderLoading(false);
      }
    };

    loadMissingPreviousMonthForCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buakSollForSelectedDay = useMemo(() => getBuakSollHoursForDay(date), [date]);
  const buakWeekTypeForSelectedDay = useMemo(() => getBuakWeekType(date), [date]);

  const dailyControlRows = useMemo(() => {
    const checkEmployees = (employees || []).filter(
      (emp) => emp?.active !== false && emp?.disabled !== true && emp?.show_in_daily_check !== false
    );

    return checkEmployees.map((emp) => {
      const empEntries = (entriesToday || []).filter((entry) => sameEmployee(emp, entry));
      const absence = empEntries.map(getEntryAbsenceType).find(Boolean);

      let status = "missing";
      let label = "Fehlt";
      let icon = "❌";

      if (buakSollForSelectedDay <= 0) {
        status = "not_required";
        label = "Nicht prüfpflichtig";
        icon = "—";
      } else if (absence === "urlaub") {
        status = "urlaub";
        label = "Urlaub";
        icon = "🟡";
      } else if (absence === "krank") {
        status = "krank";
        label = "Krank";
        icon = "🔵";
      } else if (empEntries.length > 0) {
        status = "ok";
        label = "Eingetragen";
        icon = "✅";
      }

      return {
        employee: emp,
        status,
        label,
        icon,
        entryCount: empEntries.length,
      };
    });
  }, [employees, entriesToday, buakSollForSelectedDay]);

  const missingDailyCount = dailyControlRows.filter((row) => row.status === "missing").length;
  const okDailyCount = dailyControlRows.filter((row) => row.status === "ok").length;
  const absenceDailyCount = dailyControlRows.filter((row) => row.status === "urlaub" || row.status === "krank").length;

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
    const d = new Date(`${isoDate}T00:00:00`);
    const isFri = d.getDay() === 5;
    return isFri ? 180 : 540; // Fr 3h, sonst 9h
  };

  const applyKrank = () => {
    const mins = krankMinutesForDate(date);
    // Wir setzen Start/Ende so, dass workMinutes exakt passt (Pause 0)
    setAbsenceType((prev) => (prev === "krank" ? null : "krank"));
    setBreakMinutes(0);
    setFromMin(7 * 60); // 07:00
    setToMin(7 * 60 + mins); // 07:00 + (9h/3h)
  };

  const applyUrlaub = () => {
    // Urlaub zählt nicht zu Stunden: workMinutes = 0, aber Zeitspanne muss gültig sein (Ende > Start)
    setAbsenceType((prev) => (prev === "urlaub" ? null : "urlaub"));
    setFromMin(7 * 60); // 07:00
    setToMin(7 * 60 + 1); // 1 Minute, damit Validation OK
    setBreakMinutes(1); // ergibt 0 Arbeitsminuten
  };

  const clearAbsence = () => setAbsenceType(null);

  const toggleEmp = (emp) => {
    const key = emp.id ?? emp.code ?? emp.name;
    setSelectedEmployees((prev) =>
      prev.some((e) => (e.id ?? e.code ?? e.name) === key)
        ? prev.filter((e) => (e.id ?? e.code ?? e.name) !== key)
        : [...prev, emp]
    );
  };

  const selectAllEmps = () => setSelectedEmployees(employees);
  const selectNoneEmps = () => setSelectedEmployees([]);

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
      const { error } = await supabase.from("time_entries").insert(rows);
      if (error) throw error;

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
  return (
    <div className="hbz-container">
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

        {missingReminderLoading && (
          <div className="missing-reminder-card soft">
            Prüfe fehlende Einträge vom Vormonat…
          </div>
        )}

        {!missingReminderLoading && missingPreviousMonthDays.length > 0 && (
          <div className="missing-reminder-card warning">
            <div>
              <strong>Fehlende Zeiteinträge vom Vormonat</strong>
              <div className="help">
                Bitte diese BUAK-Arbeitstage noch nachtragen: {missingPreviousMonthDays.map(formatDateAT).join(", ")}
              </div>
            </div>
          </div>
        )}

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

        <div className="hbz-row" style={{ marginBottom: 6, gap: 8 }}>
          <button
            type="button"
            className="hbz-btn btn-small"
            onClick={selectAllEmps}
          >
            Alle
          </button>
          <button
            type="button"
            className="hbz-btn btn-small"
            onClick={selectNoneEmps}
          >
            Keine
          </button>
          <div className="help">
            {selectedEmployees.length} / {employees.length} gewählt
          </div>
        </div>

        <div className="hbz-chipbar">
          {employees.map((emp) => {
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
      </div>

      {/* Tageskontrolle */}
      <div className="hbz-card tight daily-check-card" style={{ marginTop: 12 }}>
        <div className="daily-check-head">
          <div>
            <div className="hbz-section-title" style={{ margin: 0 }}>
              Tageskontrolle {formatDateAT(date)}
            </div>
            <div className="help" style={{ marginTop: 4 }}>
              BUAK: {buakSollForSelectedDay > 0 ? `${buakSollForSelectedDay} Sollstunden` : "kein prüfpflichtiger Arbeitstag"}
              {buakWeekTypeForSelectedDay ? ` · ${buakWeekTypeForSelectedDay === "kurz" ? "Kurze Woche" : "Lange Woche"}` : ""}
            </div>
          </div>
          <div className="daily-check-summary">
            <span className="daily-check-counter ok">✅ {okDailyCount}</span>
            <span className="daily-check-counter missing">❌ {missingDailyCount}</span>
            <span className="daily-check-counter absence">🟡/🔵 {absenceDailyCount}</span>
          </div>
        </div>

        {dailyControlRows.length === 0 ? (
          <div className="daily-check-empty">
            Keine Mitarbeiter für die Tageskontrolle aktiviert.
          </div>
        ) : (
          <div className="daily-check-grid">
            {dailyControlRows.map((row) => {
              const key = row.employee?.id ?? row.employee?.code ?? row.employee?.name;
              return (
                <div key={key} className={`daily-check-item status-${row.status}`}>
                  <div className="daily-check-name">{row.employee?.name || key}</div>
                  <div className="daily-check-status">
                    <span>{row.icon}</span>
                    <span>{row.label}</span>
                    {row.entryCount > 1 && <small>({row.entryCount} Einträge)</small>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tagesliste */}
      <div className="hbz-card tight" style={{ marginTop: 12 }}>
        <div className="hbz-row" style={{ justifyContent: "space-between" }}>
          <div className="hbz-section-title" style={{ margin: 0 }}>
            Einträge {date}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <EntryTable date={date} />
        </div>
      </div>
    </div>
  );
}
