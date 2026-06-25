import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getWeatherFinalLabel } from "../utils/weather";
import { ensureMonthUnlocked } from "../utils/monthLock";
import { deleteTimeEntry } from "../lib/timeEntries";

const toHM = (mins = 0) =>
  `${String(Math.floor((mins ?? 0) / 60)).padStart(2, "0")}:${String(
    (mins ?? 0) % 60
  ).padStart(2, "0")}`;

const formatTemp = (value) =>
  typeof value === "number" && !Number.isNaN(value)
    ? `${value.toFixed(1)} °C`
    : "—";

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

const fieldLabel = (field) => {
  const map = {
    Eintrag: "Eintrag",
    project_id: "Projekt",
    start_min: "Start",
    end_min: "Ende",
    break_min: "Pause",
    travel_minutes: "Fahrzeit",
    travel_min: "Fahrzeit",
    private_car_km: "Privat-PKW km",
    crane_hours: "Kranstunden",
    absence_type: "Abwesenheit",
    note: "Notiz",
    work_date: "Datum",
    employee_id: "Mitarbeiter",
  };
  return map[field] || field || "—";
};

export default function EntryTable({ date, currentUser = null, isAdmin = false }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditEntry, setAuditEntry] = useState(null);

  const me = (() => {
    try {
      return JSON.parse(localStorage.getItem("employee") || "{}");
    } catch {
      return {};
    }
  })();
  const role = (me?.role || "mitarbeiter").toLowerCase();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function load() {
    setBusy(true);

    let q = supabase
      .from("v_time_entries_expanded")
      .select("*")
      .order("created_at", { ascending: false });

    if (date) q = q.eq("work_date", date);
    if (role === "mitarbeiter" && me?.id) q = q.eq("employee_id", me.id);

    try {
      const { data, error } = await q.limit(role === "mitarbeiter" ? 20 : 50);
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      const raw = localStorage.getItem("hbz_entries") || "[]";
      let list = JSON.parse(raw);
      if (date) list = list.filter((r) => r.work_date === date);
      if (role === "mitarbeiter" && me?.id) {
        list = list.filter((r) => r.employee_id === me.id);
      }
      setRows(list);
      console.warn("[EntryTable] fallback:", e);
    } finally {
      setBusy(false);
    }
  }

  async function openAuditLog(entry) {
    if (!isAdmin || !entry?.id) return;
    setAuditEntry(entry);
    setAuditRows([]);
    setAuditOpen(true);
    setAuditBusy(true);

    try {
      const { data, error } = await supabase
        .from("time_entry_audit_log")
        .select("*")
        .eq("entry_id", entry.id)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      setAuditRows(data || []);
    } catch (e) {
      console.warn("[EntryTable] audit load:", e);
      setAuditRows([]);
    } finally {
      setAuditBusy(false);
    }
  }

  async function writeDeleteAudit(entry) {
    if (!entry?.id) return;

    const auditRow = {
      entry_id: asUuidOrNull(entry.id),
      employee_id: asUuidOrNull(entry.employee_id),
      changed_by: asUuidOrNull(currentUser?.id || me?.id),
      change_type: "delete",
      field_name: "Eintrag",
      old_value: `Gelöscht: ${entry.work_date || date || ""}, ${toHM(entry.start_min)}–${toHM(entry.end_min)}, Pause ${entry.break_min || 0} min, Fahrzeit ${entry.travel_minutes || entry.travel_min || 0} min`,
      new_value: null,
      source: "manual",
    };

    if (!auditRow.entry_id) return;

    const { error } = await supabase.from("time_entry_audit_log").insert([auditRow]);
    if (error) console.warn("[EntryTable] audit delete:", error);
  }

  async function remove(id) {
    if (!window.confirm("Diesen Eintrag wirklich löschen?")) return;
    try {
      const entryToDelete = rows.find((x) => String(x.id) === String(id));
      await ensureMonthUnlocked(supabase, entryToDelete?.work_date);
      await writeDeleteAudit(entryToDelete);

      await deleteTimeEntry(supabase, id, { entry: entryToDelete });
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      alert(e?.message || "Löschen fehlgeschlagen.");
      console.warn("[EntryTable] delete:", e);
    }
  }

  const getTravel = (r) => r.travel_minutes ?? r.travel_min ?? 0;

  const parseAbsence = (note) => {
    const t = String(note || "").trim();
    const m = t.match(/^\[(krank|urlaub)\]\s*/i);
    if (!m) return { type: "", clean: note || "" };
    const type = m[1].toLowerCase() === "krank" ? "Krank" : "Urlaub";
    const clean = t.replace(/^\[(krank|urlaub)\]\s*/i, "");
    return { type, clean };
  };

  return (
    <div className="mo-wrap">
      {busy && <div className="text-sm text-neutral-500">Lade…</div>}
      {!busy && rows.length === 0 && (
        <div className="text-sm text-neutral-500">Keine Einträge gefunden.</div>
      )}

      {!busy && rows.length > 0 && (
        <table className="nice">
          <thead>
            <tr>
              <th style={{ width: 180 }}>Mitarbeiter</th>
              <th style={{ width: 220 }}>Projekt</th>
              <th style={{ width: 90, textAlign: "center" }}>Status</th>
              <th style={{ width: 90, textAlign: "center" }}>Start</th>
              <th style={{ width: 90, textAlign: "center" }}>Ende</th>
              <th style={{ width: 110, textAlign: "right" }}>Pause</th>
              <th style={{ width: 110, textAlign: "right" }}>Fahrzeit</th>
              <th style={{ width: 170 }}>Wetter</th>
              <th style={{ width: 120, textAlign: "center" }}>Temperatur</th>
              <th style={{ minWidth: 220 }}>Notiz</th>
              <th style={{ width: 140, textAlign: "right" }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const abs = parseAbsence(r.note);

              return (
                <tr key={r.id}>
                  <td>{r.employee_name || r.employee_id}</td>
                  <td>{r.project_name || r.project_code || r.project_id || "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    {abs.type ? (
                      <span className="hbz-chip active" style={{ padding: "2px 8px" }}>
                        {abs.type}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>{toHM(r.start_min)}</td>
                  <td style={{ textAlign: "center" }}>{toHM(r.end_min)}</td>
                  <td style={{ textAlign: "right" }}>{r.break_min ?? 0} min</td>
                  <td style={{ textAlign: "right" }}>{getTravel(r)} min</td>
                  <td>{getWeatherFinalLabel(r) || "—"}</td>
                  <td style={{ textAlign: "center" }}>{formatTemp(r.temperature)}</td>
                  <td>{abs.clean || ""}</td>
                  <td style={{ textAlign: "right" }}>
                    {isAdmin && (
                      <button
                        className="hbz-btn btn-small"
                        onClick={() => openAuditLog(r)}
                        style={{ marginRight: 6 }}
                        title="Nur für Admin sichtbar"
                      >
                        Verlauf
                      </button>
                    )}
                    <button className="hbz-btn btn-small" onClick={() => remove(r.id)}>
                      Löschen
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
          <div className="hbz-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="hbz-section-title" style={{ marginBottom: 2 }}>Änderungsverlauf</div>
              <div className="help">
                {auditEntry?.employee_name || auditEntry?.employee_id || "Mitarbeiter"} · {auditEntry?.project_name || auditEntry?.project_code || auditEntry?.project_id || "Projekt"}
              </div>
            </div>
            <button type="button" className="hbz-btn btn-small" onClick={() => setAuditOpen(false)}>
              Schließen
            </button>
          </div>

          {auditBusy ? (
            <div className="help" style={{ marginTop: 8 }}>Lade Verlauf…</div>
          ) : auditRows.length === 0 ? (
            <div className="help" style={{ marginTop: 8 }}>Für diesen Eintrag gibt es noch keinen gespeicherten Verlauf.</div>
          ) : (
            <table className="nice" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Zeit</th>
                  <th style={{ width: 110 }}>Art</th>
                  <th style={{ width: 140 }}>Feld</th>
                  <th>Alt</th>
                  <th>Neu</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDateTimeAT(a.changed_at)}</td>
                    <td>{a.change_type === "create" ? "Erstellt" : a.change_type === "delete" ? "Gelöscht" : "Geändert"}</td>
                    <td>{fieldLabel(a.field_name)}</td>
                    <td>{a.old_value || "—"}</td>
                    <td>{a.new_value || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
