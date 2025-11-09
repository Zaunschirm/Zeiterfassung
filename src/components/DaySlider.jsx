import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import EmployeePicker from "./EmployeePicker.jsx";

// Utils
const toHM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hmToMin = (hm) => {
  if (!hm) return 0;
  const [h, m] = String(hm).split(":").map((x) => parseInt(x || "0", 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};
// Minuten → Stunden (2 Nachkommastellen)
const h2 = (m) => Math.round((m / 60) * 100) / 100;

const logSbError = (prefix, error) =>
  console.error(prefix, { message: error?.message, code: error?.code, details: error?.details, hint: error?.hint });

// ----------------------------------------------------

export default function DaySlider() {
  const session = getSession()?.user || null;
  const role = (session?.role || "mitarbeiter").toLowerCase();
  const isStaff = role === "mitarbeiter";
  const isManager = !isStaff;

  // Datum
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Slider (Neuanlage)
  const [fromMin, setFromMin] = useState(7 * 60);
  const [toMin, setToMin] = useState(16 * 60 + 30);
  const [breakMin, setBreakMin] = useState(30);
  const [note, setNote] = useState("");

  // Projekte
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [projectLoadNote, setProjectLoadNote] = useState(null);

  // Mitarbeiter (Picker, Mehrfachauswahl für Manager)
  const [employees, setEmployees] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState(isStaff ? [session?.code].filter(Boolean) : []);
  const [employeeRow, setEmployeeRow] = useState(null);

  // Einträge + Bearbeitung
  const [entries, setEntries] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editState, setEditState] = useState(null);

  // ---------------- Projekte laden (robust, inkl. Fallbacks) ----------------
  useEffect(() => {
    (async () => {
      setProjectLoadNote(null);

      const tryList = async (source) => {
        const { data, error } = await supabase.from(source).select("*").order("name", { ascending: true });
        if (error) {
          logSbError(`[DaySlider] ${source} load error:`, error);
          return { ok: false, data: [], source };
        }
        return { ok: true, data: data || [], source };
      };

      let res = await tryList("projects");
      if (!res.ok || res.data.length === 0) {
        for (const fb of ["v_projects", "projects_view", "projects_all"]) {
          const r = await tryList(fb);
          if (r.ok && r.data.length > 0) { res = r; break; }
        }
      }

      if (!res.ok) {
        setProjects([]);
        setProjectLoadNote("Projekte konnten nicht geladen werden. Siehe Konsole (RLS/Policy/Spalten).");
        return;
      }

      const list = (res.data || []).filter((p) => p?.disabled !== true);
      setProjects(list);
      if (list.length && !projectId) setProjectId(list[0].id);
      if (list.length === 0) setProjectLoadNote(`Keine Projekte gefunden (Quelle: ${res.source}). Prüfe Policies/Filter.`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- Mitarbeiterliste (nur Manager) ----------------
  useEffect(() => {
    if (!isManager) return;
    (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, code, name, role, active, disabled")
        .eq("active", true)
        .eq("disabled", false)
        .order("name", { ascending: true });

      if (error) {
        logSbError("employees load error:", error);
        setEmployees([]);
        return;
      }
      const list = data || [];
      setEmployees(list);
      if (list.length && selectedCodes.length === 0) setSelectedCodes(list.map((e) => e.code));
    })();
  }, [isManager]);

  // ---------------- aktiver Mitarbeiter (für Mitarbeiterrolle) ----------------
  useEffect(() => {
    const code = isStaff ? session?.code : selectedCodes[0];
    if (!code) { setEmployeeRow(null); return; }
    (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, code, name, role, active, disabled")
        .eq("code", code)
        .limit(1)
        .maybeSingle();

      if (!error && data) setEmployeeRow(data);
      else { setEmployeeRow(null); if (error) logSbError("employee fetch error:", error); }
    })();
  }, [isStaff, selectedCodes, session?.code]);

  // ---------------- Einträge laden ----------------
  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, selectedCodes, employeeRow?.id, date, isManager, isStaff]);

  async function fetchEntriesBase(filter) {
    try {
      let q = supabase.from("v_time_entries_expanded").select("*").eq("work_date", date);
      if (filter.employee_id) q = q.eq("employee_id", filter.employee_id);
      if (filter.employee_ids) q = q.in("employee_id", filter.employee_ids);
      q = q.order("employee_name", { ascending: true }).order("start_min", { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (err) {
      if (err?.code !== "42703") throw err; // Spalte existiert nicht -> fallback
      let q = supabase.from("v_time_entries_expanded").select("*").eq("work_date", date);
      if (filter.employee_id) q = q.eq("employee_id", filter.employee_id);
      if (filter.employee_ids) q = q.in("employee_id", filter.employee_ids);
      const { data, error } = await q.order("id", { ascending: true });
      if (error) throw error;
      return data || [];
    }
  }

  async function loadEntries() {
    try {
      if (isManager) {
        if (!employees.length) return setEntries([]);
        const ids = employees.filter((e) => selectedCodes.includes(e.code)).map((e) => e.id);
        if (!ids.length) return setEntries([]);
        const data = await fetchEntriesBase({ employee_ids: ids });
        setEntries(data);
        return;
      }
      if (!employeeRow?.id) return setEntries([]);
      const data = await fetchEntriesBase({ employee_id: employeeRow.id });
      setEntries(data);
    } catch (error) {
      logSbError("entries load error:", error);
      setEntries([]);
    }
  }

  // ---------------- Tagesminuten (Anzeige) + Text oben ----------------
  const totalMin = useMemo(() => {
    const raw = clamp(toMin - fromMin, 0, 24 * 60);
    return clamp(raw - breakMin, 0, 24 * 60);
  }, [fromMin, toMin, breakMin]);
  const totalHours = useMemo(() => h2(totalMin), [totalMin]);
  const totalOvertime = useMemo(() => Math.max(totalHours - 9, 0), [totalHours]);

  // ---------------- Speichern (Manager: Bulk für alle ausgewählten) ----------------
  async function handleSave() {
    try {
      const prj = projects.find((p) => p.id === projectId) || null;

      const base = {
        work_date: date,
        project_id: prj ? prj.id : null,
        start_min: fromMin,   // Tabellenspalten
        end_min: toMin,
        break_min: breakMin,
        note: note?.trim() || null,
      };

      if (isManager) {
        const chosen = employees.filter((e) => selectedCodes.includes(e.code));
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
          alert("Bitte zuerst Mitarbeiter auswählen.");
          return;
        }
        if (employeeRow.code !== session.code) {
          alert("Nicht erlaubt: Mitarbeiter dürfen nur für sich selbst buchen.");
          return;
        }
        const { error } = await supabase.from("time_entries").insert({ ...base, employee_id: employeeRow.id });
        if (error) throw error;
        alert("Gespeichert.");
      }

      setNote("");
      await loadEntries();
    } catch (err) {
      logSbError("save error:", err);
      alert("Speichern fehlgeschlagen.");
    }
  }

  // ---------------- Bearbeiten / Löschen (ohne total_min) ----------------
  function startEdit(row) {
    if (!isManager) return;
    setEditId(row.id);
    setEditState({
      project_id: row.project_id,
      from_hm: toHM(row.start_min ?? row.from_min ?? 0),
      to_hm: toHM(row.end_min ?? row.to_min ?? 0),
      break_min: row.break_min ?? 0,
      note: row.note ?? "",
    });
  }
  function cancelEdit() { setEditId(null); setEditState(null); }
  async function saveEdit() {
    if (!isManager || !editId || !editState) return;
    const from_m = hmToMin(editState.from_hm);
    const to_m = hmToMin(editState.to_hm);
    const br_m = parseInt(editState.break_min || "0", 10);
    const prj = projects.find((p) => p.id === editState.project_id) || null;

    const { error } = await supabase
      .from("time_entries")
      .update({
        project_id: prj ? prj.id : null,
        start_min: from_m,
        end_min: to_m,
        break_min: isNaN(br_m) ? 0 : br_m,
        note: (editState.note || "").trim() || null,
      })
      .eq("id", editId);

    if (error) { logSbError("update error:", error); alert("Aktualisieren fehlgeschlagen."); return; }
    await loadEntries();
    cancelEdit();
  }
  async function deleteEntry(id) {
    if (!isManager) return;
    if (!confirm("Eintrag wirklich löschen?")) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) { logSbError("delete error:", error); alert("Löschen fehlgeschlagen."); return; }
    await loadEntries();
  }

  // ---------------- UI ----------------
  return (
    <div className="max-w-screen-lg mx-auto">
      {/* Datum */}
      <div className="flex gap-2 mb-3">
        <button
          className="px-3 py-1 rounded border"
          onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); }}
        >«</button>

        <input type="date" className="px-3 py-1 rounded border" value={date} onChange={(e) => setDate(e.target.value)} />

        <button
          className="px-3 py-1 rounded border"
          onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)); }}
        >»</button>
      </div>

      {/* Mitarbeiter-Picker (nur Manager) */}
      {isManager && (
        <EmployeePicker employees={employees} selected={selectedCodes} onChange={setSelectedCodes} enableMulti={true} />
      )}

      {/* Hinweis, falls Projekte nicht geladen werden konnten */}
      {projectLoadNote && (
        <div className="mb-3 px-3 py-2 rounded border" style={{ background: "#fff6d6", borderColor: "#f2c94c" }}>
          {projectLoadNote}
        </div>
      )}

      {/* Karte: Neuer Eintrag */}
      <div className="rounded-xl shadow mb-6" style={{ background: "#fff", border: "1px solid #d9c9b6" }}>
        <div className="p-4">
          {/* Projekt */}
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Projekt</label>
            <select className="w-full px-3 py-2 rounded border" value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value || null)}>
              <option value="">— ohne Projekt —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code ? `${p.code} · ${p.name}` : p.name}</option>
              ))}
            </select>
          </div>

          {/* Slider Start/Ende/Pause */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="font-semibold mb-1">Start</div>
              <input type="range" min={5 * 60} max={19 * 60 + 30} step={15} value={fromMin} onChange={(e) => setFromMin(Number(e.target.value))} className="w-full" />
              <div className="mt-2 text-2xl font-bold">{toHM(fromMin)}</div>
            </div>
            <div>
              <div className="font-semibold mb-1">Ende</div>
              <input type="range" min={5 * 60} max={19 * 60 + 30} step={15} value={toMin} onChange={(e) => setToMin(Number(e.target.value))} className="w-full" />
              <div className="mt-2 text-2xl font-bold">{toHM(toMin)}</div>
            </div>
            <div>
              <div className="font-semibold mb-1">Pause</div>
              <input type="range" min={0} max={180} step={5} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} className="w-full" />
              <div className="mt-2 text-2xl font-bold">{breakMin} min</div>
            </div>
          </div>

          <div className="mt-4 text-sm">
            <span className="font-semibold">Arbeitszeit heute:</span>{" "}
            {totalHours.toFixed(2)} h {totalOvertime > 0 ? `(Ü: ${totalOvertime.toFixed(2)} h)` : ""}
          </div>

          {/* Notiz */}
          <div className="mt-4">
            <label className="block mb-1 font-semibold">Notiz</label>
            <textarea className="w-full h-24 rounded border px-3 py-2" placeholder="z. B. Tätigkeit, Besonderheiten…" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {/* ✅ Mobilfreundlicher Speichern-Button (sticky) – FUNKTION UNVERÄNDERT */}
          <div className="mt-4 save-btn-wrapper">
            <button
              onClick={handleSave}
              className="save-btn"
              disabled={isManager ? selectedCodes.length === 0 : !employeeRow}
              aria-busy={false}
            >
              <span className="btn-icon" aria-hidden="true">💾</span>
              Speichern
            </button>
          </div>
        </div>
      </div>

      {/* Liste + Bearbeiten */}
      <div className="rounded-xl shadow" style={{ background: "#fff", border: "1px solid #d9c9b6" }}>
        <div className="px-4 py-3 font-semibold" style={{ background: "#f6eee4" }}>
          Einträge am {new Date(date).toLocaleDateString("de-AT")}
        </div>

        <div className="p-3 overflow-auto">
          {entries.length === 0 ? (
            <div className="text-sm opacity-70">Keine Einträge.</div>
          ) : (
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Mitarbeiter</th>
                  <th style={{ textAlign: "left" }}>Projekt</th>
                  <th>Start</th>
                  <th>Ende</th>
                  <th>Pause</th>
                  <th>Stunden</th>
                  <th>Überstunden</th>
                  <th style={{ textAlign: "left" }}>Notiz</th>
                  <th style={{ width: 180 }}></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((r) => {
                  const isEditing = editId === r.id;
                  if (!isEditing) {
                    const start = r.start_min ?? r.from_min ?? 0;
                    const end = r.end_min ?? r.to_min ?? 0;
                    const minutes = Math.max(end - start - (r.break_min || 0), 0);
                    const hours = h2(minutes);
                    const overtime = Math.max(hours - 9, 0);

                    return (
                      <tr key={r.id}>
                        <td>{r.employee_name}</td>
                        <td>{r.project_name || "—"}</td>
                        <td>{toHM(start)}</td>
                        <td>{toHM(end)}</td>
                        <td>{r.break_min ?? 0} min</td>
                        <td>{hours.toFixed(2)}</td>
                        <td>{overtime.toFixed(2)}</td>
                        <td>{r.note || ""}</td>
                        <td style={{ textAlign: "right" }}>
                          {isManager ? (
                            <>
                              <button className="px-2 py-1 rounded border mr-2" onClick={() => startEdit(r)}>Bearbeiten</button>
                              <button className="px-2 py-1 rounded border" onClick={() => deleteEntry(r.id)}>Löschen</button>
                            </>
                          ) : (
                            <span className="text-xs opacity-60">nur Anzeige</span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  // Edit-Zeile
                  return (
                    <tr key={r.id}>
                      <td>{r.employee_name}</td>
                      <td>
                        <select className="px-2 py-1 rounded border" value={editState.project_id ?? ""} onChange={(e) => setEditState((s) => ({ ...s, project_id: e.target.value || null }))}>
                          <option value="">— ohne Projekt —</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.code ? `${p.code} · ${p.name}` : p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="time" className="px-2 py-1 rounded border" value={editState.from_hm} onChange={(e) => setEditState((s) => ({ ...s, from_hm: e.target.value }))} />
                      </td>
                      <td>
                        <input type="time" className="px-2 py-1 rounded border" value={editState.to_hm} onChange={(e) => setEditState((s) => ({ ...s, to_hm: e.target.value }))} />
                      </td>
                      <td>
                        <input type="number" min={0} step={5} className="px-2 py-1 rounded border w-24" value={editState.break_min} onChange={(e) => setEditState((s) => ({ ...s, break_min: e.target.value }))} />
                      </td>
                      <td colSpan={2}>
                        {(() => {
                          const mins = Math.max(
                            hmToMin(editState.to_hm) - hmToMin(editState.from_hm) - (parseInt(editState.break_min || "0", 10) || 0),
                            0
                          );
                          const hrs = h2(mins);
                          const ot = Math.max(hrs - 9, 0);
                          return `${hrs.toFixed(2)} h / Ü: ${ot.toFixed(2)} h`;
                        })()}
                      </td>
                      <td>
                        <input type="text" className="px-2 py-1 rounded border w-full" value={editState.note} onChange={(e) => setEditState((s) => ({ ...s, note: e.target.value }))} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button className="px-2 py-1 rounded border mr-2" onClick={saveEdit}>Speichern</button>
                        <button className="px-2 py-1 rounded border" onClick={cancelEdit}>Abbrechen</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
