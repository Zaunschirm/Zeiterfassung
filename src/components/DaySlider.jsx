import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import EmployeePicker from "./EmployeePicker.jsx";
// --- BUAK 2026 Kurz/Lang (nur Anzeige, sicher) ---
const BUAK_WEEK_TYPES_2026 = {
  1:"L",2:"L",3:"L",4:"K",5:"L",6:"L",7:"L",8:"K",9:"L",10:"L",11:"L",
  12:"K",13:"L",14:"L",15:"L",16:"K",17:"L",18:"L",19:"L",20:"K",21:"L",
  22:"L",23:"L",24:"K",25:"L",26:"L",27:"L",28:"K",29:"L",30:"L",31:"L",
  32:"K",33:"L",34:"L",35:"L",36:"K",37:"L",38:"L",39:"L",40:"K",41:"L",
  42:"L",43:"L",44:"K",45:"L",46:"L",47:"L",48:"K",49:"L",50:"L",51:"L",
  52:"K",53:"L",
};

function normalizeDateStr(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();

  // already ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd.mm.yyyy -> yyyy-mm-dd
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return s; // fallback (Date() might still parse)
}

function isoWeekNumber(dateStr) {
  const iso = normalizeDateStr(dateStr);
  if (!iso) return null;

  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;

  // ISO week: Monday = 0 ... Sunday = 6
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3); // Thursday
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);

  return 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

function getBuakWeekLabelSimple(dateStr) {
  try {
    const iso = normalizeDateStr(dateStr);
    const wk = isoWeekNumber(iso);
    if (!wk) return "";
    const year = Number(String(iso).slice(0, 4));
    if (year !== 2026) return `KW ${wk}`;
    const t = BUAK_WEEK_TYPES_2026[wk];
    if (t === "K") return `KW ${wk} - Kurzwoche`;
    if (t === "L") return `KW ${wk} - Langwoche`;
    return `KW ${wk}`;
  } catch {
    return "";
  }
}

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
  
  // BUAK Anzeige (nur Text)
  const buakWeekLabelSimple = getBuakWeekLabelSimple(date);

return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};
// Minuten → Stunden (2 Nachkommastellen)
const h2 = (m) => Math.round((m / 60) * 100) / 100;

// Pause- und Fahrzeit-Auswahl (0–90 Minuten in 15er-Schritten)
const PAUSE_OPTIONS = [0, 15, 30, 45, 60, 75, 90];
const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 75, 90];

const logSbError = (prefix, error) =>
  console.error(prefix, error?.message || error);

export default function DaySlider() {
  const session = getSession()?.user || null;
  const role = (session?.role || "mitarbeiter").toLowerCase();
  const isStaff = role === "mitarbeiter";
  const isManager = !isStaff;

  // Datum
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Zeiten (Neuanlage)
  const [fromMin, setFromMin] = useState(7 * 60);
  const [toMin, setToMin] = useState(16 * 60 + 30);
  const [breakMin, setBreakMin] = useState(30);
  const [travelMin, setTravelMin] = useState(0);
  const [note, setNote] = useState("");

  // NEU: Abwesenheit (Krank/Urlaub)
  // null = normale Arbeit
  const [absenceType, setAbsenceType] = useState(null);

  // Projekte
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [projectLoadNote, setProjectLoadNote] = useState(null);

  // Mitarbeiter (Picker, Mehrfachauswahl für Manager)
  const [employees, setEmployees] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState(
    isStaff ? [session?.code].filter(Boolean) : []
  );
  const [employeeRow, setEmployeeRow] = useState(null);

  // Einträge + Bearbeitung
  const [entries, setEntries] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editState, setEditState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  // ---------------- Projekte laden ----------------
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

        const list = (res.data || []).filter((p) => p?.disabled !== true && p?.active !== false);
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

  // ---------------- Mitarbeiter laden ----------------
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

  // ---------------- aktiver Mitarbeiter (für Mitarbeiterrolle) ----------------
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

  // ---------------- Anzeige: Tagesstunden + Überstunden ----------------
  const totalMin = useMemo(() => {
    const raw = clamp(toMin - fromMin, 0, 24 * 60);
    return clamp(raw - breakMin, 0, 24 * 60);
  }, [fromMin, toMin, breakMin]);

  const totalMinWithTravel = useMemo(
    () => totalMin + (travelMin || 0),
    [totalMin, travelMin]
  );

  const totalHours = useMemo(
    () => h2(totalMinWithTravel),
    [totalMinWithTravel]
  );
  const totalOvertime = useMemo(
    () => Math.max(totalHours - 9, 0),
    [totalHours]
  );

  // ---------------- Einträge laden ----------------
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

  // ---------------- Datum +/- ----------------
  const shiftDate = (days) => {
    setDate((old) => {
      const d = new Date(old);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    });
  };

  // ---------------- Speichern ----------------
  async function handleSave() {
    setError("");

    const isAbsence = absenceType === "krank" || absenceType === "urlaub";

    if (!isAbsence && !projectId) {
      setError("Bitte Projekt auswählen.");
      return;
    }

    const prj = projectId ? projects.find((p) => p.id === projectId) || null : null;

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
      note: `${absenceType === "krank" ? "[Krank] " : absenceType === "urlaub" ? "[Urlaub] " : ""}${(note || "").trim()}`.trim() || null,
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

  // ---------------- Bearbeiten / Löschen ----------------
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

  // ---------------- Render ----------------
  return (
    <div className="hbz-container">
      <div className="hbz-card">
        {/* Kopf */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="page-title">Zeiterfassung</h2>
          <div className="flex items-center gap-2">
            <button
              className="hbz-btn btn-small"
              type="button"
              onClick={() => shiftDate(-1)}
            >
              «
            </button>
            <input
              type="date"
              className="hbz-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ maxWidth: 160 }}
            />
            <button
              className="hbz-btn btn-small"
              type="button"
              onClick={() => shiftDate(1)}
            >
              »
            </button>
          </div>
        </div>

        {/* Mitarbeiter-Picker (nur Manager) */}
        {isManager && (
          <EmployeePicker
            employees={employees}
            selected={selectedCodes}
            onChange={setSelectedCodes}
            enableMulti={true}
          />
        )}

        {/* Hinweis, falls Projekte nicht geladen werden konnten */}
        {projectLoadNote && (
          <div className="text-xs text-red-700 mt-2">{projectLoadNote}</div>
        )}

        {/* Projekt */}
        <div className="mb-4 mt-3">
          <label className="block mb-1 font-semibold">Projekt</label>
          <select
            className="w-full px-3 py-2 rounded border"
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
          {(absenceType === "krank" || absenceType === "urlaub") && (
            <div className="text-xs opacity-70" style={{ marginTop: 4 }}>
              Bei Krank/Urlaub ist kein Projekt nötig.
            </div>
          )}
        </div>

        {/* Start / Ende mit Slider, Pause jetzt Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="font-semibold mb-1">Start</div>
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
              className="w-full"
            />
            <div className="mt-2 text-2xl font-bold">{toHM(fromMin)}</div>
          </div>
          <div>
            <div className="font-semibold mb-1">Ende</div>
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
              className="w-full"
            />
            <div className="mt-2 text-2xl font-bold">{toHM(toMin)}</div>
          </div>
          <div>
            <div className="font-semibold mb-1">Pause</div>
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
            <div className="mt-2 text-2xl font-bold">{breakMin} min</div>
          </div>
        </div>


        {/* NEU: Krank / Urlaub */}
        <div className="mt-4">
          <div className="font-semibold mb-1">Abwesenheit</div>
          <div className="hbz-chipbar">
            <button
              type="button"
              className={`hbz-chip ${absenceType === "krank" ? "active" : ""}`}
              onClick={() => {
                setAbsenceType("krank");
                setProjectId(null);
                // Mo–Do: 9h (07:00–16:00), Fr: 3h (07:00–10:00)
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
              className={`hbz-chip ${absenceType === "urlaub" ? "active" : ""}`}
              onClick={() => {
                setAbsenceType("urlaub");
                setProjectId(null);
                // 0h: 07:00–07:15 mit 15 min Pause => netto 0
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
          <div className="text-xs opacity-70 mt-1">
            Krank: Mo–Do 9h, Fr 3h. Urlaub: 0h. (Krank/Urlaub zählen nicht als Arbeitstage)
          </div>
        </div>

        {/* Fahrzeit – Buttons */}
        <div className="mt-4">
          <div className="font-semibold mb-1">Fahrzeit</div>
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
          <div className="text-xs opacity-70 mt-1">
            Kostenstelle: <b>FAHRZEIT</b> – wird zur Arbeitszeit dazugerechnet
            und in den Auswertungen separat ausgewiesen.
          </div>
        </div>

        <div className="mt-4 text-sm">
          <span className="font-semibold">Arbeitszeit heute:</span>{" "}
          {totalHours.toFixed(2)} h{" "}
          {totalOvertime > 0
            ? `(Ü: ${totalOvertime.toFixed(2)} h)`
            : "(keine Überstunden)"}
        </div>

        {/* Notiz */}
        <div className="mt-3">
          <label className="block mb-1 font-semibold">Notiz</label>
          <textarea
            className="w-full px-3 py-2 rounded border"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Tätigkeit, Besonderheiten…"
          />
        </div>

        {error && (
          <div className="mt-2 text-sm text-red-700">
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

      {/* Tages-Einträge */}
      <div className="hbz-card" style={{ marginTop: 12 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="hbz-section-title">Einträge am {date}</div>
          {loading && (
            <span className="text-xs opacity-70">Lade Einträge…</span>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="text-sm opacity-70">Keine Einträge.</div>
        ) : (
          <div className="mo-wrap">
            <table className="nice zt-table">
              <thead>
                <tr>
                  <th className="zt-col-emp">Mitarbeiter</th>
                  <th className="zt-col-prj">Projekt</th>
                  <th className="zt-col-time">Start</th>
                  <th className="zt-col-time">Ende</th>
                  <th className="zt-col-pause">Pause</th>
                  <th className="zt-col-pause">Fahrzeit</th>
                  <th className="zt-col-hrs">Stunden</th>
                  <th className="zt-col-ot">Überstunden</th>
                  <th className="zt-col-note">Notiz</th>
                  <th className="zt-col-actions"></th>
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
                        <td style={{ textAlign: "center" }}>{toHM(start)}</td>
                        <td style={{ textAlign: "center" }}>{toHM(end)}</td>
                        <td style={{ textAlign: "right" }}>{breakM} min</td>
                        <td style={{ textAlign: "right" }}>{travelM} min</td>
                        <td style={{ textAlign: "right" }}>
                          {hrs.toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right" }}>{ot.toFixed(2)}</td>
                        <td>{r.note || ""}</td>
                        <td style={{ textAlign: "right" }}>
                          {isManager ? (
                            <>
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
                            </>
                          ) : (
                            <span className="text-xs opacity-60">
                              nur Anzeige
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  // Bearbeitungszeile
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
                      <td style={{ textAlign: "center" }}>
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
                      <td style={{ textAlign: "center" }}>
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
                      <td style={{ textAlign: "right" }}>
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
                      <td style={{ textAlign: "right" }}>
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
                      <td colSpan={1} style={{ textAlign: "right" }}>
                        {(() => {
                          const startM = hmToMin(editState.from_hm);
                          const endM = hmToMin(editState.to_hm);
                          const br =
                            parseInt(editState.break_min || "0", 10) || 0;
                          const tr =
                            parseInt(
                              editState.travel_minutes || "0",
                              10
                            ) || 0;
                          const w = Math.max(endM - startM - br, 0) + tr;
                          const h = h2(w);
                          const o = Math.max(h - 9, 0);
                          return `${h.toFixed(2)} h / Ü: ${o.toFixed(2)} h`;
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
                      <td style={{ textAlign: "right" }}>
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