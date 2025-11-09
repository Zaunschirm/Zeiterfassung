import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ✅ exakte Dateinamen (Linux/Vercel case-sensitiv!)
import LoginPanel from "./components/LoginPanel.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx";
import ProjectPhotos from "./components/ProjectPhotos.jsx";
import EmployeeList from "./components/EmployeeList.jsx";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx";

import "./styles.css";

// ▼▼▼ Neu: feste App-Version (frei anpassbar)
const APP_VERSION = "v1.0.0";
const BUILD_STAMP = new Date().toLocaleDateString("de-AT");

export default function App() {
  // einfache App-Session (NavBar prüft zusätzlich currentUser/role)
  const [currentView, setCurrentView] = useState("login");
  const [loggedIn, setLoggedIn] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // URL → View-Mapping (keine Funktionen entfernt)
  const pathToView = (path) => {
    switch (path) {
      case "/zeiterfassung":
        return "zeiterfassung";
      case "/monatsuebersicht":
      case "/monthly": // Fallback für alte Route
        return "monatsuebersicht";
      case "/projektfotos":
        return "projektfotos";
      case "/mitarbeiter":
        return "mitarbeiter";
      default:
        return loggedIn ? "zeiterfassung" : "login";
    }
  };

  // Reagiere auf URL/Loginstatuts
  useEffect(() => {
    setCurrentView(pathToView(location.pathname));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, loggedIn]);

  const handleLogin = () => {
    setLoggedIn(true);
    navigate("/zeiterfassung", { replace: true });
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setCurrentView("login");
    navigate("/", { replace: true });
  };

  const renderView = () => {
    if (!loggedIn) return <LoginPanel onLogin={handleLogin} />;

    switch (currentView) {
      case "zeiterfassung":
        return <DaySlider />;
      case "monatsuebersicht":
        return <MonthlyOverview />;
      case "projektfotos":
        return <ProjectPhotos />;
      case "mitarbeiter":
        return <EmployeeList />;
      default:
        return <DaySlider />;
    }
  };

  return (
    <div className="App">
      {loggedIn && (
        <NavBar
          setCurrentView={setCurrentView}  // bleibt für Abwärtskompatibilität
          onLogout={handleLogout}          // wichtig: setzt loggedIn=false
        />
      )}
      <main>{renderView()}</main>

      {/* ▼▼▼ Neu: feste Fußzeile mit Version + Datum */}
      <footer className="app-footer">
        <span>Holzbau Zaunschirm · Zeiterfassung</span>
        <span className="sep">•</span>
        <span>Version {APP_VERSION}</span>
        <span className="sep">•</span>
        <span>Build {BUILD_STAMP}</span>
      </footer>
    </div>
  );
}
