// src/components/ProjectPhotoUpload.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const BUCKET = "project-photos";

export default function ProjectPhotoUpload({ me }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  // Projekt aus URL übernehmen
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("project");
    if (p) setProjectId(p);
  }, []);

  // Projekte laden
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, active")
        .order("name", { ascending: true });

      if (error) {
        console.error("projects load", error);
        return;
      }
      setProjects(data || []);
      if (!projectId && data && data.length > 0) {
        const firstActive = data.find((p) => p.active) || data[0];
        setProjectId(firstActive?.id ?? null);
      }
    }
    load();
  }, []); // nur beim Mount

  // Fotos laden (bei Projektwechsel)
  useEffect(() => {
    async function loadPhotos() {
      let query = supabase
        .from("project_photos")
        .select("id, file_path, caption, created_at, project_id")
        .order("created_at", { ascending: false });

      if (projectId) query = query.eq("project_id", projectId);
      const { data, error } = await query;
      if (error) console.error("photos load", error);
      else setPhotos(data || []);
    }
    loadPhotos();
  }, [projectId]);

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
      const path = `project-${projectId}/${stamp}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      // 1) Datei in Storage laden
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (upErr) throw upErr;

      // 2) DB-Zeile anlegen
      const { error: insErr } = await supabase.from("project_photos").insert({
        project_id: projectId,
        employee_id: me?.id ?? null,
        caption: caption?.trim() || null,
        file_path: path,
      });
      if (insErr) throw insErr;

      // Reset und Liste auffrischen
      setFile(null);
      setCaption("");
      const { data: newList } = await supabase
        .from("project_photos")
        .select("id, file_path, caption, created_at, project_id")
        .order("created_at", { ascending: false })
        .eq("project_id", projectId);
      setPhotos(newList || []);
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
      // 1) Storage-Datei löschen
      const { error: stErr } = await supabase.storage
        .from(BUCKET)
        .remove([ph.file_path]);
      if (stErr) throw stErr;

      // 2) DB-Row löschen
      const { error: dbErr } = await supabase
        .from("project_photos")
        .delete()
        .eq("id", ph.id);
      if (dbErr) throw dbErr;

      // 3) UI aktualisieren
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
      {/* Kopfbereich */}
      <div className="mb-3 text-sm">
        <div className="mb-1">
          <strong>Foto für Projekt:&nbsp;</strong>
          {currentProject ? (
            <span>{currentProject.name}</span>
          ) : (
            <span className="text-neutral-500">– bitte wählen –</span>
          )}
        </div>

        {/* Projektwahl – NUR Name */}
        <select
          value={projectId || ""}
          onChange={(e) => setProjectId(e.target.value || null)}
          className="border border-neutral-400 rounded px-2 py-1 mr-2"
        >
          <option value="">Projekt wählen …</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Datei + Beschreibung */}
        <input
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

      {/* Projektfilter */}
      <h2 className="text-xl font-semibold mb-2">Projektfotos</h2>
      <div className="text-sm mb-2">
        <label className="mr-2">Projekt filtern</label>
        <select
          value={projectId || ""}
          onChange={(e) => setProjectId(e.target.value || null)}
          className="border border-neutral-400 rounded px-2 py-1"
        >
          <option value="">Alle</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Foto-Liste */}
      {photos?.length ? (
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map((ph) => (
            <li key={ph.id} className="text-sm">
              <div className="border rounded p-2 flex flex-col gap-2">
                <div className="font-medium truncate">
                  {ph.caption || "—"}
                </div>

                <PhotoThumb path={ph.file_path} />

                <div className="text-neutral-500">
                  {new Date(ph.created_at).toLocaleString()}
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
    </div>
  );
}

/* ------- Hilfs-Komponenten ------- */

function PhotoThumb({ path }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const { data } = supabase.storage.from("project-photos").getPublicUrl(path);
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
    const { data } = supabase.storage.from("project-photos").getPublicUrl(path);
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
