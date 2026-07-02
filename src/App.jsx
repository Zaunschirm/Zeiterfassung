import React, { useEffect, useMemo, useState } from "react";
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
import RegieReports from "./components/RegieReports.jsx";
import DailySiteReports from "./components/DailySiteReports.jsx";

import { getSession, setSession, clearSession } from "./lib/session";
import { APP_VERSION } from "./version";
import { hasPermission } from "./lib/permissions";
import { supabase } from "./lib/supabase";
import "./styles.css";

function formatDateAT(dateValue) {
  const value = String(dateValue || "").slice(0, 10);
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value || "—";
  return new Date(year, month - 1, day, 12).toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateRangeAT(fromDate, toDate) {
  const from = formatDateAT(fromDate);
  const to = formatDateAT(toDate);
  return from === to ? from : `${from} – ${to}`;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [pendingTimeOffRequestCount, setPendingTimeOffRequestCount] = useState(0);
  const [pendingTimeOffRequests, setPendingTimeOffRequests] = useState([]);

  const location = useLocation();
  const navigate = useNavigate();

  const canViewAssignments =
    hasPermission(currentUser, "viewAssignments") || hasPermission(currentUser, "manageAssignments");
  const canViewMonthlyOverview = hasPermission(currentUser, "viewMonthlyOverview");
  const canViewYearOverview = hasPermission(currentUser, "viewYearOverview");
  const canManageProjects = hasPermission(currentUser, "manageProjects");
  const canManageEmployees = hasPermission(currentUser, "manageEmployees");
  const isAdmin = String(role || currentUser?.role || "").toLowerCase() === "admin";
  const pendingTimeOffSummary = useMemo(() => {
    return pendingTimeOffRequests.reduce(
      (summary, request) => {
        if (request.entry_type === "za") summary.za += 1;
        else summary.vacation += 1;
        return summary;
      },
      { vacation: 0, za: 0 }
    );
  }, [pendingTimeOffRequests]);

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
        setPendingTimeOffRequests([]);
        return;
      }

      try {
        const { data, count, error } = await supabase
          .from("time_off_requests")
          .select("id, employee_id, entry_type, from_date, to_date, days, note, created_at", { count: "exact" })
          .eq("status", "pending")
          .order("created_at", { ascending: true });

        if (error) throw error;

        const employeeIds = [
          ...new Set((data || []).map((request) => String(request.employee_id || "")).filter(Boolean)),
        ];
        let employeeById = new Map();

        if (employeeIds.length > 0) {
          const { data: employees, error: employeeError } = await supabase
            .from("employees")
            .select("id, name, code")
            .in("id", employeeIds);
          if (employeeError) throw employeeError;
          employeeById = new Map((employees || []).map((employee) => [String(employee.id), employee]));
        }

        if (!cancelled) {
          setPendingTimeOffRequestCount(Number(count ?? data?.length ?? 0));
          setPendingTimeOffRequests(
            (data || []).map((request) => ({
              ...request,
              employee: employeeById.get(String(request.employee_id)) || null,
              daysCount: Array.isArray(request.days) ? request.days.length : 0,
            }))
          );
        }
      } catch (e) {
        // Nicht blockierend: Falls die Migration noch nicht ausgeführt wurde,
        // bleibt die App normal nutzbar.
        console.warn("[App] Offene Urlaub/ZA-Anträge konnten nicht geladen werden:", e?.message || e);
        if (!cancelled) {
          setPendingTimeOffRequestCount(0);
          setPendingTimeOffRequests([]);
        }
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
              {isAdmin && (pendingTimeOffRequestCount > 0 || pendingTimeOffRequests.length > 0) && (
                <section className="admin-approval-card" aria-label="Offene Urlaub und ZA Freigaben">
                  <div className="admin-approval-head">
                    <div>
                      <div className="admin-approval-eyebrow">Admin-Freigaben</div>
                      <h2>{pendingTimeOffRequestCount} offene Prüfung{pendingTimeOffRequestCount === 1 ? "" : "en"}</h2>
                      <p>Urlaub und ZA werden erst nach deiner Freigabe in die Zeiterfassung übernommen.</p>
                    </div>
                    <div className="admin-approval-summary" aria-label="Freigabe-Zähler">
                      <span className="admin-approval-count all">{pendingTimeOffRequestCount}</span>
                      <span className="admin-approval-count vac">{pendingTimeOffSummary.vacation} Urlaub</span>
                      <span className="admin-approval-count za">{pendingTimeOffSummary.za} ZA</span>
                    </div>
                  </div>

                  {pendingTimeOffRequests.length > 0 && (
                    <div className="admin-approval-list">
                      {pendingTimeOffRequests.slice(0, 3).map((request) => {
                        const requestTypeLabel = request.entry_type === "za" ? "ZA" : "Urlaub";
                        const employeeLabel = request.employee
                          ? [request.employee.name, request.employee.code ? `(${request.employee.code})` : ""].filter(Boolean).join(" ")
                          : `MA ${request.employee_id}`;

                        return (
                          <div key={request.id} className="admin-approval-row">
                            <span className={`admin-approval-type ${request.entry_type === "za" ? "za" : "vac"}`}>{requestTypeLabel}</span>
                            <div>
                              <b>{employeeLabel}</b>
                              <small>{formatDateRangeAT(request.from_date, request.to_date)} · {request.daysCount} Tag{request.daysCount === 1 ? "" : "e"}</small>
                            </div>
                          </div>
                        );
                      })}
                      {pendingTimeOffRequestCount > pendingTimeOffRequests.slice(0, 3).length && (
                        <div className="admin-approval-more">
                          +{pendingTimeOffRequestCount - pendingTimeOffRequests.slice(0, 3).length} weitere Anträge
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="admin-approval-action"
                    onClick={() => navigate("/urlaub")}
                  >
                    Jetzt prüfen
                  </button>
                </section>
              )}
              <Routes>
                <Route path="/zeiterfassung" element={<DaySlider />} />
                <Route path="/projekte" element={canManageProjects ? <ProjectAdmin /> : <Navigate to="/zeiterfassung" replace />} />
                <Route path="/arbeitseinteilung" element={canViewAssignments ? <WorkAssignments /> : <Navigate to="/zeiterfassung" replace />} />
                <Route path="/jahresuebersicht" element={canViewYearOverview ? <YearOverview /> : <Navigate to="/zeiterfassung" replace />} />
                <Route path="/monatsuebersicht" element={canViewMonthlyOverview ? <MonthlyOverview /> : <Navigate to="/zeiterfassung" replace />} />
                <Route path="/projektfotos" element={<ProjectPhotos />} />
                <Route path="/regieberichte" element={<RegieReports />} />
                <Route path="/bautagesberichte" element={<DailySiteReports />} />
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
