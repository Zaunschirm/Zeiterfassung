import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDateISO(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekDates(dateStr) {
  const start = startOfWeek(dateStr);
  return Array.from({ length: 5 }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return d;
  });
}

function getWeekNumber(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

function formatDisplayDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function projectLabel(project) {
  if (!project) return "—";
  if (project.cost_center) return `${project.cost_center} · ${project.name}`;
  return project.name || "—";
}

export default function WorkAssignments() {
  const session = getSession()?.user || null;
  const isAdmin = (session?.role || "").toLowerCase() === "admin";

  const [weekAnchor, setWeekAnchor] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [newSelection, setNewSelection] = useState({});

  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const weekDateStrings = useMemo(
    () => weekDates.map(formatDateISO),
    [weekDates]
  );

  const weekLabel = useMemo(() => {
    const first = weekDates[0];
    const last = weekDates[weekDates.length - 1];
    return `KW ${getWeekNumber(weekAnchor)} · ${first.toLocaleDateString(
      "de-AT"
    )} – ${last.toLocaleDateString("de-AT")}`;
  }, [weekAnchor, weekDates]);

  useEffect(() => {
    async function bootstrap() {
      setError("");

      try {
        const [employeesRes, projectsRes] = await Promise.all([
          supabase
            .from("employees")
            .select("id, name, code, role, active, disabled")
            .eq("active", true)
            .eq("disabled", false)
            .order("name", { ascending: true }),

          supabase
            .from("projects")
            .select("id, name, cost_center, active")
            .eq("active", true)
            .order("name", { ascending: true }),
        ]);

        if (employeesRes.error) throw employeesRes.error;
        if (projectsRes.error) throw projectsRes.error;

        setEmployees(employeesRes.data || []);
        setProjects(projectsRes.data || []);
      } catch (e) {
        console.error("[WorkAssignments] bootstrap error:", e);
        setEmployees([]);
        setProjects([]);
        setError("Mitarbeiter oder Projekte konnten nicht geladen werden.");
      }
    }

    bootstrap();
  }, []);

  async function loadAssignments() {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("work_assignments")
        .select(
          `
            id,
            assignment_date,
            employee_id,
            project_id,
            projects (
              id,
              name,
              cost_center,
              active
            )
          `
        )
        .in("assignment_date", weekDateStrings)
        .order("assignment_date", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;

      setRows(data || []);
    } catch (e) {
      console.error("[WorkAssignments] load error:", e);
      setRows([]);
      setError("Arbeitseinteilung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekAnchor]);

  function shiftWeek(direction) {
    const start = startOfWeek(weekAnchor);
    start.setDate(start.getDate() + direction * 7);
    setWeekAnchor(formatDateISO(start));
  }

  function getAssignments(employeeId, dateStr) {
    return rows.filter(
      (row) =>
        String(row.employee_id) === String(employeeId) &&
        row.assignment_date === dateStr
    );
  }

  async function addAssignment(employeeId, dateStr) {
    const key = `${employeeId}_${dateStr}`;
    const selectedProjectId = newSelection[key];

    if (!selectedProjectId) return;

    const exists = rows.some(
      (row) =>
        String(row.employee_id) === String(employeeId) &&
        row.assignment_date === dateStr &&
        String(row.project_id) === String(selectedProjectId)
    );

    if (exists) {
      window.alert("Dieses Projekt ist an diesem Tag schon eingeteilt.");
      return;
    }

    try {
      setSavingKey(key);

      const { error } = await supabase.from("work_assignments").insert({
        employee_id: employeeId,
        assignment_date: dateStr,
        project_id: selectedProjectId,
      });

      if (error) throw error;

      setNewSelection((prev) => ({ ...prev, [key]: "" }));
      await loadAssignments();
    } catch (e) {
      console.error("[WorkAssignments] add error:", e);
      window.alert("Projekt konnte nicht hinzugefügt werden.");
    } finally {
      setSavingKey("");
    }
  }

  async function removeAssignment(id) {
    if (!window.confirm("Einteilung wirklich löschen?")) return;

    try {
      setSavingKey(String(id));

      const { error } = await supabase
        .from("work_assignments")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await loadAssignments();
    } catch (e) {
      console.error("[WorkAssignments] delete error:", e);
      window.alert("Einteilung konnte nicht gelöscht werden.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <div className="month-overview workassign-page">
      <div className="month-overview-hero hbz-card">
        <div className="month-overview-hero__content">
          <div>
            <div className="month-overview-kicker">Planung</div>
            <h2 className="month-overview-title">Arbeitseinteilung</h2>
            <div className="month-overview-subtitle">{weekLabel}</div>
          </div>

          <div className="month-overview-actions">
            <button
              className="hbz-btn"
              type="button"
              onClick={() => shiftWeek(-1)}
            >
              ← KW zurück
            </button>
            <button
              className="hbz-btn"
              type="button"
              onClick={() =>
                setWeekAnchor(new Date().toISOString().slice(0, 10))
              }
            >
              Diese KW
            </button>
            <button
              className="hbz-btn"
              type="button"
              onClick={() => shiftWeek(1)}
            >
              KW vor →
            </button>
          </div>
        </div>
      </div>

      <div className="hbz-card month-main-card">
        <div className="workassign-toolbar">
          <div>
            <div className="month-card-title">Wochenübersicht</div>
            <div className="help">
              Alle sehen alles. Bearbeiten darf nur der Admin. Die Projekte hier
              werden in der Zeiterfassung automatisch vorgeschlagen.
            </div>
          </div>

          <div className="field-inline workassign-date-field">
            <label className="hbz-label">Woche auswählen</label>
            <input
              type="date"
              className="hbz-input"
              value={weekAnchor}
              onChange={(e) => setWeekAnchor(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="year-error-box" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="month-empty-state">Lade Arbeitseinteilung…</div>
        ) : (
          <div className="workassign-day-list">
            {weekDateStrings.map((dateStr) => (
              <section key={dateStr} className="workassign-day-card">
                <div className="workassign-day-head">
                  <div>
                    <div className="workassign-day-title">
                      {formatDisplayDate(dateStr)}
                    </div>
                    <div className="help">
                      {
                        rows.filter((row) => row.assignment_date === dateStr)
                          .length
                      }{" "}
                      Einteilungen in dieser Tagesliste
                    </div>
                  </div>
                  <span className="badge-soft">
                    {employees.length} Mitarbeiter
                  </span>
                </div>

                <div className="workassign-list">
                  {employees.map((employee) => {
                    const key = `${employee.id}_${dateStr}`;
                    const assignments = getAssignments(employee.id, dateStr);

                    const availableProjects = projects.filter(
                      (project) =>
                        !assignments.some(
                          (row) =>
                            String(row.project_id) === String(project.id)
                        )
                    );

                    return (
                      <div className="workassign-row" key={key}>
                        <div className="workassign-row-main">
                          <div className="workassign-employee-name">
                            {employee.name}
                          </div>

                          <div className="workassign-projects">
                            {assignments.length === 0 ? (
                              <span className="workassign-empty">
                                Keine Einteilung
                              </span>
                            ) : (
                              assignments.map((row) => (
                                <span
                                  className="workassign-project-chip"
                                  key={row.id}
                                >
                                  {projectLabel(row.projects)}
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      className="workassign-chip-remove"
                                      onClick={() => removeAssignment(row.id)}
                                      disabled={savingKey === String(row.id)}
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        {isAdmin && (
                          <div className="workassign-edit-row">
                            <select
                              className="hbz-select"
                              value={newSelection[key] || ""}
                              onChange={(e) =>
                                setNewSelection((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Projekt wählen…</option>
                              {availableProjects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {projectLabel(project)}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              className="hbz-btn hbz-btn-primary"
                              onClick={() => addAssignment(employee.id, dateStr)}
                              disabled={
                                !newSelection[key] || savingKey === key
                              }
                            >
                              Hinzufügen
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}