import { supabase } from "../lib/supabase";

/**
 * Uploadt eine Bilddatei in den Storage-Bucket "project-photos"
 * und legt danach einen Datensatz in "project_photos" an.
 *
 * @param {Object} params
 * @param {File}   params.file
 * @param {string} params.projectId
 * @param {string} [params.projectCode]
 * @param {number|string|null} [params.employeeId]
 * @param {string|null} [params.caption]
 * @returns {Promise<string>}
 */
export async function uploadProjectPhoto({
  file,
  projectId,
  projectCode,
  employeeId = null,
  caption = null,
}) {
  if (!file) throw new Error("Kein Foto ausgewählt.");
  if (!projectId) throw new Error("Projekt fehlt.");

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const stamp = `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folder = projectCode ? projectCode : `project_${projectId}`;
  const path = `${folder}/${yyyy}-${mm}/${stamp}_${safeName}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("project-photos")
    .upload(path, file, {
      upsert: false,
      cacheControl: "3600",
      contentType: file.type || "image/jpeg",
    });

  if (upErr) throw new Error("Upload fehlgeschlagen: " + upErr.message);

  const payload = {
    project_id: projectId,
    employee_id: employeeId || null,
    file_path: path,
    caption: caption || null,
    taken_at: now.toISOString(),
  };

  const { error: dbErr } = await supabase.from("project_photos").insert([payload]);

  if (dbErr) {
    await supabase.storage.from("project-photos").remove([path]);
    throw new Error("DB-Speichern fehlgeschlagen: " + dbErr.message);
  }

  return path;
}