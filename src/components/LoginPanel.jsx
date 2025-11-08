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

    // Direktabfrage auf Supabase RPC (login_lookup)
    const { data, error } = await supabase.rpc("login_lookup", {
      p_code: code,
      p_pin: pin,
    });

    if (error || !data || data.length === 0) {
      console.error(error);
      setError("Falscher Code oder PIN");
      return;
    }

    const user = data[0];
    if (!user) {
      setError("Ungültige Anmeldedaten");
      return;
    }

    // Session lokal speichern
    setSession({ user });

    if (onLogin) {
      onLogin(user);
    } else {
      window.location.hash = "#/zeiterfassung";
    }
  }

  return (
    <div className="login-container">
      <h2>Login</h2>
      <form onSubmit={handleLogin} className="login-form">
        <label>
          Mitarbeiter-Code:
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="z. B. ZS"
            required
          />
        </label>

        <label>
          PIN:
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4-stellig"
            required
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <button type="submit">Anmelden</button>
      </form>
    </div>
  );
}
