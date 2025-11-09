import React from "react";
import { NavLink } from "react-router-dom";
// optional: Benutzer/Role anzeigen
import { useSession } from "../hooks/useSession"; // falls vorhanden

const linkStyle = ({ isActive }) => ({
  padding: "8px 12px",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
  background: isActive ? "#5c3b27" : "transparent",
  color: isActive ? "#fff" : "#5c3b27",
  border: "1px solid #5c3b27",
});

export default function NavBar() {
  const { user, logout } = useSession?.() ?? { user: null, logout: null };
  const role = user?.role || user?.rolle || "mitarbeiter";

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 10,
      display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
      background: "#e9dccf", borderBottom: "1px solid #d6c8b8"
    }}>
      <div style={{ fontWeight: 800, marginRight: 8 }}>Holzbau Zaunschirm</div>

      {/* Hauptnavigation */}
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <NavLink to="/" style={linkStyle}>Zeiterfassung</NavLink>
        <NavLink to="/project-photos" style={linkStyle}>Projektfotos</NavLink>
        <NavLink to="/monthly" style={linkStyle}>Monatsübersicht</NavLink>

        {/* Nur Admin/Teamleiter sehen diese Menüpunkte */}
        {(role === "admin" || role === "teamleiter") && (
          <>
            <NavLink to="/project-admin" style={linkStyle}>Projekte</NavLink>
            <NavLink to="/employees" style={linkStyle}>Mitarbeiter</NavLink>
          </>
        )}
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        {user ? (
          <>
            <span style={{ color: "#5c3b27", fontWeight: 600 }}>
              {user?.name || user?.displayName || "Angemeldet"}
              {role ? ` (${role})` : ""}
            </span>
            <button
              type="button"
              onClick={() => logout?.()}
              style={{
                padding: "6px 10px", borderRadius: 8, border: "1px solid #5c3b27",
                background: "#fff", color: "#5c3b27", fontWeight: 600, cursor: "pointer"
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <NavLink to="/login" style={linkStyle}>Login</NavLink>
        )}
      </div>
    </header>
  );
}
