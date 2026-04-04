import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase =
  window.supabase ??
  createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

const BUCKET = "project-photos";

export default function ProjectPhotos() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busyZip, setBusyZip] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
        setMsg("❌ Projekte konnten nicht geladen werden: " + error.message);
      } else {
        setProjects(data || []);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setPhotos([]);
      return;
    }
    loadPhotos(selectedProject);
  }, [selectedProject]);

  async function loadPhotos(projectId) {
    setMsg("");
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(projectId + "/", {
        limit: 500,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) {
      console.error(error);
      setMsg("❌ Fehler beim Laden der Fotos: " + error.message);
    } else {
      setPhotos(data || []);
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedProject) return;
    setUploading(true);
    setMsg("");

    try {
      for (const file of files) {
        const filePath = `${selectedProject}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, file, { cacheControl: "3600", upsert: false });
        if (error) throw error;
      }

      setMsg("✅ Upload erfolgreich.");
      await loadPhotos(selectedProject);
    } catch (err) {
      console.error(err);
      setMsg("❌ Fehler beim Hochladen: " + (err?.message || err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photo) {
    if (!confirm(`Foto „${photo.name}“ wirklich löschen?`)) return;

    const path = `${selectedProject}/${photo.name}`;
    const { error } = await supabase.storage.from(BUCKET).remove([path]);

    if (error) {
      setMsg("❌ Fehler beim Löschen: " + error.message);
    } else {
      setMsg("🗑️ Foto gelöscht.");
      setPhotos((list) => list.filter((p) => p.name !== photo.name));
    }
  }

  function getPublicURL(photo) {
    const path = `${selectedProject}/${photo.name}`;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  async function downloadAllAsZip() {
    if (!selectedProject || photos.length === 0) return;
    setBusyZip(true);
    setMsg("");

    try {
      const [{ default: JSZip }, { saveAs }] = await Promise.all([
        import("jszip"),
        import("file-saver"),
      ]);

      const chunks = (arr, size) =>
        Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
          arr.slice(i * size, i * size + size)
        );

      const zip = new JSZip();
      const folder = zip.folder("projektfotos");
      if (!folder) throw new Error("ZIP-Ordner konnte nicht erstellt werden.");

      for (const group of chunks(photos, 6)) {
        await Promise.all(
          group.map(async (photo) => {
            const url = getPublicURL(photo);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Download fehlgeschlagen: ${photo.name}`);
            const blob = await res.blob();
            folder.file(photo.name, blob);
          })
        );
      }

      const content = await zip.generateAsync({ type: "blob" });
      const today = new Date().toISOString().slice(0, 10);
      saveAs(content, `Projektfotos_${selectedProject}_${today}.zip`);
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
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {selectedProject && (
          <div className="project-photos-upload">
            <label className="hbz-label">Fotos hochladen</label>
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
        )}

        {msg && <div className="project-photos-msg">{msg}</div>}

        {selectedProject && photos.length > 0 && (
          <div className="project-photos-toolbar">
            <button
              className="hbz-btn"
              onClick={downloadAllAsZip}
              disabled={busyZip}
            >
              {busyZip ? "Erstelle ZIP…" : "Alle als ZIP herunterladen"}
            </button>
          </div>
        )}

        {selectedProject && (
          <div className="project-photos-section">
            <div className="project-photos-section-head">
              <h3>Fotos im Projekt</h3>
              <span className="badge-soft">{photos.length} Fotos</span>
            </div>

            {photos.length === 0 ? (
              <div className="project-empty-state">Keine Fotos vorhanden.</div>
            ) : (
              <div className="project-photo-grid">
                {photos.map((photo) => {
                  const url = getPublicURL(photo);
                  return (
                    <div key={photo.id || photo.name} className="project-photo-card">
                      <img
                        src={url}
                        alt={photo.name}
                        className="project-photo-image"
                        onClick={() => window.open(url, "_blank")}
                      />

                      <div className="project-photo-name">{photo.name}</div>

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
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}