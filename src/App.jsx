import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import LoginPanel from "./components/LoginPanel.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx";
import ProjectPhotos from "./components/ProjectPhotos.jsx";
import EmployeeList from "./components/EmployeeList.jsx";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx";
import ProjectAdmin from "./components/ProjectAdmin.jsx";

import "./styles.css";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Wenn bereits eingeloggt, auf Zeiterfassung weiterleiten
    if (loggedIn && location.pathname === "/") {
      navigate("/zeiterfassung", { replace: true });
    }
  }, [loggedIn, location.pathname, navigate]);

  const handleLogin = () => {
    setLoggedIn(true);
    navigate("/zeiterfassung", { replace: true });
  };

  const handleLogout = () => {
    setLoggedIn(false);
    navigate("/", { replace: true });
  };

  return (
    <div className="App">
      {loggedIn && <NavBar onLogout={handleLogout} />}

      <Routes>
        {!loggedIn ? (
          <>
            <Route path="/" element={<LoginPanel onLogin={handleLogin} />} />
            {/* Alles andere auf Login umlenken */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/zeiterfassung" element={<DaySlider />} />
            <Route path="/projekte" element={<ProjectAdmin />} />
            <Route path="/monatsuebersicht" element={<MonthlyOverview />} />
            <Route path="/projektfotos" element={<ProjectPhotos />} />
            <Route path="/mitarbeiter" element={<EmployeeList />} />
            {/* Default: wenn eingeloggt, aber auf / -> zur Zeiterfassung */}
            <Route path="/" element={<Navigate to="/zeiterfassung" replace />} />
            <Route path="*" element={<Navigate to="/zeiterfassung" replace />} />
          </>
        )}
      </Routes>

      <footer className="app-footer">
        <span>Holzbau Zaunschirm · Zeiterfassung</span>
      </footer>
    </div>
  );
}
