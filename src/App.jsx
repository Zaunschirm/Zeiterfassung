import React, { Suspense, useMemo } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom"; // <— HashRouter entfernt

<<<<<<< HEAD
// ✅ exakte Dateinamen (Linux/Vercel case-sensitiv!)
import LoginPanel from "./components/LoginPanel.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx";
import ProjectPhotos from "./components/ProjectPhotos.jsx";
import EmployeeList from "./components/EmployeeList.jsx";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx";
import ProjectAdmin from "./components/ProjectAdmin.jsx"; // ➕ NEU: Projekte-Seite einbinden
=======
// ——— bestehende Komponenten ———
import NavBar from "./components/NavBar";
import TimeTracking from "./components/TimeTracking";
import ProjectAdmin from "./components/ProjectAdmin";
import ProjectPhotos from "./components/ProjectPhotos";
import MonthlyOverview from "./components/MonthlyOverview";
import EmployeeList from "./components/EmployeeList";
import LoginPanel from "./components/LoginPanel";
>>>>>>> feb2ddc16042dcb41f0a03543861468c1593733e

// ——— Sitzung/Session ———
import { useSession } from "./hooks/useSession";

<<<<<<< HEAD
// ▼▼▼ feste App-Version
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
      case "/projekte":                // ➕ NEU: Route für Projekte
        return "projekte";
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
      case "projekte":                 // ➕ NEU: Darstellung der Projektseite
        return <ProjectAdmin />;
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

=======
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
>>>>>>> feb2ddc16042dcb41f0a03543861468c1593733e
  return (
    <>
      <NavBar />

<<<<<<< HEAD
      {/* ▼▼▼ feste Fußzeile mit Version + Datum */}
      <footer className="app-footer">
=======
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
>>>>>>> feb2ddc16042dcb41f0a03543861468c1593733e
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
