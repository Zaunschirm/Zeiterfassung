import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function PhotoCard({ p, onDelete }) {
  const publicUrl = supabase.storage.from("project-photos").getPublicUrl(p.file_path).data
    ?.publicUrl;

  return (
    <div className="border rounded-md p-2 flex flex-col">
      {publicUrl ? (
        <img src={publicUrl} alt={p.caption || p.file_path} className="w-full object-cover rounded-md aspect-[4/3]" />
      ) : (
        <div className="h-32 bg-gray-100 rounded-md" />
      )}
      <div className="mt-2 text-sm">
        <div className="font-medium">{p.project}</div>
        <div className="text-gray-600">{p.caption || p.file_path}</div>
      </div>
      <button
        onClick={() => onDelete(p)}
        className="mt-2 text-red-600 text-sm px-2 py-1 border border-red-200 rounded-md"
      >
        Löschen
      </button>
    </div>
  );
}

export default function ProjectPhotos() {
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState([]);
  const [list, setList] = useState([]);

  async function loadProjects() {
    const { data } = await supabase.from("projects").select("code,name,active").order("code");
    setProjects(data || []);
  }
  async function loadPhotos() {
    const q = supabase.from("project_photos").select("*").order("created_at", { ascending: false });
    const { data, error } = project ? await q.eq("project", project) : await q.limit(40);
    if (!error) setList(data || []);
  }

  useEffect(() => {
    loadProjects();
  }, []);
  useEffect(() => {
    loadPhotos();
  }, [project]);

  async function onDelete(p) {
    if (!confirm("Foto wirklich löschen?")) return;
    // 1) DB
    const { error: dberr } = await supabase.from("project_photos").delete().eq("id", p.id);
    if (dberr) {
      alert("Löschen fehlgeschlagen.");
      return;
    }
    // 2) Storage
    await supabase.storage.from("project-photos").remove([p.file_path]);
    await loadPhotos();
  }

  return (
    <div className="max-w-[1000px] mx-auto p-3 md:p-4">
      <div className="rounded-2xl shadow-md bg-white/90 p-4 space-y-3">
        <h2 className="text-xl font-semibold">Projektfotos</h2>

        <label className="block max-w-[420px]">
          <div className="text-sm text-gray-600">Projekt filtern</div>
          <select
            className="w-full mt-1 rounded-md border border-amber-200 p-2"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">Alle</option>
            {projects.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} – {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((p) => (
            <PhotoCard key={p.id} p={p} onDelete={onDelete} />
          ))}
        </div>

        {!list.length && (
          <div className="text-sm text-gray-500">Keine Fotos vorhanden.</div>
        )}
      </div>
    </div>
  );
}
