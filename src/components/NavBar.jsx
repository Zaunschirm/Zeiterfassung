// src/components/NavBar.jsx
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { currentUser, clearSession, hasRole } from "../lib/session";

export default function NavBar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const user = currentUser();
  const role = (user?.role || "").toLowerCase();

  if (!user) return null; // nicht eingeloggt => keine Navbar

  const isActive = (hashPath) => loc.pathname === hashPath;

  const logout = () => {
    clearSession();
    navigate("/", { replace: true });
    // HashRouter: zur Login-Seite
    window.location.hash = "#/";
  };

  return (
    <div className="topbar">
      <div className="brand">Holzbau Zaunschirm</div>

      <nav className="menu">
        <Link className={isActive("/zeiterfassung") ? "active" : ""} to="/zeiterfassung">
          Zeiterfassung
        </Link>

        <Link className={isActive("/projektfotos") ? "active" : ""} to="/projektfotos">
          Projektfotos
        </Link>

        {hasRole("teamleiter") && (
          <>
            <Link className={isActive("/monatsuebersicht") ? "active" : ""} to="/monatsuebersicht">
              Monatsübersicht
            </Link>
            <Link className={isActive("/mitarbeiter") ? "active" : ""} to="/mitarbeiter">
              Mitarbeiter
            </Link>
          </>
        )}

        {hasRole("admin") && (
          <>
            <Link className={isActive("/project-admin") ? "active" : ""} to="/project-admin">
              Projekte
            </Link>
          </>
        )}
      </nav>

      <div className="userbox">
        <span className="user">
          {user.name ?? user.code} <span className="role">({role})</span>
        </span>
        <button className="btn btn-small" onClick={logout}>Logout</button>
      </div>
    </div>
  );
}
