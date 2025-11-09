import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabase";
import DaySlider from "./DaySlider";
import EntryTable from "./EntryTable";

const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`;

export default function TimeTracking() {
  const { user, isAuthenticated } = useSession();

  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [date, setDate] = useState(todayISO());
  const [projectId, setProjectId] = useState("");
  const [activity, setActivity] = useState("");
  const [fromMin, setFromMin] = useState(8 * 60);
  const [toMin, setToMin] = useState(16 * 60 + 30);
  const [note, setNote] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [entriesToday, setEntriesToday] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const durationMin = useMemo(() => Math.max(toMin - fromMin, 0), [fromMin, toMin]);

  useEffect(() => {
    (async () => {
      try {
        const { data: proj } = await supabase.from("projects").select("id, name").order("name");
        setProjects(proj || []);
        const { data: emp } = await supabase.from("employees").select("id, name, code, role").order("name");
        setEmployees(emp || []);
      } catch (e) {
        console.warn("[TimeTracking] Stammdaten-Fallback:", e);
        setProjects([{ id: "demo-1", name: "Allgemein" }]);
        setEmployees(user?.code ? [{ id: user.code, name: user.code }] : []);
        setError(String(e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEntriesForDay = async () => {
    try {
      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("date", date)
        .order("created_at", { ascending: false });
      setEntriesToday(data || []);
    } catch {
      const raw = localStorage.getItem("hbz_entries") || "[]";
      setEntriesToday(JSON.parse(raw).filter((r) => r.date === date));
    }
  };
  useEffect(() => { loadEntriesForDay(); }, [date]);

  const toggleEmp = (emp) => {
    const key = emp.id ?? emp.code ?? emp.name;
    setSelectedEmployees((prev) =>
      prev.some((e) => (e.id ?? e.code ?? e.name) === key)
        ? prev.filter((e) => (e.id ?? e.code ?? e.name) !== key)
        : [...prev, emp]
    );
  };

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

      try {
        const { error } = await supabase.from("time_entries").insert(rows);
        if (error) throw error;
      } catch (dbErr) {
        const raw = localStorage.getItem("hbz_entries") || "[]";
        localStorage.setItem("hbz_entries", JSON.stringify([...rows, ...JSON.parse(raw)]));
        console.warn("[TimeTracking] LocalStorage-Fallback:", dbErr);
      }

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
      {/* EINZIGE Maske */}
      <div className="hbz-card tight">
        <div className="hbz-row">
          <h2 className="hbz-title" style={{ color: "var(--hbz-brown)", margin: 0 }}>Zeiterfassung</h2>
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
            <select className="hbz-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Projekt wählen —</option>
              {projects.map((p) => (
                <option key={p.id ?? p.name} value={p.id ?? p.name}>{p.name ?? p.title ?? p.id}</option>
              ))}
            </select>
          </div>
          <div className="hbz-col">
            <label className="hbz-label">Tätigkeit</label>
            <input className="hbz-input" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="z. B. Montage" />
          </div>
        </div>

        <hr className="hr-soft" />

        <div className="hbz-section-title">Zeit</div>
        <div className="hbz-row" style={{ alignItems: "flex-end" }}>
          <div className="hbz-col">
            <div className="field-inline">
              <label>Start</label>
              <input type="time" className="hbz-input" value={fmt(fromMin)}
                onChange={(e) => { const [h,m]=e.target.value.split(":").map(Number); setFromMin(clamp(h*60+m,0,24*60)); }}
                style={{ maxWidth: 120 }} />
            </div>
          </div>
          <div className="hbz-col">
            <div className="field-inline">
              <label>Ende</label>
              <input type="time" className="hbz-input" value={fmt(toMin)}
                onChange={(e) => { const [h,m]=e.target.value.split(":").map(Number); setToMin(clamp(h*60+m,0,24*60)); }}
                style={{ maxWidth: 120 }} />
            </div>
          </div>
          <div className="hbz-col-auto"><span className="kbd">Dauer</span>&nbsp;<b>{Math.floor(durationMin/60)} h {durationMin%60} min</b></div>
        </div>

        <div style={{ marginTop: 8 }}>
          <DaySlider
            fromMin={fromMin}
            toMin={toMin}
            step={15}
            onChange={({ from, to }) => { setFromMin(clamp(from,0,24*60)); setToMin(clamp(to,0,24*60)); }}
          />
        </div>

        <hr className="hr-soft" />

        <div className="hbz-section-title">Mitarbeiter</div>
        <div className="hbz-row" style={{ marginBottom: 6 }}>
          <button type="button" className="hbz-btn btn-small" onClick={() => setSelectedEmployees(employees)}>Alle</button>
          <button type="button" className="hbz-btn btn-small" onClick={() => setSelectedEmployees([])}>Keine</button>
          <div className="help">{selectedEmployees.length} / {employees.length} gewählt</div>
        </div>
        <div className="hbz-chipbar">
          {employees.map((emp) => {
            const key = emp.id ?? emp.code ?? emp.name;
            const active = selectedEmployees.some((e) => (e.id ?? e.code ?? e.name) === key);
            return (
              <button key={key} type="button" className={`hbz-chip ${active ? "active" : ""}`} onClick={() => toggleEmp(emp)}>
                {emp.name ?? key}
              </button>
            );
          })}
        </div>

        <hr className="hr-soft" />

        <div className="hbz-col" style={{ marginTop: 4 }}>
          <label className="hbz-label">Notiz</label>
          <textarea className="hbz-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optionale Besonderheiten…" />
        </div>

        {error && <div className="hbz-section error" style={{ marginTop: 10 }}><strong>Fehler:</strong> {error}</div>}

        <div className="save-bar">
          <button className="save-btn lg" onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
        </div>
      </div>

      {/* nur EINE Liste */}
      <div className="hbz-card tight" style={{ marginTop: 12 }}>
        <div className="hbz-row" style={{ justifyContent: "space-between" }}>
          <div className="hbz-section-title" style={{ margin: 0 }}>Einträge {date}</div>
        </div>
        <div style={{ marginTop: 8 }}>
          <EntryTable entries={entriesToday} />
        </div>
      </div>
    </div>
  );
}
