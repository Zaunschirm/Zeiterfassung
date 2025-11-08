// src/App.jsx
import React, { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";

import NavBar from "./components/NavBar";
import LoginPanel from "./components/LoginPanel";

import DaySlider from "./components/DaySlider";
import MonthlyOverview from "./components/MonthlyOverview";
import EmployeeList from "./components/EmployeeList";
import EmployeeCreate from "./components/EmployeeCreate";
import ProjectPhotos from "./components/ProjectPhotos";
import ProjectPhotoUpload from "./components/ProjectPhotoUpload";
import ProjectAdmin from "./components/ProjectAdmin";

import { getSession, currentUser, hasRole } from "./lib/session";

function Guard({ children, allow = "mitarbeiter" }) {
  // allow: "mitarbeiter" | "teamleiter" | "admin"
  if (allow === "admin" && !hasRole("admin")) return <Navigate to="/zeiterfassung" replace />;
  if (allow === "teamleiter" && !hasRole("teamleiter")) return <Navigate to="/zeiterfassung" replace />;
  return children;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
  }, []);

  if (!ready) return null;

  const user = currentUser();

  return (
    <HashRouter>
      {user ? <NavBar /> : null}

      <Routes>
        {/* Login */}
        <Route path="/" element={user ? <Navigate to="/zeiterfassung" replace /> : <LoginPanel />} />

        {/* Zeiterfassung für alle */}
        <Route path="/zeiterfassung" element={<DaySlider user={user} />} />

        {/* Projektfotos */}
        <Route path="/projektfotos" element={<ProjectPhotos user={user} />} />
        <Route path="/projektfotos/upload" element={<ProjectPhotoUpload user={user} />} />

        {/* Teamleiter + Admin */}
        <Route
          path="/monatsuebersicht"
          element={
            <Guard allow="teamleiter">
              <MonthlyOverview user={user} />
            </Guard>
          }
        />
        <Route
          path="/mitarbeiter"
          element={
            <Guard allow="teamleiter">
              <EmployeeList user={user} />
            </Guard>
          }
        />
        <Route
          path="/mitarbeiter/create"
          element={
            <Guard allow="teamleiter">
              <EmployeeCreate user={user} />
            </Guard>
          }
        />

        {/* Admin */}
        <Route
          path="/project-admin"
          element={
            <Guard allow="admin">
              <ProjectAdmin user={user} />
            </Guard>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={user ? "/zeiterfassung" : "/"} replace />} />
      </Routes>
    </HashRouter>
  );
}
