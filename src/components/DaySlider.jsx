import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import EmployeePicker from "./EmployeePicker.jsx";

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

const PAUSE_OPTIONS = [0, 15, 30, 45, 60, 75, 90];
const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 75, 90];

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

const logSbError = (prefix, error) =>
  console.error(prefix, error?.message || error);

export default function DaySlider() {
  const session = getSession()?.user || null;
  const role = (session?.role || "mitarbeiter").toLowerCase();
  const isStaff = role === "mitarbeiter";
  const isManager = !isStaff;

  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const buakWeekLabel = getBuakWeekLabel(date);

  const [fromMin, setFromMin] = useState(7 * 60);
  const [toMin, setToMin] = useState(16 * 60 + 30);
  const [breakMin, setBreakMin] = useState(30);
  const [travelMin, setTravelMin] = useState(0);
  const [note, setNote] = useState("");

  const [absenceType, setAbsenceType] = useState(null);

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [projectLoadNote, setProjectLoadNote] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState(
    isStaff ? [session?.code].filter(Boolean) : []
  );
  const [employeeRow, setEmployeeRow] = useState(null);

  const [entries, setEntries] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editState, setEditState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

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
            .select("id, code, name, role, active, disabled")
            .eq("active", true)
            .eq("disabled", false)
            .order("name", { ascending: true });

          if (error) throw error;
          setEmployees(data || []);
          if (!selectedCodes.length && data && data.length) {
            setSelectedCodes(data.map((e) => e.code));
          }
        } else {
          const { data, error } = await supabase
            .from("employees")
            .select("id, code, name, role, active, disabled")
            .eq("code", session?.code)
            .limit(1)
            .maybeSingle();
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
  }, [isManager, session?.code]);

  useEffect(() => {
    if (!isStaff) return;
    if (!session?.code) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("employees")
          .select("id, code, name, role, active, disabled")
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

  async function loadEntries() {
    try {
      setLoading(true);
      let query = supabase
        .from("v_time_entries_expanded")
        .select("*")
        .eq("work_date", date)
        .order("employee_name", { ascending: true })
        .order("start_min", { ascending: true });

      if (isManager && selectedCodes.length) {
        const selEmps = employees.filter((e) =>
          selectedCodes.includes(e.code)
        );
        const ids = selEmps.map((e) => e.id);
        if (ids.length) query = query.in("employee_id", ids);
      } else if (isStaff && employeeRow?.id) {
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

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isManager, selectedCodes, employeeRow?.id]);

  const shiftDate = (days) => {
    setDate((old) => {
      const d = new Date(old);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    });
  };

  async function handleSave() {
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
      note: `${
        absenceType === "krank"
          ? "[Krank] "
          : absenceType === "urlaub"
          ? "[Urlaub] "
          : ""
      }${(note || "").trim()}`.trim() || null,
    };

    try {
      setSaving(true);

      if (isManager) {
        const chosen = employees.filter((e) =>
          selectedCodes.includes(e.code)
        );
        if (chosen.length === 0) {
          alert("Bitte mindestens einen Mitarbeiter auswählen.");
          return;
        }
        const rows = chosen.map((e) => ({ ...base, employee_id: e.id }));
        const { error } = await supabase.from("time_entries").insert(rows);
        if (error) throw error;
        alert(`Gespeichert für ${rows.length} Mitarbeiter.`);
      } else {
        if (!employeeRow) {
          alert("Mitarbeiterdaten konnten nicht geladen werden.");
          return;
        }
        if (employeeRow.code !== session.code) {
          alert("Nicht erlaubt: Mitarbeiter dürfen nur für sich buchen.");
          return;
        }
        const { error } = await supabase
          .from("time_entries")
          .insert({ ...base, employee_id: employeeRow.id });
        if (error) throw error;
        alert("Gespeichert.");
      }

      setNote("");
      setAbsenceType(null);
      setBreakMin(30);
      setTravelMin(0);
      await loadEntries();
    } catch (err) {
      logSbError("save error:", err);
      alert("Speichern fehlgeschlagen. Siehe Konsole.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    if (!isManager) return;
    setEditId(row.id);
    setEditState({
      project_id: row.project_id,
      from_hm: toHM(row.start_min ?? row.from_min ?? 0),
      to_hm: toHM(row.end_min ?? row.to_min ?? 0),
      break_min: row.break_min ?? 0,
      travel_minutes: row.travel_minutes ?? row.travel_min ?? 0,
      note: row.note || "",
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditState(null);
  }

  async function saveEdit() {
    if (!isManager || !editId || !editState) return;

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
      note: editState.note?.trim() || null,
    };

    try {
      const { error } = await supabase
        .from("time_entries")
        .update(upd)
        .eq("id", editId);
      if (error) throw error;
      await loadEntries();
      cancelEdit();
    } catch (e) {
      logSbError("saveEdit error:", e);
      alert("Änderung konnte nicht gespeichert werden.");
    }
  }

  async function deleteEntry(id) {
    if (!isManager) return;
    if (!window.confirm("Eintrag wirklich löschen?")) return;
    try {
      const { error } = await supabase
        .from("time_entries")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await loadEntries();
    } catch (e) {
      logSbError("deleteEntry error:", e);
      alert("Löschen fehlgeschlagen.");
    }
  }

  const summaryCards = [
    { label: "Start", value: toHM(fromMin) },
    { label: "Ende", value: toHM(toMin) },
    { label: "Pause", value: `${breakMin} min` },
    { label: "Fahrzeit", value: `${travelMin} min` },
  ];

  return (
    <div className="month-overview">
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

        {isManager && (
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
                let label = `${m} min`;
                if (m === 60) label = "1:00 h";
                if (m === 75) label = "1:15 h";
                if (m === 90) label = "1:30 h";
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

              {absenceType && (
                <button
                  type="button"
                  className="hbz-chip"
                  onClick={() => setAbsenceType(null)}
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
                let label = `${m} min`;
                if (m === 60) label = "1:00 h";
                if (m === 75) label = "1:15 h";
                if (m === 90) label = "1:30 h";
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
        </div>

        <div className="year-range-active" style={{ marginTop: 16 }}>
          <strong>Arbeitszeit heute:</strong> {totalHours.toFixed(2)} h
          {totalOvertime > 0
            ? ` | Ü: ${totalOvertime.toFixed(2)} h`
            : " | keine Überstunden"}
        </div>

        <div className="month-card-field" style={{ marginTop: 16 }}>
          <label className="hbz-label">Notiz</label>
          <textarea
            className="hbz-textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Tätigkeit, Besonderheiten…"
          />
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
                  <th className="num">Stunden</th>
                  <th className="num">Überstunden</th>
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
                        <td className="num">{hrs.toFixed(2)}</td>
                        <td className="num">{ot.toFixed(2)}</td>
                        <td>{r.note || ""}</td>
                        <td className="num">
                          {isManager ? (
                            <div className="month-action-group">
                              <button
                                className="hbz-btn btn-small"
                                type="button"
                                onClick={() => startEdit(r)}
                              >
                                Bearbeiten
                              </button>
                              <button
                                className="hbz-btn btn-small"
                                type="button"
                                onClick={() => deleteEntry(r.id)}
                              >
                                Löschen
                              </button>
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
                        {(() => {
                          const startM = hmToMin(editState.from_hm);
                          const endM = hmToMin(editState.to_hm);
                          const br =
                            parseInt(editState.break_min || "0", 10) || 0;
                          const tr =
                            parseInt(editState.travel_minutes || "0", 10) || 0;
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
                            parseInt(editState.travel_minutes || "0", 10) || 0;
                          const w = Math.max(endM - startM - br, 0) + tr;
                          const h = h2(w);
                          const o = Math.max(h - 9, 0);
                          return o.toFixed(2);
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
      </div>
    </div>
  );
}