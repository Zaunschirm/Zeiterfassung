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

    setSession({ user });
    if (onLogin) onLogin(user);
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">

        {/* LOGO FIX – lädt jetzt IMMER /logo.png !!! */}
        <div className="login-logo-row">
          <div className="login-logo-circle login-logo-image">
            <img src="/logo.png" alt="Holzbau Zaunschirm Logo" />
          </div>
          <div>
            <div className="login-logo-text-main">Holzbau Zaunschirm</div>
            <div className="login-logo-text-sub">Zeiterfassung · Anmeldung</div>
          </div>
        </div>

        <div className="login-subtitle">
          Einfach Code + PIN – keine E-Mail notwendig.
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-grid">
            <div className="hbz-col">
              <label className="hbz-label">Mitarbeiter-Code</label>
              <input
                type="text"
                className="hbz-input"
                placeholder="z. B. ZS"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="hbz-col">
              <label className="hbz-label">PIN</label>
              <input
                type="password"
                className="hbz-input"
                placeholder="4-stellig"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/[^0-9]/g, ""))
                }
                required
              />
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="save-btn" style={{ width: "100%" }}>
            Anmelden
          </button>
        </form>

        <div className="login-footer">
          <span>Holzbau Zaunschirm · Zeiterfassung</span>
        </div>
      </div>
    </div>
  );
}
