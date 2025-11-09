import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProjectAdmin() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function load(){
    setErr("");
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, code, active, created_at")
      .order("created_at", { ascending: false });
    if (error) { setErr(error.message); return; }
    setItems(data || []);
  }
  useEffect(()=>{ load(); }, []);

  async function createProject(e){
    e.preventDefault();
    setErr(""); setSaving(true);
    try{
      const { error } = await supabase.from("projects").insert([{ name, code }]);
      if (error) throw error;
      setName(""); setCode("");
      await load();
    }catch(e2){ setErr(String(e2?.message || e2)); }
    finally{ setSaving(false); }
  }

  return (
    <div className="hbz-container">
      <div className="hbz-card">
        <h2 className="hbz-title" style={{ color: "var(--hbz-brown)" }}>Projekt anlegen</h2>
        <form onSubmit={createProject} className="hbz-grid hbz-grid-3" style={{ marginTop:10 }}>
          <div>
            <label className="hbz-label">Name</label>
            <input className="hbz-input" value={name} onChange={e=>setName(e.target.value)} required />
          </div>
          <div>
            <label className="hbz-label">Code (z. B. AS01)</label>
            <input className="hbz-input" value={code} onChange={e=>setCode(e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="save-btn" disabled={saving}>{saving ? "Speichere…" : "Anlegen"}</button>
          </div>
          {err && <div className="hbz-section error" style={{ gridColumn: "1 / -1" }}>{err}</div>}
        </form>
      </div>

      <div className="hbz-card">
        <h3 style={{ marginTop: 0, color: "var(--hbz-brown)" }}>Projektliste</h3>
        <table className="nice">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Status</th><th>Erstellt</th></tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign:"center", padding:"8px" }}>Keine Projekte vorhanden.</td></tr>
            )}
            {items.map(p=>(
              <tr key={p.id}>
                <td>{p.code || "—"}</td>
                <td>{p.name}</td>
                <td>{p.active === false ? "inaktiv" : "aktiv"}</td>
                <td>{p.created_at ? new Date(p.created_at).toLocaleString("de-AT") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
