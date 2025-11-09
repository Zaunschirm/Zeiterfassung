import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

/**
 * NavBar – 1:1 mit allen Funktionen, nichts entfernt:
 * - onLogout (Pflicht): wird beim Logout-Button aufgerufen
 * - setCurrentView (optional): wird zusätzlich zu navigate() gesetzt (Abwärtskompatibilität)
 * - currentUser (optional): Anzeige/Platzhalter
 * - role (optional): 'admin' | 'teamleiter' | 'mitarbeiter' – steuert Sichtbarkeit
 */
export default function NavBar({ onLogout, setCurrentView, currentUser, role }) {
  const navigate = useNavigate();

  // einheitlicher Click-Handler, behält alte setCurrentView-Logik bei
  const go = (path, viewKey) => {
    navigate(path);
    if (typeof setCurrentView === "function" && viewKey) {
      setCurrentView(viewKey);
    }
  };

  const linkStyle = ({ isActive }) => ({
    padding: "6px 10px",
    textDecoration: "none",
    color: "inherit",
    borderRadius: "8px",
    fontWeight: isActive ? 700 : 500,
    background: isActive ? "rgba(0,0,0,0.08)" : "transparent",
    marginRight: 6,
    display: "inline-block",
  });

  const canSeeAdmin = role === "admin" || role === "teamleiter";

  return (
    <nav
      className="hbz-navbar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 10px",
        background: "var(--hbz-nav-bg, #ead8c3)", // bleibt CI-freundlich
        borderBottom: "1px solid rgba(0,0,0,0.1)",
      }}
    >
      {/* Links */}
      <div className="hbz-nav-left" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <NavLink
          to="/zeiterfassung"
          style={linkStyle}
          onClick={() => go("/zeiterfassung", "zeiterfassung")}
        >
          Zeiterfassung
        </NavLink>

        <NavLink
          to="/projektfotos"
          style={linkStyle}
          onClick={() => go("/projektfotos", "projektfotos")}
        >
          Projektfotos
        </NavLink>

        <NavLink
          to="/monatsuebersicht"
          style={linkStyle}
          onClick={() => go("/monatsuebersicht", "monatsuebersicht")}
        >
          Monatsübersicht
        </NavLink>

        {canSeeAdmin && (
          <>
            <NavLink
              to="/projekte"
              style={linkStyle}
              onClick={() => go("/projekte", "projekte")}
            >
              Projekte
            </NavLink>

            <NavLink
              to="/mitarbeiter"
              style={linkStyle}
              onClick={() => go("/mitarbeiter", "mitarbeiter")}
            >
              Mitarbeiter
            </NavLink>
          </>
        )}
      </div>

      {/* Rechts: User + Logout */}
      <div className="hbz-nav-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {currentUser && (
          <span
            title={currentUser?.email || ""}
            style={{ opacity: 0.8, fontSize: 13, marginRight: 6 }}
          >
            {currentUser?.name || "Eingeloggt"}
            {role ? ` (${role})` : ""}
          </span>
        )}

        <button
          type="button"
          className="nav-btn"
          onClick={onLogout}
          style={{
            cursor: "pointer",
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.2)",
            background: "#fff",
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
