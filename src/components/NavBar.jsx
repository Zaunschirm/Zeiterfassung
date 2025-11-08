// src/components/NavBar.jsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const btn = (active) => ({
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #cdb9a7",
  background: active ? "#8B5E3C" : "#fff5ee",
  color: active ? "#fff" : "#4a3a2f",
  fontWeight: 700,
  marginRight: 10,
  textDecoration: "none",
});

export default function NavBar() {
  const loc = useLocation();
  const nav = useNavigate();

  const role = (localStorage.getItem("meRole") || "mitarbeiter").toLowerCase();
  const isAdminOrTL = role === "admin" || role === "teamleiter";

  const logout = () => {
    localStorage.removeItem("isAuthed");
    localStorage.removeItem("meId");
    localStorage.removeItem("meName");
    localStorage.removeItem("meCode");
    localStorage.removeItem("meRole");
    localStorage.removeItem("meNotfallAdmin");
    nav("/", { replace: true });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10 }}>
      <Link to="/zeiterfassung" style={btn(loc.pathname.includes("/zeiterfassung"))}>
        Zeiterfassung
      </Link>

      <Link to="/monatsuebersicht" style={btn(loc.pathname.includes("/monatsuebersicht"))}>
        Monatsübersicht
      </Link>

      {/* Beispiel: Admin/Teamleiter bekommen einen Mitarbeiter-Tab */}
      {isAdminOrTL && (
        <Link to="/mitarbeiter" style={btn(loc.pathname.includes("/mitarbeiter"))}>
          Mitarbeiter
        </Link>
      )}

      <div style={{ marginLeft: "auto" }}>
        <button onClick={logout} style={btn(false)}>Logout</button>
      </div>
    </div>
  );
}
