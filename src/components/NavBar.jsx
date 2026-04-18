import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

export default function NavBar({ onLogout, currentUser, role }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = role === "admin";
  const canSeeAdmin = role === "admin" || role === "teamleiter";

  const initials = useMemo(() => {
    const name = currentUser?.name || "HB";
    return String(name)
      .split(" ")
      .map((p) => p[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [currentUser]);

  const mainLinks = [
    { to: "/zeiterfassung", label: "Zeiterfassung" },
    { to: "/arbeitseinteilung", label: "Arbeitseinteilung" },
    { to: "/projektfotos", label: "Projektfotos" },
    { to: "/monatsuebersicht", label: "Monatsübersicht" },
  ];

  const adminLinks = [
    ...(canSeeAdmin ? [{ to: "/projekte", label: "Projekte" }] : []),
    ...(canSeeAdmin ? [{ to: "/mitarbeiter", label: "Mitarbeiter" }] : []),
    ...(isAdmin ? [{ to: "/jahresuebersicht", label: "Jahresübersicht" }] : []),
  ];

  const allLinks = [...mainLinks, ...adminLinks];

  const renderNavLink = (to, label) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        `app-nav-btn${isActive ? " app-nav-btn-active" : ""}`
      }
      onClick={() => setMobileOpen(false)}
    >
      <span className="app-nav-label">{label}</span>
    </NavLink>
  );

  return (
    <>
      <nav className="app-nav">
        <div className="app-nav-left">
          <div className="app-logo-circle">
            <span>HZ</span>
          </div>
          <div className="app-title">
            <div className="app-title-main">Holzbau Zaunschirm</div>
            <div className="app-title-sub">Zeiterfassung</div>
          </div>
        </div>

        <div className="app-nav-center">
          {allLinks.map((link) => renderNavLink(link.to, link.label))}
        </div>

        <div className="app-nav-right">
          <div className="app-user-badge">
            <div className="app-user-initial">{initials}</div>
            <span className="app-user-name">
              {currentUser?.name || "Eingeloggt"}
              {role ? ` (${role})` : ""}
            </span>
          </div>

          <button type="button" className="hbz-btn" onClick={onLogout}>
            Logout
          </button>
        </div>

        <button
          type="button"
          className="app-nav-mobile-toggle"
          onClick={() => setMobileOpen((v) => !v)}
        >
          Menü
        </button>
      </nav>

      {mobileOpen && (
        <div className="app-nav-menu-mobile">
          <div className="app-nav-menu-mobile-row">
            {allLinks.map((link) => renderNavLink(link.to, link.label))}
            <button type="button" className="app-nav-btn" onClick={onLogout}>
              <span className="app-nav-label">Logout</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}