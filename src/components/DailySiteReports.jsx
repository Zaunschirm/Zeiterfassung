import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { uploadProjectPhoto } from "../utils/uploadProjectPhoto";

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (value) => { const [y, m, d] = String(value || "").slice(0, 10).split("-"); return y && m && d ? `${d}.${m}.${y}` : "—"; };
const fmtHours = (value) => `${Number(value || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
const entryHours = (row) => {
  const direct = Number(row.total_hours ?? row.hours);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return Math.max(0, (Number(row.end_min || 0) - Number(row.start_min || 0) - Number(row.break_min || row.pause_min || 0) + Number(row.travel_min || 0)) / 60);
};

export default function DailySiteReports() {
  const session = getSession()?.user || {};
  const [date, setDate] = useState(todayISO());
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [reports, setReports] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [location, setLocation] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [weather, setWeather] = useState("");
  const [employeeItems, setEmployeeItems] = useState([]);
  const [activities, setActivities] = useState("");
  const [incidents, setIncidents] = useState("");
  const [deliveries, setDeliveries] = useState("");
  const [materialsEquipment, setMaterialsEquipment] = useState("");
  const [photos, setPhotos] = useState([]);
  const [status, setStatus] = useState("draft");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedProject = useMemo(() => projects.find((p) => String(p.id) === String(projectId)), [projects, projectId]);
  const dateReports = useMemo(() => reports.filter((r) => String(r.report_date).slice(0, 10) === date), [reports, date]);
  const activeProjectIds = useMemo(() => [...new Set(entries.map((e) => String(e.project_id || "")).filter(Boolean))], [entries]);

  async function load() {
    setError("");
    const [p, e, t, r] = await Promise.all([
      supabase.from("projects").select("*").eq("active", true).order("name"),
      supabase.from("employees").select("id,name,code"),
      supabase.from("time_entries").select("*").eq("work_date", date),
      supabase.from("daily_site_reports").select("*").gte("report_date", `${date.slice(0, 7)}-01`).order("report_date", { ascending: false }),
    ]);
    const firstError = p.error || e.error || t.error || r.error;
    if (firstError) { setError(firstError.message); return; }
    setProjects(p.data || []); setEmployees(e.data || []); setEntries(t.data || []); setReports(r.data || []);
  }
  useEffect(() => { load(); }, [date]);

  function shiftReportDate(days) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    setDate(nextDate); setProjectId(""); setSelectedId(""); setMessage("");
  }

  useEffect(() => {
    function handleArrowKey(event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (!window.matchMedia("(min-width: 801px)").matches || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target?.closest?.("input, textarea, select, button, [contenteditable='true'], canvas, [role='slider']")) return;
      event.preventDefault();
      shiftReportDate(event.key === "ArrowRight" ? 1 : -1);
    }
    window.addEventListener("keydown", handleArrowKey);
    return () => window.removeEventListener("keydown", handleArrowKey);
  }, [date]);

  function prepareProject(nextProjectId) {
    const project = projects.find((p) => String(p.id) === String(nextProjectId));
    const relevant = entries.filter((e) => String(e.project_id || "") === String(nextProjectId) && !e.absence_type);
    const grouped = new Map();
    for (const row of relevant) {
      const id = String(row.employee_id || "");
      const employee = employees.find((item) => String(item.id) === id);
      const old = grouped.get(id) || { employee_id: id, name: employee?.name || row.employee_name || id, hours: 0 };
      old.hours += entryHours(row); grouped.set(id, old);
    }
    const notes = [...new Set(relevant.map((row) => String(row.note || "").trim()).filter(Boolean))];
    const weatherText = relevant.map((row) => row.weather_manual || row.weather_auto || "").find(Boolean) || "";
    setProjectId(String(nextProjectId)); setSelectedId(""); setStatus("draft");
    setLocation(project?.address || ""); setClientName(project?.client_name || ""); setClientContact(project?.client_contact || "");
    setEmployeeItems([...grouped.values()]); setActivities(notes.join("\n")); setWeather(weatherText);
    setIncidents(""); setDeliveries(""); setMaterialsEquipment(""); setPhotos([]); setMessage("");
  }

  function openReport(report) {
    setSelectedId(report.id); setProjectId(String(report.project_id)); setLocation(report.location || ""); setClientName(report.client_name || "");
    setClientContact(report.client_contact || ""); setWeather(report.weather || ""); setEmployeeItems(Array.isArray(report.employee_items) ? report.employee_items : []);
    setActivities(report.activities || ""); setIncidents(report.incidents || ""); setDeliveries(report.deliveries || ""); setMaterialsEquipment(report.materials_equipment || "");
    setPhotos((Array.isArray(report.photo_paths) ? report.photo_paths : []).map((photo) => { const { data } = supabase.storage.from("project-photos").getPublicUrl(photo.path); return { ...photo, url: data?.publicUrl || "" }; }));
    setStatus(report.status || "draft"); setMessage("");
  }

  function payload(nextStatus) {
    return { report_date: date, project_id: projectId, project_name: selectedProject?.name || null, location: location || null, client_name: clientName || null, client_contact: clientContact || null, weather: weather || null, employee_items: employeeItems, activities: activities.trim(), incidents: incidents.trim() || null, deliveries: deliveries.trim() || null, materials_equipment: materialsEquipment.trim() || null, photo_paths: photos.map(({ path, caption }) => ({ path, caption })), status: nextStatus, completed_by: nextStatus === "completed" ? String(session.id || session.code || "") : null, completed_by_name: nextStatus === "completed" ? (session.name || session.code || null) : null, completed_at: nextStatus === "completed" ? new Date().toISOString() : null, created_by: String(session.id || session.code || ""), updated_at: new Date().toISOString() };
  }

  async function save(nextStatus) {
    if (!projectId) { setError("Bitte eine Baustelle auswählen."); return; }
    if (nextStatus === "completed" && !activities.trim()) { setError("Bitte die ausgeführten Arbeiten beschreiben."); return; }
    setBusy(true); setError("");
    const result = selectedId ? await supabase.from("daily_site_reports").update(payload(nextStatus)).eq("id", selectedId).select().single() : await supabase.from("daily_site_reports").insert(payload(nextStatus)).select().single();
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setSelectedId(result.data.id); setStatus(nextStatus); setMessage(nextStatus === "completed" ? "Bautagesbericht abgeschlossen." : "Entwurf gespeichert."); await load();
  }

  async function addPhotos(event) {
    const files = Array.from(event.target.files || []); event.target.value = "";
    if (!projectId || !files.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const file of files.slice(0, Math.max(0, 8 - photos.length))) {
        const path = await uploadProjectPhoto({ file, projectId, projectCode: selectedProject?.code, employeeId: session.id, caption: `Bautagesbericht ${date}` });
        const { data } = supabase.storage.from("project-photos").getPublicUrl(path); added.push({ path, caption: file.name, url: data?.publicUrl || "" });
      }
      setPhotos((old) => [...old, ...added]);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function removePhoto(photo) {
    if (!photo?.path || locked) return;
    setBusy(true);
    await supabase.storage.from("project-photos").remove([photo.path]);
    await supabase.from("project_photos").delete().eq("file_path", photo.path);
    setPhotos((rows) => rows.filter((item) => item.path !== photo.path)); setBusy(false);
  }

  async function photoDataUrl(url) {
    const response = await fetch(url); const blob = await response.blob();
    return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  }

  async function exportPdf() {
    if (!projectId) return;
    const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ unit: "pt", format: "a4" }); const autoTable = autoTableModule.default; const brown = [123, 74, 45];
    doc.setFillColor(...brown); doc.rect(0, 0, 595, 62, "F"); doc.setTextColor(255); doc.setFontSize(19); doc.text("Bautagesbericht", 36, 30); doc.setFontSize(10); doc.text(`${selectedProject?.name || "Baustelle"} · ${fmtDate(date)}`, 36, 48); doc.setTextColor(40);
    autoTable(doc, { startY: 78, theme: "grid", body: [["Baustelle", selectedProject?.name || "—", "Datum", fmtDate(date)], ["Adresse", location || "—", "Wetter", weather || "—"], ["Auftraggeber", clientName || "—", "Bauleiter", clientContact || "—"]], styles: { fontSize: 9 } });
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 18, theme: "striped", head: [["Mitarbeiter", "Stunden"]], body: employeeItems.map((item) => [item.name, fmtHours(item.hours)]), headStyles: { fillColor: brown } });
    let y = doc.lastAutoTable.finalY + 20; const blocks = [["Ausgeführte Arbeiten", activities], ["Besondere Vorkommnisse / Behinderungen", incidents], ["Lieferungen", deliveries], ["Material / Geräte (optional)", materialsEquipment]];
    for (const [title, text] of blocks) { if (!text) continue; doc.setFontSize(11); doc.text(title, 36, y); autoTable(doc, { startY: y + 7, theme: "grid", body: [[text]], margin: { left: 36, right: 36 }, styles: { fontSize: 9 } }); y = doc.lastAutoTable.finalY + 18; }
    for (let index = 0; index < photos.length; index += 1) { try { const imageData = await photoDataUrl(photos[index].url); const image = doc.getImageProperties(imageData); const scale = Math.min(523 / image.width, 700 / image.height); doc.addPage(); doc.setFontSize(12); doc.text(`Baustellenfoto ${index + 1} · ${photos[index].caption || "Foto"}`, 36, 45); doc.addImage(imageData, image.fileType || "JPEG", 36, 65, image.width * scale, image.height * scale); } catch { /* Einzelnes Foto überspringen. */ } }
    const pages = doc.getNumberOfPages(); for (let page = 1; page <= pages; page += 1) { doc.setPage(page); doc.setFontSize(8); doc.text(`Seite ${page} von ${pages}`, 297, 820, { align: "center" }); }
    doc.save(`Bautagesbericht_${selectedProject?.name || "Projekt"}_${date}.pdf`);
  }

  const locked = status === "completed";
  return <div className="hbz-container daily-page">
    <div className="daily-head"><div><div className="eyebrow">Tägliche Baustellendokumentation</div><h1>Bautagesberichte</h1><p>Aus Zeiterfassung und Arbeitseinteilung vorbereitet, abends kontrollieren und abschließen.</p></div><label>Datum<input className="hbz-input" type="date" value={date} onChange={(e) => { setDate(e.target.value); setProjectId(""); setSelectedId(""); }} /></label></div>
    {error && <div className="hbz-alert hbz-alert-error">{error}</div>}{message && <div className="hbz-alert hbz-alert-success">{message}</div>}
    <div className="daily-layout"><aside className="hbz-card daily-list"><b>Baustellen am {fmtDate(date)}</b>{!activeProjectIds.length && <p className="hint">Keine Baustelle mit Zeiteinträgen gefunden.</p>}{activeProjectIds.map((id) => { const project = projects.find((p) => String(p.id) === id); const report = dateReports.find((r) => String(r.project_id) === id); return <button type="button" key={id} className="daily-list-item" onClick={() => report ? openReport(report) : prepareProject(id)}><strong>{project?.name || id}</strong><span>{report ? (report.status === "completed" ? "✓ Abgeschlossen" : "Entwurf") : "Offen – noch zu erstellen"}</span></button>; })}</aside>
    <main className="hbz-card daily-form">{!projectId ? <div className="daily-empty"><h2>Baustelle auswählen</h2><p>Links erscheinen automatisch alle Baustellen mit Zeiteinträgen an diesem Tag.</p></div> : <fieldset disabled={locked || busy}><div className="daily-form-head"><h2>{selectedProject?.name}</h2><span className={`regie-status ${locked ? "signed" : "draft"}`}>{locked ? "✓ Abgeschlossen" : "Entwurf"}</span></div><div className="regie-grid"><label>Adresse<input className="hbz-input" value={location} onChange={(e) => setLocation(e.target.value)} /></label><label>Wetter<input className="hbz-input" value={weather} onChange={(e) => setWeather(e.target.value)} /></label><label>Auftraggeber<input className="hbz-input" value={clientName} onChange={(e) => setClientName(e.target.value)} /></label><label>Bauleiter / Kontakt<input className="hbz-input" value={clientContact} onChange={(e) => setClientContact(e.target.value)} /></label></div>
    <section className="regie-section"><h3>Mitarbeiter und Stunden</h3>{employeeItems.map((item) => <div className="daily-employee" key={item.employee_id}><span>{item.name}</span><b>{fmtHours(item.hours)}</b></div>)}</section>
    <label className="regie-block">Ausgeführte Arbeiten<textarea className="hbz-textarea" rows="5" value={activities} onChange={(e) => setActivities(e.target.value)} /></label><label className="regie-block">Besondere Vorkommnisse / Behinderungen (optional)<textarea className="hbz-textarea" rows="3" value={incidents} onChange={(e) => setIncidents(e.target.value)} /></label><label className="regie-block">Lieferungen (optional)<textarea className="hbz-textarea" rows="2" value={deliveries} onChange={(e) => setDeliveries(e.target.value)} /></label><label className="regie-block">Material und Geräte (nur bei Bedarf)<textarea className="hbz-textarea" rows="2" value={materialsEquipment} onChange={(e) => setMaterialsEquipment(e.target.value)} /></label>
    <section className="regie-section"><div className="regie-section-head"><h3>Fotos (optional)</h3><label className="hbz-btn btn-small daily-upload">+ Fotos<input type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} /></label></div>{!!photos.length && <div className="daily-photos">{photos.map((photo) => <figure key={photo.path}><img src={photo.url} alt={photo.caption || "Baustellenfoto"} /><input value={photo.caption || ""} onChange={(e) => setPhotos((rows) => rows.map((item) => item.path === photo.path ? { ...item, caption: e.target.value } : item))} placeholder="Beschreibung" /><button type="button" onClick={() => removePhoto(photo)}>×</button></figure>)}</div>}</section></fieldset>}
    {projectId && <div className="regie-actions">{!locked && <><button className="hbz-btn" onClick={() => save("draft")}>Entwurf speichern</button><button className="hbz-btn hbz-btn-primary" onClick={() => save("completed")}>Bautagesbericht abschließen</button></>}<button className="hbz-btn" onClick={exportPdf}>PDF erstellen</button></div>}</main></div>
    <style>{`.daily-head{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:16px}.daily-head h1{margin:2px 0}.daily-head p{margin:0;color:#6f6259}.daily-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px}.daily-list{align-self:start}.daily-list-item{display:flex;flex-direction:column;width:100%;text-align:left;gap:4px;margin-top:8px;padding:10px;border:1px solid #eadfd7;border-radius:9px;background:#fff;cursor:pointer}.daily-list-item span{font-size:12px;color:#6f6259}.daily-form fieldset{border:0;padding:0;margin:0}.daily-form-head{display:flex;justify-content:space-between;align-items:center}.daily-form-head h2{margin:0}.daily-empty{text-align:center;padding:60px 15px}.daily-employee{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:8px}.daily-upload{display:inline-flex!important;flex-direction:row!important}.daily-upload input{display:none}.daily-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}.daily-photos figure{position:relative;margin:0}.daily-photos img{width:100%;height:120px;object-fit:cover;border-radius:8px}.daily-photos input{width:100%;box-sizing:border-box}.daily-photos button{position:absolute;right:4px;top:4px;border:0;border-radius:50%;background:#9f2f24;color:#fff;width:28px;height:28px}@media(max-width:800px){.daily-head{align-items:stretch;flex-direction:column}.daily-layout{grid-template-columns:1fr}.daily-form{padding:13px}}`}</style>
  </div>;
}
