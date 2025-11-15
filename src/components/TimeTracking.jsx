import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import DaySlider from "./DaySlider";
import EntryTable from "./EntryTable";

// --------------------------------------------------
// Helfer/Format
// --------------------------------------------------
const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const toHM = (m) =>
  `${String(Math.floor((m ?? 0) / 60)).padStart(2, "0")}:${String(
    (m ?? 0) % 60
  ).padStart(2, "0")}`;

// Vorhandenes Pausenraster lassen wir wie gehabt – hier als Fallback:
const PAUSE_OPTIONS = [0, 15, 30, 45, 60, 75, 90];

// Fahrzeit-Optionen (0–90 in 15er-Schritten)
const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 75, 90];

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

  // Einträge für den Tag (Tabelle unten)
  const [entriesToday, setEntriesToday] = useState([]);

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

  // --------------------------------------------------
  // Daten laden
  // --------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const { data: proj } = await supabase
          .from("projects")
          .select("id, name, code, active")
          .order("name", { ascending: true });
        setProjects((proj || []).filter((p) => p?.active !== false));

        const { data: emp } = await supabase
          .from("employees")
          .select("id, code, name, role, active, disabled")
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

  // --------------------------------------------------
  // UI-Interaktionen
  // --------------------------------------------------
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

      await loadEntriesForDay();
    } catch (e) {
      // Fallback (offline) – NICHT löschen, nur ergänzen
      const raw = localStorage.getItem("hbz_entries") || "[]";
      localStorage.setItem(
        "hbz_entries",
        JSON.stringify([
          ...rows.map((r) => ({
            ...r,
            id: `local-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`,
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

        <hr className="hr-soft" />

        <div className="hbz-section-title">Zeit</div>

        <div className="hbz-row" style={{ alignItems: "flex-end" }}>
          <div className="hbz-col">
            <div className="field-inline">
              <label>Start</label>
              <input
                type="time"
                className="hbz-input"
                value={toHM(fromMin)}
                onChange={(e) => {
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
                  const [h, m] = e.target.value.split(":").map(Number);
                  setToMin(clamp(h * 60 + m, 0, 24 * 60));
                }}
                style={{ maxWidth: 120 }}
              />
            </div>
          </div>

          <div className="hbz-col-auto">
            <span className="kbd">Arbeitszeit heute</span>&nbsp;
            <b>
              {Math.floor(workMinutes / 60)} h {workMinutes % 60} min
            </b>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <DaySlider
            fromMin={fromMin}
            toMin={toMin}
            step={15}
            onChange={({ from, to }) => {
              setFromMin(clamp(from, 0, 24 * 60));
              setToMin(clamp(to, 0, 24 * 60));
            }}
          />
        </div>

        {/* PAUSE + FAHRZEIT nebeneinander */}
        <div className="hbz-row" style={{ marginTop: 10 }}>
          <div className="hbz-col" style={{ maxWidth: 220 }}>
            <label className="hbz-label">Pause (min)</label>
            <select
              className="hbz-input"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(parseInt(e.target.value, 10))}
            >
              {PAUSE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>

          {/* NEU: Fahrzeit als Buttons */}
          <div className="hbz-col" style={{ maxWidth: 260 }}>
            <label className="hbz-label">Fahrzeit</label>
            <div className="hbz-chipbar">
              {TRAVEL_OPTIONS.map((m) => {
                const active = travelMinutes === m;
                // Schönerer Text ab 60 min
                let label = `${m} min`;
                if (m === 60) label = "1:00 h";
                if (m === 75) label = "1:15 h";
                if (m === 90) label = "1:30 h";

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
            <b>
              {Math.floor(totalWithTravel / 60)} h {totalWithTravel % 60} min
            </b>
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
