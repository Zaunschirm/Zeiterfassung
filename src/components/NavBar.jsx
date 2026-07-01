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
    { to: "/urlaub", label: "Abwesenheiten" },
    { to: "/monatsuebersicht", label: "Monatsübersicht" },
  ];

  const moreLinks = [{ to: "/regieberichte", label: "Regieberichte" }, { to: "/projektfotos", label: "Projektfotos" }];

  const adminLinks = [
    ...(canSeeAdmin ? [{ to: "/projekte", label: "Projekte" }] : []),
    ...(canSeeAdmin ? [{ to: "/mitarbeiter", label: "Mitarbeiter" }] : []),
    ...(isAdmin ? [{ to: "/jahresuebersicht", label: "Jahresübersicht" }] : []),
  ];

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
      <nav className="app-nav" aria-label="Hauptnavigation">
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
          {mainLinks.map((link) => renderNavLink(link.to, link.label))}
          <details className="app-nav-more">
            <summary className="app-nav-btn">Mehr</summary>
            <div className="app-nav-dropdown">
              {moreLinks.map((link) => renderNavLink(link.to, link.label))}
            </div>
          </details>
          {adminLinks.length > 0 && (
            <details className="app-nav-more">
              <summary className="app-nav-btn">Verwaltung</summary>
              <div className="app-nav-dropdown">
                {adminLinks.map((link) => renderNavLink(link.to, link.label))}
              </div>
            </details>
          )}
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
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
        >
          {mobileOpen ? "Schließen" : "Menü"}
        </button>
      </nav>

      {mobileOpen && (
        <div className="app-nav-menu-mobile" id="mobile-navigation">
          <div className="app-nav-menu-mobile-row">
            {mainLinks.map((link) => renderNavLink(link.to, link.label))}
            {moreLinks.map((link) => renderNavLink(link.to, link.label))}
            {adminLinks.length > 0 && <div className="app-nav-mobile-heading">Verwaltung</div>}
            {adminLinks.map((link) => renderNavLink(link.to, link.label))}
            <button type="button" className="app-nav-btn" onClick={onLogout}>
              <span className="app-nav-label">Logout</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
