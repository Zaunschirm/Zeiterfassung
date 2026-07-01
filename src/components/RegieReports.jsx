import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { filterVisibleEmployeesForRole } from "../utils/employeeVisibility";
import { uploadProjectPhoto } from "../utils/uploadProjectPhoto";
import {
  cleanLaborItems,
  cleanMaterialItems,
  createReportNumber,
  prepareLaborItems,
  prepareMaterialItems,
  sumLaborHours,
} from "../utils/regieReports";

const todayISO = () => new Date().toISOString().slice(0, 10);
const emptyMaterial = () => ({ description: "", quantity: 1, unit: "Stk." });
const fmtDate = (value) => {
  const [y, m, d] = String(value || "").slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : "—";
};
const fmtHours = (value) => `${Number(value || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;

function SignaturePad({ value, onChange, disabled }) {
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const drawingRef = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  function prepare(ref) {
    const canvas = ref.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(Math.round(rect.width * ratio), 1);
    const height = Math.max(Math.round(rect.height * ratio), 1);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "#2d241f";
    }
    return canvas;
  }

  function drawValue(ref, imageValue) {
    const canvas = prepare(ref);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!imageValue) return;
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = imageValue;
  }

  useEffect(() => { drawValue(previewRef, value); }, [value]);
  useEffect(() => {
    if (!expanded) return undefined;
    const frame = window.requestAnimationFrame(() => drawValue(editorRef, draft));
    const closeOnEscape = (event) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("keydown", closeOnEscape); };
  }, [expanded]);

  const point = (event, ref) => {
    const rect = ref.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function start(event) {
    event.preventDefault();
    const canvas = prepare(editorRef);
    const ctx = canvas.getContext("2d");
    const p = point(event, editorRef);
    drawingRef.current = true;
    canvas.setPointerCapture?.(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const p = point(event, editorRef);
    const ctx = editorRef.current.getContext("2d");
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDraft(editorRef.current.toDataURL("image/png"));
  }
  function clear() {
    const canvas = prepare(editorRef);
    const rect = canvas.getBoundingClientRect();
    canvas.getContext("2d").clearRect(0, 0, rect.width, rect.height);
    setDraft("");
  }
  function openEditor() {
    if (disabled) return;
    setDraft(value || "");
    setExpanded(true);
  }
  function apply() {
    onChange?.(draft);
    setExpanded(false);
  }

  return (
    <div className="regie-signature">
      <button type="button" className="regie-signature-preview" onClick={openEditor} disabled={disabled} aria-label={disabled ? "Unterschrift Auftraggeber" : "Großes Unterschriftsfeld öffnen"}>
        <canvas ref={previewRef} className="regie-signature-canvas" />
        {!value && !disabled && <span>Zum Unterschreiben antippen</span>}
      </button>
      {expanded && <div className="regie-signature-overlay" role="dialog" aria-modal="true" aria-label="Unterschrift erfassen">
        <div className="regie-signature-modal">
          <div className="regie-signature-head"><div><strong>Unterschrift Auftraggeber</strong><small>Bitte im großen Feld unterschreiben.</small></div><button type="button" className="hbz-btn btn-small" onClick={() => setExpanded(false)}>Abbrechen</button></div>
          <canvas ref={editorRef} className="regie-signature-editor" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="Großes Unterschriftsfeld" />
          <div className="regie-signature-actions"><button type="button" className="hbz-btn" onClick={clear}>Löschen</button><button type="button" className="hbz-btn hbz-btn-primary" onClick={apply}>Unterschrift übernehmen</button></div>
        </div>
      </div>}
    </div>
  );
}

export default function RegieReports() {
  const session = getSession()?.user || {};
  const role = String(session?.role || "mitarbeiter").toLowerCase();
  const canPrepare = role === "admin" || role === "teamleiter";
  const ownId = String(session?.id || "");

  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [reportNumber, setReportNumber] = useState(() => createReportNumber());
  const [reportDate, setReportDate] = useState(todayISO());
  const [projectId, setProjectId] = useState("");
  const [location, setLocation] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [description, setDescription] = useState("");
  const [laborItems, setLaborItems] = useState([]);
  const [materialItems, setMaterialItems] = useState([emptyMaterial()]);
  const [photos, setPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState([]);
  const [signedBy, setSignedBy] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [status, setStatus] = useState("draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");

  const selectedProject = useMemo(() => projects.find((p) => String(p.id) === String(projectId)), [projects, projectId]);
  const locked = status === "signed";
  const visibleReports = useMemo(() => {
    if (canPrepare) return reports;
    return reports.filter((report) => {
      const assigned = Array.isArray(report.assigned_employee_ids) ? report.assigned_employee_ids.map(String) : [];
      return report.status !== "draft" && assigned.includes(ownId);
    });
  }, [reports, canPrepare, ownId]);

  async function loadData() {
    setError("");
    try {
      const [projectResult, employeeResult, reportResult] = await Promise.all([
        supabase.from("projects").select("*").eq("active", true).order("name"),
        supabase.from("employees").select("id, code, name, active, disabled, is_test_employee").order("name"),
        supabase.from("regie_reports").select("*").order("report_date", { ascending: false }).order("created_at", { ascending: false }).limit(100),
      ]);
      if (projectResult.error) throw projectResult.error;
      if (employeeResult.error) throw employeeResult.error;
      if (reportResult.error) throw reportResult.error;
      setProjects(projectResult.data || []);
      setEmployees(filterVisibleEmployeesForRole(employeeResult.data || [], role, session).filter((e) => e.active !== false && e.disabled !== true));
      setReports(reportResult.data || []);
    } catch (e) {
      setError(e?.message || "Regieberichte konnten nicht geladen werden.");
    }
  }
  useEffect(() => { loadData(); }, []);
  useEffect(() => () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
  }, [pdfPreviewUrl]);

  function resetReport() {
    setSelectedId(""); setReportNumber(createReportNumber()); setReportDate(todayISO()); setProjectId("");
    setLocation(""); setClientName(""); setClientContact(""); setDescription(""); setLaborItems([]);
    setMaterialItems([emptyMaterial()]); setPhotos([]); setAssignedEmployeeIds([]); setSignedBy(""); setSignatureData("");
    setSignedAt(""); setStatus("draft"); setError(""); setMessage("");
  }
  function openReport(report) {
    setSelectedId(report.id); setReportNumber(report.report_number); setReportDate(report.report_date);
    setProjectId(report.project_id || ""); setLocation(report.location || ""); setClientName(report.client_name || "");
    setClientContact(report.client_contact || ""); setDescription(report.description || "");
    setLaborItems(Array.isArray(report.labor_items) ? report.labor_items : []);
    setMaterialItems(Array.isArray(report.material_items) && report.material_items.length ? report.material_items : [emptyMaterial()]);
    setPhotos((Array.isArray(report.photo_paths) ? report.photo_paths : []).map((photo) => {
      const path = typeof photo === "string" ? photo : photo.path;
      const { data } = supabase.storage.from("project-photos").getPublicUrl(path);
      return { path, name: typeof photo === "string" ? "Foto" : (photo.name || "Foto"), url: data?.publicUrl || "" };
    }));
    setAssignedEmployeeIds(Array.isArray(report.assigned_employee_ids) ? report.assigned_employee_ids.map(String) : []);
    setSignedBy(report.signed_by || ""); setSignatureData(report.signature_data || ""); setSignedAt(report.signed_at || "");
    setStatus(report.status || "draft"); setError(""); setMessage("");
  }
  function setLaborEmployee(index, employeeId) {
    const employee = employees.find((e) => String(e.id) === String(employeeId));
    setLaborItems((rows) => rows.map((row, i) => i === index ? { ...row, employee_id: employeeId, name: employee?.name || "" } : row));
  }
  function toggleAssignment(employeeId) {
    const id = String(employeeId);
    setAssignedEmployeeIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  }
  function addAssignedEmployeesToLabor() {
    setLaborItems((rows) => {
      const known = new Set(rows.map((row) => String(row.employee_id || "")));
      const additions = assignedEmployeeIds.filter((id) => !known.has(id)).map((id) => {
        const employee = employees.find((item) => String(item.id) === id);
        return { employee_id: id, name: employee?.name || "", hours: 0, activity: "" };
      });
      return [...rows, ...additions];
    });
  }

  function startDescriptionVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Spracherkennung wird von diesem Browser nicht unterstützt. Am iPhone bitte die Diktierfunktion der Tastatur verwenden.");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "de-AT";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setVoiceListening(true);
      recognition.onerror = () => setVoiceListening(false);
      recognition.onend = () => setVoiceListening(false);
      recognition.onresult = (event) => {
        const text = Array.from(event.results || []).map((result) => result?.[0]?.transcript || "").join(" ").trim();
        if (text) setDescription((old) => old.trim() ? `${old.trim()}\n${text}` : text);
      };
      recognition.start();
    } catch (e) {
      console.error("[RegieReports] speech recognition", e);
      setVoiceListening(false);
      alert("Spracherkennung konnte nicht gestartet werden.");
    }
  }

  async function addPhotos(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (!projectId) { setError("Bitte zuerst ein Projekt auswählen."); return; }
    if (photos.length + files.length > 8) { setError("Pro Regiebericht sind maximal 8 Fotos möglich."); return; }
    const invalid = files.find((file) => !String(file.type || "").startsWith("image/") || file.size > 8 * 1024 * 1024);
    if (invalid) { setError("Bitte nur Bilder bis maximal 8 MB auswählen."); return; }
    setPhotoBusy(true); setError("");
    try {
      const uploaded = [];
      for (const file of files) {
        const path = await uploadProjectPhoto({ file, projectId, projectCode: selectedProject?.code, employeeId: session?.id, caption: `Regiebericht ${reportNumber}` });
        const { data } = supabase.storage.from("project-photos").getPublicUrl(path);
        uploaded.push({ path, name: file.name || "Foto", url: data?.publicUrl || "" });
      }
      setPhotos((old) => [...old, ...uploaded]);
      setMessage(`${uploaded.length} Foto${uploaded.length === 1 ? "" : "s"} hinzugefügt.`);
    } catch (e) {
      setError(e?.message || "Foto konnte nicht hochgeladen werden.");
    } finally { setPhotoBusy(false); }
  }

  async function removePhoto(photo) {
    if (!photo?.path || locked) return;
    setPhotoBusy(true); setError("");
    try {
      const { error: storageError } = await supabase.storage.from("project-photos").remove([photo.path]);
      if (storageError) throw storageError;
      await supabase.from("project_photos").delete().eq("file_path", photo.path);
      setPhotos((old) => old.filter((item) => item.path !== photo.path));
    } catch (e) {
      setError(e?.message || "Foto konnte nicht entfernt werden.");
    } finally { setPhotoBusy(false); }
  }

  async function photoDataUrl(photo) {
    const response = await fetch(photo.url);
    if (!response.ok) throw new Error("Foto konnte für PDF nicht geladen werden.");
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function makePayload(nextStatus) {
    const final = nextStatus === "signed";
    return {
      report_number: reportNumber,
      report_date: reportDate,
      project_id: projectId || null,
      project_name: selectedProject?.name || null,
      location: location.trim() || selectedProject?.address || null,
      client_name: clientName.trim() || null,
      client_contact: clientContact.trim() || null,
      description: description.trim(),
      labor_items: final ? cleanLaborItems(laborItems) : prepareLaborItems(laborItems),
      material_items: final ? cleanMaterialItems(materialItems) : prepareMaterialItems(materialItems),
      photo_paths: photos.map(({ path, name }) => ({ path, name })),
      assigned_employee_ids: assignedEmployeeIds,
      status: nextStatus,
      signed_by: final ? signedBy.trim() : null,
      signature_data: final ? signatureData : null,
      signed_at: final ? new Date().toISOString() : null,
      prepared_at: nextStatus === "prepared" ? new Date().toISOString() : null,
      prepared_by: nextStatus === "prepared" ? String(session?.id || session?.code || "") : null,
      created_by: String(session?.id || session?.code || ""),
      created_by_name: session?.name || session?.code || null,
      updated_at: new Date().toISOString(),
    };
  }
  function validate(nextStatus) {
    if (!reportDate || !projectId) return "Bitte Datum und Projekt ausfüllen.";
    if (nextStatus === "prepared") {
      if (!description.trim()) return "Bitte den Arbeitsauftrag ausfüllen.";
      if (!clientName.trim()) return "Bitte den Auftraggeber eintragen.";
      if (!assignedEmployeeIds.length) return "Bitte mindestens einen Mitarbeiter zuweisen.";
      if (!prepareLaborItems(laborItems).length) return "Bitte die zugewiesenen Mitarbeiter in die Stundenliste übernehmen.";
    }
    if (nextStatus === "signed") {
      if (!description.trim()) return "Bitte die ausgeführten Arbeiten beschreiben.";
      if (!cleanLaborItems(laborItems).length) return "Bitte mindestens einen Mitarbeiter mit Stunden eintragen.";
      if (!clientName.trim() || !signedBy.trim() || !signatureData) return "Auftraggeber, Unterzeichner und Unterschrift werden benötigt.";
    }
    return "";
  }
  async function save(nextStatus) {
    const problem = validate(nextStatus);
    if (problem) { setError(problem); return null; }
    if (locked) return selectedId;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = selectedId
        ? await supabase.from("regie_reports").update(makePayload(nextStatus)).eq("id", selectedId).select().single()
        : await supabase.from("regie_reports").insert(makePayload(nextStatus)).select().single();
      if (result.error) throw result.error;
      setSelectedId(result.data.id); setStatus(nextStatus); setSignedAt(result.data.signed_at || "");
      setMessage(nextStatus === "signed" ? "Regiebericht unterschrieben und abgeschlossen." : nextStatus === "prepared" ? "Auftrag wurde für den Mitarbeiter vorbereitet." : "Entwurf gespeichert.");
      await loadData();
      return result.data.id;
    } catch (e) {
      setError(e?.message || "Regiebericht konnte nicht gespeichert werden.");
      return null;
    } finally { setBusy(false); }
  }

  async function createPdfDocument() {
    const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const autoTable = autoTableModule.default;
    const brown = [123, 74, 45];
    doc.setFillColor(...brown); doc.rect(0, 0, 595, 62, "F"); doc.setTextColor(255); doc.setFontSize(20);
    doc.text("Regiebericht", 36, 30); doc.setFontSize(10); doc.text(reportNumber, 36, 48); doc.setTextColor(40);
    autoTable(doc, { startY: 80, theme: "grid", styles: { fontSize: 9, cellPadding: 5 }, body: [["Datum", fmtDate(reportDate), "Projekt", selectedProject?.name || "—"], ["Ort", location || selectedProject?.address || "—", "Auftraggeber", clientName || "—"], ["Kontakt", clientContact || "—", "Erstellt von", session?.name || session?.code || "—"]] });
    let y = doc.lastAutoTable.finalY + 22;
    doc.setFontSize(12); doc.text("Ausgeführte Arbeiten", 36, y);
    autoTable(doc, { startY: y + 10, theme: "grid", styles: { fontSize: 9, cellPadding: 6 }, body: [[description]], margin: { left: 36, right: 36 } });
    y = doc.lastAutoTable.finalY + 20;
    autoTable(doc, { startY: y, theme: "striped", head: [["Mitarbeiter", "Stunden", "Tätigkeit"]], body: prepareLaborItems(laborItems).map((row) => [row.name, fmtHours(row.hours), row.activity || "—"]), headStyles: { fillColor: brown }, styles: { fontSize: 9 } });
    y = doc.lastAutoTable.finalY + 18;
    const materials = prepareMaterialItems(materialItems);
    if (materials.length) {
      autoTable(doc, { startY: y, theme: "striped", head: [["Material / Gerät", "Menge", "Einheit"]], body: materials.map((row) => [row.description, row.quantity.toLocaleString("de-AT"), row.unit]), headStyles: { fillColor: brown }, styles: { fontSize: 9 } });
      y = doc.lastAutoTable.finalY + 20;
    }
    if (signatureData) {
      if (y > 630) { doc.addPage(); y = 50; }
      const signedLabel = signedAt ? new Date(signedAt).toLocaleString("de-AT") : "Zeitpunkt nicht verfügbar";
      doc.setFontSize(11); doc.text(`Bestätigt durch: ${signedBy || clientName || "—"}`, 36, y);
      doc.setFontSize(8.5); doc.text(`Leistungen, Stunden und Materialien bestätigt. Unterschrieben am ${signedLabel}.`, 36, y + 15);
      doc.addImage(signatureData, "PNG", 36, y + 24, 210, 85); doc.line(36, y + 114, 260, y + 114);
      doc.setFontSize(8); doc.text("Unterschrift Auftraggeber", 36, y + 127);
    } else {
      doc.setFontSize(10); doc.text(status === "prepared" ? "Vorbereiteter Arbeitsauftrag - noch nicht unterschrieben" : "Noch nicht unterschriebener Entwurf", 36, y);
    }
    doc.setFontSize(8); doc.text(`Gesamtstunden: ${fmtHours(sumLaborHours(laborItems))}`, 559, 810, { align: "right" });
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      try {
        const imageData = await photoDataUrl(photo);
        const image = doc.getImageProperties(imageData);
        const maxWidth = 523;
        const maxHeight = 700;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        doc.addPage();
        doc.setFontSize(13); doc.text(`Baustellenfoto ${index + 1} von ${photos.length}`, 36, 42);
        doc.setFontSize(8); doc.text(photo.name || "Foto", 36, 57);
        doc.addImage(imageData, image.fileType || "JPEG", 36 + (maxWidth - width) / 2, 74, width, height);
      } catch {
        // Ein einzelnes nicht erreichbares Foto soll die PDF-Erstellung nicht verhindern.
      }
    }
    return doc;
  }

  function validatePdf() {
    const problem = validate(status === "signed" ? "signed" : "draft");
    if (problem) setError(problem);
    return !problem;
  }

  async function exportPdf() {
    if (!validatePdf()) return;
    const doc = await createPdfDocument();
    doc.save(`Regiebericht_${reportNumber}.pdf`);
  }

  async function previewPdf() {
    if (!validatePdf()) return;
    try {
      const doc = await createPdfDocument();
      const url = URL.createObjectURL(doc.output("blob"));
      setPdfPreviewUrl(url);
    } catch (e) {
      setError(e?.message || "PDF-Vorschau konnte nicht erstellt werden.");
    }
  }

  async function sharePdf() {
    if (!validatePdf()) return;
    try {
      const doc = await createPdfDocument();
      const fileName = `Regiebericht_${reportNumber}.pdf`;
      const file = new File([doc.output("blob")], fileName, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `Regiebericht ${reportNumber}`, text: `Regiebericht ${reportNumber}`, files: [file] });
        return;
      }
      doc.save(fileName);
      setMessage("Die PDF wurde heruntergeladen. Du kannst sie nun in Mail oder WhatsApp anhängen.");
    } catch (e) {
      if (e?.name !== "AbortError") setError(e?.message || "PDF konnte nicht geteilt werden.");
    }
  }

  const statusLabel = status === "signed" ? "✓ Unterschrieben" : status === "prepared" ? "Für Mitarbeiter bereit" : "Entwurf";
  const hasOpenReport = canPrepare || !!selectedId;

  return (
    <div className="hbz-container regie-page">
      <div className="regie-header">
        <div><div className="eyebrow">Baustellendokumentation</div><h1>Regieberichte</h1><p>{canPrepare ? "Arbeitsauftrag am Desktop vorbereiten und einem Mitarbeiter zuweisen." : "Vorbereiteten Auftrag öffnen, Stunden und Material ergänzen und unterschreiben lassen."}</p></div>
        {canPrepare && <button className="hbz-btn hbz-btn-primary" onClick={resetReport}>+ Neuer Auftrag</button>}
      </div>
      {error && <div className="hbz-alert hbz-alert-error">{error}</div>}
      {message && <div className="hbz-alert hbz-alert-success">{message}</div>}
      <div className="regie-layout">
        <aside className="hbz-card regie-list">
          <div className="month-card-title">{canPrepare ? "Regieberichte" : "Meine Aufträge"}</div>
          {!visibleReports.length && <p className="hint">{canPrepare ? "Noch keine Regieberichte vorhanden." : "Derzeit ist dir kein Regieauftrag zugewiesen."}</p>}
          {visibleReports.map((report) => (
            <button type="button" key={report.id} className={`regie-list-item ${String(selectedId) === String(report.id) ? "active" : ""}`} onClick={() => openReport(report)}>
              <b>{report.report_number}</b><span>{fmtDate(report.report_date)} · {report.project_name || "Ohne Projekt"}</span>
              <small className={report.status}>{report.status === "signed" ? "Unterschrieben" : report.status === "prepared" ? "Bereit" : "Entwurf"}</small>
            </button>
          ))}
        </aside>

        {hasOpenReport ? (
          <main className="hbz-card regie-form">
            <div className="regie-form-head"><div><div className="eyebrow">{locked ? "Abgeschlossen" : canPrepare ? "Desktop-Vorbereitung" : "Handy-Erfassung"}</div><h2>{reportNumber}</h2></div><span className={`regie-status ${status}`}>{statusLabel}</span></div>

            <fieldset disabled={locked || busy}>
              <div className="regie-grid">
                <label>Datum<input className="hbz-input" disabled={!canPrepare} type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></label>
                <label>Projekt / Baustelle<select className="hbz-input" disabled={!canPrepare} value={projectId} onChange={(e) => { setProjectId(e.target.value); const project = projects.find((item) => String(item.id) === String(e.target.value)); if (!location && project?.address) setLocation(project.address); }}><option value="">Bitte auswählen</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                <label>Ort / Baustellenadresse<input className="hbz-input" disabled={!canPrepare} value={location} onChange={(e) => setLocation(e.target.value)} /></label>
                <label>Auftraggeber (Firma/Name)<input className="hbz-input" disabled={!canPrepare} value={clientName} onChange={(e) => setClientName(e.target.value)} /></label>
                <label>Kontakt / Bauleiter<input className="hbz-input" disabled={!canPrepare} value={clientContact} onChange={(e) => setClientContact(e.target.value)} /></label>
              </div>
              <label className="regie-block">{canPrepare ? "Arbeitsauftrag / auszuführende Arbeiten" : "Beschreibung der ausgeführten Arbeiten"}<textarea className="hbz-textarea" rows="5" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Arbeiten diktieren oder korrigieren…" /></label>
              <button type="button" className={`hbz-btn regie-voice ${voiceListening ? "listening" : ""}`} onClick={startDescriptionVoice} disabled={voiceListening}>
                {voiceListening ? "🎙 Aufnahme läuft …" : "🎙 Beschreibung diktieren"}
              </button>

              {canPrepare && <section className="regie-section">
                <div className="regie-section-head"><h3>Mitarbeiter zuweisen</h3><button type="button" className="hbz-btn btn-small" onClick={addAssignedEmployeesToLabor}>In Stundenliste übernehmen</button></div>
                <div className="regie-assignment-grid">{employees.map((employee) => <label className="regie-assignment" key={employee.id}><input type="checkbox" checked={assignedEmployeeIds.includes(String(employee.id))} onChange={() => toggleAssignment(employee.id)} />{employee.name}</label>)}</div>
              </section>}
            </fieldset>

            <fieldset disabled={locked || busy}>
              <section className="regie-section">
                <div className="regie-section-head"><h3>Mitarbeiter und Stunden</h3>{canPrepare && <button type="button" className="hbz-btn btn-small" onClick={() => setLaborItems((rows) => [...rows, { employee_id: "", name: "", hours: 0, activity: "" }])}>+ Mitarbeiter</button>}</div>
                {laborItems.map((row, index) => <div className="regie-row labor" key={index}><select className="hbz-input" disabled={!canPrepare} value={row.employee_id || ""} onChange={(e) => setLaborEmployee(index, e.target.value)}><option value="">Mitarbeiter</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select><input className="hbz-input" type="number" min="0" step="0.25" value={row.hours} onChange={(e) => setLaborItems((rows) => rows.map((item, i) => i === index ? { ...item, hours: e.target.value } : item))} placeholder="Std." /><input className="hbz-input" disabled={!canPrepare} value={row.activity || ""} onChange={(e) => setLaborItems((rows) => rows.map((item, i) => i === index ? { ...item, activity: e.target.value } : item))} placeholder="Tätigkeit" />{canPrepare && <button type="button" className="regie-remove" onClick={() => setLaborItems((rows) => rows.filter((_, i) => i !== index))}>×</button>}</div>)}
                <div className="regie-total">Gesamt: {fmtHours(sumLaborHours(laborItems))}</div>
              </section>

              <section className="regie-section">
                <div className="regie-section-head"><h3>Material und Geräte</h3><button type="button" className="hbz-btn btn-small" onClick={() => setMaterialItems((rows) => [...rows, emptyMaterial()])}>+ Position</button></div>
                {materialItems.map((row, index) => <div className="regie-row material" key={index}><input className="hbz-input" value={row.description} onChange={(e) => setMaterialItems((rows) => rows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} placeholder="Material / Gerät" /><input className="hbz-input" type="number" min="0" step="0.01" value={row.quantity} onChange={(e) => setMaterialItems((rows) => rows.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} /><select className="hbz-input" value={row.unit} onChange={(e) => setMaterialItems((rows) => rows.map((item, i) => i === index ? { ...item, unit: e.target.value } : item))}><option>Stk.</option><option>m</option><option>m²</option><option>m³</option><option>kg</option><option>Std.</option><option>pauschal</option></select><button type="button" className="regie-remove" onClick={() => setMaterialItems((rows) => rows.filter((_, i) => i !== index))}>×</button></div>)}
              </section>

              <section className="regie-section">
                <div className="regie-section-head"><div><h3>Baustellenfotos</h3><p className="hint">Bis zu 8 Fotos, jeweils maximal 8 MB.</p></div><label className="hbz-btn btn-small regie-photo-upload">+ Fotos hinzufügen<input type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} /></label></div>
                {photoBusy && <p className="hint">Fotos werden hochgeladen …</p>}
                {!!photos.length && <div className="regie-photo-grid">{photos.map((photo) => <figure key={photo.path}><img src={photo.url} alt={photo.name || "Baustellenfoto"} /><figcaption>{photo.name || "Foto"}</figcaption>{!locked && <button type="button" aria-label="Foto entfernen" onClick={() => removePhoto(photo)}>×</button>}</figure>)}</div>}
              </section>

              <section className="regie-section signature">
                <h3>Bestätigung durch den Auftraggeber</h3>
                <label>Name des Unterzeichners<input className="hbz-input" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Vor- und Nachname" /></label>
                <p className="hint">Bitte direkt im Feld mit Finger oder Stift unterschreiben.</p>
                <SignaturePad value={signatureData} onChange={setSignatureData} disabled={locked} />
              </section>
            </fieldset>

            <div className="regie-actions">
              {!locked && canPrepare && <><button className="hbz-btn" disabled={busy} onClick={() => save("draft")}>Entwurf speichern</button><button className="hbz-btn hbz-btn-primary" disabled={busy} onClick={() => save("prepared")}>Für Mitarbeiter bereitstellen</button></>}
              {!locked && !canPrepare && <button className="hbz-btn hbz-btn-primary" disabled={busy || status !== "prepared"} onClick={() => save("signed")}>Unterschreiben & abschließen</button>}
              <button className="hbz-btn" onClick={previewPdf}>PDF-Vorschau</button>
              <button className="hbz-btn" onClick={exportPdf}>PDF herunterladen</button>
              <button className="hbz-btn" onClick={sharePdf}>PDF teilen</button>
            </div>
          </main>
        ) : <main className="hbz-card regie-empty"><h2>Kein offener Regieauftrag</h2><p>Sobald dir am Desktop ein Auftrag zugewiesen wurde, erscheint er hier automatisch.</p></main>}
      </div>

      {pdfPreviewUrl && <div className="regie-pdf-overlay" role="dialog" aria-modal="true" aria-label="PDF-Vorschau">
        <div className="regie-pdf-modal">
          <div className="regie-pdf-head"><strong>PDF-Vorschau · {reportNumber}</strong><button type="button" className="hbz-btn btn-small" onClick={() => setPdfPreviewUrl("")}>Schließen</button></div>
          <iframe src={pdfPreviewUrl} title={`PDF-Vorschau ${reportNumber}`} />
        </div>
      </div>}

      <style>{`
        .regie-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:16px}.regie-header h1{margin:2px 0 4px}.regie-header p{margin:0;color:#6f6259}.regie-layout{display:grid;grid-template-columns:280px minmax(0,1fr));gap:16px}.regie-list{align-self:start;position:sticky;top:82px}.regie-list-item{display:flex;width:100%;flex-direction:column;align-items:flex-start;gap:3px;border:1px solid #eadfd7;background:#fff;padding:10px;margin-top:8px;border-radius:9px;text-align:left;cursor:pointer}.regie-list-item.active{border-color:#7b4a2d;background:#fff8f2}.regie-list-item span{font-size:12px;color:#6f6259}.regie-list-item small{font-weight:800}.regie-list-item small.signed{color:#28723d}.regie-list-item small.prepared{color:#1f6592}.regie-list-item small.draft{color:#9a6812}.regie-form-head,.regie-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.regie-form-head h2{margin:2px 0 12px;font-size:20px}.regie-status{padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900}.regie-status.signed{background:#e7f6eb;color:#246a36}.regie-status.prepared{background:#e9f4fb;color:#1f6592}.regie-status.draft{background:#fff3d7;color:#875b00}.regie-form fieldset{border:0;padding:0;margin:0;min-width:0}.regie-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.regie-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:800;color:#5a3a23}.regie-block{margin-top:14px}.regie-section{border-top:1px solid #eadfd7;margin-top:18px;padding-top:16px}.regie-section h3{margin:0 0 10px}.regie-assignment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.regie-assignment{flex-direction:row!important;align-items:center;padding:8px;border:1px solid #eadfd7;border-radius:8px;background:#fff}.regie-row{display:grid;gap:8px;margin-top:8px;align-items:center}.regie-row.labor{grid-template-columns:1.1fr 90px 1.5fr 34px}.regie-row.material{grid-template-columns:1.6fr 90px 100px 34px}.regie-remove{border:0;background:#fff0ed;color:#a23a2c;border-radius:8px;height:38px;font-size:22px;cursor:pointer}.regie-total{text-align:right;margin-top:10px;font-weight:900}.regie-signature-canvas{display:block;width:100%;height:180px;background:#fff;border:2px dashed #bda99a;border-radius:10px;pointer-events:none}.regie-signature-preview{position:relative;display:block;width:100%;padding:0;border:0;background:transparent;cursor:pointer}.regie-signature-preview:disabled{cursor:default}.regie-signature-preview span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#765f50;font-weight:800}.regie-signature-overlay{position:fixed;inset:0;z-index:1900;padding:18px;background:rgba(30,24,20,.78);display:flex;align-items:center;justify-content:center}.regie-signature-modal{width:min(1000px,100%);height:min(720px,calc(100vh - 36px));padding:14px;background:#f8f4f0;border-radius:14px;display:flex;flex-direction:column;gap:12px;box-shadow:0 24px 70px rgba(0,0,0,.4)}.regie-signature-head,.regie-signature-actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.regie-signature-head div{display:flex;flex-direction:column;gap:2px}.regie-signature-head small{color:#75675d}.regie-signature-editor{display:block;width:100%;min-height:260px;flex:1;background:#fff;border:3px solid #7b4a2d;border-radius:12px;touch-action:none}.regie-signature-actions{justify-content:flex-end}.regie-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:18px}.regie-empty{text-align:center;padding:40px 20px}
        .regie-voice{margin-top:8px}.regie-voice.listening{background:#fff0ed;color:#9b3024}.regie-section-head .hint{margin:0}.regie-photo-upload{display:inline-flex!important;flex-direction:row!important;cursor:pointer}.regie-photo-upload input{display:none}.regie-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px}.regie-photo-grid figure{position:relative;margin:0;border:1px solid #eadfd7;border-radius:10px;overflow:hidden;background:#fff}.regie-photo-grid img{display:block;width:100%;height:120px;object-fit:cover}.regie-photo-grid figcaption{padding:7px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.regie-photo-grid button{position:absolute;top:5px;right:5px;width:28px;height:28px;border:0;border-radius:50%;background:rgba(125,34,25,.9);color:#fff;font-size:20px;cursor:pointer}
        .regie-pdf-overlay{position:fixed;inset:0;z-index:1800;background:rgba(30,24,20,.72);padding:20px;display:flex;align-items:center;justify-content:center}.regie-pdf-modal{width:min(960px,100%);height:min(900px,calc(100vh - 40px));background:#fff;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.35)}.regie-pdf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #eadfd7}.regie-pdf-modal iframe{width:100%;flex:1;border:0;background:#eee}
        @media(max-width:800px){.regie-header{align-items:stretch;flex-direction:column}.regie-layout{grid-template-columns:1fr}.regie-list{position:static;max-height:230px;overflow:auto}.regie-grid,.regie-assignment-grid{grid-template-columns:1fr}.regie-row.labor{grid-template-columns:1fr 86px}.regie-row.labor input:nth-of-type(2){grid-column:1/3}.regie-row.material{grid-template-columns:1fr 72px 88px 34px}.regie-form{padding:13px}.regie-actions{position:sticky;bottom:0;background:#fff;padding:10px 0;z-index:4}.regie-actions .hbz-btn{flex:1 1 150px}.regie-signature-canvas{height:150px}.regie-signature-overlay{padding:0}.regie-signature-modal{height:100vh;border-radius:0;padding:10px}.regie-signature-actions .hbz-btn{flex:1}.regie-section-head{align-items:flex-start;flex-wrap:wrap}.regie-photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.regie-pdf-overlay{padding:0}.regie-pdf-modal{height:100vh;border-radius:0}}
      `}</style>
    </div>
  );
}
