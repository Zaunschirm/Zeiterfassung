import { useMemo, useState } from "react";
import { supabase } from "/src/lib/supabase.js";

export default function EmployeeCreate(){
  const [name, setName] = useState("");
  const [role, setRole] = useState("mitarbeiter");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  // eingeloggte Person
  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("employee") || "{}"); }
    catch { return {}; }
  }, []);
  const isAdmin = (me?.role || "").toLowerCase() === "admin";

  async function handleSubmit(e){
    e.preventDefault();
    setErr(""); setOk("");

    // Harter Check: nur Admin
    if (!isAdmin) {
      setErr("Kein Zugriff: Nur Admins dürfen Mitarbeiter anlegen.");
      return;
    }

    try{
      const encoded = btoa(pin); // wie beim Login verwendet
      const { error } = await supabase.from("employees").insert({
        name, role, code, pin: encoded, active: true
      });
      if (error) throw error;
      setOk("Mitarbeiter angelegt.");
      setName(""); setRole("mitarbeiter"); setCode(""); setPin("");
    }catch(ex){
      setErr(ex.message);
    }
  }

  // Nicht-Admin: freundliche Sperre
  if (!isAdmin) {
    return (
      <>
        <h1>Mitarbeiter anlegen</h1>
        <div className="card" style={{maxWidth:560}}>
          <div className="chips"><span className="chip err">Kein Zugriff</span></div>
          <p style={{marginTop:8}}>
            Nur <b>Admins</b> dürfen Mitarbeiter anlegen oder verwalten.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Mitarbeiter anlegen</h1>

      {ok && <div className="card"><div className="chips"><span className="chip ok">OK</span></div><p style={{marginTop:8}}>{ok}</p></div>}
      {err && <div className="card"><div className="chips"><span className="chip err">Fehler</span></div><p style={{marginTop:8}}>{err}</p></div>}

      <form className="card form" onSubmit={handleSubmit} style={{maxWidth:560}}>
        <div className="row">
          <label className="label">Name</label>
          <input className="input" value={name} onChange={e=>setName(e.target.value)} required />
        </div>
        <div className="row">
          <label className="label">Rolle</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="mitarbeiter">Mitarbeiter</option>
            <option value="teamleiter">Teamleiter</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="row">
          <label className="label">Code</label>
          <input className="input" value={code} onChange={e=>setCode(e.target.value)} />
        </div>
        <div className="row">
          <label className="label">PIN</label>
          <input className="input" type="password" value={pin} onChange={e=>setPin(e.target.value)} />
        </div>
        <div style={{display:"flex", gap:10}}>
          <button className="btn">Speichern</button>
          <button type="reset" className="btn-ghost" onClick={()=>{setName("");setRole("mitarbeiter");setCode("");setPin("");}}>Zurücksetzen</button>
        </div>
      </form>
    </>
  );
}
