import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { filterVisibleEmployeesForRole } from "../utils/employeeVisibility";
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
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  function prepare() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(Math.round(rect.width * ratio), 1);
    const height = Math.max(Math.round(rect.height * ratio), 1);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#2d241f";
    }
    return canvas;
  }

  useEffect(() => {
    const canvas = prepare();
    if (!canvas || !value) return;
    const image = new Image();
    image.onload = () => canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function start(event) {
    if (disabled) return;
    event.preventDefault();
    const canvas = prepare();
    const ctx = canvas.getContext("2d");
    const p = point(event);
    drawingRef.current = true;
    canvas.setPointerCapture?.(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(event) {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    const p = point(event);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange?.(canvasRef.current.toDataURL("image/png"));
  }
  function clear() {
    const canvas = prepare();
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange?.("");
  }

  return (
    <div>
      <canvas ref={canvasRef} className="regie-signature-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="Unterschriftsfeld Auftraggeber" />
      {!disabled && <button type="button" className="hbz-btn btn-small" onClick={clear}>Unterschrift löschen</button>}
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
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState([]);
  const [signedBy, setSignedBy] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [status, setStatus] = useState("draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  function resetReport() {
    setSelectedId(""); setReportNumber(createReportNumber()); setReportDate(todayISO()); setProjectId("");
    setLocation(""); setClientName(""); setClientContact(""); setDescription(""); setLaborItems([]);
    setMaterialItems([emptyMaterial()]); setAssignedEmployeeIds([]); setSignedBy(""); setSignatureData("");
    setSignedAt(""); setStatus("draft"); setError(""); setMessage("");
  }
  function openReport(report) {
    setSelectedId(report.id); setReportNumber(report.report_number); setReportDate(report.report_date);
    setProjectId(report.project_id || ""); setLocation(report.location || ""); setClientName(report.client_name || "");
    setClientContact(report.client_contact || ""); setDescription(report.description || "");
    setLaborItems(Array.isArray(report.labor_items) ? report.labor_items : []);
    setMaterialItems(Array.isArray(report.material_items) && report.material_items.length ? report.material_items : [emptyMaterial()]);
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
    if (!reportDate || !projectId || !description.trim()) return "Bitte Datum, Projekt und Arbeitsauftrag ausfüllen.";
    if (nextStatus === "prepared") {
      if (!clientName.trim()) return "Bitte den Auftraggeber eintragen.";
      if (!assignedEmployeeIds.length) return "Bitte mindestens einen Mitarbeiter zuweisen.";
      if (!prepareLaborItems(laborItems).length) return "Bitte die zugewiesenen Mitarbeiter in die Stundenliste übernehmen.";
    }
    if (nextStatus === "signed") {
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

  async function exportPdf() {
    const problem = validate(status === "signed" ? "signed" : "draft");
    if (problem) { setError(problem); return; }
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
    doc.save(`Regiebericht_${reportNumber}.pdf`);
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

            <fieldset disabled={locked || busy || !canPrepare}>
              <div className="regie-grid">
                <label>Datum<input className="hbz-input" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></label>
                <label>Projekt / Baustelle<select className="hbz-input" value={projectId} onChange={(e) => { setProjectId(e.target.value); const project = projects.find((item) => String(item.id) === String(e.target.value)); if (!location && project?.address) setLocation(project.address); }}><option value="">Bitte auswählen</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                <label>Ort / Baustellenadresse<input className="hbz-input" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
                <label>Auftraggeber (Firma/Name)<input className="hbz-input" value={clientName} onChange={(e) => setClientName(e.target.value)} /></label>
                <label>Kontakt / Bauleiter<input className="hbz-input" value={clientContact} onChange={(e) => setClientContact(e.target.value)} /></label>
              </div>
              <label className="regie-block">Arbeitsauftrag / auszuführende Arbeiten<textarea className="hbz-textarea" rows="5" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Arbeiten genau beschreiben…" /></label>

              <section className="regie-section">
                <div className="regie-section-head"><h3>Mitarbeiter zuweisen</h3><button type="button" className="hbz-btn btn-small" onClick={addAssignedEmployeesToLabor}>In Stundenliste übernehmen</button></div>
                <div className="regie-assignment-grid">{employees.map((employee) => <label className="regie-assignment" key={employee.id}><input type="checkbox" checked={assignedEmployeeIds.includes(String(employee.id))} onChange={() => toggleAssignment(employee.id)} />{employee.name}</label>)}</div>
              </section>
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
              <button className="hbz-btn" onClick={exportPdf}>PDF erstellen</button>
            </div>
          </main>
        ) : <main className="hbz-card regie-empty"><h2>Kein offener Regieauftrag</h2><p>Sobald dir am Desktop ein Auftrag zugewiesen wurde, erscheint er hier automatisch.</p></main>}
      </div>

      <style>{`
        .regie-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:16px}.regie-header h1{margin:2px 0 4px}.regie-header p{margin:0;color:#6f6259}.regie-layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px}.regie-list{align-self:start;position:sticky;top:82px}.regie-list-item{display:flex;width:100%;flex-direction:column;align-items:flex-start;gap:3px;border:1px solid #eadfd7;background:#fff;padding:10px;margin-top:8px;border-radius:9px;text-align:left;cursor:pointer}.regie-list-item.active{border-color:#7b4a2d;background:#fff8f2}.regie-list-item span{font-size:12px;color:#6f6259}.regie-list-item small{font-weight:800}.regie-list-item small.signed{color:#28723d}.regie-list-item small.prepared{color:#1f6592}.regie-list-item small.draft{color:#9a6812}.regie-form-head,.regie-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.regie-form-head h2{margin:2px 0 12px;font-size:20px}.regie-status{padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900}.regie-status.signed{background:#e7f6eb;color:#246a36}.regie-status.prepared{background:#e9f4fb;color:#1f6592}.regie-status.draft{background:#fff3d7;color:#875b00}.regie-form fieldset{border:0;padding:0;margin:0;min-width:0}.regie-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.regie-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:800;color:#5a3a23}.regie-block{margin-top:14px}.regie-section{border-top:1px solid #eadfd7;margin-top:18px;padding-top:16px}.regie-section h3{margin:0 0 10px}.regie-assignment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.regie-assignment{flex-direction:row!important;align-items:center;padding:8px;border:1px solid #eadfd7;border-radius:8px;background:#fff}.regie-row{display:grid;gap:8px;margin-top:8px;align-items:center}.regie-row.labor{grid-template-columns:1.1fr 90px 1.5fr 34px}.regie-row.material{grid-template-columns:1.6fr 90px 100px 34px}.regie-remove{border:0;background:#fff0ed;color:#a23a2c;border-radius:8px;height:38px;font-size:22px;cursor:pointer}.regie-total{text-align:right;margin-top:10px;font-weight:900}.regie-signature-canvas{display:block;width:100%;height:180px;background:#fff;border:2px dashed #bda99a;border-radius:10px;touch-action:none;margin:8px 0}.regie-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:18px}.regie-empty{text-align:center;padding:40px 20px}
        @media(max-width:800px){.regie-header{align-items:stretch;flex-direction:column}.regie-layout{grid-template-columns:1fr}.regie-list{position:static;max-height:230px;overflow:auto}.regie-grid,.regie-assignment-grid{grid-template-columns:1fr}.regie-row.labor{grid-template-columns:1fr 86px}.regie-row.labor input:nth-of-type(2){grid-column:1/3}.regie-row.material{grid-template-columns:1fr 72px 88px 34px}.regie-form{padding:13px}.regie-actions{position:sticky;bottom:0;background:#fff;padding:10px 0;z-index:4}.regie-actions .hbz-btn{flex:1 1 150px}.regie-signature-canvas{height:160px}}
      `}</style>
    </div>
  );
}
