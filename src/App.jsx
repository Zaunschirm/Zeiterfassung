import React, { Suspense, useMemo } from "react";
import { HashRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

// ——— deine bestehenden Komponenten (bitte Pfade ggf. angleichen) ———
import NavBar from "./components/NavBar";
import TimeTracking from "./components/TimeTracking";          // Zeiterfassung
import ProjectAdmin from "./components/ProjectAdmin";          // Projekte anlegen/bearbeiten
import ProjectPhotos from "./components/ProjectPhotos";        // Projektfotos
import MonthlyOverview from "./components/MonthlyOverview";    // Monatsübersicht
import EmployeeList from "./components/EmployeeList";          // Mitarbeiter
import LoginPanel from "./components/LoginPanel";              // euer Code+PIN-Login

// Optional: deine Sitzung/Session aus dem Store/Supabase o.ä.
import { useSession } from "./hooks/useSession";               // <- falls vorhanden

// ——— Version/Build-Anzeige (falls schon vorhanden: so lassen) ———
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
  const { user } = useSession?.() ?? { user: null }; // robust falls Hook nicht existiert
  const role = user?.role || user?.rolle || user?.permissions || "mitarbeiter";

  const allowed = useMemo(() => allow.includes(role), [allow, role]);
  if (!user) return <Navigate to="/" replace />;            // nicht eingeloggt → Start (Zeiterfassung/ Login)
  if (!allowed) return <Navigate to="/" replace />;         // keine Rechte → Start
  return <Outlet />;
}

// ——— Fallback-Komponenten ———
const Loader = () => <div style={{ padding: 16 }}>Lade…</div>;
const NotFound = () => <Navigate to="/" replace />;

export default function App() {
  return (
    <HashRouter>
      <NavBar />

      {/* Seiteninhalt */}
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* Start/Default: Zeiterfassung */}
          <Route path="/" element={<TimeTracking />} />

          {/* Projekte: Erstellung/Bearbeitung (Admin/Teamleiter) */}
          <Route element={<ProtectedRoute allow={["admin", "teamleiter"]} />}>
            <Route path="/project-admin" element={<ProjectAdmin />} />
            {/* Alias falls im Menü „/projects“ verlinkt wurde */}
            <Route path="/projects" element={<ProjectAdmin />} />
          </Route>

          {/* Projektfotos */}
          <Route path="/project-photos" element={<ProjectPhotos />} />

          {/* Monatsübersicht */}
          <Route path="/monthly" element={<MonthlyOverview />} />

          {/* Mitarbeiterverwaltung (Admin/Teamleiter) */}
          <Route element={<ProtectedRoute allow={["admin", "teamleiter"]} />}>
            <Route path="/employees" element={<EmployeeList />} />
          </Route>

          {/* Loginpanel (falls direkt erreichbar sein soll) */}
          <Route path="/login" element={<LoginPanel />} />

          {/* Catch-All → zurück zur Startseite */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      {/* Footer mit Version/Build (nur Anzeige, keine Logik verändert) */}
      <footer className="app-footer" style={{
        marginTop: 24, padding: "10px 16px", borderTop: "1px solid #e5e5e5",
        fontSize: 12, color: "#6b7280", display: "flex", gap: 8, flexWrap: "wrap"
      }}>
        <span>Holzbau Zaunschirm · Zeiterfassung</span>
        <span>•</span>
        <span>Version {APP_VERSION}{APP_COMMIT ? ` (${APP_COMMIT})` : ""}</span>
        <span>•</span>
        <span>Build {BUILD_STAMP}</span>
      </footer>
    </HashRouter>
  );
}
