import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { hasPermission } from "../lib/permissions";
import { getBuakWeekType, getHolidayName } from "../utils/time";

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


function isFriday(dateStr) {
  return new Date(`${dateStr}T12:00:00`).getDay() === 5;
}

function getDayStatus(dateStr) {
  const holidayName = getHolidayName(dateStr);
  const weekType = getBuakWeekType(dateStr);
  const shortWeekFriday = weekType === "kurz" && isFriday(dateStr);

  return {
    holidayName,
    isHoliday: !!holidayName,
    weekType,
    shortWeekFriday,
  };
}

function projectLabel(project) {
  if (!project) return "—";
  if (project.cost_center) return `${project.cost_center} · ${project.name}`;
  return project.name || "—";
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

const ACTIVE_PROJECT_COLORS = [
  { bg: "#e8f1ff", border: "#8fb2e8", text: "#173f70" },
  { bg: "#e9f7ee", border: "#83c99a", text: "#1f5b32" },
  { bg: "#fff0df", border: "#e4a15b", text: "#74400d" },
  { bg: "#ffeceb", border: "#df8b84", text: "#7a2822" },
  { bg: "#e7f7f5", border: "#7ac8c0", text: "#155d59" },
  { bg: "#f1ecff", border: "#aa95df", text: "#49327a" },
  { bg: "#eef7df", border: "#a9c86b", text: "#465d18" },
  { bg: "#fdebf4", border: "#d58db2", text: "#783255" },
  { bg: "#fff7d8", border: "#d7b84d", text: "#66500a" },
  { bg: "#e6f2fb", border: "#78aed2", text: "#1d526f" },
  { bg: "#f0eee9", border: "#b7a995", text: "#4d4033" },
  { bg: "#eaf4e8", border: "#8dbb84", text: "#2d5b26" },
];

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
  const [currentUser, setCurrentUser] = useState(session);
  const canViewAssignments =
    hasPermission(currentUser || session, "viewAssignments") || hasPermission(currentUser || session, "manageAssignments");
  const canEditAssignments = hasPermission(currentUser || session, "manageAssignments");

  const [weekAnchor, setWeekAnchor] = useState(() => formatLocalDate(new Date()));
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [employeeOrder, setEmployeeOrder] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [dragEmployeeId, setDragEmployeeId] = useState(null);
  const [dragProjectId, setDragProjectId] = useState("");
  const [hoverRow, setHoverRow] = useState("");
  const [hoverCell, setHoverCell] = useState("");
  const projectRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCurrentUser() {
      if (!session?.code && !session?.id) return;

      try {
        let query = supabase
          .from("employees")
          .select("id, code, name, role, active, disabled, permissions")
          .limit(1);

        if (session?.code) query = query.eq("code", session.code);
        else if (session?.id) query = query.eq("id", session.id);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!cancelled && data) setCurrentUser((prev) => ({ ...(prev || {}), ...data }));
      } catch (e) {
        console.error("[WorkAssignments] current user load error:", e);
      }
    }

    hydrateCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [session?.code, session?.id]);

  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const weekDateStrings = useMemo(() => weekDates.map(formatLocalDate), [weekDates]);

  const weekLabel = useMemo(() => {
    const first = weekDates[0];
    const last = weekDates[4];
    return `KW ${getWeekNumber(weekAnchor)} · ${first.toLocaleDateString(
      "de-AT"
    )} – ${last.toLocaleDateString("de-AT")}`;
  }, [weekAnchor, weekDates]);

  const weekType = useMemo(() => getBuakWeekType(weekDateStrings[0]), [weekDateStrings]);
  const weekTypeLabel = weekType === "kurz" ? "Kurzwoche" : weekType === "lang" ? "Langwoche" : "";

  const dayStatusMap = useMemo(() => {
    const map = new Map();
    weekDateStrings.forEach((dateStr) => map.set(dateStr, getDayStatus(dateStr)));
    return map;
  }, [weekDateStrings]);

  const projectMap = useMemo(() => {
    const map = new Map();
    for (const project of projects) {
      map.set(String(project.id), project);
    }
    return map;
  }, [projects]);

  const projectColorMap = useMemo(() => {
    const map = new Map();
    projects.forEach((project, index) => {
      map.set(String(project.id), ACTIVE_PROJECT_COLORS[index % ACTIVE_PROJECT_COLORS.length]);
    });
    return map;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => {
      const haystack = `${project.cost_center || ""} ${project.name || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [projects, projectSearch]);

  function getProjectColorStyle(projectId) {
    const color = projectColorMap.get(String(projectId));

    // Nur aktive Projekte bekommen Farben. Falls ein altes/deaktiviertes Projekt
    // noch in einer bestehenden Einteilung vorkommt, bleibt es neutral/grau.
    if (!color) {
      return {
        "--project-bg": "#f3f0eb",
        "--project-border": "#c8bbad",
        "--project-text": "#5f564d",
      };
    }

    return {
      "--project-bg": color.bg,
      "--project-border": color.border,
      "--project-text": color.text,
    };
  }

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

  const visibleAssignmentEmployees = useMemo(() => {
    if (canEditAssignments) return orderedEmployees;

    const currentEmployeeId = currentUser?.id || session?.id;
    if (!currentEmployeeId) return [];

    return orderedEmployees.filter(
      (employee) => String(employee.id) === String(currentEmployeeId)
    );
  }, [canEditAssignments, orderedEmployees, currentUser?.id, session?.id]);

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
            .neq("role", "buchhaltung")
            .order("name", { ascending: true }),
          supabase
            .from("projects")
            .select("id, name, cost_center, active")
            .eq("active", true)
            .order("name", { ascending: true }),
        ]);

        if (employeesRes.error) throw employeesRes.error;
        if (projectsRes.error) throw projectsRes.error;

        const employeeData = (employeesRes.data || []).filter((e) => String(e.role || "").toLowerCase() !== "buchhaltung");
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


  useEffect(() => {
    function handlePrevWeek() {
      shiftWeek(-1);
    }

    function handleNextWeek() {
      shiftWeek(1);
    }

    window.addEventListener("hbz-prev-week", handlePrevWeek);
    window.addEventListener("hbz-next-week", handleNextWeek);

    return () => {
      window.removeEventListener("hbz-prev-week", handlePrevWeek);
      window.removeEventListener("hbz-next-week", handleNextWeek);
    };
  }, [weekAnchor]);

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


  async function markAssignmentChanged(employeeId, dateStr) {
    if (!employeeId || !dateStr) return;

    try {
      const { error } = await supabase
        .from("work_assignment_push_pending")
        .upsert(
          {
            employee_id: Number(employeeId),
            assignment_date: dateStr,
            changed_at: new Date().toISOString(),
          },
          { onConflict: "employee_id,assignment_date" }
        );

      if (error) {
        console.warn("[WorkAssignments] push pending not saved:", error);
      }
    } catch (e) {
      console.warn("[WorkAssignments] push pending error:", e);
    }
  }

  async function addProjectToCell(employeeId, dateStr, projectId) {
    if (!canEditAssignments || !projectId) return;

    const status = dayStatusMap.get(dateStr) || getDayStatus(dateStr);
    if (status.isHoliday) {
      alert(`Dieser Tag ist ein Feiertag (${status.holidayName}) und kann in der Arbeitseinteilung nicht überschrieben werden.`);
      return;
    }

    const projectIdValue = String(projectId).trim();
    if (!projectIdValue) {
      alert("Fehler: Projekt-ID fehlt oder ist ungültig.");
      return;
    }

    const existing = getCellRows(employeeId, dateStr).some(
      (row) => String(row.project_id) === projectIdValue
    );

    if (existing) return;

    try {
      setBusyKey(`add-${employeeId}-${dateStr}-${projectIdValue}`);

      const payload = {
        employee_id: Number(employeeId),
        assignment_date: dateStr,
        project_id: projectIdValue,
        sort_order: getNextSortOrderForEmployee(employeeId),
      };

      const { error } = await supabase.from("work_assignments").insert(payload);

      if (error) {
        console.error("[WorkAssignments] insert payload:", payload);
        throw error;
      }

      await markAssignmentChanged(employeeId, dateStr);
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
    if (!canEditAssignments) return;
    const rowToRemove = assignments.find((row) => String(row.id) === String(rowId));
    if (!window.confirm("Projekt aus der Arbeitseinteilung entfernen?")) return;

    try {
      setBusyKey(`remove-${rowId}`);

      const { error } = await supabase
        .from("work_assignments")
        .delete()
        .eq("id", rowId);

      if (error) throw error;

      if (rowToRemove) {
        await markAssignmentChanged(rowToRemove.employee_id, rowToRemove.assignment_date);
      }
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

  async function onCellClick(employeeId, dateStr) {
    if (!canEditAssignments) return;

    const projectIdValue = selectedProjectId || projectRef.current?.value?.trim();

    if (!projectIdValue) {
      alert("Bitte oben ein Projekt antippen oder direkt in die Zelle ziehen.");
      return;
    }

    await addProjectToCell(employeeId, dateStr, projectIdValue);
  }

  function selectProject(projectId) {
    const value = String(projectId || "").trim();
    setSelectedProjectId(value);
    if (projectRef.current) projectRef.current.value = value;
  }

  function onPaletteProjectDragStart(e, projectId) {
    if (!canEditAssignments) return;

    const projectIdValue = String(projectId || "").trim();
    if (!projectIdValue) {
      e.preventDefault();
      return;
    }

    selectProject(projectIdValue);
    e.dataTransfer.clearData();
    e.dataTransfer.setData("projectId", projectIdValue);
    e.dataTransfer.setData("text/plain", projectIdValue);
    e.dataTransfer.effectAllowed = "copy";
    setDragProjectId(projectIdValue);
  }

  function onProjectDragStart(e) {
    if (!canEditAssignments) return;

    const projectIdValue = selectedProjectId || projectRef.current?.value?.trim();

    if (!projectIdValue) {
      e.preventDefault();
      alert("Bitte zuerst oben ein Projekt antippen oder direkt ziehen.");
      return;
    }

    e.dataTransfer.clearData();
    e.dataTransfer.setData("projectId", projectIdValue);
    e.dataTransfer.setData("text/plain", projectIdValue);
    e.dataTransfer.effectAllowed = "copy";
    setDragProjectId(projectIdValue);
  }

  function onProjectDragEnd() {
    setDragProjectId("");
  }

  async function onCellDrop(e, employeeId, dateStr) {
    e.preventDefault();
    if (!canEditAssignments) return;

    const droppedProjectId =
      e.dataTransfer.getData("projectId") ||
      e.dataTransfer.getData("text/plain") ||
      dragProjectId ||
      selectedProjectId ||
      projectRef.current?.value?.trim() ||
      "";

    if (!droppedProjectId) {
      alert("Fehler: Projekt-ID fehlt oder ist ungültig.");
      return;
    }

    await addProjectToCell(employeeId, dateStr, droppedProjectId);
    setHoverCell("");
    setDragProjectId("");
  }

  function onEmployeeDragStart(e, employeeId) {
    if (!canEditAssignments) return;
    e.dataTransfer.clearData();
    e.dataTransfer.setData("employeeId", String(employeeId));
    e.dataTransfer.effectAllowed = "move";
    setDragEmployeeId(String(employeeId));
  }

  function onEmployeeDragEnd() {
    setDragEmployeeId(null);
  }

  async function onRowDrop(e, targetEmployeeId) {
    e.preventDefault();
    if (!canEditAssignments) return;

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

  const compactRowsByDate = useMemo(() => {
    return weekDateStrings.map((dateStr) => {
      const dayRows = visibleAssignmentEmployees
        .map((employee) => ({
          employee,
          rows: getCellRows(employee.id, dateStr),
        }))
        .filter((entry) => entry.rows.length > 0);

      return { dateStr, rows: dayRows };
    });
  }, [weekDateStrings, visibleAssignmentEmployees, cellMap]);

  return (
    <div className="workassign-dispo-page">
      <div className="workassign-dispo-head hbz-card">
        <div className="workassign-dispo-head-top">
          <div>
            <div className="workassign-dispo-kicker">Planung</div>
            <h2 className="workassign-dispo-title">Arbeitseinteilung</h2>
            <div className="workassign-dispo-subtitle">{weekLabel} {weekTypeLabel ? <span className={`workassign-week-badge ${weekType === "kurz" ? "short" : "long"}`}>{weekTypeLabel}</span> : null}</div>
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
            {canEditAssignments
              ? "Aktive Projekte oben als farbige Chips in die Zelle ziehen oder antippen und danach unten in die gewünschte Zelle klicken. Mitarbeiter können weiter per Ziehen sortiert werden."
              : "Hier siehst du die Arbeitseinteilung der Woche. Änderungen sind mit deinem Benutzer nicht erlaubt."}
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

        <div className="workassign-legend">
          <span><i className="legend-dot legend-green" /> eingeteilt</span>
          <span><i className="legend-dot legend-yellow" /> offen</span>
          <span><i className="legend-dot legend-red" /> keine Einteilung</span>
          <span><i className="legend-dot legend-holiday" /> Feiertag gesperrt</span>
          <span><i className="legend-dot legend-short" /> Kurzwoche frei / überschreibbar</span>
        </div>

        {error ? <div className="year-error-box">{error}</div> : null}
      </div>

      {canEditAssignments ? (
      <div className="hbz-card workassign-project-palette-card">
        <div className="workassign-project-palette-head">
          <div>
            <div className="month-card-title">Aktive Projekte</div>
            <div className="help">Farben gelten nur für aktive Projekte in dieser Ansicht. Projekt antippen oder direkt in die Zelle ziehen.</div>
          </div>
          <span className="badge">{projects.length} aktiv</span>
        </div>

        <div className="workassign-project-tools no-dropdown">
          <div className="hbz-col">
            <label className="hbz-label">Projekt suchen</label>
            <input
              className="hbz-input"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Kostenstelle oder Projektname…"
            />
          </div>
          <div className="hbz-col-auto workassign-project-actions">
            <button
              type="button"
              className="hbz-btn"
              onClick={() => selectProject("")}
            >
              Auswahl löschen
            </button>
          </div>
        </div>

        <div className="workassign-project-palette visible-project-list">
          {filteredProjects.length === 0 ? (
            <div className="workassign-project-empty">Kein aktives Projekt gefunden.</div>
          ) : (
            filteredProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`workassign-project-token color-token ${String(selectedProjectId) === String(project.id) ? "active" : ""}`}
                style={getProjectColorStyle(project.id)}
                draggable={canEditAssignments}
                onClick={() => selectProject(project.id)}
                onDragStart={(e) => onPaletteProjectDragStart(e, project.id)}
                onDragEnd={onProjectDragEnd}
                title="Projekt ziehen oder antippen"
              >
                <span className="project-color-dot" />
                <span>{projectLabel(project)}</span>
              </button>
            ))
          )}
        </div>
      </div>
      ) : null}

      <div className="hbz-card workassign-matrix-card">
        {!canViewAssignments ? (
          <div className="year-error-box">Du hast keine Berechtigung für die Arbeitseinteilung.</div>
        ) : loading ? (
          <div className="month-empty-state">Lade Arbeitseinteilung…</div>
        ) : !canEditAssignments ? (
          <div className="workassign-list-view">
            {compactRowsByDate.every((day) => day.rows.length === 0) ? (
              <div className="month-empty-state">Für diese Woche ist noch keine Arbeitseinteilung eingetragen.</div>
            ) : (
              compactRowsByDate.map((day) => {
                const projectsForDay = day.rows.flatMap((entry) => entry.rows);
                const status = dayStatusMap.get(day.dateStr) || getDayStatus(day.dateStr);
                const rowClass = status.isHoliday
                  ? "holiday"
                  : status.shortWeekFriday
                    ? "short-free"
                    : projectsForDay.length > 0
                      ? "assigned"
                      : "missing";

                return (
                  <div className={`workassign-compact-row ${rowClass}`} key={day.dateStr}>
                    <div className="workassign-compact-date">
                      <strong>{dayShort(day.dateStr)}</strong>
                      <span>{dayLabel(day.dateStr)}</span>
                    </div>

                    <div className="workassign-compact-projects">
                      {status.isHoliday ? (
                        <span className="workassign-day-note holiday">Feiertag: {status.holidayName}</span>
                      ) : status.shortWeekFriday && projectsForDay.length === 0 ? (
                        <span className="workassign-day-note short-free">Kurzwoche frei / überschreibbar</span>
                      ) : projectsForDay.length === 0 ? (
                        <span className="workassign-compact-empty">frei / keine Einteilung</span>
                      ) : (
                        projectsForDay.map((row) => {
                          const project = projectMap.get(String(row.project_id));
                          return (
                            <span
                              className="workassign-cell-chip color-token"
                              style={getProjectColorStyle(row.project_id)}
                              key={row.id}
                            >
                              {projectLabel(project)}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="workassign-matrix-wrap">
            <table className="workassign-matrix">
              <thead>
                <tr>
                  <th className="workassign-sticky-left workassign-employee-col">
                    Mitarbeiter
                  </th>
                  {weekDateStrings.map((dateStr) => {
                    const status = dayStatusMap.get(dateStr) || getDayStatus(dateStr);
                    return (
                      <th
                        key={dateStr}
                        className={`${status.isHoliday ? "workassign-day-holiday" : ""} ${status.shortWeekFriday ? "workassign-day-shortfree" : ""}`}
                      >
                        <div className="workassign-day-headline">
                          <div className="workassign-day-short">{dayShort(dateStr)}</div>
                          <div className="workassign-day-date">{dayLabel(dateStr)}</div>
                          {status.isHoliday ? <div className="workassign-day-tag holiday">{status.holidayName}</div> : null}
                          {!status.isHoliday && status.shortWeekFriday ? <div className="workassign-day-tag shortfree">Kurzwoche frei</div> : null}
                        </div>
                      </th>
                    );
                  })}
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
                        draggable={canEditAssignments}
                        onDragStart={(e) => onEmployeeDragStart(e, employee.id)}
                        onDragEnd={onEmployeeDragEnd}
                        onDragOver={(e) => {
                          if (!canEditAssignments || !dragEmployeeId) return;
                          e.preventDefault();
                          setHoverRow(rowKey);
                        }}
                        onDragLeave={() => {
                          if (hoverRow === rowKey) setHoverRow("");
                        }}
                        onDrop={(e) => onRowDrop(e, employee.id)}
                      >
                        <div className="workassign-employee-cell-inner">
                          {canEditAssignments ? <span className="workassign-row-drag">↕</span> : null}
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
                        const status = dayStatusMap.get(dateStr) || getDayStatus(dateStr);
                        const isLocked = status.isHoliday;
                        const isEmpty = cellRows.length === 0;
                        const cellStatusClass = isLocked
                          ? "workassign-cell-holiday"
                          : status.shortWeekFriday && isEmpty
                            ? "workassign-cell-shortfree"
                            : isEmpty
                              ? "workassign-cell-open"
                              : "workassign-cell-assigned";

                        return (
                          <td
                            key={cellKey}
                            className={`workassign-drop-cell ${cellStatusClass} ${
                              hoverCell === cellKey && !isLocked ? "workassign-drop-cell-hover" : ""
                            }`}
                            onClick={() => { if (!isLocked) onCellClick(employee.id, dateStr); }}
                            onDragOver={(e) => {
                              if (!canEditAssignments || isLocked) return;
                              e.preventDefault();
                              setHoverCell(cellKey);
                            }}
                            onDragLeave={() => {
                              if (hoverCell === cellKey) setHoverCell("");
                            }}
                            onDrop={(e) => {
                              if (isLocked) { e.preventDefault(); return; }
                              onCellDrop(e, employee.id, dateStr);
                            }}
                          >
                            <div className="workassign-cell-content">
                              {isLocked ? (
                                <div className="workassign-cell-locked">Feiertag<br /><strong>{status.holidayName}</strong></div>
                              ) : status.shortWeekFriday && cellRows.length === 0 ? (
                                <div className="workassign-cell-shortfree-note">Kurzwoche frei<br /><small>überschreibbar</small></div>
                              ) : cellRows.length === 0 ? (
                                <div className="workassign-cell-empty">—</div>
                              ) : (
                                cellRows.map((row) => {
                                  const project = projectMap.get(String(row.project_id));

                                  return (
                                    <span
                                      className="workassign-cell-chip color-token"
                                      style={getProjectColorStyle(row.project_id)}
                                      key={row.id}
                                    >
                                      {projectLabel(project)}
                                      {canEditAssignments ? (
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