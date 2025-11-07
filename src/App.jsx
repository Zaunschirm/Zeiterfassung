import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import NavBar from "./components/NavBar";
import LoginPanel from "./components/LoginPanel";
import DaySlider from "./components/DaySlider";
import MonthlyOverview from "./components/MonthlyOverview";
import EmployeeList from "./components/EmployeeList";
import ProjectPhotos from "./components/ProjectPhotos";

// --------- einfache Helpers (wie bisher bei dir) ----------
function isAuthed() {
  return localStorage.getItem("isAuthed") === "1";
}
function role() {
  return (localStorage.getItem("meRole") || "mitarbeiter").toLowerCase();
}
function isManager() {
  const r = role();
  return r === "admin" || r === "teamleiter";
}

// Route-Guards
function Private({ children }) {
  return isAuthed() ? children : <Navigate to="/" replace />;
}
function OnlyManager({ children }) {
  return isManager() ? children : <Navigate to="/zeiterfassung" replace />;
}

export default function App() {
  const handleLogout = () => {
    // optional weitere Keys hier löschen (z. B. userId, token, etc.)
    localStorage.clear();
    // harte Weiterleitung (Browser-Refresh, verhindert "Zurück" ins App-UI)
    window.location.href = "/";
  };

  return (
    <>
      {isAuthed() && (
        <NavBar userRole={role()} onLogout={handleLogout} />
      )}

      <Routes>
        {/* Login */}
        <Route path="/" element={<LoginPanel />} />

        {/* Zeiterfassung */}
        <Route
          path="/zeiterfassung"
          element={
            <Private>
              <DaySlider />
            </Private>
          }
        />

        {/* Monatsübersicht (editierbar für admin & teamleiter) */}
        <Route
          path="/monatsübersicht"
          element={
            <Private>
              <OnlyManager>
                <MonthlyOverview />
              </OnlyManager>
            </Private>
          }
        />

        {/* Mitarbeiterverwaltung (nur admin & teamleiter) */}
        <Route
          path="/mitarbeiter"
          element={
            <Private>
              <OnlyManager>
                <EmployeeList />
              </OnlyManager>
            </Private>
          }
        />

        {/* Projektfotos (für alle eingeloggten) */}
        <Route
          path="/projektfotos"
          element={
            <Private>
              <ProjectPhotos />
            </Private>
          }
        />

        {/* Fallback */}
        <Route
          path="*"
          element={
            <Navigate
              to={isAuthed() ? "/zeiterfassung" : "/"}
              replace
            />
          }
        />
      </Routes>
    </>
  );
}
