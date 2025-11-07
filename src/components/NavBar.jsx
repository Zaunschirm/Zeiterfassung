import React from "react";
import { useNavigate, Link } from "react-router-dom";
import "./styles.css"; // für Farben und Layout

export default function NavBar({ userRole, onLogout }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    // optional Supabase / Local Storage / Session clear
    localStorage.removeItem("user");
    if (onLogout) onLogout();
    navigate("/login");
  };

  return (
    <nav
      style={{
        backgroundColor: "#8B5E3C",
        color: "white",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 20px",
        borderBottom: "4px solid #12100E",
      }}
    >
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <span style={{ fontWeight: "bold", fontSize: "18px" }}>
          Holzbau Zaunschirm
        </span>
        <Link to="/zeiterfassung" className="nav-link">
          Zeiterfassung
        </Link>
        {(userRole === "admin" || userRole === "teamleiter") && (
          <>
            <Link to="/monatsuebersicht" className="nav-link">
              Monatsübersicht
            </Link>
            <Link to="/mitarbeiter" className="nav-link">
              Mitarbeiter
            </Link>
          </>
        )}
        <Link to="/projektfotos" className="nav-link">
          Projektfotos
        </Link>
      </div>

      <button
        onClick={handleLogout}
        style={{
          backgroundColor: "#12100E",
          color: "white",
          border: "none",
          borderRadius: "6px",
          padding: "6px 12px",
          cursor: "pointer",
          fontWeight: "600",
        }}
      >
        Logout
      </button>
    </nav>
  );
}
