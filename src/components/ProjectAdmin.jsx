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
  external_cost_center: "",
  address: "",
  client_name: "",
  client_contact: "",
  active: true,
};

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectAdmin() {
  const [projects, setProjects] = useState([]);
  const [photoRows, setPhotoRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [contactFilter, setContactFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);

    const [{ data: projectsData, error: projectsError }, { data: photosData, error: photosError }] =
      await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase
          .from("project_photos")
          .select("id, project_id, created_at, taken_at")
          .order("created_at", { ascending: false }),
      ]);

    if (projectsError) {
      console.error(projectsError);
      setMessage("❌ Fehler: " + projectsError.message);
      setLoading(false);
      return;
    }

    if (photosError) {
      console.error(photosError);
      setMessage("❌ Fotos konnten nicht geladen werden: " + photosError.message);
      setLoading(false);
      return;
    }

    setProjects(projectsData || []);
    setPhotoRows(photosData || []);
    setLoading(false);
  }

  const photoStats = useMemo(() => {
    const map = new Map();

    for (const row of photoRows) {
      const existing = map.get(row.project_id) || {
        count: 0,
        lastAdded: null,
      };

      existing.count += 1;

      const candidate = row.created_at || row.taken_at || null;
      if (!existing.lastAdded || new Date(candidate) > new Date(existing.lastAdded)) {
        existing.lastAdded = candidate;
      }

      map.set(row.project_id, existing);
    }

    return map;
  }, [photoRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects.map((p) => {
      const stats = photoStats.get(p.id) || { count: 0, lastAdded: null };
      return {
        ...p,
        photo_count: stats.count || 0,
        last_photo_at: stats.lastAdded || null,
      };
    });

    if (q) {
      list = list.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.cost_center?.toLowerCase().includes(q) ||
          p.external_cost_center?.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q) ||
          p.client_name?.toLowerCase().includes(q) ||
          p.client_contact?.toLowerCase().includes(q)
      );
    }

    if (statusFilter === "active") list = list.filter((p) => p.active !== false);
    if (statusFilter === "inactive") list = list.filter((p) => p.active === false);
    if (contactFilter === "complete") list = list.filter((p) => p.client_name && p.client_contact);
    if (contactFilter === "missing") list = list.filter((p) => !p.client_name || !p.client_contact);

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortField === "photo_count") {
        return ((a.photo_count || 0) - (b.photo_count || 0)) * dir;
      }

      if (sortField === "last_photo_at") {
        const av = a.last_photo_at ? new Date(a.last_photo_at).getTime() : 0;
        const bv = b.last_photo_at ? new Date(b.last_photo_at).getTime() : 0;
        return (av - bv) * dir;
      }

      const valA = (a[sortField] || "").toString().toLowerCase();
      const valB = (b[sortField] || "").toString().toLowerCase();
      return valA.localeCompare(valB) * dir;
    });

    return list;
  }, [projects, photoStats, search, statusFilter, contactFilter, sortField, sortDir]);

  const projectStats = useMemo(() => ({
    total: projects.length,
    active: projects.filter((p) => p.active !== false).length,
    inactive: projects.filter((p) => p.active === false).length,
    missingContacts: projects.filter((p) => !p.client_name || !p.client_contact).length,
  }), [projects]);

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
      external_cost_center: form.external_cost_center?.trim() || null,
      address: form.address?.trim() || null,
      client_name: form.client_name?.trim() || null,
      client_contact: form.client_contact?.trim() || null,
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
      external_cost_center: p.external_cost_center || "",
      address: p.address || "",
      client_name: p.client_name || "",
      client_contact: p.client_contact || "",
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
          <div>
            <label className="hbz-label">Projektname *</label>
            <input
              className="hbz-input"
              name="name"
              value={form.name}
              onChange={onChange}
              required
            />
          </div>

          <div>
            <label className="hbz-label">Kostenstelle</label>
            <input
              className="hbz-input"
              name="cost_center"
              value={form.cost_center}
              onChange={onChange}
              placeholder="optional"
            />
          </div>

          <div>
            <label className="hbz-label">Externe Kostenstelle</label>
            <input
              className="hbz-input"
              name="external_cost_center"
              value={form.external_cost_center}
              onChange={onChange}
              placeholder="Kostenstelle des Auftraggebers"
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

          <div>
            <label className="hbz-label">Auftraggeber</label>
            <input className="hbz-input" name="client_name" value={form.client_name} onChange={onChange} placeholder="Firma oder Name" />
          </div>
          <div>
            <label className="hbz-label">Bauleiter / Kontakt</label>
            <input className="hbz-input" name="client_contact" value={form.client_contact} onChange={onChange} placeholder="Name, Telefon oder E-Mail" />
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

      <div className="project-overview-grid">
        <button type="button" className={`project-overview-card ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}><span>Alle Projekte</span><strong>{projectStats.total}</strong></button>
        <button type="button" className={`project-overview-card ${statusFilter === "active" ? "active" : ""}`} onClick={() => setStatusFilter("active")}><span>Aktiv</span><strong>{projectStats.active}</strong></button>
        <button type="button" className={`project-overview-card ${statusFilter === "inactive" ? "active" : ""}`} onClick={() => setStatusFilter("inactive")}><span>Inaktiv</span><strong>{projectStats.inactive}</strong></button>
        <button type="button" className={`project-overview-card ${contactFilter === "missing" ? "active warning" : ""}`} onClick={() => setContactFilter((value) => value === "missing" ? "all" : "missing")}><span>Kontaktdaten fehlen</span><strong>{projectStats.missingContacts}</strong></button>
      </div>

      <div className="hbz-card project-page-card">
        <div className="project-page-head">
          <h3 className="project-page-title">Projekte</h3>
          <div className="project-filter-row">
            <span className="badge-soft">{filtered.length} Projekte</span>
            <select className="hbz-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="active">Nur aktive</option><option value="inactive">Nur inaktive</option><option value="all">Alle Projekte</option></select>
            <select className="hbz-input" value={contactFilter} onChange={(e) => setContactFilter(e.target.value)}><option value="all">Alle Kontaktdaten</option><option value="complete">Kontaktdaten vollständig</option><option value="missing">Kontaktdaten fehlen</option></select>
            <input
              className="hbz-input"
              placeholder="Projekt, Kostenstelle, Auftraggeber, Bauleiter…"
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
                  <th onClick={() => toggleSort("name")} style={{ cursor: "pointer" }}>
                    Name{sortArrow("name")}
                  </th>
                  <th onClick={() => toggleSort("cost_center")} style={{ cursor: "pointer" }}>
                    Kostenstelle{sortArrow("cost_center")}
                  </th>
                  <th onClick={() => toggleSort("external_cost_center")} style={{ cursor: "pointer" }}>
                    Externe Kostenstelle{sortArrow("external_cost_center")}
                  </th>
                  <th onClick={() => toggleSort("address")} style={{ cursor: "pointer" }}>
                    Baustellenadresse{sortArrow("address")}
                  </th>
                  <th onClick={() => toggleSort("client_name")} style={{ cursor: "pointer" }}>Auftraggeber{sortArrow("client_name")}</th>
                  <th onClick={() => toggleSort("client_contact")} style={{ cursor: "pointer" }}>Bauleiter / Kontakt{sortArrow("client_contact")}</th>
                  <th onClick={() => toggleSort("photo_count")} style={{ cursor: "pointer" }}>
                    Fotos{sortArrow("photo_count")}
                  </th>
                  <th onClick={() => toggleSort("last_photo_at")} style={{ cursor: "pointer" }}>
                    Zuletzt ergänzt{sortArrow("last_photo_at")}
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
                    <td>{p.external_cost_center || "—"}</td>
                    <td>
                      {p.address ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
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
                    <td>{p.client_name || <span className="project-missing">Fehlt</span>}</td>
                    <td>{p.client_contact || <span className="project-missing">Fehlt</span>}</td>
                    <td>{p.photo_count || 0}</td>
                    <td>{formatDateTime(p.last_photo_at)}</td>
                    <td>{p.active ? "Ja" : "Nein"}</td>
                    <td className="num">
                      <div className="employee-action-group">
                        <button className="hbz-btn btn-small" onClick={() => onEdit(p)}>
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
                    <td colSpan={10} className="employee-empty">
                      Keine Projekte gefunden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style>{`
        .project-overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.project-overview-card{display:flex;align-items:center;justify-content:space-between;padding:14px;border:1px solid #e3d7cd;border-radius:10px;background:#fff;color:#5a3a23;cursor:pointer;text-align:left}.project-overview-card strong{font-size:24px}.project-overview-card.active{border-color:#7b4a2d;background:#fff8f2;box-shadow:0 0 0 1px #7b4a2d}.project-overview-card.warning strong,.project-missing{color:#a23a2c;font-weight:800}.project-filter-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.project-filter-row .hbz-input{width:auto;min-width:170px}.project-filter-row input.hbz-input{min-width:300px}@media(max-width:800px){.project-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.project-filter-row{align-items:stretch}.project-filter-row .hbz-input,.project-filter-row input.hbz-input{width:100%;min-width:0}}
      `}</style>
    </div>
  );
}
