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
      .select("id, work_date, start_min, end_min, break_min, note, project, employee_id")
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

  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow">
      <h3 className="text-lg font-semibold mb-3">Letzte Einträge</h3>

      {busy && <div className="text-sm text-neutral-500">Lade…</div>}

      {!busy && rows.length === 0 && (
        <div className="text-sm text-neutral-500">Keine Einträge gefunden.</div>
      )}

      {!busy && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const start = `${String(Math.floor(r.start_min / 60)).padStart(2, "0")}:${String(
              r.start_min % 60
            ).padStart(2, "0")}`;
            const end = `${String(Math.floor(r.end_min / 60)).padStart(2, "0")}:${String(
              r.end_min % 60
            ).padStart(2, "0")}`;
            const pause = r.break_min ?? 0;
            return (
              <li
                key={r.id}
                className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {r.project} • {r.work_date}
                  </div>
                  <div className="text-neutral-600">
                    {start} – {end} • Pause {pause} min
                    {r.note ? ` • ${r.note}` : ""}
                  </div>
                </div>
                <button
                  className="rounded bg-neutral-200 px-3 py-1 text-sm hover:bg-neutral-300"
                  onClick={() => remove(r.id)}
                >
                  Löschen
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
