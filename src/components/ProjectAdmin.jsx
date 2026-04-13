import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase =
  window.supabase ??
  createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

const emptyForm = {
  name: "",
  cost_center: "",
  address: "",
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
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

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
    let list = projects;

    if (q) {
      list = list.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.cost_center?.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const valA = (a[sortField] || "").toString().toLowerCase();
      const valB = (b[sortField] || "").toString().toLowerCase();
      return valA.localeCompare(valB) * dir;
    });

    return list;
  }, [projects, search, sortField, sortDir]);

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      name: form.name?.trim(),
      cost_center: form.cost_center?.trim() || null,
      address: form.address?.trim() || null,
      active: !!form.active,
    };

    let res;
    if (editId) {
      res = await supabase
        .from("projects")
        .update(payload)
        .eq("id", editId)
        .select()
        .single();
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

    if (error) {
      setMessage("❌ Fehler: " + error.message);
    } else {
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
      cost_center: p.cost_center || "",
      address: p.address || "",
      active: !!p.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function sortArrow(field) {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " 🔼" : " 🔽";
  }

  return (
    <div className="hbz-container">
      <div className="hbz-card project-page-card">
        <div className="project-page-head">
          <div>
            <div className="hbz-section-title">
              {editId ? "Bearbeiten" : "Neu anlegen"}
            </div>
            <h2 className="page-title">
              {editId ? "Projekt bearbeiten" : "Projekt anlegen"}
            </h2>
          </div>
        </div>

        <form onSubmit={onSubmit} className="project-form-grid">
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="hbz-label">Projektname *</label>
            <input
              className="hbz-input"
              name="name"
              value={form.name}
              onChange={onChange}
              required
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className="hbz-label">Kostenstelle</label>
            <input
              className="hbz-input"
              name="cost_center"
              value={form.cost_center}
              onChange={onChange}
              placeholder="optional"
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className="hbz-label">Baustellenadresse</label>
            <input
              className="hbz-input"
              name="address"
              value={form.address}
              onChange={onChange}
              placeholder="z. B. Hauptstraße 12, 8010 Graz"
            />
            <div className="help" style={{ marginTop: 6 }}>
              Diese Adresse wird für das automatische Wetter in der Tageserfassung verwendet.
            </div>
          </div>

          <div className="project-active-row" style={{ gridColumn: "1 / -1" }}>
            <label className="project-checkbox-row">
              <input
                type="checkbox"
                name="active"
                checked={form.active}
                onChange={onChange}
              />
              <span>Projekt aktiv</span>
            </label>

            <button className="save-btn" disabled={saving}>
              {saving
                ? "Speichert…"
                : editId
                ? "Änderungen speichern"
                : "Projekt anlegen"}
            </button>

            {editId && (
              <button
                type="button"
                className="hbz-btn"
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

      {message && <div className="project-note-box">{message}</div>}

      <div className="hbz-card project-page-card">
        <div className="project-page-head">
          <h3 className="project-page-title">Projekte</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="badge-soft">{filtered.length} Projekte</span>
            <input
              className="hbz-input"
              style={{ width: 220 }}
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm opacity-70">Lade Projekte…</p>
        ) : (
          <div className="employee-table-wrap">
            <table className="employee-table">
              <thead>
                <tr>
                  <th
                    onClick={() => toggleSort("name")}
                    style={{ cursor: "pointer" }}
                  >
                    Name{sortArrow("name")}
                  </th>
                  <th
                    onClick={() => toggleSort("cost_center")}
                    style={{ cursor: "pointer" }}
                  >
                    Kostenstelle{sortArrow("cost_center")}
                  </th>
                  <th
                    onClick={() => toggleSort("address")}
                    style={{ cursor: "pointer" }}
                  >
                    Baustellenadresse{sortArrow("address")}
                  </th>
                  <th>Aktiv</th>
                  <th className="num">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.cost_center || "—"}</td>
                    <td>
                      {p.address ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>{p.address}</span>
                          <button
                            type="button"
                            className="hbz-btn btn-small"
                            onClick={() =>
                              window.open(
                                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  p.address
                                )}`,
                                "_blank"
                              )
                            }
                          >
                            Route öffnen
                          </button>
                          <button
                            type="button"
                            className="hbz-btn btn-small"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(p.address);
                                setMessage("✅ Adresse kopiert.");
                              } catch {
                                setMessage("❌ Adresse konnte nicht kopiert werden.");
                              }
                            }}
                          >
                            Adresse kopieren
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{p.active ? "Ja" : "Nein"}</td>
                    <td className="num">
                      <div className="employee-action-group">
                        <button
                          className="hbz-btn btn-small"
                          onClick={() => onEdit(p)}
                        >
                          Bearbeiten
                        </button>
                        <button
                          className="hbz-btn btn-small"
                          onClick={() => onDelete(p.id, p.name)}
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="employee-empty">
                      Keine Projekte gefunden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
