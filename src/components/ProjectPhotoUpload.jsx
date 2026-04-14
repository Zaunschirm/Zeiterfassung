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

export default function ProjectPhotoUpload({ me }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const rawSearch =
      window.location.search ||
      (window.location.hash.includes("?")
        ? "?" + window.location.hash.split("?")[1]
        : "");
    if (rawSearch) {
      const p = new URLSearchParams(rawSearch).get("project");
      if (p) setProjectId(p);
    }
  }, []);

  useEffect(() => {
    loadProjectsAndPhotos();
  }, []);

  useEffect(() => {
    loadPhotosForProject(projectId);
  }, [projectId]);

  async function loadProjectsAndPhotos() {
    const [{ data: projectData, error: projectErr }, { data: photoData, error: photoErr }] =
      await Promise.all([
        supabase.from("projects").select("id, name, active").order("name", { ascending: true }),
        supabase
          .from("project_photos")
          .select("id, file_path, caption, created_at, project_id, taken_at")
          .order("created_at", { ascending: false }),
      ]);

    if (projectErr) {
      console.error("projects load", projectErr);
      return;
    }

    if (photoErr) {
      console.error("photos load", photoErr);
      return;
    }

    const projectList = projectData || [];
    setProjects(projectList);

    if (!projectId && projectList.length > 0) {
      const firstActive = projectList.find((p) => p.active) || projectList[0];
      setProjectId(firstActive?.id ?? null);
    }

    if (projectId) {
      setPhotos((photoData || []).filter((x) => x.project_id === projectId));
    }
  }

  async function loadPhotosForProject(currentProjectId) {
    if (!currentProjectId) {
      setPhotos([]);
      return;
    }

    const { data, error } = await supabase
      .from("project_photos")
      .select("id, file_path, caption, created_at, project_id, taken_at")
      .eq("project_id", currentProjectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("photos load", error);
      return;
    }

    setPhotos(data || []);
  }

  const projectStats = useMemo(() => {
    const map = new Map();

    for (const p of projects) {
      map.set(p.id, { count: 0, lastAdded: null });
    }

    for (const ph of photos) {
      const existing = map.get(ph.project_id) || { count: 0, lastAdded: null };
      existing.count += 1;

      const candidate = ph.created_at || ph.taken_at || null;
      if (!existing.lastAdded || new Date(candidate) > new Date(existing.lastAdded)) {
        existing.lastAdded = candidate;
      }

      map.set(ph.project_id, existing);
    }

    return map;
  }, [projects, photos]);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === projectId) || null,
    [projects, projectId]
  );

  async function doUpload() {
    if (!projectId) return alert("Bitte zuerst ein Projekt auswählen.");
    if (!file) return alert("Bitte eine Datei wählen.");

    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `project-${projectId}/${stamp}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg",
        });

      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("project_photos").insert({
        project_id: projectId,
        employee_id: me?.id ?? null,
        caption: caption?.trim() || null,
        file_path: path,
        taken_at: new Date().toISOString(),
      });

      if (insErr) throw insErr;

      setFile(null);
      setCaption("");
      await loadPhotosForProject(projectId);

      const input = document.getElementById("project-photo-upload-input");
      if (input) input.value = "";
    } catch (e) {
      console.error(e);
      alert("Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(ph) {
    if (!ph?.id) return;
    const go = confirm("Dieses Foto wirklich löschen?");
    if (!go) return;

    setDeletingId(ph.id);
    try {
      const { error: stErr } = await supabase.storage.from(BUCKET).remove([ph.file_path]);
      if (stErr) throw stErr;

      const { error: dbErr } = await supabase
        .from("project_photos")
        .delete()
        .eq("id", ph.id);
      if (dbErr) throw dbErr;

      setPhotos((prev) => prev.filter((x) => x.id !== ph.id));
    } catch (e) {
      console.error(e);
      alert("Löschen fehlgeschlagen.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-3 text-sm">
        <div className="mb-1">
          <strong>Foto für Projekt:&nbsp;</strong>
          {currentProject ? (
            <span>{currentProject.name}</span>
          ) : (
            <span className="text-neutral-500">– bitte wählen –</span>
          )}
        </div>

        <select
          value={projectId || ""}
          onChange={(e) => setProjectId(e.target.value || null)}
          className="border border-neutral-400 rounded px-2 py-1 mr-2"
        >
          <option value="">Projekt wählen …</option>
          {projects.map((p) => {
            const stats = projectStats.get(p.id) || { count: 0, lastAdded: null };
            return (
              <option key={p.id} value={p.id}>
                {p.name} ({stats.count} Fotos)
              </option>
            );
          })}
        </select>

        <input
          id="project-photo-upload-input"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mr-2"
        />
        <input
          type="text"
          placeholder="Beschreibung (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="border border-neutral-400 rounded px-2 py-1 mr-2"
          style={{ width: 240 }}
        />
        <button
          onClick={doUpload}
          disabled={busy || !file}
          className="px-3 py-1 rounded bg-[#6b4b34] text-white disabled:opacity-50"
        >
          Hochladen
        </button>
      </div>

      <h2 className="text-xl font-semibold mb-2">Projektübersicht Fotos</h2>

      <div className="project-list" style={{ marginBottom: 16 }}>
        {projects.map((p) => {
          const stats = projectStats.get(p.id) || { count: 0, lastAdded: null };

          return (
            <div
              key={p.id}
              className="project-list-row"
              style={{
                cursor: "pointer",
                border:
                  projectId === p.id ? "1px solid rgba(123, 74, 45, 0.9)" : undefined,
                boxShadow:
                  projectId === p.id ? "0 0 0 2px rgba(123, 74, 45, 0.08)" : undefined,
              }}
              onClick={() => setProjectId(p.id)}
            >
              <div className="project-list-info">
                <div className="project-list-title">{p.name}</div>
                <div className="project-list-status">
                  📷 {stats.count} Foto{stats.count === 1 ? "" : "s"} · Zuletzt ergänzt:{" "}
                  {formatDateTime(stats.lastAdded)}
                </div>
              </div>

              <div className="project-list-actions">
                <button
                  type="button"
                  className="hbz-btn btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectId(p.id);
                  }}
                >
                  Öffnen
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {projectId ? (
        <>
          <div className="text-sm mb-2">
            <strong>Ausgewähltes Projekt:</strong> {currentProject?.name || "—"}
          </div>

          {photos?.length ? (
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {photos.map((ph) => (
                <li key={ph.id} className="text-sm">
                  <div className="border rounded p-2 flex flex-col gap-2">
                    <div className="font-medium truncate">{ph.caption || "—"}</div>

                    <PhotoThumb path={ph.file_path} />

                    <div className="text-neutral-500">
                      {formatDateTime(ph.created_at || ph.taken_at)}
                    </div>

                    <div className="flex gap-2">
                      <OpenButton path={ph.file_path} />
                      <button
                        onClick={() => handleDelete(ph)}
                        disabled={deletingId === ph.id}
                        className="px-2 py-1 rounded bg-red-600 text-white disabled:opacity-50"
                        title="Foto löschen"
                      >
                        {deletingId === ph.id ? "Löschen…" : "Löschen"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-neutral-500">Keine Fotos vorhanden.</div>
          )}
        </>
      ) : (
        <div className="text-neutral-500">
          Bitte zuerst ein Projekt auswählen, dann werden die Fotos angezeigt.
        </div>
      )}
    </div>
  );
}

function PhotoThumb({ path }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setUrl(data?.publicUrl || "");
  }, [path]);

  if (!url) return <div className="h-32 bg-neutral-100" />;

  return (
    <img
      src={url}
      alt=""
      className="block w-full h-32 object-cover rounded bg-neutral-100"
    />
  );
}

function OpenButton({ path }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setUrl(data?.publicUrl || "");
  }, [path]);

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="px-2 py-1 rounded bg-neutral-700 text-white"
      title="In neuem Tab öffnen"
    >
      Öffnen
    </a>
  );
}