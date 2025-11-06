import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const pad=(n)=>String(n).padStart(2,"0");
const toHHMM=(m)=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const minutesBetween=(s,e)=>Math.max(0,e-s);
const snap15=(m)=>Math.round(m/15)*15;
const DAY_START=5*60, DAY_END=19*60+30;
const todayISO=(d=new Date())=>{const t=new Date(d); t.setHours(0,0,0,0); return t.toISOString().slice(0,10);};

export default function DaySlider(){
  const me = JSON.parse(localStorage.getItem("me") || "null");
  const role = (me?.role || "").toLowerCase();
  const isManager = role==="admin" || role==="teamleiter";

  // Mitarbeiterliste nur für Manager
  const [employees,setEmployees]=useState([]);
  useEffect(()=>{
    if(!isManager) return;
    let ig=false;
    (async()=>{
      const { data, error } = await supabase
        .from("employees").select("id,name,active")
        .eq("active",true).order("name");
      if(!ig && data){ setEmployees(data); }
      if(error) console.error(error);
    })();
    return ()=>{ig=true};
  },[isManager]);

  // Auswahl: Mitarbeiter = eigene ID
  const [selectedIds,setSelectedIds]=useState(()=>{
    if(!isManager) return me?.id ? [me.id] : [];
    try { return JSON.parse(localStorage.getItem("activeEmployeeIds") || "[]"); }
    catch { return me?.id ? [me.id] : []; }
  });
  useEffect(()=>{
    if(isManager){
      localStorage.setItem("activeEmployeeIds", JSON.stringify(selectedIds));
    } else {
      const own = me?.id ? [me.id] : [];
      if(JSON.stringify(selectedIds)!==JSON.stringify(own)) setSelectedIds(own);
    }
  },[isManager, me?.id, selectedIds]);

  const toggleEmp=id=>{
    if(!isManager) return;
    setSelectedIds(p=>{const s=new Set(p); s.has(id)?s.delete(id):s.add(id); return [...s];});
  };

  const [refDate,setRefDate]=useState(()=>new Date());
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [ok,setOk]=useState("");

  const [entryId,setEntryId]=useState(null);
  const [startMin,setStartMin]=useState(snap15(7*60));
  const [endMin,setEndMin]=useState(snap15(16*60+30));
  const [breakMin,setBreakMin]=useState(30);
  const [note,setNote]=useState("");
  const [projects,setProjects]=useState([]);
  const [projectId,setProjectId]=useState(null);

  useEffect(()=>{
    (async()=>{
      const {data,error} = await supabase.from("projects")
        .select("id,name,active").eq("active",true).order("name");
      if(data) setProjects(data);
      if(error) console.error(error);
    })();
  },[]);

  const duration=useMemo(()=>Math.max(0, minutesBetween(startMin,endMin)-(breakMin||0)),[startMin,endMin,breakMin]);

  async function loadEntry(dateIso){
    setErr(""); setOk(""); setLoading(true);
    const targetId = isManager ? (selectedIds[0] || null) : (me?.id || null);
    if(!targetId){ setEntryId(null); setLoading(false); return; }

    const { data, error } = await supabase
      .from("time_entries")
      .select("id,start_min,end_min,break_min,note,project_id")
      .eq("employee_id", targetId).eq("work_date", dateIso)
      .limit(1).maybeSingle();

    if(error){ setErr("Fehler beim Laden: "+error.message); setEntryId(null); }
    else if(data){
      setEntryId(data.id);
      setStartMin(snap15(clamp(data.start_min??7*60,DAY_START,DAY_END)));
      setEndMin(snap15(clamp(data.end_min??16*60+30,DAY_START,DAY_END)));
      setBreakMin(Number.isFinite(data.break_min)?data.break_min:30);
      setNote(data.note||"");
      setProjectId(data.project_id || null);
    } else {
      setEntryId(null);
      setStartMin(snap15(7*60)); setEndMin(snap15(16*60+30)); setBreakMin(30); setNote("");
      setProjectId(null);
    }
    setLoading(false);
  }
  useEffect(()=>{ loadEntry(todayISO(refDate)); /* eslint-disable-next-line */ },[refDate, JSON.stringify(selectedIds), isManager]);

  async function upsertForEmployee(empId, dateIso){
    // robust: erst prüfen, dann update/insert
    const payload = {
      employee_id: empId,
      work_date: dateIso,
      start_min: snap15(clamp(startMin,DAY_START,DAY_END)),
      end_min:   snap15(clamp(endMin,  DAY_START,DAY_END)),
      break_min: clamp(parseInt(breakMin||0,10),0,240),
      note: note || "",
      project_id: projectId || null
    };

    const { data: ex, error: selErr } = await supabase
      .from("time_entries").select("id")
      .eq("employee_id",empId).eq("work_date",dateIso)
      .limit(1).maybeSingle();
    if(selErr) throw selErr;

    if(ex?.id){
      const { error, status } = await supabase
        .from("time_entries").update(payload).eq("id", ex.id);
      if(error) throw error;
      return { id: ex.id, status };
    } else {
      const { data, error, status } = await supabase
        .from("time_entries").insert(payload).select("id").maybeSingle();
      if(error) throw error;
      return { id: data?.id ?? null, status };
    }
  }

  async function verifyWritten(empId, dateIso){
    // liest zurück und prüft, ob die Werte wirklich so in der DB stehen
    const { data, error } = await supabase
      .from("time_entries")
      .select("id,start_min,end_min,break_min,note,project_id")
      .eq("employee_id", empId).eq("work_date", dateIso)
      .limit(1).maybeSingle();
    if(error) throw error;
    if(!data) throw new Error("Kein Datensatz gefunden – vermutlich RLS blockiert oder Insert fehlgeschlagen.");
    // einfache Plausibilitätsprüfung
    const same =
      data.start_min===snap15(clamp(startMin,DAY_START,DAY_END)) &&
      data.end_min  ===snap15(clamp(endMin,DAY_START,DAY_END))   &&
      (data.break_min||0)===clamp(parseInt(breakMin||0,10),0,240) &&
      String(data.note||"")===String(note||"") &&
      (data.project_id||null)===(projectId||null);
    if(!same) throw new Error("Werte stimmen nach dem Speichern nicht überein (RLS/Trigger?).");
    return true;
  }

  async function save(){
    setErr(""); setOk("");
    const dateIso = todayISO(refDate);
    const targets = isManager ? selectedIds : (me?.id ? [me.id] : []);
    if(!targets.length){ setErr("Bitte Mitarbeiter auswählen."); return; }
    if(endMin<=startMin){ setErr("Ende muss nach Start liegen."); return; }

    setBusy(true);
    try{
      for(const id of targets){
        // speichern
        await upsertForEmployee(id, dateIso);
        // nachkontrolle
        await verifyWritten(id, dateIso);
      }
      setOk(`Gespeichert${isManager?` für ${targets.length} MA`:""}`);
      await loadEntry(dateIso);
    }catch(e){
      setErr("Speichern nicht übernommen: "+(e.message||e));
    }finally{
      setBusy(false);
    }
  }

  async function removeEntry(){
    if(!entryId) return;
    // Mitarbeiter löscht nur eigenen Eintrag (durch selectedIds ohnehin eingeschränkt)
    setBusy(true); setErr(""); setOk("");
    try{
      const { error } = await supabase.from("time_entries").delete().eq("id", entryId);
      if(error) throw error;
      // Verify gelöscht
      const { data } = await supabase
        .from("time_entries").select("id").eq("id", entryId).maybeSingle();
      if(data?.id) throw new Error("Eintrag wurde nicht gelöscht (RLS?).");
      setOk("Eintrag gelöscht"); setEntryId(null);
    }catch(e){ setErr("Löschen fehlgeschlagen: "+(e.message||e)); }
    finally{ setBusy(false); }
  }

  const onStart = v => { const m=snap15(clamp(+v,DAY_START,DAY_END)); setStartMin(m); if(endMin<m+15) setEndMin(snap15(m+15)); };
  const onEnd   = v => { const m=snap15(clamp(+v,DAY_START,DAY_END)); setEndMin(m); if(m<startMin+15) setStartMin(snap15(m-15)); };
  const onBreak = v => setBreakMin(clamp(+v,0,240));
  const prevDay = ()=>{ const d=new Date(refDate); d.setDate(d.getDate()-1); setRefDate(d); };
  const nextDay = ()=>{ const d=new Date(refDate); d.setDate(d.getDate()+1); setRefDate(d); };

  return (
    <div className="hbz-container">
      <div className="hbz-toolbar">
        <div className="group">
          <button className="hbz-btn" onClick={prevDay}>&laquo;</button>
          <input type="date" className="hbz-input" value={todayISO(refDate)} onChange={(e)=>setRefDate(new Date(e.target.value))}/>
          <button className="hbz-btn" onClick={nextDay}>&raquo;</button>
        </div>

        {isManager && (
          <div className="group" style={{marginLeft:"auto", alignItems:"flex-start"}}>
            <div style={{display:"grid", gap:6}}>
              <div className="hbz-label">Mitarbeiter auswählen (mehrere möglich)</div>
              <div className="hbz-pills">
                {employees.map(e=>{
                  const active = selectedIds.includes(e.id);
                  return (
                    <button key={e.id} className={`hbz-pill ${active?"active":""}`} onClick={()=>toggleEmp(e.id)}>
                      {e.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {err && <div className="hbz-section error">{err}</div>}
      {ok  && <div className="hbz-section ok">{ok}</div>}

      <div className="hbz-card hbz-section">
        {/* Projekt */}
        <div style={{marginBottom:10}}>
          <div className="hbz-label" style={{marginBottom:6}}>Projekt</div>
          <select className="hbz-input" value={projectId||""} onChange={e=>setProjectId(e.target.value||null)}>
            <option value="">— ohne Projekt —</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Zeiten */}
        <div className="hbz-grid hbz-grid-3">
          <div>
            <div className="hbz-label" style={{marginBottom:6}}>Start</div>
            <input type="range" min={DAY_START} max={DAY_END} step={15} value={startMin} onChange={(e)=>onStart(e.target.value)} style={{width:"100%"}}/>
            <div style={{marginTop:8,fontSize:22,fontWeight:700}}>{toHHMM(startMin)}</div>
          </div>
          <div>
            <div className="hbz-label" style={{marginBottom:6}}>Ende</div>
            <input type="range" min={DAY_START} max={DAY_END} step={15} value={endMin} onChange={(e)=>onEnd(e.target.value)} style={{width:"100%"}}/>
            <div style={{marginTop:8,fontSize:22,fontWeight:700}}>{toHHMM(endMin)}</div>
          </div>
          <div>
            <div className="hbz-label" style={{marginBottom:6}}>Pause</div>
            <input type="range" min={0} max={240} step={5} value={breakMin} onChange={(e)=>onBreak(e.target.value)} style={{width:"100%"}}/>
            <div style={{marginTop:8,fontSize:22,fontWeight:700}}>{breakMin} min</div>
          </div>
        </div>

        <div className="hbz-kpi" style={{marginTop:14}}>
          <b>Arbeitszeit heute:</b> {Math.floor(duration/60)}h {pad(duration%60)}m
        </div>

        <div style={{marginTop:14}}>
          <div className="hbz-label" style={{marginBottom:6}}>Notiz</div>
          <textarea className="hbz-textarea" rows={3} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="z. B. Tätigkeit, Besonderheiten…"/>
        </div>

        <div style={{marginTop:14, display:"flex", gap:8, alignItems:"center"}}>
          <button className="hbz-btn primary" onClick={save} disabled={busy||loading||(!me?.id)}>
            Speichern
          </button>
          {entryId && (
            <button className="hbz-btn" onClick={removeEntry} disabled={busy}>Eintrag löschen</button>
          )}
          {loading && <span className="hbz-label">Lade …</span>}
          {busy && <span className="hbz-label">Speichere …</span>}
        </div>
      </div>
    </div>
  );
}
