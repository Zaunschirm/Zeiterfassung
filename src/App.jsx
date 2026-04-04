import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import LoginPanel from "./components/LoginPanel.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx";
import ProjectPhotos from "./components/ProjectPhotos.jsx";
import EmployeeList from "./components/EmployeeList.jsx";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx";
import ProjectAdmin from "./components/ProjectAdmin.jsx";
import YearOverview from "./components/YearOverview.jsx";

import { APP_VERSION } from "./version";
import "./styles.css";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

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
    if (loggedIn && (location.pathname === "/" || location.pathname === "/login")) {
      navigate("/zeiterfassung", { replace: true });
    }
  }, [loggedIn, location.pathname, navigate]);

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
    <div className="app-root">
      {loggedIn ? (
        <>
          <div className="app-shell">
            <NavBar
              onLogout={handleLogout}
              role={role}
              currentUser={currentUser}
            />

            <div className="app-page">
              <Routes>
                <Route path="/zeiterfassung" element={<DaySlider />} />
                <Route path="/projekte" element={<ProjectAdmin />} />
                <Route path="/jahresuebersicht" element={<YearOverview />} />
                <Route path="/monatsuebersicht" element={<MonthlyOverview />} />
                <Route path="/projektfotos" element={<ProjectPhotos />} />
                <Route path="/mitarbeiter" element={<EmployeeList />} />
                <Route path="/" element={<Navigate to="/zeiterfassung" replace />} />
                <Route path="*" element={<Navigate to="/zeiterfassung" replace />} />
              </Routes>
            </div>
          </div>

          <footer className="app-footer">
            <div>Holzbau Zaunschirm · Zeiterfassung</div>
            <div>Version: {APP_VERSION}</div>
          </footer>
        </>
      ) : (
        <Routes>
          <Route path="/" element={<LoginPanel onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </div>
  );
}