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

// 🔹 Hilfsfunktion: versucht verschiedene Tabellennamen (public.mitarbeiter, mitarbeiter, Mitarbeiter)
async function findUserByCodePin(supabase, codeClean, pinClean) {
  const tables = ["public.mitarbeiter", "mitarbeiter", "Mitarbeiter"];
  for (const tbl of tables) {
    const { data, error } = await supabase
      .from(tbl)
      .select("id, name, code, rolle, aktiv, notfall_admin, pin")
      .ilike("code", codeClean)
      .eq("pin", pinClean.toString())
      .maybeSingle();

    // Falls Tabelle nicht existiert → nächste Variante probieren
    if (error && /relation .* does not exist|not found in the schema cache/i.test(error.message)) {
      continue;
    }
    if (error) return { data: null, error };
    if (data) return { data, error: null };
  }
  return { data: null, error: null };
}

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
      // 🔹 Benutzer anhand Code + PIN in Tabelle suchen (mit Fallback)
      const { data, error } = await findUserByCodePin(supabase, codeClean, pinClean);

      if (error) {
        console.error(error);
        setMsg("Serverfehler beim Login.");
        return;
      }

      if (!data) {
        setMsg("PIN oder Code falsch.");
        return;
      }

      const u = data;

      // 🔹 Aktiv-Status prüfen
      if (u.aktiv === false) {
        setMsg("Dieser Benutzer ist deaktiviert.");
        return;
      }

      // 🔹 Lokale Session speichern
      localStorage.setItem("isAuthed", "1");
      localStorage.setItem("meId", u.id);
      localStorage.setItem("meName", u.name || "");
      localStorage.setItem("meCode", u.code || codeClean);
      localStorage.setItem("meRole", (u.rolle || "mitarbeiter").toLowerCase());
      if (typeof u.notfall_admin === "boolean") {
        localStorage.setItem("meNotfallAdmin", u.notfall_admin ? "1" : "0");
      }

      // 🔹 Weiterleiten (klein, damit mit basename /Zeiterfassung funktioniert)
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
