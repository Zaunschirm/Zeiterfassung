import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const localISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayISO = () => localISO(new Date());
const weekStartISO = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localISO(d);
};
const isBadWeather = (row) => row?.bad_weather === true || String(row?.bad_weather).toLowerCase() === "true";
const isBillingClosed = (record) => record?.is_closed === true || record?.billing_data?.closed === true || record?.billing_data?.workflowStatus === "Abgeschlossen";
const billedRegieIdsFromRecords = (records = []) => new Set(records.flatMap((record) => Array.isArray(record?.billing_data?.regieBilledIds) ? record.billing_data.regieBilledIds.map(String) : []));
const backupTables = [
  { table: "time_entries", label: "stunden" },
  { table: "time_entry_audit_log", label: "stunden_aenderungen" },
  { table: "time_off_requests", label: "abwesenheitsantraege" },
  { table: "employees", label: "mitarbeiter" },
  { table: "projects", label: "projekte" },
  { table: "work_assignments", label: "arbeitseinteilung" },
  { table: "regie_reports", label: "regieberichte" },
  { table: "regie_report_audit_log", label: "regieberichte_aenderungen" },
  { table: "daily_site_reports", label: "bautagesberichte" },
  { table: "daily_site_report_audit_log", label: "bautagesberichte_aenderungen" },
  { table: "project_billing_records", label: "abrechnung" },
  { table: "project_billing_audit_log", label: "abrechnung_aenderungen" },
  { table: "special_leave_types", label: "sonderurlaub_arten" },
];
const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
};
const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const rowsToCsv = (rows = []) => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))].sort();
  if (!columns.length) return "sep=;\r\n";
  return ["sep=;", columns.join(";"), ...rows.map((row) => columns.map((column) => csvEscape(row?.[column])).join(";"))].join("\r\n");
};
async function fetchAllRows(table) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
const fmtDate = (value) => {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "—";
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("de-AT");
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    pending: [],
    regie: [],
    daily: [],
    entries: [],
    assignments: [],
    billing: [],
    audits: [],
    regieAudits: [],
    dailyAudits: [],
    billingAudits: [],
  });
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const weekStart = weekStartISO();
    const today = todayISO();
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const [
      pending,
      regie,
      daily,
      entries,
      assignments,
      billing,
      audits,
      regieAudits,
      dailyAudits,
      billingAudits,
    ] = await Promise.all([
      supabase.from("time_off_requests").select("id,entry_type,employee_id,from_date,to_date,status").eq("status", "pending"),
      supabase.from("regie_reports").select("id,status,is_archived,report_number,report_date,project_id,project_name").eq("is_archived", false),
      supabase.from("daily_site_reports").select("id,status,report_date,project_id,project_name").gte("report_date", weekStart).lte("report_date", today),
      supabase.from("time_entries").select("id,work_date,project_id,bad_weather,note,za_hours").gte("work_date", weekStart).lte("work_date", today),
      supabase.from("work_assignments").select("id,assignment_date,project_id").gte("assignment_date", weekStart).lte("assignment_date", today),
      supabase.from("project_billing_records").select("project_id,billing_data,is_closed,closed_at"),
      supabase.from("time_entry_audit_log").select("id,changed_at").gte("changed_at", since.toISOString()).limit(500),
      supabase.from("regie_report_audit_log").select("id,changed_at").gte("changed_at", since.toISOString()).limit(500),
      supabase.from("daily_site_report_audit_log").select("id,changed_at").gte("changed_at", since.toISOString()).limit(500),
      supabase.from("project_billing_audit_log").select("id,changed_at").gte("changed_at", since.toISOString()).limit(500),
    ]);
    const firstError = pending.error || regie.error || daily.error || entries.error || assignments.error || billing.error || audits.error || regieAudits.error || dailyAudits.error || billingAudits.error;
    if (firstError) setError(firstError.message);
    setData({
      pending: pending.data || [],
      regie: regie.data || [],
      daily: daily.data || [],
      entries: entries.data || [],
      assignments: assignments.data || [],
      billing: billing.data || [],
      audits: audits.data || [],
      regieAudits: regieAudits.data || [],
      dailyAudits: dailyAudits.data || [],
      billingAudits: billingAudits.data || [],
    });
    setLoading(false);
  }

  async function exportBackup() {
    setBackupLoading(true);
    setError("");
    setMessage("");
    try {
      const [{ default: JSZip }, fileSaver] = await Promise.all([import("jszip"), import("file-saver")]);
      const saveAs = fileSaver.saveAs || fileSaver.default?.saveAs || fileSaver.default;
      const zip = new JSZip();
      const createdAt = new Date();
      const stamp = createdAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const info = {
        app: "Holzbau Zaunschirm Zeiterfassung",
        type: "Admin-Datensicherung",
        created_at: createdAt.toISOString(),
        note: "CSV-Dateien sind fuer Excel mit Semikolon getrennt. JSON-Dateien enthalten die Rohdaten.",
        tables: [],
      };

      zip.file("README.txt", [
        "Holzbau Zaunschirm - Admin-Datensicherung",
        `Erstellt am: ${createdAt.toLocaleString("de-AT")}`,
        "",
        "Dieses ZIP enthaelt CSV-Dateien fuer Excel und JSON-Rohdaten.",
        "Der Export ist rein lesend und veraendert keine Daten in der App.",
      ].join("\r\n"));

      for (const item of backupTables) {
        try {
          const rows = await fetchAllRows(item.table);
          zip.file(`${item.label}.csv`, `\ufeff${rowsToCsv(rows)}`);
          zip.file(`${item.label}.json`, JSON.stringify(rows, null, 2));
          info.tables.push({ table: item.table, file: item.label, rows: rows.length, ok: true });
        } catch (err) {
          const detail = err?.message || String(err);
          zip.file(`${item.label}_FEHLER.txt`, `${item.table}: ${detail}`);
          info.tables.push({ table: item.table, file: item.label, rows: 0, ok: false, error: detail });
        }
      }

      zip.file("_backup_info.json", JSON.stringify(info, null, 2));
      const blob = await zip.generateAsync({ type: "blob" });
      const fileName = `Zeiterfassung_Backup_${stamp}.zip`;
      if (typeof saveAs === "function") saveAs(blob, fileName);
      else downloadBlob(blob, fileName);
      setMessage("Datensicherung wurde erstellt und heruntergeladen.");
    } catch (err) {
      setError(`Datensicherung fehlgeschlagen: ${err?.message || err}`);
    } finally {
      setBackupLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    const expected = new Map();
    const badOnly = new Map();
    for (const row of data.entries) {
      const day = String(row.work_date || "").slice(0, 10);
      const project = String(row.project_id || "");
      const note = String(row.note || "").toLowerCase();
      const isAbsence = /^\s*\[(urlaub|krank|krankenstand|zeitausgleich|za)\]/i.test(String(row.note || "")) || Number(row.za_hours || 0) > 0 || note === "urlaub" || note === "krank";
      if (!day || !project || isAbsence) continue;
      const key = `${day}__${project}`;
      const state = badOnly.get(key) || { normal: false, bad: false };
      if (isBadWeather(row)) {
        state.bad = true;
      } else {
        state.normal = true;
        expected.set(key, { day, project });
      }
      badOnly.set(key, state);
    }
    for (const row of data.assignments) {
      const day = String(row.assignment_date || "").slice(0, 10);
      const project = String(row.project_id || "");
      const key = `${day}__${project}`;
      if (day && project && !(badOnly.get(key)?.bad && !badOnly.get(key)?.normal)) expected.set(key, { day, project });
    }

    const missingDailyItems = [...expected].filter(([key]) => !data.daily.some((row) => `${String(row.report_date).slice(0, 10)}__${String(row.project_id)}` === key)).map(([, item]) => item);
    const billedIds = billedRegieIdsFromRecords(data.billing);
    const signedRegieOpen = data.regie.filter((row) => row.status === "signed" && !billedIds.has(String(row.id)));
    const signedRegieDone = data.regie.filter((row) => row.status === "signed" && billedIds.has(String(row.id)));
    const billingOpen = data.billing.filter((record) => !isBillingClosed(record));
    const auditTotal = data.audits.length + data.regieAudits.length + data.dailyAudits.length + data.billingAudits.length;
    const priorityItems = [
      ...data.pending.slice(0, 3).map((row) => ({ title: row.entry_type === "za" ? "ZA-Antrag offen" : "Urlaub/Sonderurlaub offen", detail: `${fmtDate(row.from_date)} bis ${fmtDate(row.to_date)}`, path: "/urlaub", tone: "warning" })),
      ...signedRegieOpen.slice(0, 3).map((row) => ({ title: "Regiebericht unterfertigt, noch offen", detail: `${row.report_number || row.id} · ${row.project_name || "ohne Projekt"}`, path: "/abrechnung", tone: "blue" })),
      ...missingDailyItems.slice(0, 3).map((row) => ({ title: "Bautagesbericht fehlt", detail: `${fmtDate(row.day)} · Projekt ${row.project}`, path: "/bautagesberichte", tone: "danger" })),
    ].slice(0, 7);

    return {
      pending: data.pending.length,
      vacation: data.pending.filter((row) => row.entry_type !== "za").length,
      za: data.pending.filter((row) => row.entry_type === "za").length,
      regie: data.regie.filter((row) => row.status !== "signed").length,
      signedRegieOpen: signedRegieOpen.length,
      signedRegieDone: signedRegieDone.length,
      dailyDrafts: data.daily.filter((row) => row.status !== "completed").length,
      missingDaily: missingDailyItems.length,
      billingOpen: billingOpen.length,
      billingClosed: data.billing.length - billingOpen.length,
      audits: auditTotal,
      priorityItems,
    };
  }, [data]);

  const cards = [
    { label: "Offene Freigaben", value: summary.pending, detail: `${summary.vacation} Urlaub · ${summary.za} ZA`, tone: "warning", path: "/urlaub" },
    { label: "Regieberichte", value: summary.regie + summary.signedRegieOpen, detail: `${summary.regie} in Arbeit · ${summary.signedRegieOpen} unterfertigt offen`, tone: "blue", path: "/regieberichte" },
    { label: "Bautagesberichte", value: summary.missingDaily + summary.dailyDrafts, detail: `${summary.missingDaily} fehlen · ${summary.dailyDrafts} Entwürfe`, tone: "danger", path: "/bautagesberichte" },
    { label: "Abrechnung", value: summary.billingOpen + summary.signedRegieOpen, detail: `${summary.billingOpen} Projekte offen · ${summary.signedRegieOpen} Regieberichte unverrechnet`, tone: "purple", path: "/abrechnung" },
    { label: "Änderungen 7 Tage", value: summary.audits, detail: "Stunden, Regie, Bautage, Abrechnung", tone: "green", path: "/monatsuebersicht" },
  ];

  return <div className="hbz-container admin-dashboard">
    <header className="dashboard-hero">
      <div><div className="eyebrow">Arbeitsübersicht</div><h1>Admin-Dashboard</h1><p>Offene Aufgaben, Abrechnung und Dokumentation auf einen Blick.</p></div>
      <div className="dashboard-hero-actions">
        <button className="hbz-btn hbz-btn-primary" onClick={exportBackup} disabled={backupLoading}>{backupLoading ? "Sichere..." : "Daten sichern"}</button>
        <button className="hbz-btn" onClick={load} disabled={loading}>{loading ? "Aktualisiere…" : "Aktualisieren"}</button>
      </div>
    </header>
    {error && <div className="hbz-alert hbz-alert-error">{error}</div>}
    {message && <div className="hbz-alert hbz-alert-success">{message}</div>}
    <section className="dashboard-grid">{cards.map((card) => <button type="button" key={card.label} className={`dashboard-card ${card.tone}`} onClick={() => navigate(card.path)}><span>{card.label}</span><strong>{loading ? "…" : card.value}</strong><small>{card.detail}</small><b>Öffnen →</b></button>)}</section>
    <section className="dashboard-columns">
      <div className="hbz-card dashboard-priority">
        <div className="eyebrow">Chef-Liste</div><h2>Als nächstes prüfen</h2>
        {summary.priorityItems.length ? summary.priorityItems.map((item, index) => <button type="button" className={`dashboard-priority-row ${item.tone}`} key={`${item.title}-${index}`} onClick={() => navigate(item.path)}><span>{item.title}</span><small>{item.detail}</small><b>öffnen</b></button>) : <p className="hint">Keine dringenden Punkte offen.</p>}
      </div>
      <div className="hbz-card dashboard-priority">
        <div className="eyebrow">Ablage</div><h2>Erledigte Arbeit</h2>
        <div className="dashboard-done-grid"><div><span>Regie verrechnet</span><b>{summary.signedRegieDone}</b></div><div><span>Abrechnung abgeschlossen</span><b>{summary.billingClosed}</b></div></div>
        <p className="hint">Verrechnete Regieberichte verschwinden aus der normalen Arbeitsliste und bleiben über „Archivierte anzeigen“ auffindbar.</p>
      </div>
    </section>
    <section className="dashboard-actions hbz-card">
      <div><div className="eyebrow">Schnellzugriff</div><h2>Was möchtest du prüfen?</h2></div>
      <div><button className="hbz-btn hbz-btn-primary" onClick={() => navigate("/abrechnung")}>Abrechnung</button><button className="hbz-btn" onClick={() => navigate("/monatsuebersicht")}>Lohncheck</button><button className="hbz-btn" onClick={() => navigate("/arbeitseinteilung")}>Arbeitseinteilung</button><button className="hbz-btn" onClick={() => navigate("/projekte")}>Projekte</button></div>
    </section>
    <style>{`.dashboard-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px}.dashboard-hero h1{margin:3px 0}.dashboard-hero p{margin:0;color:#6f6259}.dashboard-hero-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.dashboard-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.dashboard-card{border:1px solid #e4d7cd;border-top:5px solid #7b4a2d;border-radius:13px;background:#fff;padding:18px;text-align:left;display:grid;gap:7px;cursor:pointer;box-shadow:0 10px 28px rgba(75,47,30,.07)}.dashboard-card span{font-weight:800;color:#604735}.dashboard-card strong{font-size:34px;color:#2f2119}.dashboard-card small{color:#74675e;min-height:30px}.dashboard-card b{font-size:12px;color:#7b4a2d}.dashboard-card.warning{border-top-color:#d18a20}.dashboard-card.blue{border-top-color:#397ba8}.dashboard-card.danger{border-top-color:#b94a40}.dashboard-card.green{border-top-color:#438557}.dashboard-card.purple{border-top-color:#7b5aa6}.dashboard-columns{display:grid;grid-template-columns:1.35fr .9fr;gap:14px;margin-top:18px}.dashboard-priority h2{margin:4px 0 12px}.dashboard-priority-row{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;align-items:center;border:1px solid #eadfd7;border-left:5px solid #7b4a2d;border-radius:10px;background:#fff;padding:10px 12px;margin-top:8px;text-align:left;cursor:pointer}.dashboard-priority-row span{font-weight:900;color:#3b2a20}.dashboard-priority-row small{color:#6f6259}.dashboard-priority-row b{grid-row:1/3;grid-column:2;color:#7b4a2d;font-size:12px}.dashboard-priority-row.warning{border-left-color:#d18a20}.dashboard-priority-row.blue{border-left-color:#397ba8}.dashboard-priority-row.danger{border-left-color:#b94a40}.dashboard-done-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dashboard-done-grid div{border:1px solid #eadfd7;border-radius:12px;background:#fbf7f2;padding:14px}.dashboard-done-grid span{display:block;font-size:12px;font-weight:800;color:#6f6259}.dashboard-done-grid b{font-size:28px}.dashboard-actions{margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:16px}.dashboard-actions h2{margin:3px 0}.dashboard-actions>div:last-child{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:1100px){.dashboard-grid{grid-template-columns:repeat(3,1fr)}.dashboard-columns{grid-template-columns:1fr}}@media(max-width:700px){.dashboard-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.dashboard-hero,.dashboard-actions{align-items:stretch;flex-direction:column}.dashboard-hero-actions{display:grid;justify-content:stretch}.dashboard-grid{grid-template-columns:1fr}.dashboard-card{min-height:135px}.dashboard-actions>div:last-child{display:grid}.dashboard-actions .hbz-btn{min-height:46px}}`}</style>
  </div>;
}
