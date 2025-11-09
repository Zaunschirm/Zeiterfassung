import React, { Suspense, useMemo } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom"; // <— HashRouter entfernt

// ——— bestehende Komponenten ———
import NavBar from "./components/NavBar";
import TimeTracking from "./components/TimeTracking";
import ProjectAdmin from "./components/ProjectAdmin";
import ProjectPhotos from "./components/ProjectPhotos";
import MonthlyOverview from "./components/MonthlyOverview";
import EmployeeList from "./components/EmployeeList";
import LoginPanel from "./components/LoginPanel";

// ——— Sitzung/Session ———
import { useSession } from "./hooks/useSession";

// ——— Version/Build-Anzeige ———
import pkg from "../package.json";
const ENV_VERSION = import.meta?.env?.VITE_BUILD_VERSION;
const ENV_SHA     = import.meta?.env?.VITE_GIT_SHA;
const ENV_TIME    = import.meta?.env?.VITE_BUILD_TIME;
export const APP_VERSION = (ENV_VERSION && `v${ENV_VERSION}`) || (pkg?.version ? `v${pkg.version}` : "dev");
export const APP_COMMIT  = ENV_SHA ? ENV_SHA.substring(0, 7) : "";
export const BUILD_STAMP = ENV_TIME
  ? new Date(ENV_TIME).toLocaleString("de-AT")
  : new Date().toLocaleString("de-AT");

// ——— Guard: schützt Admin-/Teamleiter-Routen ———
function ProtectedRoute({ allow = ["admin", "teamleiter"] }) {
  const { user } = useSession?.() ?? { user: null };
  const role = user?.role || user?.rolle || user?.permissions || "mitarbeiter";

  const allowed = useMemo(() => allow.includes(role), [allow, role]);
  if (!user) return <Navigate to="/" replace />;
  if (!allowed) return <Navigate to="/" replace />;
  return <Outlet />;
}

// ——— Fallback-Komponenten ———
const Loader = () => <div style={{ padding: 16 }}>Lade…</div>;
const NotFound = () => <Navigate to="/" replace />;

export default function App() {
  return (
    <>
      <NavBar />

      {/* Seiteninhalt */}
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* Start/Default: Zeiterfassung */}
          <Route path="/" element={<TimeTracking />} />

          {/* Projekte: Erstellung/Bearbeitung (Admin/Teamleiter) */}
          <Route element={<ProtectedRoute allow={["admin", "teamleiter"]} />}>
            <Route path="/project-admin" element={<ProjectAdmin />} />
            <Route path="/projects" element={<ProjectAdmin />} />
          </Route>

          {/* Projektfotos */}
          <Route path="/project-photos" element={<ProjectPhotos />} />

          {/* Monatsübersicht */}
          <Route path="/monthly" element={<MonthlyOverview />} />

          {/* Mitarbeiterverwaltung */}
          <Route element={<ProtectedRoute allow={["admin", "teamleiter"]} />}>
            <Route path="/employees" element={<EmployeeList />} />
          </Route>

          {/* Loginpanel */}
          <Route path="/login" element={<LoginPanel />} />

          {/* Catch-All */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      {/* Footer mit Version/Build */}
      <footer
        className="app-footer"
        style={{
          marginTop: 24,
          padding: "10px 16px",
          borderTop: "1px solid #e5e5e5",
          fontSize: 12,
          color: "#6b7280",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span>Holzbau Zaunschirm · Zeiterfassung</span>
        <span>•</span>
        <span>
          Version {APP_VERSION}
          {APP_COMMIT ? ` (${APP_COMMIT})` : ""}
        </span>
        <span>•</span>
        <span>Build {BUILD_STAMP}</span>
      </footer>
    </>
  );
}
