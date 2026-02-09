import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const toHM = (mins = 0) =>
  `${String(Math.floor((mins ?? 0) / 60)).padStart(2, "0")}:${String(
    (mins ?? 0) % 60
  ).padStart(2, "0")}`;

export default function EntryTable({ date }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

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
      // Fallback localStorage
      const raw = localStorage.getItem("hbz_entries") || "[]";
      let list = JSON.parse(raw);
      if (date) list = list.filter((r) => r.work_date === date);
      if (role === "mitarbeiter" && me?.id) list = list.filter((r) => r.employee_id === me.id);
      setRows(list);
      console.warn("[EntryTable] fallback:", e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Diesen Eintrag wirklich löschen?")) return;
    try {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      alert("Löschen fehlgeschlagen.");
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
              <th style={{ minWidth: 280 }}>Notiz</th>
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
                <td style={{ textAlign: "right" }}>{(r.break_min ?? 0)} min</td>
                <td style={{ textAlign: "right" }}>{getTravel(r)} min</td>
                <td>{abs.clean || ""}</td>
                <td style={{ textAlign: "right" }}>
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
    </div>
  );
}
