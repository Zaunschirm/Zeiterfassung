import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase =
  window.supabase ??
  createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

export default function ProjectPhotos() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  // Projekte laden
  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) console.error(error);
    else setProjects(data || []);
  }

  // Fotos eines Projekts laden
  useEffect(() => {
    if (selectedProject) loadPhotos(selectedProject);
  }, [selectedProject]);

  async function loadPhotos(projectId) {
    setMessage("");
    const { data, error } = await supabase
      .storage
      .from("project_photos")
      .list(projectId + "/", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) {
      setMessage("❌ Fehler beim Laden der Fotos: " + error.message);
    } else {
      setPhotos(data || []);
    }
  }

  async function handleUpload(e) {
    const files = e.target.files;
    if (!files?.length || !selectedProject) return;
    setUploading(true);
    setMessage("");

    for (const file of files) {
      const filePath = `${selectedProject}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("project_photos").upload(filePath, file);
      if (error) {
        console.error(error);
        setMessage("❌ Fehler beim Hochladen: " + error.message);
        setUploading(false);
        return;
      }
    }

    setUploading(false);
    setMessage("✅ Upload erfolgreich!");
    loadPhotos(selectedProject);
  }

  async function handleDelete(photo) {
    if (!confirm(`Foto "${photo.name}" wirklich löschen?`)) return;
    const filePath = `${selectedProject}/${photo.name}`;
    const { error } = await supabase.storage.from("project_photos").remove([filePath]);
    if (error) {
      setMessage("❌ Fehler beim Löschen: " + error.message);
    } else {
      setMessage("🗑️ Foto gelöscht.");
      loadPhotos(selectedProject);
    }
  }

  async function getPublicURL(photo) {
    const filePath = `${selectedProject}/${photo.name}`;
    const { data } = supabase.storage.from("project_photos").getPublicUrl(filePath);
    return data?.publicUrl;
  }

  return (
    <div className="hbz-container">
      <div className="hbz-card" style={{ marginTop: 10 }}>
        <h3>Projektfotos</h3>

        {/* Projekt-Auswahl */}
        <div style={{ marginBottom: 12 }}>
          <label>Projekt auswählen:</label>
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

        {/* Uploadfeld */}
        {selectedProject && (
          <div style={{ marginBottom: 16 }}>
            <label>Fotos hochladen:</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="hbz-input"
            />
            {uploading && <p>Lade hoch…</p>}
          </div>
        )}

        {message && (
          <div
            className="hbz-card"
            style={{
              background: "#f5f5f5",
              padding: "6px 10px",
              marginBottom: 10,
            }}
          >
            {message}
          </div>
        )}

        {/* Fotoübersicht */}
        {selectedProject && (
          <div>
            <h4>Fotos im Projekt:</h4>
            {photos.length === 0 && <p>Keine Fotos vorhanden.</p>}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 10,
                marginTop: 10,
              }}
            >
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.id || photo.name}
                  photo={photo}
                  selectedProject={selectedProject}
                  getPublicURL={getPublicURL}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Kleine Unterkomponente für Fotoanzeige
function PhotoCard({ photo, selectedProject, getPublicURL, onDelete }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    (async () => {
      const publicUrl = await getPublicURL(photo);
      setUrl(publicUrl);
    })();
  }, [photo, selectedProject]);

  return (
    <div
      className="hbz-card"
      style={{
        padding: 6,
        textAlign: "center",
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.1)",
      }}
    >
      {url ? (
        <img
          src={url}
          alt={photo.name}
          style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6 }}
        />
      ) : (
        <div style={{ height: 120, background: "#ddd" }} />
      )}
      <div style={{ fontSize: 12, marginTop: 4 }}>{photo.name}</div>
      <button
        className="hbz-btn btn-small"
        style={{ marginTop: 4 }}
        onClick={() => onDelete(photo)}
      >
        Löschen
      </button>
    </div>
  );
}
