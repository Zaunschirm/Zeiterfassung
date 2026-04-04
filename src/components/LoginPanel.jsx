import React, { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function normalizeRole(role) {
  const r = String(role || "mitarbeiter").trim().toLowerCase();
  if (r === "admin") return "admin";
  if (r === "teamleiter") return "teamleiter";
  return "mitarbeiter";
}

function getDisplayName(row) {
  return (
    row?.name ||
    row?.full_name ||
    row?.mitarbeitername ||
    row?.employee_name ||
    row?.code ||
    "Mitarbeiter"
  );
}

export default function LoginPanel({ onLogin }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const codeValue = useMemo(() => code.trim(), [code]);
  const pinValue = useMemo(() => pin.trim(), [pin]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!codeValue || !pinValue) {
      setError("Bitte Code und PIN eingeben.");
      return;
    }

    try {
      setLoading(true);

      const { data, error: sbError } = await supabase
        .from("employees")
        .select("id, code, name, role, active, disabled, pin")
        .eq("code", codeValue)
        .limit(1)
        .maybeSingle();

      if (sbError) throw sbError;

      if (!data) {
        setError("Mitarbeiter nicht gefunden.");
        return;
      }

      if (data.disabled === true || data.active === false) {
        setError("Dieser Mitarbeiter ist deaktiviert.");
        return;
      }

      const storedPin = data?.pin != null ? String(data.pin).trim() : "";
      if (!storedPin) {
        setError("Für diesen Mitarbeiter ist keine PIN hinterlegt.");
        return;
      }

      if (storedPin !== pinValue) {
        setError("PIN ist falsch.");
        return;
      }

      onLogin?.(
        {
          id: data.id,
          code: data.code,
          name: getDisplayName(data),
          role: normalizeRole(data.role),
        },
        rememberMe
      );
    } catch (err) {
      console.error("[LoginPanel] login error:", err);
      setError("Login fehlgeschlagen. Bitte Konsole prüfen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-logo-row">
          <div className="login-logo-circle">
            <span>HZ</span>
          </div>

          <div>
            <div className="login-logo-text-main">Holzbau Zaunschirm</div>
            <div className="login-logo-text-sub">Zeiterfassung</div>
          </div>
        </div>

        <div className="login-subtitle">
          Bitte mit Mitarbeiter-Code und 4-stelliger PIN anmelden.
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field-inline" style={{ marginBottom: 10 }}>
            <label className="hbz-label">Mitarbeiter-Code</label>
            <input
              type="text"
              className="hbz-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="z. B. MA01"
              autoComplete="username"
            />
          </div>

          <div className="field-inline">
            <label className="hbz-label">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={10}
              className="hbz-input"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="••••"
              autoComplete="current-password"
            />
          </div>

          <div className="field-inline" style={{ marginTop: 10 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "#5a3a23",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Dauerhaft eingeloggt bleiben
            </label>
          </div>

          {error && <div className="login-error">{error}</div>}

          <div className="login-submit-row">
            <button
              type="submit"
              className="save-btn lg"
              disabled={loading}
            >
              {loading ? "Anmeldung läuft…" : "Anmelden"}
            </button>
          </div>
        </form>

        <div className="login-footer">
          <span>Holzbau Zaunschirm GmbH</span>
          <span>Zeiterfassung</span>
        </div>
      </div>
    </div>
  );
}