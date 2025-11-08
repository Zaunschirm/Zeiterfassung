// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import NavBar from "./components/NavBar";
import LoginPanel from "./components/LoginPanel";
import DaySlider from "./components/DaySlider";
import MonthlyOverview from "./components/MonthlyOverview";
import EmployeeList from "./components/EmployeeList";
import ProjectPhotos from "./components/ProjectPhotos";

// ---- Helpers (wie gehabt) ----
function isAuthed() { return localStorage.getItem("isAuthed") === "1"; }
function role() { return (localStorage.getItem("meRole") || "mitarbeiter").toLowerCase(); }
function isManager() { const r = role(); return r === "admin" || r === "teamleiter"; }

function Private({ children }) { return isAuthed() ? children : <Navigate to="/" replace />; }
function OnlyManager({ children }) { return isManager() ? children : <Navigate to="/zeiterfassung" replace />; }

export default function App() {
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "#/"; // HashRouter
  };

  return (
    <>
      {isAuthed() && <NavBar userRole={role()} onLogout={handleLogout} />}

      <Routes>
        {/* Login */}
        <Route path="/" element={<LoginPanel />} />

        {/* Zeiterfassung (alle) */}
        <Route path="/zeiterfassung" element={<Private><DaySlider /></Private>} />

        {/* Monatsübersicht (editierbar für Admin/Teamleiter) */}
        <Route path="/monatsübersicht" element={
          <Private><OnlyManager><MonthlyOverview /></OnlyManager></Private>
        }/>

        {/* Mitarbeiter (nur Admin/Teamleiter) */}
        <Route path="/mitarbeiter" element={
          <Private><OnlyManager><EmployeeList /></OnlyManager></Private>
        }/>

        {/* Projektfotos (alle Eingeloggten) */}
        <Route path="/projektfotos" element={<Private><ProjectPhotos /></Private>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={isAuthed() ? "/zeiterfassung" : "/"} replace />} />
      </Routes>
    </>
  );
}
