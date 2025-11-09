// src/components/ProjectAdmin.jsx
import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase =
  window.supabase ??
  createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

const emptyForm = {
  name: "",
  client: "",
  code: "",
  cost_center: "",
  note: "",
  active: true,
};

export default function ProjectAdmin() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      setMessage("❌ Fehler: " + error.message);
    } else {
      setProjects(data || []);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.client?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q)
    );
  }, [projects, search]);

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      name: form.name?.trim(),
      client: form.client?.trim() || null,
      code: form.code?.trim() || null,
      cost_center: form.cost_center?.trim() || null,
      note: form.note?.trim() || null,
      active: !!form.active,
    };

    let res;
    if (editId) {
      res = await supabase.from("projects").update(payload).eq("id", editId).select().single();
    } else {
      res = await supabase.from("projects").insert(payload).select().single();
    }

    if (res.error) {
      setMessage("❌ Fehler: " + res.error.message);
    } else {
      setMessage(editId ? "✅ Projekt aktualisiert." : "✅ Projekt angelegt.");
      setForm(emptyForm);
      setEditId(null);
      fetchProjects();
    }
    setSaving(false);
  }

  async function onDelete(id, name) {
    if (!confirm(`Projekt "${name}" wirklich löschen?`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) setMessage("❌ Fehler: " + error.message);
    else {
      setProjects((p) => p.filter((x) => x.id !== id));
      setMessage("🗑️ Projekt gelöscht.");
      if (editId === id) {
        setEditId(null);
        setForm(emptyForm);
      }
    }
  }

  function onEdit(p) {
    setEditId(p.id);
    setForm({
      name: p.name || "",
      client: p.client || "",
      code: p.code || "",
      cost_center: p.cost_center || "",
      note: p.note || "",
      active: !!p.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="hbz-container">
      <div className="hbz-card" style={{ marginTop: 10 }}>
        <h3>{editId ? "Projekt bearbeiten" : "Projekt anlegen"}</h3>

        <form onSubmit={onSubmit} className="hbz-grid hbz-grid-2">
          <div>
            <label>Projektname *</label>
            <input
              className="hbz-input"
              name="name"
              value={form.name}
              onChange={onChange}
              required
            />
          </div>
          <div>
            <label>Kunde</label>
            <input
              className="hbz-input"
              name="client"
              value={form.client}
              onChange={onChange}
            />
          </div>
          <div>
            <label>Projektcode</label>
            <input
              className="hbz-input"
              name="code"
              value={form.code}
              onChange={onChange}
              placeholder="z. B. BV-ÖWG"
            />
          </div>
          <div>
            <label>Kostenstelle</label>
            <input
              className="hbz-input"
              name="cost_center"
              value={form.cost_center}
              onChange={onChange}
              placeholder="optional"
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Notiz</label>
            <textarea
              className="hbz-textarea"
              name="note"
              rows={3}
              value={form.note}
              onChange={onChange}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <input
              type="checkbox"
              name="active"
              checked={form.active}
              onChange={onChange}
            />{" "}
            Projekt aktiv
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="save-btn" disabled={saving}>
              💾 {saving ? "Speichert..." : editId ? "Änderungen speichern" : "Projekt anlegen"}
            </button>
            {editId && (
              <button
                type="button"
                className="hbz-btn"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setForm(emptyForm);
                  setEditId(null);
                }}
              >
                Abbrechen
              </button>
            )}
          </div>
        </form>
      </div>

      {message && (
        <div className="hbz-card" style={{ marginTop: 10, background: "#f5f5f5", padding: "6px 10px" }}>
          {message}
        </div>
      )}

      <div className="hbz-card" style={{ marginTop: 10 }}>
        <div className="hbz-toolbar">
          <strong>Projekte</strong>
          <input
            className="hbz-input"
            style={{ width: 200 }}
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p>Lade Projekte...</p>
        ) : (
          <table className="nice">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kunde</th>
                <th>Code</th>
                <th>Aktiv</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.client || "—"}</td>
                  <td>{p.code || "—"}</td>
                  <td>{p.active ? "Ja" : "Nein"}</td>
                  <td>
                    <button className="hbz-btn btn-small" onClick={() => onEdit(p)}>
                      Bearbeiten
                    </button>
                    <button
                      className="hbz-btn btn-small"
                      style={{ marginLeft: 6 }}
                      onClick={() => onDelete(p.id, p.name)}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ opacity: 0.6 }}>
                    Keine Projekte gefunden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
