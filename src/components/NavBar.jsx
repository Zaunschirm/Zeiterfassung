import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

// CI-Farben
const BROWN = "#8B5E3C";
const BROWN_HOVER = "#A5724C";
const DARK = "#12100E";

export default function NavBar({ userRole = "mitarbeiter", onLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => {
    try {
      // alles leeren (Login, Rolle usw.)
      localStorage.clear();
    } finally {
      if (onLogout) onLogout();
      navigate("/", { replace: true });
    }
  };

  const NavLink = ({ to, children }) => {
    const active = pathname === to;
    return (
      <Link
        to={to}
        style={{
          color: "white",
          textDecoration: "none",
          padding: "6px 10px",
          borderRadius: 8,
          backgroundColor: active ? BROWN_HOVER : "transparent",
          fontWeight: 600,
        }}
      >
        {children}
      </Link>
    );
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        backgroundColor: BROWN,
        borderBottom: `4px solid ${DARK}`,
      }}
    >
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 16px",
          color: "white",
        }}
      >
        {/* left */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>
            Holzbau Zaunschirm
          </span>

          <NavLink to="/zeiterfassung">Zeiterfassung</NavLink>

          {(userRole === "admin" || userRole === "teamleiter") && (
            <>
              <NavLink to="/monatsübersicht">Monatsübersicht</NavLink>
              <NavLink to="/mitarbeiter">Mitarbeiter</NavLink>
            </>
          )}

          <NavLink to="/projektfotos">Projektfotos</NavLink>
        </div>

        {/* right */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 13,
              opacity: 0.9,
              background: "rgba(0,0,0,.15)",
              padding: "3px 8px",
              borderRadius: 6,
            }}
            title="Rolle"
          >
            {userRole}
          </span>

          <button
            onClick={handleLogout}
            style={{
              backgroundColor: DARK,
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "7px 12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
            aria-label="Logout"
          >
            Logout
          </button>
        </div>
      </nav>
    </header>
  );
}
