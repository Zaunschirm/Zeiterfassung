// src/utils/uploadProjectPhoto.js
import { supabase } from "../lib/supabase";

/**
 * Uploadt eine Bilddatei in den Storage-Bucket "project-photos"
 * und legt danach einen Datensatz in "project_photos" an.
 *
 * @param {Object} params
 * @param {File}   params.file           - Datei aus <input type="file">
 * @param {number} params.projectId      - projects.id
 * @param {string} [params.projectCode]  - z.B. "ZS" (nur für hübschen Pfad)
 * @param {number} [params.employeeId]   - optional
 * @param {string} [params.caption]      - optional
 * @returns {Promise<string>}            - der Storage-Pfad
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

  // 1) Pfad erzeugen: z.B. "ZS/2025-11/20251101_121530_MeinFoto.jpg"
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const stamp = `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folder = projectCode ? projectCode : `project_${projectId}`;
  const path = `${folder}/${yyyy}-${mm}/${stamp}_${safeName}`;

  // 2) Upload in Storage
  const { error: upErr } = await supabase
    .storage
    .from("project-photos")
    .upload(path, file, {
      upsert: false,                 // keine Überschreibung
      cacheControl: "3600",
      contentType: file.type || "image/jpeg",
    });

  if (upErr) throw new Error("Upload fehlgeschlagen: " + upErr.message);

  // 3) Datensatz in DB anlegen
  const { error: dbErr } = await supabase.from("project_photos").insert([{
    project_id: Number(projectId),
    employee_id: employeeId ? Number(employeeId) : null,
    file_path: path,
    caption: caption || null,
    taken_at: now.toISOString(),
  }]);

  if (dbErr) {
    // Rollback Storage, wenn DB-Insert fehlschlägt
    await supabase.storage.from("project-photos").remove([path]);
    throw new Error("DB-Speichern fehlgeschlagen: " + dbErr.message);
  }

  return path;
}
