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
import VacationEntry from "./components/VacationEntry.jsx";

import { getSession, setSession, clearSession } from "./lib/session";
import { APP_VERSION } from "./version";
import { hasPermission } from "./lib/permissions";
import { supabase } from "./lib/supabase";
import "./styles.css";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [pendingTimeOffRequestCount, setPendingTimeOffRequestCount] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();

  const canViewAssignments =
    hasPermission(currentUser, "viewAssignments") || hasPermission(currentUser, "manageAssignments");
  const canViewMonthlyOverview = hasPermission(currentUser, "viewMonthlyOverview");
  const canViewYearOverview = hasPermission(currentUser, "viewYearOverview");
  const canManageProjects = hasPermission(currentUser, "manageProjects");
  const canManageEmployees = hasPermission(currentUser, "manageEmployees");
  const isAdmin = String(role || currentUser?.role || "").toLowerCase() === "admin";

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const stored = getSession();
        const user = stored?.user || null;
        if (!user) return;

        let nextUser = user;

        try {
          let query = supabase
            .from("employees")
            .select("*")
            .limit(1);

          if (user?.code) query = query.eq("code", user.code);
          else if (user?.id) query = query.eq("id", user.id);

          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          if (data) nextUser = { ...user, ...data };
        } catch (e) {
          console.error("[App] User hydrate error:", e);
        }

        if (!mounted) return;
        setCurrentUser(nextUser);
        setRole(nextUser?.role || "mitarbeiter");
        setLoggedIn(true);
      } catch (e) {
        console.error("[App] Session load error:", e);
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loggedIn && (location.pathname === "/" || location.pathname === "/login")) {
      navigate("/zeiterfassung", { replace: true });
    }
  }, [loggedIn, location.pathname, navigate]);

  useEffect(() => {
    let cancelled = false;

    async function loadPendingTimeOffRequests() {
      if (!loggedIn || !isAdmin) {
        setPendingTimeOffRequestCount(0);
        return;
      }

      try {
        const { count, error } = await supabase
          .from("time_off_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");

        if (error) throw error;
        if (!cancelled) setPendingTimeOffRequestCount(Number(count || 0));
      } catch (e) {
        // Nicht blockierend: Falls die Migration noch nicht ausgeführt wurde,
        // bleibt die App normal nutzbar.
        console.warn("[App] Offene Urlaub/ZA-Anträge konnten nicht geladen werden:", e?.message || e);
        if (!cancelled) setPendingTimeOffRequestCount(0);
      }
    }

    loadPendingTimeOffRequests();
    window.addEventListener("hbz-time-off-requests-changed", loadPendingTimeOffRequests);
    return () => {
      cancelled = true;
      window.removeEventListener("hbz-time-off-requests-changed", loadPendingTimeOffRequests);
    };
  }, [loggedIn, isAdmin]);

  const handleLogin = async (user, persistent = false) => {
    if (!user) return;

    let nextUser = user;

    try {
      let query = supabase
        .from("employees")
        .select("*")
        .limit(1);

      if (user?.code) query = query.eq("code", user.code);
      else if (user?.id) query = query.eq("id", user.id);

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (data) nextUser = { ...user, ...data };
    } catch (e) {
      console.error("[App] Login hydrate error:", e);
    }

    setLoggedIn(true);
    setCurrentUser(nextUser);
    setRole(nextUser?.role || "mitarbeiter");

    try {
      setSession({ user: nextUser }, persistent);
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

      if (location.pathname === "/zeiterfassung") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("hbz-prev-day"));
        }

        if (e.key === "ArrowRight") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("hbz-next-day"));
        }
      }

      if (location.pathname === "/arbeitseinteilung") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("hbz-prev-week"));
        }

        if (e.key === "ArrowRight") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("hbz-next-week"));
        }
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
              {isAdmin && pendingTimeOffRequestCount > 0 && (
                <div className="hbz-alert hbz-alert-info" style={{ marginBottom: 12 }}>
                  {pendingTimeOffRequestCount} offene Urlaub/ZA-Freigabe{pendingTimeOffRequestCount === 1 ? "" : "n"} warten auf Prüfung.{" "}
                  <button
                    type="button"
                    className="hbz-link-button"
                    onClick={() => navigate("/urlaub")}
                  >
                    Jetzt prüfen
                  </button>
                </div>
              )}
              <Routes>
                <Route path="/zeiterfassung" element={<DaySlider />} />
                <Route path="/projekte" element={canManageProjects ? <ProjectAdmin /> : <Navigate to="/zeiterfassung" replace />} />
                <Route path="/arbeitseinteilung" element={canViewAssignments ? <WorkAssignments /> : <Navigate to="/zeiterfassung" replace />} />
                <Route path="/jahresuebersicht" element={canViewYearOverview ? <YearOverview /> : <Navigate to="/zeiterfassung" replace />} />
                <Route path="/monatsuebersicht" element={canViewMonthlyOverview ? <MonthlyOverview /> : <Navigate to="/zeiterfassung" replace />} />
                <Route path="/projektfotos" element={<ProjectPhotos />} />
                <Route path="/urlaub" element={<VacationEntry currentUser={currentUser} />} />
                <Route path="/mitarbeiter" element={canManageEmployees ? <EmployeeList /> : <Navigate to="/zeiterfassung" replace />} />
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
