import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProjectQuickCreate() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const me = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("employee") || "{}");
    } catch {
      return {};
    }
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

  return (
    <div className="hbz-container">
      <div className="hbz-card project-page-card">
        <div className="project-page-head">
          <div>
            <div className="hbz-section-title">Verwaltung</div>
            <h2 className="page-title">Projekt Schnellanlage</h2>
          </div>
        </div>

        {!isAdmin && (
          <div className="project-note-box">
            Hinweis: Nur <b>Admins</b> dürfen Projekte anlegen, ändern oder löschen.
          </div>
        )}

        <div className="project-form-grid">
          <div>
            <label className="hbz-label">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="hbz-input"
              placeholder="Projektname"
              disabled={!isAdmin}
            />
          </div>

          <div>
            <label className="hbz-label">Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="hbz-input"
              placeholder="z. B. BV-ÖWG"
              disabled={!isAdmin}
            />
          </div>

          <div className="project-active-row">
            <label className="project-checkbox-row">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={!isAdmin}
              />
              <span>aktiv</span>
            </label>

            <button
              onClick={save}
              disabled={busy || !isAdmin}
              className="save-btn"
            >
              {busy ? "Speichere…" : "Projekt speichern"}
            </button>
          </div>
        </div>
      </div>

      <div className="hbz-card project-page-card">
        <div className="project-page-head">
          <h3 className="project-page-title">Alle Projekte</h3>
          <span className="badge-soft">{rows.length} Projekte</span>
        </div>

        <div className="project-list">
          {(rows || []).map((r) => (
            <div key={r.id} className="project-list-row">
              <div className="project-list-info">
                <div className="project-list-title">
                  {r.code} — {r.name}
                </div>
                <div className="project-list-status">
                  Status:{" "}
                  {r.active ? (
                    <span className="project-status-active">aktiv</span>
                  ) : (
                    <span className="project-status-inactive">inaktiv</span>
                  )}
                </div>
              </div>

              <div className="project-list-actions">
                <button
                  onClick={() => toggleActive(r)}
                  disabled={!isAdmin}
                  className="hbz-btn btn-small"
                >
                  {r.active ? "Deaktivieren" : "Aktivieren"}
                </button>
                <button
                  onClick={() => remove(r)}
                  disabled={!isAdmin}
                  className="hbz-btn btn-small"
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="project-empty-state">Keine Projekte vorhanden.</div>
          )}
        </div>
      </div>
    </div>
  );
}