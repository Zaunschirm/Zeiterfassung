import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import LoginPanel from "./components/LoginPanel.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx";
import ProjectPhotos from "./components/ProjectPhotos.jsx";
import EmployeeList from "./components/EmployeeList.jsx";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx";
import ProjectAdmin from "./components/ProjectAdmin.jsx";

import { APP_VERSION } from "./version";
import "./styles.css";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Optional: Session wiederherstellen
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("hbz_user");
      if (raw) {
        const u = JSON.parse(raw);
        setCurrentUser(u);
        setRole(u?.role || "mitarbeiter");
        setLoggedIn(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    // Wenn bereits eingeloggt, auf Zeiterfassung weiterleiten
    if (loggedIn && location.pathname === "/") {
      navigate("/zeiterfassung", { replace: true });
    }
  }, [loggedIn, location.pathname, navigate]);

  // LoginPanel ruft diesen Handler auf (übergibt optional user-Objekt)
  const handleLogin = (user) => {
    setLoggedIn(true);
    if (user) {
      setCurrentUser(user);
      setRole(user?.role || "mitarbeiter");
      try {
        sessionStorage.setItem("hbz_user", JSON.stringify(user));
      } catch {}
    }
    navigate("/zeiterfassung", { replace: true });
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setCurrentUser(null);
    setRole(null);
    try {
      sessionStorage.removeItem("hbz_user");
    } catch {}
    navigate("/", { replace: true });
  };

  return (
    <div className="App">
      {loggedIn && (
        <NavBar
          onLogout={handleLogout}
          role={role}
          currentUser={currentUser}
          // setCurrentView bleibt optional für Abwärtskompatibilität
        />
      )}

      <Routes>
        {!loggedIn ? (
          <>
            <Route path="/" element={<LoginPanel onLogin={handleLogin} />} />
            {/* Alles andere auf Login umlenken */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            {/* Zeit-Erfassung */}
            <Route path="/zeiterfassung" element={<DaySlider />} />

            {/* Projekte anlegen / verwalten */}
            <Route path="/projekte" element={<ProjectAdmin />} />

            {/* Monatsübersicht */}
            <Route path="/monatsuebersicht" element={<MonthlyOverview />} />

            {/* Projektfotos */}
            <Route path="/projektfotos" element={<ProjectPhotos />} />

            {/* Mitarbeiterverwaltung */}
            <Route path="/mitarbeiter" element={<EmployeeList />} />

            {/* Default: wenn eingeloggt, aber auf / -> zur Zeiterfassung */}
            <Route path="/" element={<Navigate to="/zeiterfassung" replace />} />
            <Route path="*" element={<Navigate to="/zeiterfassung" replace />} />
          </>
        )}
      </Routes>

      <footer className="app-footer">
        <div>Holzbau Zaunschirm · Zeiterfassung</div>
        <div>Version: {APP_VERSION}</div>
      </footer>
    </div>
  );
}
