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
import WorkAssignments from "./components/WorkAssignments.jsx";

import { getSession, setSession, clearSession } from "./lib/session";
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
      const stored = getSession();
      const user = stored?.user || null;

      if (user) {
        setCurrentUser(user);
        setRole(user?.role || "mitarbeiter");
        setLoggedIn(true);
      }
    } catch (e) {
      console.error("[App] Session load error:", e);
    }
  }, []);

  useEffect(() => {
    if (loggedIn && (location.pathname === "/" || location.pathname === "/login")) {
      navigate("/zeiterfassung", { replace: true });
    }
  }, [loggedIn, location.pathname, navigate]);

  const handleLogin = (user, persistent = false) => {
    if (!user) return;

    setLoggedIn(true);
    setCurrentUser(user);
    setRole(user?.role || "mitarbeiter");

    try {
      setSession({ user }, persistent);
    } catch (e) {
      console.error("[App] Session save error:", e);
    }

    navigate("/zeiterfassung", { replace: true });
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setCurrentUser(null);
    setRole(null);

    try {
      clearSession();
    } catch (e) {
      console.error("[App] Session clear error:", e);
    }

    navigate("/", { replace: true });
  };


  useEffect(() => {
    function isTyping(target) {
      if (!target) return false;
      const tag = target.tagName?.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      );
    }

    function handleKeyDown(e) {
      if (isTyping(e.target)) return;
      if (location.pathname !== "/zeiterfassung") return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hbz-prev-day"));
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("hbz-next-day"));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [location.pathname]);

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
                <Route path="/arbeitseinteilung" element={<WorkAssignments />} />
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
          <Route path="/login" element={<LoginPanel onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </div>
  );
}