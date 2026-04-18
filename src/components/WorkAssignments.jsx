import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function getWeekDates(dateStr) {
  const start = startOfWeek(dateStr);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    d.setHours(12, 0, 0, 0);
    return d;
  });
}

function getWeekNumber(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4, 12, 0, 0, 0);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

function dayShort(dateStr) {
  const label = new Date(`${dateStr}T12:00:00`).toLocaleDateString("de-AT", {
    weekday: "short",
  });
  return label.replace(".", "");
}

function dayLabel(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
  });
}

function projectLabel(project) {
  if (!project) return "—";
  if (project.cost_center) return `${project.cost_center} · ${project.name}`;
  return project.name || "—";
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function employeeDefaultSort(a, b) {
  const roleA = normalizeRole(a.role);
  const roleB = normalizeRole(b.role);

  const aIsTeamleiter = roleA === "teamleiter";
  const bIsTeamleiter = roleB === "teamleiter";

  if (aIsTeamleiter && !bIsTeamleiter) return -1;
  if (!aIsTeamleiter && bIsTeamleiter) return 1;

  return String(a.name || "").localeCompare(String(b.name || ""), "de", {
    sensitivity: "base",
  });
}

export default function WorkAssignments() {
  const session = getSession()?.user || null;
  const isAdmin = normalizeRole(session?.role) === "admin";

  const [weekAnchor, setWeekAnchor] = useState(() => formatLocalDate(new Date()));
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [employeeOrder, setEmployeeOrder] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [dragEmployeeId, setDragEmployeeId] = useState(null);
  const [dragProjectId, setDragProjectId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [hoverCell, setHoverCell] = useState("");
  const [hoverRow, setHoverRow] = useState("");

  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const weekDateStrings = useMemo(() => weekDates.map(formatLocalDate), [weekDates]);

  const weekLabel = useMemo(() => {
    const first = weekDates[0];
    const last = weekDates[4];
    return `KW ${getWeekNumber(weekAnchor)} · ${first.toLocaleDateString(
      "de-AT"
    )} – ${last.toLocaleDateString("de-AT")}`;
  }, [weekAnchor, weekDates]);

  const projectMap = useMemo(() => {
    const map = new Map();
    for (const project of projects) {
      map.set(String(project.id), project);
    }
    return map;
  }, [projects]);

  const cellMap = useMemo(() => {
    const map = new Map();

    for (const row of assignments) {
      const key = `${row.employee_id}__${row.assignment_date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }

    for (const [key, rows] of map.entries()) {
      rows.sort((a, b) => a.id - b.id);
      map.set(key, rows);
    }

    return map;
  }, [assignments]);

  const weekSortMap = useMemo(() => {
    const map = new Map();

    for (const row of assignments) {
      const empId = String(row.employee_id);
      const current = map.get(empId);

      if (current == null || Number(row.sort_order || 0) < current) {
        map.set(empId, Number(row.sort_order || 0));
      }
    }

    return map;
  }, [assignments]);

  const orderedEmployees = useMemo(() => {
    const byId = new Map(employees.map((emp) => [String(emp.id), emp]));

    if (employeeOrder.length) {
      const ordered = employeeOrder.map((id) => byId.get(String(id))).filter(Boolean);
      const missing = employees
        .filter((emp) => !employeeOrder.includes(String(emp.id)))
        .sort(employeeDefaultSort);

      return [...ordered, ...missing];
    }

    return [...employees].sort((a, b) => {
      const sortA = weekSortMap.get(String(a.id));
      const sortB = weekSortMap.get(String(b.id));

      if (sortA != null && sortB != null && sortA !== sortB) return sortA - sortB;
      if (sortA != null && sortB == null) return -1;
      if (sortA == null && sortB != null) return 1;

      return employeeDefaultSort(a, b);
    });
  }, [employees, employeeOrder, weekSortMap]);

  useEffect(() => {
    async function bootstrap() {
      setError("");

      try {
        const [employeesRes, projectsRes] = await Promise.all([
          supabase
            .from("employees")
            .select("id, name, role, active, disabled")
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

        const employeeData = employeesRes.data || [];
        setEmployees(employeeData);
        setProjects(projectsRes.data || []);
        setEmployeeOrder(
          employeeData.slice().sort(employeeDefaultSort).map((emp) => String(emp.id))
        );
      } catch (e) {
        console.error("[WorkAssignments] bootstrap error:", e);
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
        .select(`
          id,
          assignment_date,
          employee_id,
          project_id,
          sort_order
        `)
        .in("assignment_date", weekDateStrings)
        .order("assignment_date", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;

      setAssignments(data || []);
    } catch (e) {
      console.error("[WorkAssignments] load error:", e);
      setAssignments([]);
      setError("Arbeitseinteilung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignments();
  }, [weekAnchor]);

  function shiftWeek(direction) {
    const start = startOfWeek(weekAnchor);
    start.setDate(start.getDate() + direction * 7);
    start.setHours(12, 0, 0, 0);
    setWeekAnchor(formatLocalDate(start));
  }

  function getCellRows(employeeId, dateStr) {
    return cellMap.get(`${employeeId}__${dateStr}`) || [];
  }

  function getNextSortOrderForEmployee(employeeId) {
    const position = orderedEmployees.findIndex(
      (emp) => String(emp.id) === String(employeeId)
    );
    return position >= 0 ? position + 1 : orderedEmployees.length + 1;
  }

  async function persistEmployeeOrder(nextOrder) {
    try {
      setBusyKey("persist-employee-order");

      const positionMap = new Map(
        nextOrder.map((employeeId, index) => [String(employeeId), index + 1])
      );

      for (const employeeId of nextOrder) {
        const employeeRows = assignments
          .filter((row) => String(row.employee_id) === String(employeeId))
          .map((row) => row.id);

        if (!employeeRows.length) continue;

        const { error } = await supabase
          .from("work_assignments")
          .update({ sort_order: positionMap.get(String(employeeId)) || 0 })
          .in("id", employeeRows);

        if (error) throw error;
      }

      await loadAssignments();
    } catch (e) {
      console.error("[WorkAssignments] persist employee order error:", e);
      alert(
        e?.message ||
          e?.details ||
          e?.hint ||
          JSON.stringify(e) ||
          "Mitarbeiter-Reihenfolge konnte nicht gespeichert werden."
      );
    } finally {
      setBusyKey("");
    }
  }

  async function addProjectToCell(employeeId, dateStr, projectId) {
    if (!isAdmin || !projectId) return;

    const projectIdNumber = Number(projectId);
    if (!projectIdNumber || Number.isNaN(projectIdNumber)) {
      alert("Fehler: Projekt-ID fehlt oder ist ungültig.");
      return;
    }

    const existing = getCellRows(employeeId, dateStr).some(
      (row) => String(row.project_id) === String(projectIdNumber)
    );

    if (existing) return;

    try {
      setBusyKey(`add-${employeeId}-${dateStr}-${projectIdNumber}`);

      const payload = {
        employee_id: Number(employeeId),
        assignment_date: dateStr,
        project_id: projectIdNumber,
        sort_order: getNextSortOrderForEmployee(employeeId),
      };

      const { error } = await supabase.from("work_assignments").insert(payload);

      if (error) {
        console.error("[WorkAssignments] insert payload:", payload);
        throw error;
      }

      await loadAssignments();
    } catch (e) {
      console.error("[WorkAssignments] add project error:", e);
      alert(
        e?.message ||
          e?.details ||
          e?.hint ||
          JSON.stringify(e) ||
          "Projekt konnte nicht hinzugefügt werden."
      );
    } finally {
      setBusyKey("");
    }
  }

  async function removeProject(rowId) {
    if (!isAdmin) return;
    if (!window.confirm("Projekt aus der Arbeitseinteilung entfernen?")) return;

    try {
      setBusyKey(`remove-${rowId}`);

      const { error } = await supabase
        .from("work_assignments")
        .delete()
        .eq("id", rowId);

      if (error) throw error;

      await loadAssignments();
    } catch (e) {
      console.error("[WorkAssignments] remove project error:", e);
      alert(
        e?.message ||
          e?.details ||
          e?.hint ||
          JSON.stringify(e) ||
          "Projekt konnte nicht gelöscht werden."
      );
    } finally {
      setBusyKey("");
    }
  }

  function onProjectDragStart(e, projectId) {
    if (!isAdmin) return;
    const value = String(projectId);
    e.dataTransfer.clearData();
    e.dataTransfer.setData("text/plain", value);
    e.dataTransfer.setData("projectId", value);
    e.dataTransfer.effectAllowed = "copy";
    setDragProjectId(value);
    setSelectedProjectId(value);
  }

  function onProjectDragEnd() {
    setDragProjectId(null);
  }

  function onEmployeeDragStart(e, employeeId) {
    if (!isAdmin) return;
    e.dataTransfer.clearData();
    e.dataTransfer.setData("employeeId", String(employeeId));
    e.dataTransfer.effectAllowed = "move";
    setDragEmployeeId(String(employeeId));
  }

  function onEmployeeDragEnd() {
    setDragEmployeeId(null);
  }

  async function onCellDrop(e, employeeId, dateStr) {
    e.preventDefault();
    if (!isAdmin) return;

    const droppedProjectId =
      e.dataTransfer.getData("projectId") ||
      e.dataTransfer.getData("text/plain") ||
      dragProjectId ||
      selectedProjectId ||
      "";

    if (!droppedProjectId || droppedProjectId === "undefined" || droppedProjectId === "null") {
      alert("Fehler: Projekt-ID fehlt oder ist ungültig.");
      return;
    }

    await addProjectToCell(employeeId, dateStr, droppedProjectId);
    setHoverCell("");
    setDragProjectId(null);
  }

  async function onCellClick(employeeId, dateStr) {
    if (!isAdmin || !selectedProjectId) return;
    await addProjectToCell(employeeId, dateStr, selectedProjectId);
  }

  async function onRowDrop(e, targetEmployeeId) {
    e.preventDefault();
    if (!isAdmin) return;

    const droppedEmployeeId =
      e.dataTransfer.getData("employeeId") || dragEmployeeId || "";

    if (!droppedEmployeeId) return;
    if (String(droppedEmployeeId) === String(targetEmployeeId)) return;

    const currentOrder = orderedEmployees.map((emp) => String(emp.id));
    const fromIndex = currentOrder.findIndex(
      (id) => id === String(droppedEmployeeId)
    );
    const toIndex = currentOrder.findIndex(
      (id) => id === String(targetEmployeeId)
    );

    if (fromIndex < 0 || toIndex < 0) return;

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);

    setEmployeeOrder(nextOrder);
    setDragEmployeeId(null);
    setHoverRow("");

    await persistEmployeeOrder(nextOrder);
  }

  return (
    <div className="workassign-dispo-page">
      <div className="workassign-dispo-head hbz-card">
        <div className="workassign-dispo-head-top">
          <div>
            <div className="workassign-dispo-kicker">Planung</div>
            <h2 className="workassign-dispo-title">Arbeitseinteilung</h2>
            <div className="workassign-dispo-subtitle">{weekLabel}</div>
          </div>

          <div className="workassign-dispo-actions">
            <button className="hbz-btn" type="button" onClick={() => shiftWeek(-1)}>
              ← KW zurück
            </button>
            <button
              className="hbz-btn"
              type="button"
              onClick={() => setWeekAnchor(formatLocalDate(new Date()))}
            >
              Diese KW
            </button>
            <button className="hbz-btn" type="button" onClick={() => shiftWeek(1)}>
              KW vor →
            </button>
          </div>
        </div>

        <div className="workassign-dispo-toolbar">
          <div className="help">
            Projekte oben greifen und auf Mitarbeiter + Tag ziehen. Du kannst alternativ auch ein Projekt anklicken und danach die Zelle anklicken.
          </div>

          <div className="field-inline workassign-dispo-datefield">
            <label className="hbz-label">Woche auswählen</label>
            <input
              type="date"
              className="hbz-input"
              value={weekAnchor}
              onChange={(e) => setWeekAnchor(e.target.value)}
            />
          </div>
        </div>

        {error ? <div className="year-error-box">{error}</div> : null}
      </div>

      <div className="hbz-card workassign-project-palette-card">
        <div className="workassign-project-palette-head">
          <div className="month-card-title">Projekte</div>
          <div className="help">
            Projekt ziehen oder anklicken und dann auf eine Zelle klicken.
          </div>
        </div>

        <div className="workassign-project-palette">
          {projects.map((project) => {
            const active = String(selectedProjectId || "") === String(project.id);

            return (
              <button
                key={project.id}
                type="button"
                className={`workassign-project-token${
                  active ? " workassign-project-token-dragging" : ""
                }`}
                draggable={isAdmin}
                onClick={() => setSelectedProjectId(String(project.id))}
                onDragStart={(e) => onProjectDragStart(e, project.id)}
                onDragEnd={onProjectDragEnd}
              >
                {projectLabel(project)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hbz-card workassign-matrix-card">
        {loading ? (
          <div className="month-empty-state">Lade Arbeitseinteilung…</div>
        ) : (
          <div className="workassign-matrix-wrap">
            <table className="workassign-matrix">
              <thead>
                <tr>
                  <th className="workassign-sticky-left workassign-employee-col">
                    Mitarbeiter
                  </th>
                  {weekDateStrings.map((dateStr) => (
                    <th key={dateStr}>
                      <div className="workassign-day-headline">
                        <div className="workassign-day-short">{dayShort(dateStr)}</div>
                        <div className="workassign-day-date">{dayLabel(dateStr)}</div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {orderedEmployees.map((employee) => {
                  const rowKey = String(employee.id);

                  return (
                    <tr
                      key={employee.id}
                      className={hoverRow === rowKey ? "workassign-row-hover" : ""}
                    >
                      <td
                        className="workassign-sticky-left workassign-employee-cell"
                        draggable={isAdmin}
                        onDragStart={(e) => onEmployeeDragStart(e, employee.id)}
                        onDragEnd={onEmployeeDragEnd}
                        onDragOver={(e) => {
                          if (!isAdmin || !dragEmployeeId) return;
                          e.preventDefault();
                          setHoverRow(rowKey);
                        }}
                        onDragLeave={() => {
                          if (hoverRow === rowKey) setHoverRow("");
                        }}
                        onDrop={(e) => onRowDrop(e, employee.id)}
                      >
                        <div className="workassign-employee-cell-inner">
                          {isAdmin ? <span className="workassign-row-drag">↕</span> : null}
                          <span className="workassign-employee-name">
                            {employee.name}
                          </span>
                          {normalizeRole(employee.role) === "teamleiter" ? (
                            <span className="badge">Teamleiter</span>
                          ) : null}
                        </div>
                      </td>

                      {weekDateStrings.map((dateStr) => {
                        const cellRows = getCellRows(employee.id, dateStr);
                        const cellKey = `${employee.id}__${dateStr}`;

                        return (
                          <td
                            key={cellKey}
                            className={`workassign-drop-cell ${
                              hoverCell === cellKey ? "workassign-drop-cell-hover" : ""
                            }`}
                            onClick={() => onCellClick(employee.id, dateStr)}
                            onDragOver={(e) => {
                              if (!isAdmin) return;
                              e.preventDefault();
                              setHoverCell(cellKey);
                            }}
                            onDragLeave={() => {
                              if (hoverCell === cellKey) setHoverCell("");
                            }}
                            onDrop={(e) => onCellDrop(e, employee.id, dateStr)}
                          >
                            <div className="workassign-cell-content">
                              {cellRows.length === 0 ? (
                                <div className="workassign-cell-empty">—</div>
                              ) : (
                                cellRows.map((row) => {
                                  const project = projectMap.get(String(row.project_id));

                                  return (
                                    <span className="workassign-cell-chip" key={row.id}>
                                      {projectLabel(project)}
                                      {isAdmin ? (
                                        <button
                                          type="button"
                                          className="workassign-cell-chip-remove"
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            removeProject(row.id);
                                          }}
                                          disabled={busyKey === `remove-${row.id}`}
                                        >
                                          ×
                                        </button>
                                      ) : null}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}