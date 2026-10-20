import React, { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { createWeeklyPdf, loadWeeklyReport, previousViennaWeek } from "../utils/internWeeklyReport";

export default function InternWeeklyReport({ employees }) {
  const dialog = useRef(null);
  const [employeeId, setEmployeeId] = useState("");
  const [week, setWeek] = useState(previousViennaWeek);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function open() {
    setWeek(previousViennaWeek());
    setEmployeeId(employees.length === 1 ? String(employees[0].id) : "");
    setMessage("");
    dialog.current.showModal();
  }
  async function download(event) {
    event.preventDefault();
    if (busy) return;
    const employee = employees.find((item) => String(item.id) === employeeId);
    if (!employee) { setMessage("Bitte einen Mitarbeiter wählen."); return; }
    setBusy(true);
    setMessage("");
    try {
      const report = await loadWeeklyReport(supabase, employee.id, week);
      if (!report.rows.length) {
        setMessage("Für diese Kalenderwoche sind keine Arbeitszeiten gespeichert.");
        return;
      }
      const pdf = await createWeeklyPdf(report, employee.name || employee.code);
      pdf.save(`Praktikanten-Stundennachweis_${String(employee.name || employee.code).replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_")}_${week}.pdf`);
      setMessage("PDF erstellt. Der Download wurde gestartet.");
    } catch (error) {
      setMessage(`PDF konnte nicht erstellt werden: ${error.message || "Daten konnten nicht geladen werden."}`);
    } finally { setBusy(false); }
  }
  return <>
    <button type="button" className="hbz-btn" onClick={open} disabled={!employees.length}>
      Praktikanten-Stundennachweis
    </button>
    <dialog ref={dialog} aria-labelledby="intern-report-title" onCancel={(event) => { if (busy) event.preventDefault(); }}
      style={{ width: "min(540px, 92vw)", border: "none", borderRadius: 16, padding: 24 }}>
      <form onSubmit={download}>
        <h3 id="intern-report-title">Praktikanten-Stundennachweis</h3>
        <p>Wochennachweis von Montag bis Sonntag, unabhängig von den Monatsfiltern.</p>
        <label className="hbz-label" htmlFor="intern-report-employee">Praktikant / Mitarbeiter</label>
        <select id="intern-report-employee" className="hbz-select" required value={employeeId}
          disabled={busy} onChange={(event) => { setEmployeeId(event.target.value); setMessage(""); }}>
          <option value="">Bitte auswählen</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name || employee.code}</option>)}
        </select>
        <label className="hbz-label" htmlFor="intern-report-week">Kalenderwoche</label>
        <input id="intern-report-week" className="hbz-input" type="week" required value={week}
          disabled={busy} onChange={(event) => { setWeek(event.target.value); setMessage(""); }} />
        <p>Nettoarbeitszeit ohne Fahrzeiten und Abwesenheiten. Fehlende Kostenstellen oder Adressen werden als „Nicht hinterlegt“ ausgewiesen.</p>
        <p role="status" aria-live="polite">{message}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="hbz-btn" type="submit" disabled={busy || !employeeId || !week}>{busy ? "PDF wird erstellt…" : "PDF herunterladen"}</button>
          <button className="hbz-btn" type="button" disabled={busy} onClick={() => dialog.current.close()}>Schließen</button>
        </div>
      </form>
    </dialog>
  </>;
}
