// src/components/LoginPanel.jsx
import React, { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useNavigate } from "react-router-dom";

export default function LoginPanel(){
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [pin,  setPin]  = useState("");
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin(e){
    e.preventDefault();
    setErr(""); setBusy(true);

    try {
      // 1) Mitarbeiter mit CODE finden ( Groß/Kleinschreibung egal )
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,role,code,pin,active")
        .ilike("code", code.trim())        // 'MH' == 'mh'
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Benutzer nicht gefunden.");
      if (!data.pin) throw new Error("Keine PIN hinterlegt.");
      if (String(pin).trim() !== String(data.pin).trim())
        throw new Error("PIN falsch.");

      // 2) Session lokal merken
      localStorage.setItem("me", JSON.stringify(data));
      localStorage.setItem("employee", JSON.stringify(data));
      localStorage.setItem("isAuthed", "1");
      localStorage.setItem("meRole", (data.role || "").toLowerCase());

      // 3) Start → Zeiterfassung
      nav("/zeiterfassung", { replace: true });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbz-container" style={{display:"grid", placeItems:"center", minHeight:"70vh"}}>
      <form onSubmit={handleLogin} className="hbz-card" style={{width:"min(420px, 92vw)"}}>
        <div className="hbz-title" style={{marginBottom:10}}>Anmelden</div>

        <div className="hbz-section" style={{padding:0}}>
          <div className="hbz-label" style={{marginBottom:6}}>Code</div>
          <input className="hbz-input" value={code} onChange={(e)=>setCode(e.target.value)} placeholder="z. B. MH" autoFocus />

          <div className="hbz-label" style={{margin:"12px 0 6px"}}>PIN</div>
          <input className="hbz-input" value={pin} onChange={(e)=>setPin(e.target.value)} placeholder="4-stellig" maxLength={6} type="password"/>

          {err && <div className="hbz-section error" style={{marginTop:12}}>{err}</div>}

          <div style={{marginTop:14, display:"flex", justifyContent:"flex-end", gap:8}}>
            <button className="hbz-btn primary" disabled={busy || !code.trim() || !pin.trim()}>
              {busy ? "Prüfe…" : "Login"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
