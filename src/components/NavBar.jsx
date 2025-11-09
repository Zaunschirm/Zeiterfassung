import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

/**
 * NavBar – alle bisherigen Funktionen bleiben erhalten:
 * - onLogout (Pflicht)
 * - setCurrentView (optional, wird zusätzlich zu navigate() aufgerufen)
 * - currentUser (optional Anzeige)
 * - role (optional: 'admin' | 'teamleiter' | 'mitarbeiter') steuert Sichtbarkeit
 */
export default function NavBar({ onLogout, setCurrentView, currentUser, role }) {
  const navigate = useNavigate();

  // Zentraler Navigations-Handler: Router + alte View-Logik
  const go = (path, viewKey) => {
    navigate(path);
    if (typeof setCurrentView === "function" && viewKey) {
      setCurrentView(viewKey);
    }
  };

  const linkClass = ({ isActive }) =>
    "nav-btn" + (isActive ? " nav-btn-active" : "");

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
        background: "var(--hbz-nav-bg, #ead8c3)",
        borderBottom: "1px solid rgba(0,0,0,0.1)",
      }}
    >
      {/* Links */}
      <div className="hbz-nav-left" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <NavLink
          to="/zeiterfassung"
          className={linkClass}
          onClick={() => go("/zeiterfassung", "zeiterfassung")}
        >
          Zeiterfassung
        </NavLink>

        <NavLink
          to="/projektfotos"
          className={linkClass}
          onClick={() => go("/projektfotos", "projektfotos")}
        >
          Projektfotos
        </NavLink>

        <NavLink
          to="/monatsuebersicht"
          className={linkClass}
          onClick={() => go("/monatsuebersicht", "monatsuebersicht")}
        >
          Monatsübersicht
        </NavLink>

        {canSeeAdmin && (
          <>
            <NavLink
              to="/projekte"
              className={linkClass}
              onClick={() => go("/projekte", "projekte")}
            >
              Projekte
            </NavLink>

            <NavLink
              to="/mitarbeiter"
              className={linkClass}
              onClick={() => go("/mitarbeiter", "mitarbeiter")}
            >
              Mitarbeiter
            </NavLink>
          </>
        )}
      </div>

      {/* Rechts: Userinfo + Logout */}
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
