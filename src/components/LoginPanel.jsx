// src/components/LoginPanel.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

const UI = {
  card: {
    maxWidth: 520,
    margin: "80px auto",
    background: "#fff",
    borderRadius: 14,
    boxShadow: "0 8px 30px rgba(0,0,0,.08)",
    padding: 22,
    border: "1px solid rgba(0,0,0,.06)",
  },
  label: { fontWeight: 700, marginBottom: 6, display: "block", color: "#4a3a2f" },
  input: {
    width: "100%",
    border: "1px solid #d1c6bd",
    borderRadius: 10,
    padding: "10px 12px",
    outline: "none",
    fontSize: 15,
    background: "#fffdfb",
  },
  btn: {
    background: "#8B5E3C",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: 700,
    minWidth: 110,
  },
  error: {
    background: "#ffeaea",
    color: "#7c1f1f",
    border: "1px solid #f1c1c1",
    borderRadius: 8,
    padding: "10px 12px",
    marginTop: 10,
    fontSize: 14,
  },
};

export default function LoginPanel() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    const codeClean = (code || "").trim().toUpperCase();
    const pinClean = (pin || "").trim();

    if (!codeClean) return setMsg("Bitte Code eingeben (z. B. ZS, MH …)");
    if (!pinClean) return setMsg("Bitte PIN eingeben.");

    setLoading(true);
    try {
      // 🔒 Stabile Auth über RPC – unabhängig von Schema-Cache/Tabellennamen
      const { data, error } = await supabase
        .rpc("login_lookup", { p_code: codeClean, p_pin: pinClean });

      if (error) {
        console.error("[Login] Supabase-Error:", error);
        const text =
          (error?.message || error?.hint || error?.details || "").toString().trim() ||
          "Serverfehler beim Login.";
        setMsg(text);
        return;
      }

      const u = Array.isArray(data) ? data[0] : null;
      if (!u) {
        setMsg("PIN oder Code falsch.");
        return;
      }

      if (u.aktiv === false) {
        setMsg("Dieser Benutzer ist deaktiviert.");
        return;
      }

      // 🔑 Session ins LocalStorage
      localStorage.setItem("isAuthed", "1");
      localStorage.setItem("meId", u.id);
      localStorage.setItem("meName", u.name || "");
      localStorage.setItem("meCode", u.code || codeClean);
      localStorage.setItem("meRole", (u.rolle || "mitarbeiter").toLowerCase());
      if (typeof u.notfall_admin === "boolean") {
        localStorage.setItem("meNotfallAdmin", u.notfall_admin ? "1" : "0");
      }

      // 🚀 Weiterleiten (intern; bei HashRouter ergibt das #/zeiterfassung)
      nav("/zeiterfassung", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={UI.card}>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={UI.label}>Code</label>
          <input
            style={UI.input}
            placeholder="z. B. ZS, MH, AS …"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={UI.label}>PIN</label>
          <input
            style={UI.input}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
          />
        </div>

        {msg && <div style={UI.error}>{msg}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="submit" style={UI.btn} disabled={loading}>
            {loading ? "Anmelden …" : "Login"}
          </button>
        </div>
      </form>
    </div>
  );
}
