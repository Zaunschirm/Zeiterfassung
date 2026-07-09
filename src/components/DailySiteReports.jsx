import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { uploadProjectPhoto } from "../utils/uploadProjectPhoto";
import { addPdfFooters, addPdfHeader, addPdfWatermarks, brandedTable, PDF_BRAND } from "../utils/pdfBranding";

const todayISO = () => new Date().toISOString().slice(0, 10);
const localISO = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const addDays = (value, days) => { const next = new Date(`${value}T12:00:00`); next.setDate(next.getDate() + days); return localISO(next); };
const weekStartFor = (value) => { const next = new Date(`${value}T12:00:00`); next.setDate(next.getDate() - ((next.getDay() + 6) % 7)); return localISO(next); };
const fmtDate = (value) => { const [y, m, d] = String(value || "").slice(0, 10).split("-"); return y && m && d ? `${d}.${m}.${y}` : "—"; };
const fmtHours = (value) => `${Number(value || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
const entryHours = (row) => {
  const direct = Number(row.total_hours ?? row.hours);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return Math.max(0, (Number(row.end_min || 0) - Number(row.start_min || 0) - Number(row.break_min || row.pause_min || 0) + Number(row.travel_min || 0)) / 60);
};
const isBadWeatherEntry = (row) => row?.bad_weather === true || String(row?.bad_weather).toLowerCase() === "true";
const DAILY_DRAFT_KEY = "hbz_daily_site_report_draft_v1";

export default function DailySiteReports() {
  const session = getSession()?.user || {};
  const role = String(session.role || "mitarbeiter").toLowerCase();
  const canManage = role === "admin" || role === "teamleiter";
  const [date, setDate] = useState(todayISO());
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [assignments, setAssignments] = useState([]);
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
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [auditRows, setAuditRows] = useState([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listStatusFilter, setListStatusFilter] = useState("all");
  const [listProjectFilter, setListProjectFilter] = useState("all");

  const selectedProject = useMemo(() => projects.find((p) => String(p.id) === String(projectId)), [projects, projectId]);
  const dateReports = useMemo(() => reports.filter((r) => String(r.report_date).slice(0, 10) === date), [reports, date]);
  const dateEntries = useMemo(() => entries.filter((e) => String(e.work_date).slice(0, 10) === date), [entries, date]);
  const badWeatherOnlyKeys = useMemo(() => {
    const grouped = new Map();
    for (const row of entries) {
      const key = `${String(row.work_date || "").slice(0, 10)}__${String(row.project_id || "")}`;
      if (!row.project_id || row.absence_type) continue;
      const state = grouped.get(key) || { hasNormal: false, hasBadWeather: false };
      if (isBadWeatherEntry(row)) state.hasBadWeather = true; else state.hasNormal = true;
      grouped.set(key, state);
    }
    return new Set([...grouped].filter(([, state]) => state.hasBadWeather && !state.hasNormal).map(([key]) => key));
  }, [entries]);
  const activeProjectIds = useMemo(() => [...new Set(dateEntries.filter((row) => !isBadWeatherEntry(row)).map((e) => String(e.project_id || "")).filter(Boolean))], [dateEntries]);
  const dateAssignments = useMemo(() => assignments.filter((row) => String(row.assignment_date).slice(0, 10) === date), [assignments, date]);
  const visibleProjectIds = useMemo(() => [...new Set([...activeProjectIds, ...dateAssignments.filter((row) => !badWeatherOnlyKeys.has(`${date}__${String(row.project_id || "")}`)).map((row) => String(row.project_id || "")).filter(Boolean)])], [activeProjectIds, dateAssignments, badWeatherOnlyKeys, date]);
  const filteredProjectIds = useMemo(() => visibleProjectIds.filter((id) => {
    const project = projects.find((p) => String(p.id) === String(id));
    const report = dateReports.find((r) => String(r.project_id) === String(id));
    const statusKey = report ? (report.status === "completed" ? "completed" : "draft") : "open";
    if (listProjectFilter !== "all" && String(id) !== String(listProjectFilter)) return false;
    if (listStatusFilter !== "all" && statusKey !== listStatusFilter) return false;
    const haystack = `${project?.name || ""} ${project?.code || ""} ${project?.address || ""} ${report?.project_name || ""}`.toLowerCase();
    return haystack.includes(listSearch.trim().toLowerCase());
  }), [visibleProjectIds, projects, dateReports, listProjectFilter, listStatusFilter, listSearch]);
  const weekStart = weekStartFor(date);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const expectedReports = useMemo(() => {
    const map = new Map();
    for (const row of entries) {
      const day = String(row.work_date || "").slice(0, 10); const id = String(row.project_id || "");
      if (!day || !id || row.absence_type || isBadWeatherEntry(row)) continue;
      map.set(`${day}__${id}`, { day, projectId: id });
    }
    for (const row of assignments) {
      const day = String(row.assignment_date || "").slice(0, 10); const id = String(row.project_id || "");
      if (day && id && !badWeatherOnlyKeys.has(`${day}__${id}`)) map.set(`${day}__${id}`, { day, projectId: id });
    }
    return [...map.values()];
  }, [entries, assignments, badWeatherOnlyKeys]);
  const openReports = useMemo(() => expectedReports.filter((item) => item.day <= todayISO() && !reports.some((r) => String(r.report_date).slice(0, 10) === item.day && String(r.project_id) === item.projectId && r.status === "completed")), [expectedReports, reports]);

  async function load() {
    setError("");
    const firstDay = addDays(weekStart, -1); const lastDay = addDays(weekStart, 6);
    const [p, e, t, a, r] = await Promise.all([
      supabase.from("projects").select("*").eq("active", true).order("name"),
      supabase.from("employees").select("id,name,code"),
      supabase.from("time_entries").select("*").gte("work_date", weekStart).lte("work_date", lastDay),
      supabase.from("work_assignments").select("id,assignment_date,employee_id,project_id").gte("assignment_date", weekStart).lte("assignment_date", lastDay),
      supabase.from("daily_site_reports").select("*").gte("report_date", firstDay).lte("report_date", lastDay).order("report_date", { ascending: false }),
    ]);
    const firstError = p.error || e.error || t.error || a.error || r.error;
    if (firstError) { setError(firstError.message); return; }
    setProjects(p.data || []); setEmployees(e.data || []); setEntries(t.data || []); setAssignments(a.data || []); setReports(r.data || []);
  }
  useEffect(() => { load(); }, [date]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DAILY_DRAFT_KEY) || "null");
      if (!saved || Date.now() - Number(saved.savedAt || 0) > 7 * 86400000) return;
      setDate(saved.date || todayISO()); setProjectId(String(saved.projectId || "")); setSelectedId(""); setStatus("draft");
      setLocation(saved.location || ""); setClientName(saved.clientName || ""); setClientContact(saved.clientContact || ""); setWeather(saved.weather || "");
      setEmployeeItems(Array.isArray(saved.employeeItems) ? saved.employeeItems : []); setActivities(saved.activities || ""); setIncidents(saved.incidents || "");
      setDeliveries(saved.deliveries || ""); setMaterialsEquipment(saved.materialsEquipment || ""); setPhotos(Array.isArray(saved.photos) ? saved.photos : []);
      setDraftRestored(true); setMessage("Lokaler Entwurf wiederhergestellt.");
    } catch { localStorage.removeItem(DAILY_DRAFT_KEY); }
  }, []);

  useEffect(() => {
    if (status === "completed" || (!projectId && !activities && !incidents && !deliveries && !materialsEquipment)) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(DAILY_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), date, projectId, location, clientName, clientContact, weather, employeeItems, activities, incidents, deliveries, materialsEquipment, photos }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [date, projectId, location, clientName, clientContact, weather, employeeItems, activities, incidents, deliveries, materialsEquipment, photos, status]);

  function shiftReportDate(days) {
    setDate(addDays(date, days)); setProjectId(""); setSelectedId(""); setMessage("");
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

  function employeeItemsFromTimeEntries(nextProjectId, reportDate = date) {
    const relevantEntries = entries.filter((e) => String(e.work_date).slice(0, 10) === reportDate);
    const relevantAssignments = assignments.filter((row) => String(row.assignment_date).slice(0, 10) === reportDate);
    const relevant = relevantEntries.filter((e) => String(e.project_id || "") === String(nextProjectId) && !e.absence_type && !isBadWeatherEntry(e));
    const grouped = new Map();
    for (const row of relevant) {
      const id = String(row.employee_id || "");
      const employee = employees.find((item) => String(item.id) === id);
      const old = grouped.get(id) || { employee_id: id, name: employee?.name || row.employee_name || id, hours: 0 };
      old.hours += entryHours(row); grouped.set(id, old);
    }
    for (const row of relevantAssignments.filter((item) => String(item.project_id) === String(nextProjectId))) {
      const id = String(row.employee_id || "");
      if (!grouped.has(id)) { const employee = employees.find((item) => String(item.id) === id); grouped.set(id, { employee_id: id, name: employee?.name || id, hours: 0 }); }
    }
    return [...grouped.values()];
  }

  function prepareProject(nextProjectId) {
    const project = projects.find((p) => String(p.id) === String(nextProjectId));
    const relevant = dateEntries.filter((e) => String(e.project_id || "") === String(nextProjectId) && !e.absence_type && !isBadWeatherEntry(e));
    const notes = [...new Set(relevant.map((row) => String(row.note || "").trim()).filter(Boolean))];
    const weatherText = relevant.map((row) => row.weather_manual || row.weather_auto || "").find(Boolean) || "";
    setProjectId(String(nextProjectId)); setSelectedId(""); setStatus("draft");
    setLocation(project?.address || ""); setClientName(project?.client_name || ""); setClientContact(project?.client_contact || "");
    setEmployeeItems(employeeItemsFromTimeEntries(nextProjectId, date)); setActivities(notes.join("\n")); setWeather(weatherText);
    setIncidents(""); setDeliveries(""); setMaterialsEquipment(""); setPhotos([]); setMessage("");
  }

  function openReport(report) {
    const reportDate = String(report.report_date || date).slice(0, 10);
    const freshEmployeeItems = employeeItemsFromTimeEntries(report.project_id, reportDate);
    setDate(reportDate);
    setSelectedId(report.id); setProjectId(String(report.project_id)); setLocation(report.location || ""); setClientName(report.client_name || "");
    setClientContact(report.client_contact || ""); setWeather(report.weather || "");
    setEmployeeItems(report.status === "completed" || !freshEmployeeItems.length ? (Array.isArray(report.employee_items) ? report.employee_items : []) : freshEmployeeItems);
    setActivities(report.activities || ""); setIncidents(report.incidents || ""); setDeliveries(report.deliveries || ""); setMaterialsEquipment(report.materials_equipment || "");
    setPhotos((Array.isArray(report.photo_paths) ? report.photo_paths : []).map((photo) => { const { data } = supabase.storage.from("project-photos").getPublicUrl(photo.path); return { ...photo, url: data?.publicUrl || "" }; }));
    setStatus(report.status || "draft"); setMessage("");
  }

  function refreshEmployeeItemsFromTimeEntries() {
    if (!projectId || status === "completed") return;
    const freshEmployeeItems = employeeItemsFromTimeEntries(projectId, date);
    setEmployeeItems(freshEmployeeItems);
    setMessage(freshEmployeeItems.length ? "Mitarbeiter und Stunden aus der Zeiterfassung aktualisiert." : "Keine Zeiteinträge für diese Baustelle gefunden.");
  }

  function payload(nextStatus) {
    return { report_date: date, project_id: projectId, project_name: selectedProject?.name || null, location: location || null, client_name: clientName || null, client_contact: clientContact || null, weather: weather || null, employee_items: employeeItems, activities: activities.trim(), incidents: incidents.trim() || null, deliveries: deliveries.trim() || null, materials_equipment: materialsEquipment.trim() || null, photo_paths: photos.map(({ path, caption }) => ({ path, caption })), status: nextStatus, completed_by: nextStatus === "completed" ? String(session.id || session.code || "") : null, completed_by_name: nextStatus === "completed" ? (session.name || session.code || null) : null, completed_at: nextStatus === "completed" ? new Date().toISOString() : null, created_by: String(session.id || session.code || ""), updated_at: new Date().toISOString() };
  }

  async function writeAudit(reportId, action, reason = null, changes = {}) {
    const { error: auditError } = await supabase.from("daily_site_report_audit_log").insert({ report_id: reportId, action, reason, changed_by: String(session.id || session.code || ""), changed_by_name: session.name || session.code || null, changes });
    if (auditError) console.warn("[DailySiteReports] audit:", auditError.message);
  }

  async function save(nextStatus) {
    if (!projectId) { setError("Bitte eine Baustelle auswählen."); return; }
    if (nextStatus === "completed" && !activities.trim()) { setError("Bitte die ausgeführten Arbeiten beschreiben."); return; }
    setBusy(true); setError("");
    const result = selectedId ? await supabase.from("daily_site_reports").update(payload(nextStatus)).eq("id", selectedId).select().single() : await supabase.from("daily_site_reports").insert(payload(nextStatus)).select().single();
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    await writeAudit(result.data.id, selectedId ? (nextStatus === "completed" ? "completed" : "updated") : "created", null, { status: nextStatus });
    localStorage.removeItem(DAILY_DRAFT_KEY); setDraftRestored(false);
    setSelectedId(result.data.id); setStatus(nextStatus); setMessage(nextStatus === "completed" ? "Bautagesbericht abgeschlossen." : "Entwurf gespeichert."); await load();
  }

  async function copyPreviousDay() {
    if (!projectId) return;
    const previous = reports.find((r) => String(r.report_date).slice(0, 10) === addDays(date, -1) && String(r.project_id) === String(projectId));
    if (!previous) { setError("Für diese Baustelle wurde am Vortag kein Bericht gefunden."); return; }
    setActivities(previous.activities || ""); setIncidents(""); setDeliveries(""); setMaterialsEquipment(previous.materials_equipment || "");
    if (!weather) setWeather(previous.weather || "");
    setMessage("Inhalte vom Vortag übernommen. Mitarbeiter und Stunden bleiben vom aktuellen Tag."); setError("");
  }

  async function reopenReport() {
    if (!selectedId || !canManage) return;
    const reason = window.prompt("Warum muss der abgeschlossene Bautagesbericht korrigiert werden?");
    if (!reason?.trim()) return;
    setBusy(true); setError("");
    const { error: updateError } = await supabase.from("daily_site_reports").update({ status: "draft", completed_at: null, completed_by: null, completed_by_name: null, updated_at: new Date().toISOString() }).eq("id", selectedId);
    if (updateError) { setError(updateError.message); setBusy(false); return; }
    await writeAudit(selectedId, "reopened", reason.trim(), { previous_status: "completed", status: "draft" });
    setStatus("draft"); setMessage("Bericht zur Korrektur geöffnet. Die Wiederöffnung wurde protokolliert."); setBusy(false); await load();
  }

  async function showAudit() {
    if (!selectedId) return;
    const { data, error: auditError } = await supabase.from("daily_site_report_audit_log").select("*").eq("report_id", selectedId).order("changed_at", { ascending: false });
    if (auditError) { setError(auditError.message); return; }
    setAuditRows(data || []); setAuditOpen(true);
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

  async function createPdfDocument() {
    if (!projectId) return;
    const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ unit: "pt", format: "a4" }); const autoTable = autoTableModule.default; const brown = PDF_BRAND.brown;
    addPdfHeader(doc, { title: "Bautagesbericht", rightTop: fmtDate(date), subtitle: selectedProject?.name || "Baustelle" });
    autoTable(doc, { startY: 84, theme: "grid", ...brandedTable, body: [["Baustelle", selectedProject?.name || "—", "Datum", fmtDate(date)], ["Adresse", location || "—", "Wetter", weather || "—"], ["Auftraggeber", clientName || "—", "Bauleiter", clientContact || "—"]] });
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 18, theme: "striped", head: [["Mitarbeiter", "Stunden"]], body: employeeItems.map((item) => [item.name, fmtHours(item.hours)]), headStyles: { fillColor: brown } });
    let y = doc.lastAutoTable.finalY + 20; const blocks = [["Ausgeführte Arbeiten", activities], ["Besondere Vorkommnisse / Behinderungen", incidents], ["Lieferungen", deliveries], ["Material / Geräte (optional)", materialsEquipment]];
    for (const [title, text] of blocks) { if (!text) continue; doc.setFontSize(11); doc.text(title, 36, y); autoTable(doc, { startY: y + 7, theme: "grid", body: [[text]], margin: { left: 36, right: 36 }, styles: { fontSize: 9 } }); y = doc.lastAutoTable.finalY + 18; }
    for (let index = 0; index < photos.length; index += 1) { try { const imageData = await photoDataUrl(photos[index].url); const image = doc.getImageProperties(imageData); const scale = Math.min(523 / image.width, 700 / image.height); doc.addPage(); doc.setFontSize(12); doc.text(`Baustellenfoto ${index + 1} · ${photos[index].caption || "Foto"}`, 36, 45); doc.addImage(imageData, image.fileType || "JPEG", 36, 65, image.width * scale, image.height * scale); } catch { /* Einzelnes Foto überspringen. */ } }
    await addPdfWatermarks(doc);
    addPdfFooters(doc, { label: "Bautagesbericht", detail: `${selectedProject?.name || "Baustelle"} | ${fmtDate(date)}` });
    return doc;
  }

  async function exportPdf() {
    const doc = await createPdfDocument(); if (!doc) return;
    doc.save(`Bautagesbericht_${selectedProject?.name || "Projekt"}_${date}.pdf`);
  }

  async function previewPdf() {
    try { const doc = await createPdfDocument(); if (!doc) return; setPdfPreviewUrl(URL.createObjectURL(doc.output("blob"))); }
    catch (e) { setError(e?.message || "PDF-Vorschau konnte nicht erstellt werden."); }
  }

  async function sharePdf(channel = "share") {
    try {
      const doc = await createPdfDocument(); if (!doc) return;
      const fileName = `Bautagesbericht_${selectedProject?.name || "Projekt"}_${date}.pdf`;
      const file = new File([doc.output("blob")], fileName, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `Bautagesbericht ${selectedProject?.name || ""}`, text: `Bautagesbericht vom ${fmtDate(date)}`, files: [file] }); return;
      }
      doc.save(fileName);
      const text = encodeURIComponent(`Bautagesbericht ${selectedProject?.name || ""} vom ${fmtDate(date)}. Die PDF wurde heruntergeladen und kann angehängt werden.`);
      if (channel === "mail") window.location.href = `mailto:?subject=${encodeURIComponent(`Bautagesbericht ${fmtDate(date)}`)}&body=${text}`;
      else if (channel === "whatsapp") window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
      setMessage("PDF heruntergeladen. Bitte im geöffneten Mail- oder WhatsApp-Fenster anhängen.");
    } catch (e) { if (e?.name !== "AbortError") setError(e?.message || "PDF konnte nicht geteilt werden."); }
  }

  const locked = status === "completed";
  return <div className="hbz-container daily-page">
    <div className="daily-head"><div><div className="eyebrow">Tägliche Baustellendokumentation</div><h1>Bautagesberichte</h1><p>Aus Zeiterfassung und Arbeitseinteilung vorbereitet, abends kontrollieren und abschließen.</p></div><div className="daily-date-nav"><button className="hbz-btn" onClick={() => shiftReportDate(-1)} aria-label="Vorheriger Tag">←</button><label>Datum<input className="hbz-input" type="date" value={date} onChange={(e) => { setDate(e.target.value); setProjectId(""); setSelectedId(""); }} /></label><button className="hbz-btn" onClick={() => shiftReportDate(1)} aria-label="Nächster Tag">→</button></div></div>
    {error && <div className="hbz-alert hbz-alert-error">{error}</div>}{message && <div className="hbz-alert hbz-alert-success">{message}</div>}{draftRestored && <div className="daily-draft-note">Automatisch lokal gesichert, bis du den Entwurf speicherst.</div>}
    {canManage && openReports.length > 0 && <div className="hbz-alert daily-reminder"><b>{openReports.length} Bautagesbericht{openReports.length === 1 ? " ist" : "e sind"} noch offen.</b><span>Bitte prüfen und abschließen.</span></div>}
    <section className="hbz-card daily-week"><div className="daily-week-head"><button className="hbz-btn btn-small" onClick={() => shiftReportDate(-7)}>← Woche</button><b>Woche {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}</b><button className="hbz-btn btn-small" onClick={() => shiftReportDate(7)}>Woche →</button></div><div className="daily-week-days">{weekDays.map((day) => { const expected = expectedReports.filter((item) => item.day === day); const completed = reports.filter((r) => String(r.report_date).slice(0, 10) === day && r.status === "completed").length; const drafts = reports.filter((r) => String(r.report_date).slice(0, 10) === day && r.status === "draft").length; const missing = Math.max(0, expected.length - completed - drafts); return <button type="button" key={day} className={`daily-week-day ${day === date ? "active" : ""}`} onClick={() => { setDate(day); setProjectId(""); setSelectedId(""); }}><strong>{new Date(`${day}T12:00:00`).toLocaleDateString("de-AT", { weekday: "short" })}</strong><span>{fmtDate(day)}</span>{!expected.length ? <small className="empty">Keine Baustelle</small> : <small className={missing ? "missing" : drafts ? "draft" : "done"}>{completed} fertig · {drafts} Entwurf{missing ? ` · ${missing} offen` : ""}</small>}</button>; })}</div></section>
    <div className="daily-layout"><aside className="hbz-card daily-list"><b>Baustellen am {fmtDate(date)}</b><div className="daily-filters"><input className="hbz-input" value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Baustelle suchen…" /><select className="hbz-input" value={listStatusFilter} onChange={(e) => setListStatusFilter(e.target.value)}><option value="all">Alle Status</option><option value="open">Offen</option><option value="draft">Entwurf</option><option value="completed">Abgeschlossen</option></select><select className="hbz-input" value={listProjectFilter} onChange={(e) => setListProjectFilter(e.target.value)}><option value="all">Alle Projekte</option>{visibleProjectIds.map((id) => { const project = projects.find((p) => String(p.id) === id); return <option key={id} value={id}>{project?.name || id}</option>; })}</select></div>{!visibleProjectIds.length && <p className="hint">Keine Baustelle in Einteilung oder Zeiterfassung gefunden.</p>}{!!visibleProjectIds.length && !filteredProjectIds.length && <p className="hint">Keine Baustelle passt zum Filter.</p>}{filteredProjectIds.map((id) => { const project = projects.find((p) => String(p.id) === id); const report = dateReports.find((r) => String(r.project_id) === id); return <button type="button" key={id} className="daily-list-item" onClick={() => report ? openReport(report) : prepareProject(id)}><strong>{project?.name || id}</strong><span>{report ? (report.status === "completed" ? "✓ Abgeschlossen" : "Entwurf") : "Offen – noch zu erstellen"}</span></button>; })}</aside>
    <main className="hbz-card daily-form">{!projectId ? <div className="daily-empty"><h2>Baustelle auswählen</h2><p>Links erscheinen automatisch alle Baustellen mit Zeiteinträgen an diesem Tag.</p></div> : <fieldset disabled={locked || busy}><div className="daily-form-head"><h2>{selectedProject?.name}</h2><span className={`regie-status ${locked ? "signed" : "draft"}`}>{locked ? "✓ Abgeschlossen" : "Entwurf"}</span></div><div className="regie-grid"><label>Adresse<input className="hbz-input" value={location} onChange={(e) => setLocation(e.target.value)} /></label><label>Wetter<input className="hbz-input" value={weather} onChange={(e) => setWeather(e.target.value)} /></label><label>Auftraggeber<input className="hbz-input" value={clientName} onChange={(e) => setClientName(e.target.value)} /></label><label>Bauleiter / Kontakt<input className="hbz-input" value={clientContact} onChange={(e) => setClientContact(e.target.value)} /></label></div>
    <section className="regie-section"><h3>Mitarbeiter und Stunden</h3>{employeeItems.map((item) => <div className="daily-employee" key={item.employee_id}><span>{item.name}</span><b>{fmtHours(item.hours)}</b></div>)}</section>
    <label className="regie-block">Ausgeführte Arbeiten<textarea className="hbz-textarea" rows="5" value={activities} onChange={(e) => setActivities(e.target.value)} /></label><label className="regie-block">Besondere Vorkommnisse / Behinderungen (optional)<textarea className="hbz-textarea" rows="3" value={incidents} onChange={(e) => setIncidents(e.target.value)} /></label><label className="regie-block">Lieferungen (optional)<textarea className="hbz-textarea" rows="2" value={deliveries} onChange={(e) => setDeliveries(e.target.value)} /></label><label className="regie-block">Material und Geräte (nur bei Bedarf)<textarea className="hbz-textarea" rows="2" value={materialsEquipment} onChange={(e) => setMaterialsEquipment(e.target.value)} /></label>
    <section className="regie-section"><div className="regie-section-head"><h3>Fotos (optional)</h3><label className="hbz-btn btn-small daily-upload">+ Fotos<input type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} /></label></div>{!!photos.length && <div className="daily-photos">{photos.map((photo) => <figure key={photo.path}><img src={photo.url} alt={photo.caption || "Baustellenfoto"} /><input value={photo.caption || ""} onChange={(e) => setPhotos((rows) => rows.map((item) => item.path === photo.path ? { ...item, caption: e.target.value } : item))} placeholder="Beschreibung" /><button type="button" onClick={() => removePhoto(photo)}>×</button></figure>)}</div>}</section></fieldset>}
    {projectId && <div className="regie-actions">{!locked && <><button className="hbz-btn" onClick={refreshEmployeeItemsFromTimeEntries}>Stunden aktualisieren</button><button className="hbz-btn" onClick={copyPreviousDay}>Vortag kopieren</button><button className="hbz-btn" onClick={() => save("draft")}>Entwurf speichern</button><button className="hbz-btn hbz-btn-primary" onClick={() => save("completed")}>Bautagesbericht abschließen</button></>}{locked && canManage && <button className="hbz-btn" onClick={reopenReport}>Mit Begründung korrigieren</button>}{selectedId && canManage && <button className="hbz-btn" onClick={showAudit}>Änderungsverlauf</button>}<button className="hbz-btn" onClick={previewPdf}>PDF-Vorschau</button><button className="hbz-btn" onClick={exportPdf}>PDF laden</button><button className="hbz-btn" onClick={() => sharePdf("mail")}>Per E-Mail</button><button className="hbz-btn" onClick={() => sharePdf("whatsapp")}>Per WhatsApp</button></div>}</main></div>
    {pdfPreviewUrl && <div className="daily-modal" role="dialog" aria-modal="true"><div className="daily-pdf"><div><b>PDF-Vorschau</b><button className="hbz-btn btn-small" onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(""); }}>Schließen</button></div><iframe title="PDF-Vorschau Bautagesbericht" src={pdfPreviewUrl} /></div></div>}
    {auditOpen && <div className="daily-modal" role="dialog" aria-modal="true"><div className="daily-audit"><div className="daily-modal-head"><b>Änderungsverlauf</b><button className="hbz-btn btn-small" onClick={() => setAuditOpen(false)}>Schließen</button></div>{!auditRows.length ? <p>Keine Änderungen protokolliert.</p> : auditRows.map((row) => <article key={row.id}><b>{new Date(row.changed_at).toLocaleString("de-AT")} · {row.changed_by_name || row.changed_by || "Unbekannt"}</b><span>{row.action}{row.reason ? ` – ${row.reason}` : ""}</span></article>)}</div></div>}
    <style>{`.daily-head{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:16px}.daily-head h1{margin:2px 0}.daily-head p{margin:0;color:#6f6259}.daily-date-nav{display:flex;align-items:end;gap:7px}.daily-draft-note{font-size:12px;color:#39734a;margin:-6px 0 10px}.daily-reminder{display:flex;justify-content:space-between;background:#fff1cd;border-color:#e8bf59;color:#654800}.daily-week{margin-bottom:16px}.daily-week-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.daily-week-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px}.daily-week-day{border:1px solid #eadfd7;border-radius:9px;background:#fff;padding:8px;display:grid;gap:3px;text-align:left;cursor:pointer}.daily-week-day.active{border-color:#7b4a2d;box-shadow:0 0 0 2px #ead8cc}.daily-week-day span,.daily-week-day small{font-size:11px}.daily-week-day .done{color:#28743a}.daily-week-day .draft{color:#9b6600}.daily-week-day .missing{color:#a12626;font-weight:700}.daily-week-day .empty{color:#8a817b}.daily-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px}.daily-list{align-self:start}.daily-filters{display:grid;gap:7px;margin-top:10px}.daily-list-item{display:flex;flex-direction:column;width:100%;text-align:left;gap:4px;margin-top:8px;padding:10px;border:1px solid #eadfd7;border-radius:9px;background:#fff;cursor:pointer}.daily-list-item span{font-size:12px;color:#6f6259}.daily-form fieldset{border:0;padding:0;margin:0}.daily-form-head{display:flex;justify-content:space-between;align-items:center}.daily-form-head h2{margin:0}.daily-empty{text-align:center;padding:60px 15px}.daily-employee{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:8px}.daily-upload{display:inline-flex!important;flex-direction:row!important}.daily-upload input{display:none}.daily-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}.daily-photos figure{position:relative;margin:0}.daily-photos img{width:100%;height:120px;object-fit:cover;border-radius:8px}.daily-photos input{width:100%;box-sizing:border-box}.daily-photos button{position:absolute;right:4px;top:4px;border:0;border-radius:50%;background:#9f2f24;color:#fff;width:28px;height:28px}.daily-modal{position:fixed;inset:0;z-index:1600;background:#0009;display:flex;align-items:center;justify-content:center;padding:20px}.daily-pdf,.daily-audit{width:min(1000px,100%);height:min(90vh,850px);background:#fff;border-radius:12px;padding:12px;box-sizing:border-box}.daily-pdf>div,.daily-modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.daily-pdf iframe{width:100%;height:calc(100% - 44px);border:0}.daily-audit{height:auto;max-height:85vh;overflow:auto;max-width:760px}.daily-audit article{display:grid;gap:4px;padding:10px 0;border-bottom:1px solid #eadfd7}.daily-audit span{color:#6f6259}@media(max-width:800px){.daily-head{align-items:stretch;flex-direction:column}.daily-date-nav{align-items:end}.daily-date-nav label{flex:1}.daily-week-days{display:flex;overflow:auto;padding-bottom:3px}.daily-week-day{min-width:118px}.daily-layout{grid-template-columns:1fr}.daily-list{max-height:300px;overflow:auto}.daily-form{padding:13px}.daily-form-head{align-items:flex-start;gap:8px;flex-wrap:wrap}.daily-reminder{display:grid}.daily-upload{width:100%;justify-content:center;min-height:44px}.daily-photos{grid-template-columns:repeat(2,minmax(0,1fr))}.daily-pdf{height:95dvh;padding:7px;border-radius:10px}.daily-modal{padding:8px}.daily-page .regie-actions{position:sticky;bottom:6px;z-index:35;background:rgba(248,244,240,.96);padding:9px calc(9px + env(safe-area-inset-right)) calc(9px + env(safe-area-inset-bottom)) calc(9px + env(safe-area-inset-left));border-radius:12px;box-shadow:0 -8px 24px rgba(70,43,29,.12);max-height:42vh;overflow:auto}.daily-page .regie-actions .hbz-btn{min-height:44px;flex:1 1 150px}.daily-page textarea{font-size:16px}}@media(max-width:430px){.daily-date-nav{display:grid;grid-template-columns:44px 1fr 44px}.daily-photos{grid-template-columns:1fr}.daily-employee{align-items:flex-start;gap:8px;flex-direction:column}.daily-page .regie-actions .hbz-btn{flex-basis:100%}}`}</style>
  </div>;
}
