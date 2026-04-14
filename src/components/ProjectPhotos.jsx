import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const BUCKET = "project-photos";

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

function getPublicURL(path) {
  if (!path) return "";
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

function getPossiblePrefixes(projectId) {
  if (!projectId) return [];
  return [
    `${projectId}/`,
    `project-${projectId}/`,
    `project_${projectId}/`,
  ];
}

function getFileNameFromPath(path) {
  return path?.split("/").pop() || "Foto";
}

export default function ProjectPhotos() {
  const [projects, setProjects] = useState([]);
  const [dbPhotos, setDbPhotos] = useState([]);
  const [legacyByProject, setLegacyByProject] = useState({});
  const [selectedProject, setSelectedProject] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyZip, setBusyZip] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setMsg("");

    const [{ data: projectsData, error: projectsError }, { data: photosData, error: photosError }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id, name, active")
          .order("name", { ascending: true }),
        supabase
          .from("project_photos")
          .select("id, project_id, file_path, caption, created_at, taken_at")
          .order("created_at", { ascending: false }),
      ]);

    if (projectsError) {
      console.error(projectsError);
      setMsg("❌ Projekte konnten nicht geladen werden: " + projectsError.message);
      return;
    }

    if (photosError) {
      console.error(photosError);
      setMsg("❌ Fotos konnten nicht geladen werden: " + photosError.message);
      return;
    }

    const projectList = projectsData || [];
    const dbList = photosData || [];

    setProjects(projectList);
    setDbPhotos(dbList);

    if (!selectedProject && projectList.length > 0) {
      const firstActive = projectList.find((p) => p.active) || projectList[0];
      setSelectedProject(firstActive?.id || "");
    }

    await loadLegacyForProjects(projectList, dbList);
  }

  async function loadLegacyForProjects(projectList, currentDbPhotos) {
    const dbPathSet = new Set((currentDbPhotos || []).map((x) => x.file_path).filter(Boolean));
    const result = {};

    for (const project of projectList) {
      const prefixes = getPossiblePrefixes(project.id);
      const collected = [];

      for (const prefix of prefixes) {
        const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
          limit: 500,
          sortBy: { column: "name", order: "desc" },
        });

        if (error) {
          continue;
        }

        for (const item of data || []) {
          if (!item?.name) continue;
          const fullPath = `${prefix}${item.name}`;

          if (dbPathSet.has(fullPath)) continue;

          collected.push({
            key: `legacy:${fullPath}`,
            source: "legacy",
            id: null,
            project_id: project.id,
            file_path: fullPath,
            caption: null,
            created_at: item.created_at || item.updated_at || null,
            taken_at: item.created_at || item.updated_at || null,
            name: item.name,
          });
        }
      }

      const uniqueMap = new Map();
      for (const row of collected) {
        uniqueMap.set(row.file_path, row);
      }

      result[project.id] = Array.from(uniqueMap.values()).sort((a, b) => {
        const av = new Date(b.created_at || b.taken_at || 0).getTime();
        const bv = new Date(a.created_at || a.taken_at || 0).getTime();
        return av - bv;
      });
    }

    setLegacyByProject(result);
  }

  const projectStats = useMemo(() => {
    const map = new Map();

    for (const p of projects) {
      map.set(p.id, {
        count: 0,
        lastAdded: null,
      });
    }

    for (const row of dbPhotos) {
      const existing = map.get(row.project_id) || { count: 0, lastAdded: null };
      existing.count += 1;

      const candidate = row.created_at || row.taken_at || null;
      if (candidate && (!existing.lastAdded || new Date(candidate) > new Date(existing.lastAdded))) {
        existing.lastAdded = candidate;
      }

      map.set(row.project_id, existing);
    }

    for (const projectId of Object.keys(legacyByProject)) {
      const legacyPhotos = legacyByProject[projectId] || [];
      const existing = map.get(projectId) || { count: 0, lastAdded: null };

      existing.count += legacyPhotos.length;

      for (const row of legacyPhotos) {
        const candidate = row.created_at || row.taken_at || null;
        if (candidate && (!existing.lastAdded || new Date(candidate) > new Date(existing.lastAdded))) {
          existing.lastAdded = candidate;
        }
      }

      map.set(projectId, existing);
    }

    return map;
  }, [projects, dbPhotos, legacyByProject]);

  const projectCards = useMemo(() => {
    return projects.map((p) => {
      const stats = projectStats.get(p.id) || { count: 0, lastAdded: null };
      return {
        ...p,
        photoCount: stats.count || 0,
        lastAdded: stats.lastAdded || null,
      };
    });
  }, [projects, projectStats]);

  const selectedProjectInfo = useMemo(() => {
    return projectCards.find((p) => p.id === selectedProject) || null;
  }, [projectCards, selectedProject]);

  const selectedPhotos = useMemo(() => {
    if (!selectedProject) return [];

    const dbRows = dbPhotos
      .filter((p) => p.project_id === selectedProject)
      .map((p) => ({
        ...p,
        key: `db:${p.id}`,
        source: "db",
      }));

    const legacyRows = legacyByProject[selectedProject] || [];

    return [...dbRows, ...legacyRows].sort((a, b) => {
      const av = new Date(b.created_at || b.taken_at || 0).getTime();
      const bv = new Date(a.created_at || a.taken_at || 0).getTime();
      return av - bv;
    });
  }, [dbPhotos, legacyByProject, selectedProject]);

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedProject) return;

    setUploading(true);
    setMsg("");

    try {
      for (const file of files) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `project-${selectedProject}/${stamp}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "image/jpeg",
          });

        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("project_photos").insert({
          project_id: selectedProject,
          file_path: filePath,
          caption: null,
          taken_at: new Date().toISOString(),
        });

        if (insertError) {
          await supabase.storage.from(BUCKET).remove([filePath]);
          throw insertError;
        }
      }

      setMsg("✅ Upload erfolgreich.");
      await loadAll();
      e.target.value = "";
    } catch (err) {
      console.error(err);
      setMsg("❌ Fehler beim Hochladen: " + (err?.message || err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photo) {
    if (!photo?.file_path) return;
    if (!confirm("Foto wirklich löschen?")) return;

    setDeletingKey(photo.key);
    setMsg("");

    try {
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([photo.file_path]);

      if (storageError) throw storageError;

      if (photo.source === "db" && photo.id) {
        const { error: dbError } = await supabase
          .from("project_photos")
          .delete()
          .eq("id", photo.id);

        if (dbError) throw dbError;

        setDbPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      } else {
        setLegacyByProject((prev) => ({
          ...prev,
          [selectedProject]: (prev[selectedProject] || []).filter(
            (p) => p.file_path !== photo.file_path
          ),
        }));
      }

      setMsg("🗑️ Foto gelöscht.");
    } catch (err) {
      console.error(err);
      setMsg("❌ Fehler beim Löschen: " + (err?.message || err));
    } finally {
      setDeletingKey(null);
    }
  }

  async function downloadAllAsZip() {
    if (!selectedProject || selectedPhotos.length === 0) return;

    setBusyZip(true);
    setMsg("");

    try {
      const [{ default: JSZip }, { saveAs }] = await Promise.all([
        import("jszip"),
        import("file-saver"),
      ]);

      const zip = new JSZip();
      const folder = zip.folder("projektfotos");
      if (!folder) throw new Error("ZIP-Ordner konnte nicht erstellt werden.");

      for (const photo of selectedPhotos) {
        const url = getPublicURL(photo.file_path);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Download fehlgeschlagen.");
        const blob = await res.blob();
        folder.file(getFileNameFromPath(photo.file_path), blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const today = new Date().toISOString().slice(0, 10);
      const projectName = (selectedProjectInfo?.name || "Projekt")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 60);

      saveAs(content, `Projektfotos_${projectName}_${today}.zip`);
      setMsg("📦 ZIP erstellt.");
    } catch (e) {
      console.error(e);
      setMsg("❌ ZIP-Fehler: " + (e?.message || e));
    } finally {
      setBusyZip(false);
    }
  }

  return (
    <div className="hbz-container">
      <div className="hbz-card project-photos-card">
        <div className="project-photos-head">
          <div>
            <div className="hbz-section-title">Bilder</div>
            <h2 className="page-title">Projektfotos</h2>
          </div>
        </div>

        <div className="project-photos-filter">
          <label className="hbz-label">Projekt auswählen</label>
          <select
            className="hbz-input"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            <option value="">– Projekt wählen –</option>
            {projectCards.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.photoCount} Fotos)
              </option>
            ))}
          </select>
        </div>

        <div className="project-list" style={{ marginBottom: 16 }}>
          {projectCards.map((p) => (
            <div
              key={p.id}
              className="project-list-row"
              style={{
                cursor: "pointer",
                border:
                  selectedProject === p.id
                    ? "1px solid rgba(123, 74, 45, 0.9)"
                    : undefined,
                boxShadow:
                  selectedProject === p.id
                    ? "0 0 0 2px rgba(123, 74, 45, 0.08)"
                    : undefined,
              }}
              onClick={() => setSelectedProject(p.id)}
            >
              <div className="project-list-info">
                <div className="project-list-title">{p.name}</div>
                <div className="project-list-status">
                  📷 {p.photoCount} Foto{p.photoCount === 1 ? "" : "s"} · Zuletzt ergänzt:{" "}
                  {formatDateTime(p.lastAdded)}
                </div>
              </div>

              <div className="project-list-actions">
                <button
                  type="button"
                  className="hbz-btn btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProject(p.id);
                  }}
                >
                  Öffnen
                </button>
              </div>
            </div>
          ))}

          {projectCards.length === 0 && (
            <div className="project-empty-state">Keine Projekte vorhanden.</div>
          )}
        </div>

        {selectedProject && (
          <>
            <div className="project-photos-upload">
              <label className="hbz-label">
                Fotos hochladen für: <strong>{selectedProjectInfo?.name || "Projekt"}</strong>
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hbz-input"
                onChange={handleUpload}
                disabled={uploading}
              />
              {uploading && <p className="text-xs opacity-70">⏳ Lade hoch…</p>}
            </div>

            {msg && <div className="project-photos-msg">{msg}</div>}

            <div className="project-photos-toolbar">
              <button
                className="hbz-btn"
                onClick={downloadAllAsZip}
                disabled={busyZip || selectedPhotos.length === 0}
              >
                {busyZip ? "Erstelle ZIP…" : "Alle als ZIP herunterladen"}
              </button>
            </div>

            <div className="project-photos-section">
              <div className="project-photos-section-head">
                <h3>Fotos im Projekt</h3>
                <span className="badge-soft">
                  {selectedPhotos.length} Foto{selectedPhotos.length === 1 ? "" : "s"}
                </span>
              </div>

              {selectedPhotos.length === 0 ? (
                <div className="project-empty-state">Keine Fotos vorhanden.</div>
              ) : (
                <div className="project-photo-grid">
                  {selectedPhotos.map((photo) => {
                    const url = getPublicURL(photo.file_path);
                    const filename = getFileNameFromPath(photo.file_path);

                    return (
                      <div key={photo.key} className="project-photo-card">
                        <img
                          src={url}
                          alt={photo.caption || filename}
                          className="project-photo-image"
                          onClick={() => window.open(url, "_blank")}
                        />

                        <div className="project-photo-name">
                          {photo.caption?.trim() || filename}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: "#7a614e",
                            marginTop: 6,
                          }}
                        >
                          Hinzugefügt: {formatDateTime(photo.created_at || photo.taken_at)}
                        </div>

                        {photo.source === "legacy" && (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 11,
                              color: "#7b4a2d",
                              fontWeight: 600,
                            }}
                          >
                            Altes Foto
                          </div>
                        )}

                        <div className="project-photo-actions">
                          <button
                            className="hbz-btn btn-small"
                            onClick={() => window.open(url, "_blank")}
                          >
                            Ansehen
                          </button>
                          <a className="hbz-btn btn-small" href={url} download>
                            Download
                          </a>
                          <button
                            className="hbz-btn btn-small"
                            onClick={() => handleDelete(photo)}
                            disabled={deletingKey === photo.key}
                          >
                            {deletingKey === photo.key ? "Löschen…" : "Löschen"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {!selectedProject && (
          <div className="project-empty-state">
            Bitte zuerst ein Projekt auswählen, dann werden die Fotos angezeigt.
          </div>
        )}
      </div>
    </div>
  );
}