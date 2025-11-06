import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProjectQuickCreate() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  // eingeloggte Person
  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("employee") || "{}"); }
    catch { return {}; }
  }, []);
  const isAdmin = (me?.role || "").toLowerCase() === "admin";

  async function load() {
    const { data, error } = await supabase
      .from("projects")
      .select("id, code, name, active")
      .order("name", { ascending: true });
    if (error) console.error(error);
    setRows(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!isAdmin) return alert("Nur Admins dürfen Projekte anlegen/ändern.");

    const c = code.trim();
    const n = name.trim();
    if (!c || !n) return alert("Bitte Code und Name angeben.");

    setBusy(true);

    // gibt es den Code bereits? (case-insensitive)
    const { data: existing, error: findErr } = await supabase
      .from("projects")
      .select("id")
      .ilike("code", c)
      .limit(1);

    if (findErr) {
      setBusy(false);
      console.error(findErr);
      return alert("Suche fehlgeschlagen.");
    }

    if (existing && existing.length > 0) {
      // UPDATE
      const { error } = await supabase
        .from("projects")
        .update({ code: c, name: n, active })
        .eq("id", existing[0].id);
      setBusy(false);
      if (error) {
        console.error(error);
        return alert("Update fehlgeschlagen.");
      }
    } else {
      // INSERT
      const { error } = await supabase
        .from("projects")
        .insert({ code: c, name: n, active });
      setBusy(false);
      if (error) {
        console.error(error);
        return alert("Anlegen fehlgeschlagen.");
      }
    }

    setCode("");
    setName("");
    setActive(true);
    load();
  }

  async function toggleActive(row) {
    if (!isAdmin) return alert("Nur Admins dürfen Projekte ändern.");
    const { error } = await supabase
      .from("projects")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) {
      console.error(error);
      alert("Ändern fehlgeschlagen.");
      return;
    }
    load();
  }

  async function remove(row) {
    if (!isAdmin) return alert("Nur Admins dürfen Projekte löschen.");
    if (!confirm(`Projekt "${row.code} — ${row.name}" löschen?`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", row.id);
    if (error) {
      console.error(error);
      alert("Löschen fehlgeschlagen – ggf. referenzierte Einträge vorhanden.");
      return;
    }
    load();
  }

  // Nicht-Admin: freundliche Sperre (Liste ist ok zu sehen, aber keine Aktionen)
  const disabledNote = !isAdmin ? (
    <div className="rounded border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 mb-3 text-sm">
      Hinweis: Nur <b>Admins</b> dürfen Projekte anlegen, ändern oder löschen.
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      {/* Block 1: schnelles Anlegen/Ändern */}
      <div className="rounded-2xl bg-white/70 p-4 shadow">
        <h2 className="text-lg font-semibold mb-3">Projekt Schnellanlage</h2>
        {disabledNote}

        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-neutral-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              placeholder="Projektname"
              disabled={!isAdmin}
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500">Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              placeholder="z. B. BV-ÖWG"
              disabled={!isAdmin}
            />
          </div>

          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={!isAdmin}
              />
              aktiv
            </label>
            <button
              onClick={save}
              disabled={busy || !isAdmin}
              className="ml-auto rounded-xl bg-[#6b4b34] px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            >
              Projekt speichern
            </button>
          </div>
        </div>
      </div>

      {/* Block 2: Liste aller Projekte */}
      <div className="rounded-2xl bg-white/70 p-4 shadow">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">Alle Projekte</h3>
        <div className="divide-y rounded-xl border border-neutral-200 bg-white">
          {(rows || []).map((r) => (
            <div
              key={r.id}
              className="flex flex-col md:flex-row md:items-center justify-between gap-2 px-3 py-2"
            >
              <div className="text-sm">
                <div className="font-medium">
                  {r.code} — {r.name}
                </div>
                <div className="text-neutral-600">
                  Status:{" "}
                  {r.active ? (
                    <span className="text-green-700">aktiv</span>
                  ) : (
                    <span className="text-red-600">inaktiv</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleActive(r)}
                  disabled={!isAdmin}
                  className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {r.active ? "Deaktivieren" : "Aktivieren"}
                </button>
                <button
                  onClick={() => remove(r)}
                  disabled={!isAdmin}
                  className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="px-3 py-3 text-sm text-neutral-500">Keine Projekte vorhanden.</div>
          )}
        </div>
      </div>
    </div>
  );
}
