import React, { useRef, useState } from "react";

export const EMPLOYEE_APP_URL = "https://zeiterfassung-rho.vercel.app";

export default function EmployeeAppLink({ currentUser, role }) {
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);
  if (role !== "admin" || currentUser?.role !== "admin") return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(EMPLOYEE_APP_URL);
      setMessage("Link kopiert – bereit zum Weitergeben.");
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setMessage("Bitte den markierten Link manuell kopieren.");
    }
  }

  return (
    <div className="employee-app-link">
      <label>
        <strong>Link für Mitarbeiter</strong>
        <input ref={inputRef} className="hbz-input" type="text" readOnly
          value={EMPLOYEE_APP_URL} onFocus={(event) => event.target.select()} />
      </label>
      <button type="button" className="hbz-btn" onClick={copyLink}>Link kopieren</button>
      <small>Die Mitarbeiter melden sich mit ihren eigenen Zugangsdaten an.</small>
      <span role="status" aria-live="polite">{message}</span>
    </div>
  );
}
