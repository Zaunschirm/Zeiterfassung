// src/components/EntryTable.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function EntryTable() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  // eingeloggter Mitarbeiter (aus LoginPanel in localStorage geschrieben)
  const me = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("employee") || "{}");
    } catch {
      return {};
    }
  }, []);
  const role = me?.role || "mitarbeiter";

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setBusy(true);

    // Mitarbeiter: nur eigene Einträge
    // Admin/Teamleiter: die letzten Einträge aller
    let query = supabase
      .from("time_entries")
      .select(
        "id, work_date, start_min, end_min, break_min, note, project, employee_id"
      )
      .order("created_at", { ascending: false })
      .limit(role === "mitarbeiter" ? 10 : 20);

    if (role === "mitarbeiter") {
      query = query.eq("employee_id", me.id);
    }

    const { data, error } = await query;
    setBusy(false);

    if (!error) setRows(data || []);
  }

  async function remove(id) {
    if (!confirm("Diesen Eintrag wirklich löschen?")) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) {
      alert(error.message || "Löschen fehlgeschlagen.");
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
  }

  const toHM = (mins = 0) =>
    `${String(Math.floor((mins ?? 0) / 60)).padStart(2, "0")}:${String(
      (mins ?? 0) % 60
    ).padStart(2, "0")}`;

  return (
    <div className="hbz-card">
      <h3 className="text-lg font-semibold mb-3">Letzte Einträge</h3>

      {busy && <div className="text-sm text-neutral-500">Lade…</div>}

      {!busy && rows.length === 0 && (
        <div className="text-sm text-neutral-500">Keine Einträge gefunden.</div>
      )}

      {!busy && rows.length > 0 && (
        <div className="mo-wrap">
          <table className="nice">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Datum</th>
                <th style={{ width: 220 }}>Projekt</th>
                <th style={{ width: 90, textAlign: "center" }}>Start</th>
                <th style={{ width: 90, textAlign: "center" }}>Ende</th>
                <th style={{ width: 110, textAlign: "right" }}>Pause</th>
                <th style={{ minWidth: 280 }}>Notiz</th>
                <th style={{ width: 140, textAlign: "right" }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.work_date}</td>
                  <td>{r.project || "—"}</td>
                  <td style={{ textAlign: "center" }}>{toHM(r.start_min)}</td>
                  <td style={{ textAlign: "center" }}>{toHM(r.end_min)}</td>
                  <td style={{ textAlign: "right" }}>
                    {(r.break_min ?? 0).toString()} min
                  </td>
                  <td>{r.note || ""}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="hbz-btn btn-small"
                      onClick={() => remove(r.id)}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
