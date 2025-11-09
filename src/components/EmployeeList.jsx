import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Formular
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState("mitarbeiter");
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr(""); setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, role, disabled, code")
      .order("name", { ascending: true });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  // 4-stellige PIN generieren
  function randomPin() { return String(Math.floor(1000 + Math.random() * 9000)); }
  function b64(s){ try { return btoa(s); } catch { return Buffer.from(s, "utf-8").toString("base64"); } }

  async function resetPin(row) {
    let pin = prompt(`Neue 4-stellige PIN für ${row.name}:`, "");
    if (pin === null) return;
    pin = (pin || "").trim() || randomPin();
    if (!/^\d{4}$/.test(pin)) { alert("Bitte genau 4 Ziffern eingeben."); return; }
    const { error } = await supabase
      .from("employees")
      .update({ pin: b64(pin), pin_hash: null })
      .eq("id", row.id);
    if (error) { alert("PIN konnte nicht gespeichert werden."); return; }
    alert(`Neue PIN für ${row.name}: ${pin}`);
    load();
  }

  async function remove(row) {
    if (!confirm(`Mitarbeiter „${row.name}“ wirklich löschen?`)) return;
    const { error } = await supabase.from("employees").delete().eq("id", row.id);
    if (error) { alert("Löschen fehlgeschlagen (RLS prüfen)."); return; }
    load();
  }

  async function createEmployee(e){
    e.preventDefault();
    setErr(""); setSaving(true);
    try{
      const { error } = await supabase.from("employees").insert([{ name, code, role }]);
      if (error) throw error;
      setName(""); setCode(""); setRole("mitarbeiter");
      await load();
    }catch(e2){ setErr(String(e2?.message || e2)); }
    finally{ setSaving(false); }
  }

  return (
    <div className="hbz-container">
      <div className="hbz-card">
        <h2 className="hbz-title" style={{ color: "var(--hbz-brown)" }}>Mitarbeiter anlegen</h2>
        <form onSubmit={createEmployee} className="hbz-grid hbz-grid-3" style={{ marginTop: 10 }}>
          <div>
            <label className="hbz-label">Name</label>
            <input className="hbz-input" value={name} onChange={e=>setName(e.target.value)} required />
          </div>
          <div>
            <label className="hbz-label">Code</label>
            <input className="hbz-input" value={code} onChange={e=>setCode(e.target.value)} required />
          </div>
          <div>
            <label className="hbz-label">Rolle</label>
            <select className="hbz-input" value={role} onChange={e=>setRole(e.target.value)}>
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="teamleiter">Teamleiter</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="save-btn" disabled={saving}>{saving ? "Speichere…" : "Anlegen"}</button>
          </div>
          {err && <div className="hbz-section error" style={{ gridColumn: "1 / -1" }}>{err}</div>}
        </form>
      </div>

      <div className="hbz-card">
        <h3 style={{ marginTop: 0, color: "var(--hbz-brown)" }}>Mitarbeiterliste</h3>

        {loading && <div>Lade Mitarbeiter…</div>}
        {!loading && (
          <table className="nice">
            <thead>
              <tr><th>Name</th><th>Code</th><th>Rolle</th><th>Status</th><th style={{ textAlign:"right" }}>Aktionen</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign:"center", padding:"8px" }}>Keine Mitarbeiter gefunden.</td></tr>
              )}
              {rows.map(r=>(
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.code}</td>
                  <td>{r.role}</td>
                  <td>{r.disabled ? "inaktiv" : "aktiv"}</td>
                  <td style={{ textAlign:"right" }}>
                    <button className="hbz-btn btn-small" onClick={()=>resetPin(r)}>PIN zurücksetzen</button>{" "}
                    <button className="hbz-btn btn-small" onClick={()=>remove(r)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
