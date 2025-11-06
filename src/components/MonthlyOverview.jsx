import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";

const pad = (n) => String(n).padStart(2, "0");
const hm  = (m) => `${Math.floor(m/60)}h ${pad(m%60)}m`;
const toHH  = (m) => `${(m/60).toFixed(2).replace(".", ",")} h`;
const toHHMM = (m) => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const first = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const last  = (d) => new Date(d.getFullYear(), d.getMonth()+1, 0);
const iso   = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function startOfWeek(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function weekKey(dateStr){
  const d=new Date(dateStr); const ws=startOfWeek(d); const we=new Date(ws); we.setDate(ws.getDate()+6);
  return { key:`${ws.getFullYear()}-${pad(ws.getMonth()+1)}-${pad(ws.getDate())}`, label:`${ws.toLocaleDateString()} – ${we.toLocaleDateString()}` };
}

export default function MonthlyOverview(){
  const me   = JSON.parse(localStorage.getItem("me") || "null");
  const role = (me?.role || "").toLowerCase();
  const isManager = role==="admin" || role==="teamleiter";

  /* Zeitraum */
  const [refDate, setRefDate] = useState(()=>{ const x=new Date(); x.setDate(1); x.setHours(0,0,0,0); return x;});
  const start = first(refDate), end = last(refDate);
  const prevMonth = ()=>{ const d=new Date(refDate); d.setMonth(d.getMonth()-1); setRefDate(d); };
  const nextMonth = ()=>{ const d=new Date(refDate); d.setMonth(d.getMonth()+1); setRefDate(d); };

  /* Mitarbeiterliste + Auswahl (Pills) */
  const [employees, setEmployees] = useState([]);
  useEffect(()=>{ (async()=>{
    const { data } = await supabase.from("employees").select("id,name,active").eq("active", true).order("name");
    if (data) setEmployees(data);
  })();},[]);
  const [selectedIds, setSelectedIds] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("activeEmployeeIds") || "[]"); }
    catch { return me?.id ? [me.id] : []; }
  });
  useEffect(()=>localStorage.setItem("activeEmployeeIds", JSON.stringify(selectedIds)), [selectedIds]);
  const toggleEmp = id => setSelectedIds(p=>{const s=new Set(p); s.has(id)?s.delete(id):s.add(id); return [...s];});
  const selectAll = ()=> setSelectedIds(employees.map(e=>e.id));
  const selectMe  = ()=> me?.id && setSelectedIds([me.id]);
  const clearSel  = ()=> setSelectedIds([]);

  /* Daten */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [projects,setProjects]=useState([]);
  useEffect(()=>{ (async()=>{
    const { data } = await supabase.from("projects").select("id,name,active").eq("active",true).order("name");
    if (data) setProjects(data);
  })(); },[]);

  async function fetchData(){
    setLoading(true);
    let data=[];
    const { data: viewData } = await supabase
      .from("v_time_entries_expanded")
      .select("id,work_date,start_min,end_min,break_min,note,project_id,project_name,employee_name,employee_id")
      .gte("work_date", iso(start)).lte("work_date", iso(end))
      .order("work_date",{ascending:true});

    if(viewData){
      data = viewData.map(r=>({
        id:r.id, date:r.work_date, start_min:r.start_min, end_min:r.end_min,
        break_min:r.break_min, note:r.note||"", project:r.project_name||"",
        project_id:r.project_id||null, employee:r.employee_name||"", employee_id:r.employee_id
      }));
    }

    if (role === "mitarbeiter") data = data.filter(r => r.employee_id === me?.id);
    else if (selectedIds.length){ const s=new Set(selectedIds); data = data.filter(r => s.has(r.employee_id)); }

    setRows(data); setLoading(false);
  }
  useEffect(()=>{ fetchData(); /* eslint-disable-next-line */ }, [refDate, JSON.stringify(selectedIds)]);

  /* Textfilter */
  const filtered = useMemo(()=>{
    if(!q.trim()) return rows;
    const s=q.trim().toLowerCase();
    return rows.filter(r =>
      (r.project||"").toLowerCase().includes(s) ||
      (r.employee||"").toLowerCase().includes(s) ||
      (r.note||"").toLowerCase().includes(s)
    );
  },[rows,q]);

  /* Dauer + Tages-ÜS (>9h) */
  const augmented = useMemo(()=>filtered.map(r=>{
    const dur = Math.max(0,(r.end_min - r.start_min) - (r.break_min||0));
    const dayOT = Math.max(0, dur - 9*60);
    return {...r, duration_min: dur, day_ot_min: dayOT};
  }),[filtered]);

  /* Wochen-Übersicht (Mo–So) & Woche-ÜS (>39h) */
  const weekly = useMemo(()=>{
    const byWeek = new Map();
    for(const r of augmented){
      const { key, label } = weekKey(r.date);
      if(!byWeek.has(key)) byWeek.set(key, { key, label, total:0, dayOT:0 });
      const w = byWeek.get(key);
      w.total += r.duration_min;
      w.dayOT += r.day_ot_min;
    }
    for(const w of byWeek.values()){ w.weekOT = Math.max(0, w.total - 39*60); }
    return [...byWeek.values()].sort((a,b)=>a.key.localeCompare(b.key));
  },[augmented]);

  const sumTotalMin  = useMemo(()=>augmented.reduce((a,b)=>a+b.duration_min,0),[augmented]);
  const sumDayOTMin  = useMemo(()=>augmented.reduce((a,b)=>a+b.day_ot_min,0),[augmented]);
  const sumWeekOTMin = useMemo(()=>weekly.reduce((a,b)=>a+b.weekOT,0),[weekly]);

  /* ---- NEU: Projekt-Aggregate ---- */
  // 1) Monat gesamt je Projekt
  const projectTotals = useMemo(()=>{
    const map = new Map(); // projectName -> minutes
    for(const r of augmented){
      const key = r.project || "— ohne Projekt —";
      map.set(key, (map.get(key)||0) + r.duration_min);
    }
    return [...map.entries()].map(([project,minutes])=>({project, minutes})).sort((a,b)=>a.project.localeCompare(b.project));
  },[augmented]);

  // 2) Wochen (Pivot) je Projekt
  const projectWeekly = useMemo(()=>{
    // weeks ordered
    const weekOrder = weekly.map(w=>w.key);
    const weekLabels = Object.fromEntries(weekly.map(w=>[w.key,w.label]));
    const map = new Map(); // project -> { [weekKey]: minutes , _total }
    for(const r of augmented){
      const p = r.project || "— ohne Projekt —";
      const w = weekKey(r.date).key;
      if(!map.has(p)) map.set(p,{});
      map.get(p)[w] = (map.get(p)[w]||0) + r.duration_min;
      map.get(p)._total = (map.get(p)._total||0) + r.duration_min;
    }
    // build rows sorted by project
    const rows = [...map.entries()].map(([project,vals])=>{
      const row = { project, total: vals._total||0, weeks:{} };
      for(const wk of weekOrder){ row.weeks[wk] = vals[wk]||0; }
      return row;
    }).sort((a,b)=>a.project.localeCompare(b.project));
    return { rows, weekOrder, weekLabels };
  },[augmented, weekly]);

  /* Bearbeiten/Löschen */
  const [projectsList,setProjectsList]=useState([]); // for editor select
  useEffect(()=>{ (async()=>{ const {data}=await supabase.from("projects").select("id,name,active").eq("active",true).order("name"); if(data) setProjectsList(data); })(); },[]);
  const [editId,setEditId]=useState(null);
  const [eStart,setEStart]=useState(7*60);
  const [eEnd,setEEnd]=useState(16*60+30);
  const [eBreak,setEBreak]=useState(30);
  const [eNote,setENote]=useState("");
  const [eProj,setEProj]=useState(null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");

  function openEditor(row){ setEditId(row.id); setEStart(row.start_min); setEEnd(row.end_min); setEBreak(row.break_min||0); setENote(row.note||""); setEProj(row.project_id||""); }
  function cancelEdit(){ setEditId(null); setErr(""); }
  async function saveEdit(){
    if(!isManager || !editId) return;
    if(eEnd<=eStart){ setErr("Ende muss nach Start liegen."); return; }
    setBusy(true); setErr("");
    try{
      const payload={ start_min:eStart, end_min:eEnd, break_min:eBreak, note:eNote, project_id: eProj || null };
      const { error } = await supabase.from("time_entries").update(payload).eq("id", editId);
      if(error) throw error;
      setRows(rs=>rs.map(r=> r.id===editId ? {...r, ...payload, project: (projectsList.find(p=>p.id===eProj)?.name || r.project)} : r));
      setEditId(null);
    }catch(e){ setErr("Speichern fehlgeschlagen: "+(e.message||e)); }
    finally{ setBusy(false); }
  }
  async function removeRow(id){ if(!isManager) return; await supabase.from("time_entries").delete().eq("id", id); setRows(r=>r.filter(x=>x.id!==id)); }

  /* Export */
  function exportCSV(){
    const header=["Datum","Mitarbeiter","Projekt","Start","Ende","Pause","Dauer","Tages-ÜS (>9h)","Notiz"];
    const lines=augmented.map(r=>[
      r.date, r.employee, r.project, toHHMM(r.start_min), toHHMM(r.end_min),
      `${r.break_min||0} min`, hm(r.duration_min), hm(r.day_ot_min), (r.note||"").replace(/\r?\n/g," ")
    ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";"));
    const csv=[header.join(";"),...lines, "", `Gesamt; ; ; ; ; ;${hm(sumTotalMin)};${hm(sumDayOTMin)};`].join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`Monatsübersicht_${refDate.getFullYear()}-${pad(refDate.getMonth()+1)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function exportPDF(){ window.print(); }

  const timeInput=(val,setVal)=>(
    <input type="time"
      value={`${pad(Math.floor(val/60))}:${pad(val%60)}`}
      onChange={e=>{ const [h,m]=e.target.value.split(":").map(Number); setVal(h*60+m); }}
      className="hbz-input" style={{maxWidth:110}}
    />
  );

  return (
    <div className="hbz-container">
      {/* Toolbar */}
      <div className="hbz-toolbar">
        <div className="group">
          <button className="hbz-btn" onClick={prevMonth}>&laquo;</button>
          <div className="hbz-title">{refDate.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</div>
          <button className="hbz-btn" onClick={nextMonth}>&raquo;</button>
        </div>
        <div className="group" style={{marginLeft:"auto"}}>
          <input className="hbz-input" placeholder="Filter: Projekt/Mitarbeiter/Notiz" value={q} onChange={(e)=>setQ(e.target.value)}/>
          <button className="hbz-btn" onClick={exportCSV}>CSV</button>
          <button className="hbz-btn" onClick={exportPDF}>PDF</button>
        </div>
      </div>

      {/* Mitarbeiter-Filter */}
      <div className="hbz-card">
        <div className="hbz-label" style={{marginBottom:6}}>Mitarbeiter filtern (mehrere möglich)</div>
        <div className="hbz-pills" style={{marginBottom:8}}>
          {employees.map(e=>{
            const active = selectedIds.includes(e.id);
            return <button key={e.id} className={`hbz-pill ${active?"active":""}`} onClick={()=>toggleEmp(e.id)}>{e.name}</button>;
          })}
        </div>
        <div className="group">
          <button className="hbz-btn" onClick={selectAll}>Alle</button>
          <button className="hbz-btn" onClick={selectMe}>Nur ich</button>
          <button className="hbz-btn" onClick={clearSel}>Leeren</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="hbz-card hbz-section">
        <div className="hbz-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))"}}>
          <div className="hbz-kpi"><b>Gesamtstunden</b><div>{hm(sumTotalMin)} <span className="hbz-label">({toHH(sumTotalMin)})</span></div></div>
          <div className="hbz-kpi"><b>Tages-Überstunden (&gt;9h)</b><div>{hm(sumDayOTMin)}</div></div>
          <div className="hbz-kpi"><b>Wochen-Überstunden (&gt;39h)</b><div>{hm(sumWeekOTMin)}</div></div>
        </div>
      </div>

      {/* Einzeltabelle */}
      <div className="hbz-card hbz-section print-card">
        <table className="nice print-table">
          <thead>
            <tr>
              <th>Datum</th><th>Mitarbeiter</th><th>Projekt</th>
              <th>Start</th><th>Ende</th><th>Pause</th><th>Dauer</th><th>Tages-ÜS</th><th>Notiz</th>
              {isManager && <th className="no-print">Aktion</th>}
            </tr>
          </thead>
          <tbody>
            {!loading && augmented.length===0 && (
              <tr><td colSpan={isManager?10:9} className="hbz-label">Keine Einträge.</td></tr>
            )}
            {augmented.map(r=>(
              <React.Fragment key={r.id}>
                <tr>
                  <td>{new Date(r.date).toLocaleDateString()}</td>
                  <td>{r.employee}</td>
                  <td>{r.project}</td>
                  <td>{toHHMM(r.start_min)}</td>
                  <td>{toHHMM(r.end_min)}</td>
                  <td>{(r.break_min||0)} min</td>
                  <td>{hm(r.duration_min)}</td>
                  <td>{hm(r.day_ot_min)}</td>
                  <td className="note-cell">{r.note}</td>
                  {isManager && (
                    <td className="no-print">
                      <button className="hbz-btn" onClick={()=>openEditor(r)}>Bearbeiten</button>
                      <button className="hbz-btn" onClick={()=>removeRow(r.id)} style={{marginLeft:6}}>Löschen</button>
                    </td>
                  )}
                </tr>

                {isManager && editId===r.id && (
                  <tr className="no-print">
                    <td colSpan={isManager?10:9} style={{background:"#fffaf5"}}>
                      <div className="hbz-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10}}>
                        <div><div className="hbz-label">Projekt</div>
                          <select className="hbz-input" value={eProj||""} onChange={e=>setEProj(e.target.value||"")}>
                            <option value="">— ohne —</option>
                            {projectsList.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div><div className="hbz-label">Start</div>{timeInput(eStart,setEStart)}</div>
                        <div><div className="hbz-label">Ende</div>{timeInput(eEnd,setEEnd)}</div>
                        <div><div className="hbz-label">Pause (min)</div>
                          <input type="number" className="hbz-input" value={eBreak} onChange={e=>setEBreak(Math.max(0,parseInt(e.target.value||0,10)))} />
                        </div>
                        <div style={{gridColumn:"1/-1"}}>
                          <div className="hbz-label">Notiz</div>
                          <textarea className="hbz-textarea" rows={2} value={eNote} onChange={e=>setENote(e.target.value)} />
                        </div>
                      </div>
                      {err && <div className="hbz-section error" style={{marginTop:8}}>{err}</div>}
                      <div style={{marginTop:10, display:"flex", gap:8}}>
                        <button className="hbz-btn primary" onClick={saveEdit} disabled={busy}>{busy?"Speichere…":"Speichern"}</button>
                        <button className="hbz-btn" onClick={cancelEdit}>Abbrechen</button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="hbz-label">Gesamt</td>
              <td>{hm(sumTotalMin)}</td>
              <td>{hm(sumDayOTMin)}</td>
              <td />
              {isManager && <td className="no-print" />}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Wochenübersicht (Mo–So) */}
      <div className="hbz-card hbz-section print-card">
        <div className="hbz-label" style={{marginBottom:8}}>Wochenübersicht (Mo–So)</div>
        <table className="nice print-table">
          <thead>
            <tr>
              <th>Woche</th><th>Gesamt</th><th>Tages-ÜS-Summe</th><th>Wochen-ÜS (&gt;39h)</th>
            </tr>
          </thead>
          <tbody>
            {weekly.map(w=>(
              <tr key={w.key}><td>{w.label}</td><td>{hm(w.total)}</td><td>{hm(w.dayOT)}</td><td>{hm(w.weekOT)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="hbz-label">Summe</td><td>{hm(sumTotalMin)}</td><td>{hm(sumDayOTMin)}</td><td>{hm(sumWeekOTMin)}</td></tr>
          </tfoot>
        </table>
      </div>

      {/* NEU: Projektübersicht (Monat gesamt) */}
      <div className="hbz-card hbz-section print-card">
        <div className="hbz-label" style={{marginBottom:8}}>Projektübersicht – Monat gesamt</div>
        <table className="nice print-table">
          <thead>
            <tr><th>Projekt</th><th>Stunden</th></tr>
          </thead>
          <tbody>
            {projectTotals.map(p=>(
              <tr key={p.project}><td>{p.project}</td><td>{hm(p.minutes)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="hbz-label">Summe</td><td>{hm(sumTotalMin)}</td></tr>
          </tfoot>
        </table>
      </div>

      {/* NEU: Projekt-Wochenübersicht (Pivot) */}
      <div className="hbz-card hbz-section print-card">
        <div className="hbz-label" style={{marginBottom:8}}>Projekt-Wochenübersicht (Mo–So)</div>
        <table className="nice print-table">
          <thead>
            <tr>
              <th>Projekt</th>
              {projectWeekly.weekOrder.map(wk=>(
                <th key={wk}>{projectWeekly.weekLabels[wk]}</th>
              ))}
              <th>Gesamt</th>
            </tr>
          </thead>
        <tbody>
          {projectWeekly.rows.map(row=>(
            <tr key={row.project}>
              <td>{row.project}</td>
              {projectWeekly.weekOrder.map(wk=>(
                <td key={wk}>{hm(row.weeks[wk])}</td>
              ))}
              <td>{hm(row.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="hbz-label">Summe</td>
            {projectWeekly.weekOrder.map(wk=>(
              <td key={wk}>{hm(projectWeekly.rows.reduce((a,b)=>a+(b.weeks[wk]||0),0))}</td>
            ))}
            <td>{hm(sumTotalMin)}</td>
          </tr>
        </tfoot>
        </table>
      </div>
    </div>
  );
}
