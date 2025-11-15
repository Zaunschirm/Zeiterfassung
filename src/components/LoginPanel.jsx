import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { setSession } from "../lib/session";
import "../styles.css";

export default function LoginPanel({ onLogin }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");

    const { data, error: rpcError } = await supabase.rpc("login_lookup", {
      p_code: code.trim().toUpperCase(),
      p_pin: pin.trim(),
    });

    if (rpcError || !data || data.length === 0) {
      setError("Falscher Code oder PIN");
      return;
    }

    const user = data[0];
    if (!user) {
      setError("Ungültige Anmeldedaten");
      return;
    }

    // Session speichern
    setSession({ user });

    if (onLogin) onLogin(user);
  }

  return (
    <div className="hbz-login-page">
      <div className="hbz-login-card">

        {/* Logo */}
        <div className="hbz-login-header">
          <div className="hbz-login-logo-wrap">
            <img
              src="/icon-192.png"
              alt="Holzbau Zaunschirm"
              className="hbz-login-logo-img"
            />
          </div>
          <div>
            <div className="hbz-login-title">Holzbau Zaunschirm</div>
            <div className="hbz-login-subtitle">Zeiterfassung · Anmeldung</div>
          </div>
        </div>

        {/* Formular */}
        <form className="hbz-login-form" onSubmit={handleLogin}>
          <label className="hbz-login-label">
            Mitarbeiter-Code
            <input
              type="text"
              className="hbz-login-input"
              placeholder="z. B. ZS"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
          </label>

          <label className="hbz-login-label">
            PIN
            <input
              type="password"
              className="hbz-login-input"
              placeholder="4-stellig"
              inputMode="numeric"
              value={pin}
              maxLength={4}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              required
            />
          </label>

          {error && <div className="hbz-login-error">{error}</div>}

          <button type="submit" className="hbz-login-button">
            Anmelden
          </button>

          <div className="hbz-login-hint">
            Einfach Code + PIN – keine E-Mail notwendig.
          </div>
        </form>
      </div>
    </div>
  );
}
