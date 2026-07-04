import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const localISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayISO = () => localISO(new Date());
const weekStartISO = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localISO(d); };
const isBadWeather = (row) => row?.bad_weather === true || String(row?.bad_weather).toLowerCase() === "true";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState({ pending: [], regie: [], daily: [], entries: [], assignments: [], audits: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    const weekStart = weekStartISO(); const today = todayISO();
    const since = new Date(); since.setDate(since.getDate() - 7);
    const [pending, regie, daily, entries, assignments, audits] = await Promise.all([
      supabase.from("time_off_requests").select("id,entry_type,employee_id,from_date,to_date,status").eq("status", "pending"),
      supabase.from("regie_reports").select("id,status,is_archived,report_number,report_date,project_name").eq("is_archived", false),
      supabase.from("daily_site_reports").select("id,status,report_date,project_id,project_name").gte("report_date", weekStart).lte("report_date", today),
      supabase.from("time_entries").select("id,work_date,project_id,bad_weather,note,za_hours").gte("work_date", weekStart).lte("work_date", today),
      supabase.from("work_assignments").select("id,assignment_date,project_id").gte("assignment_date", weekStart).lte("assignment_date", today),
      supabase.from("time_entry_audit_log").select("id,changed_at").gte("changed_at", since.toISOString()).limit(500),
    ]);
    const firstError = pending.error || regie.error || daily.error || entries.error || assignments.error || audits.error;
    if (firstError) setError(firstError.message);
    setData({ pending: pending.data || [], regie: regie.data || [], daily: daily.data || [], entries: entries.data || [], assignments: assignments.data || [], audits: audits.data || [] });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    const expected = new Map(); const badOnly = new Map();
    for (const row of data.entries) {
      const day = String(row.work_date || "").slice(0, 10); const project = String(row.project_id || "");
      const note = String(row.note || "").toLowerCase();
      const isAbsence = /^\s*\[(urlaub|krank|krankenstand|zeitausgleich|za)\]/i.test(String(row.note || "")) || Number(row.za_hours || 0) > 0 || note === "urlaub" || note === "krank";
      if (!day || !project || isAbsence) continue;
      const key = `${day}__${project}`; const state = badOnly.get(key) || { normal: false, bad: false };
      if (isBadWeather(row)) state.bad = true; else { state.normal = true; expected.set(key, { day, project }); }
      badOnly.set(key, state);
    }
    for (const row of data.assignments) {
      const day = String(row.assignment_date || "").slice(0, 10); const project = String(row.project_id || ""); const key = `${day}__${project}`;
      if (day && project && !(badOnly.get(key)?.bad && !badOnly.get(key)?.normal)) expected.set(key, { day, project });
    }
    const missingDaily = [...expected].filter(([key]) => !data.daily.some((row) => `${String(row.report_date).slice(0, 10)}__${String(row.project_id)}` === key)).length;
    return {
      pending: data.pending.length,
      vacation: data.pending.filter((row) => row.entry_type !== "za").length,
      za: data.pending.filter((row) => row.entry_type === "za").length,
      regie: data.regie.filter((row) => row.status !== "signed").length,
      dailyDrafts: data.daily.filter((row) => row.status !== "completed").length,
      missingDaily,
      audits: data.audits.length,
    };
  }, [data]);

  const cards = [
    { label: "Offene Freigaben", value: summary.pending, detail: `${summary.vacation} Urlaub · ${summary.za} ZA`, tone: "warning", path: "/urlaub" },
    { label: "Regieberichte offen", value: summary.regie, detail: "Entwürfe und bereitgestellte Aufträge", tone: "blue", path: "/regieberichte" },
    { label: "Bautagesberichte", value: summary.missingDaily + summary.dailyDrafts, detail: `${summary.missingDaily} fehlen · ${summary.dailyDrafts} Entwürfe`, tone: "danger", path: "/bautagesberichte" },
    { label: "Änderungen 7 Tage", value: summary.audits, detail: "Protokollierte Stundenänderungen", tone: "green", path: "/monatsuebersicht" },
  ];

  return <div className="hbz-container admin-dashboard">
    <header className="dashboard-hero"><div><div className="eyebrow">Arbeitsübersicht</div><h1>Admin-Dashboard</h1><p>Offene Aufgaben und wichtige Prüfungen auf einen Blick.</p></div><button className="hbz-btn" onClick={load} disabled={loading}>{loading ? "Aktualisiere…" : "Aktualisieren"}</button></header>
    {error && <div className="hbz-alert hbz-alert-error">{error}</div>}
    <section className="dashboard-grid">{cards.map((card) => <button type="button" key={card.label} className={`dashboard-card ${card.tone}`} onClick={() => navigate(card.path)}><span>{card.label}</span><strong>{loading ? "…" : card.value}</strong><small>{card.detail}</small><b>Öffnen →</b></button>)}</section>
    <section className="dashboard-actions hbz-card"><div><div className="eyebrow">Schnellzugriff</div><h2>Was möchtest du prüfen?</h2></div><div><button className="hbz-btn hbz-btn-primary" onClick={() => navigate("/monatsuebersicht")}>Lohncheck</button><button className="hbz-btn" onClick={() => navigate("/arbeitseinteilung")}>Arbeitseinteilung</button><button className="hbz-btn" onClick={() => navigate("/projekte")}>Projekte</button></div></section>
    <style>{`.dashboard-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px}.dashboard-hero h1{margin:3px 0}.dashboard-hero p{margin:0;color:#6f6259}.dashboard-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.dashboard-card{border:1px solid #e4d7cd;border-top:5px solid #7b4a2d;border-radius:13px;background:#fff;padding:18px;text-align:left;display:grid;gap:7px;cursor:pointer;box-shadow:0 10px 28px rgba(75,47,30,.07)}.dashboard-card span{font-weight:800;color:#604735}.dashboard-card strong{font-size:34px;color:#2f2119}.dashboard-card small{color:#74675e;min-height:30px}.dashboard-card b{font-size:12px;color:#7b4a2d}.dashboard-card.warning{border-top-color:#d18a20}.dashboard-card.blue{border-top-color:#397ba8}.dashboard-card.danger{border-top-color:#b94a40}.dashboard-card.green{border-top-color:#438557}.dashboard-actions{margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:16px}.dashboard-actions h2{margin:3px 0}.dashboard-actions>div:last-child{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:900px){.dashboard-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.dashboard-hero,.dashboard-actions{align-items:stretch;flex-direction:column}.dashboard-grid{grid-template-columns:1fr}.dashboard-card{min-height:135px}.dashboard-actions>div:last-child{display:grid}.dashboard-actions .hbz-btn{min-height:46px}}`}</style>
  </div>;
}
