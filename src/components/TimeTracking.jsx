import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabase";

import DaySlider from "./DaySlider";
import EmployeePicker from "./EmployeePicker";
import EntryTable from "./EntryTable";

/** Helpers */
const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`;

/** LocalStorage Keys (Fallback) */
const LS_ENTRIES = "hbz_entries";

/**
 * ZEITERFASSUNG – voll integriert
 * - lädt Projekte & Mitarbeiter (Supabase)
 * - Mehrfachauswahl Mitarbeiter
 * - DaySlider + Time-Inputs (15-Min Schritt)
 * - Speichern in 'time_entries' (Supabase) – Fallback LocalStorage
 * - Tagesliste unten
 */
export default function TimeTracking() {
  const { user, isAuthenticated } = useSession();

  // Stammdaten
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Auswahl/State
  const [date, setDate] = useState(todayISO());
  const [projectId, setProjectId] = useState("");
  const [activity, setActivity] = useState("");

  const [fromMin, setFromMin] = useState(8 * 60);       // 08:00
  const [toMin, setToMin] = useState(16 * 60 + 30);     // 16:30
  const [note, setNote] = useState("");

  const [selectedEmployees, setSelectedEmployees] = useState([]);

  // Anzeige & Status
  const [entriesToday, setEntriesToday] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const durationMin = useMemo(() => clamp(toMin - fromMin, 0, 24 * 60), [fromMin, toMin]);

  /** Stammdaten laden */
  useEffect(() => {
    (async () => {
      try {
        // Projekte
        const { data: proj, error: pErr } = await supabase
          .from("projects")
          .select("id, name")
          .order("name", { ascending: true });
        if (pErr) throw pErr;
        setProjects(proj || []);

        // Mitarbeiter
        const { data: emp, error: eErr } = await supabase
          .from("employees")
          .select("id, name, code, role")
          .order("name", { ascending: true });
        if (eErr) throw eErr;
        setEmployees(emp || []);
      } catch (e) {
        // Fallback (nur damit UI benutzbar bleibt)
        console.warn("[TimeTracking] Fallback Stammdaten:", e);
        setProjects((prev) => prev.length ? prev : [{ id: "demo-1", name: "Allgemein" }]);
        setEmployees((prev) => prev.length ? prev : (user?.code ? [{ id: user.code, name: user.code }] : []));
        setError(String(e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tagesliste laden */
  const loadEntriesForDay = async () => {
    try {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("date", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setEntriesToday(data || []);
    } catch (e) {
      // Fallback LocalStorage
      const raw = localStorage.getItem(LS_ENTRIES);
      const all = raw ? JSON.parse(raw) : [];
      setEntriesToday(all.filter((r) => r.date === date));
      console.warn("[TimeTracking] Fallback Tagesliste:", e);
    }
  };
  useEffect(() => { loadEntriesForDay(); }, [date]);

  /** Mitarbeiter-Mehrfachauswahl */
  const toggleEmployee = (emp) => {
    setSelectedEmployees((prev) => {
      const key = emp.id ?? emp.code ?? emp.name;
      const exists = prev.some((e) => (e.id ?? e.code ?? e.name) === key);
      return exists ? prev.filter((e) => (e.id ?? e.code ?? e.name) !== key) : [...prev, emp];
    });
  };

  /** Speichern */
  const save = async () => {
    setError("");

    if (!projectId) return setError("Bitte ein Projekt auswählen.");
    if (!selectedEmployees.length) return setError("Bitte mindestens einen Mitarbeiter auswählen.");
    if (durationMin <= 0) return setError("Zeitspanne ungültig.");
    if (!isAuthenticated && !user?.code) return setError("Bitte zuerst einloggen (Code+PIN).");

    setSaving(true);
    try {
      const base = {
        date,
        project_id: projectId,
        activity: activity || null,
        from: fmt(fromMin),
        to: fmt(toMin),
        minutes: durationMin,
        note: note || null,
        created_by: user?.code || "unknown",
        created_at: new Date().toISOString(),
      };

      const rows = selectedEmployees.map((emp) => ({
        ...base,
        employee_id: emp.id ?? emp.code ?? emp.name,
      }));

      // bevorzugt: Supabase
      try {
        const { error } = await supabase.from("time_entries").insert(rows);
        if (error) throw error;
      } catch (dbErr) {
        // Fallback: LocalStorage
        const raw = localStorage.getItem(LS_ENTRIES);
        const all = raw ? JSON.parse(raw) : [];
        localStorage.setItem(LS_ENTRIES, JSON.stringify([...rows, ...all]));
        console.warn("[TimeTracking] LocalStorage-Fallback, DB-Fehler:", dbErr);
      }

      // Reset / Reload
      setNote("");
      await loadEntriesForDay();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hbz-container">
      <div className="hbz-card">
        <div className="hbz-toolbar">
          <h2 className="hbz-title" style={{ color: "var(--hbz-brown)" }}>Zeiterfassung</h2>
          <input
            type="date"
            className="hbz-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ maxWidth: 170 }}
          />
        </div>

        {/* Projekt + Tätigkeit */}
        <div className="hbz-grid hbz-grid-3" style={{ marginTop: 12 }}>
          <div>
            <label className="hbz-label">Projekt</label>
            <select
              className="hbz-input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— Projekt wählen —</option>
              {projects.map((p) => (
                <option key={p.id ?? p.name} value={p.id ?? p.name}>
                  {p.name ?? p.title ?? p.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="hbz-label">Tätigkeit</label>
            <input
              className="hbz-input"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="z. B. Montage"
            />
          </div>

          <div />
        </div>

        {/* Zeiten */}
        <div className="hbz-grid" style={{ marginTop: 12 }}>
          <label className="hbz-label">Zeit</label>
          <DaySlider
            fromMin={fromMin}
            toMin={toMin}
            step={15}
            onChange={({ from, to }) => {
              setFromMin(clamp(from, 0, 24 * 60));
              setToMin(clamp(to, 0, 24 * 60));
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="hbz-input"
              type="time"
              value={fmt(fromMin)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map((x) => parseInt(x, 10));
                setFromMin(h * 60 + m);
              }}
              style={{ maxWidth: 120 }}
            />
            <input
              className="hbz-input"
              type="time"
              value={fmt(toMin)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map((x) => parseInt(x, 10));
                setToMin(h * 60 + m);
              }}
              style={{ maxWidth: 120 }}
            />
            <div style={{ alignSelf: "center", fontWeight: 600 }}>
              Dauer: {Math.floor(durationMin / 60)} h {durationMin % 60} min
            </div>
          </div>
        </div>

        {/* Mitarbeiter (Mehrfachauswahl) */}
        <div className="hbz-grid" style={{ marginTop: 12 }}>
          <label className="hbz-label">Mitarbeiter</label>
          <EmployeePicker
            employees={employees}
            selected={selectedEmployees}
            onToggle={toggleEmployee}
            multi
          />
        </div>

        {/* Notiz */}
        <div className="hbz-grid" style={{ marginTop: 12 }}>
          <label className="hbz-label">Notiz</label>
          <textarea
            className="hbz-textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optionale Notiz…"
          />
        </div>

        {/* Fehleranzeige */}
        {error && (
          <div className="hbz-section error" style={{ marginTop: 12 }}>
            <strong>Fehler:</strong> {error}
          </div>
        )}

        {/* Speichern */}
        <div className="save-btn-wrapper" style={{ marginTop: 12 }}>
          <button className="save-btn" onClick={save} disabled={saving}>
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </div>

      {/* Tagesliste */}
      <div className="hbz-card">
        <div className="hbz-toolbar">
          <h3 style={{ margin: 0, color: "var(--hbz-brown)" }}>Einträge {date}</h3>
        </div>
        <div style={{ marginTop: 8 }}>
          <EntryTable entries={entriesToday} />
        </div>
      </div>
    </div>
  );
}
