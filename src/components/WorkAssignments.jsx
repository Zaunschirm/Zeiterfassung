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

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekDates(dateStr) {
  const start = startOfWeek(dateStr);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
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

function dayShort(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("de-AT", {
    weekday: "short",
  });
}

function dayLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("de-AT", {
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

function groupRows(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const key = `${row.assignment_date}__${row.employee_id}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        date: row.assignment_date,
        employee_id: row.employee_id,
        employee_name: row.employees?.name || `Mitarbeiter ${row.employee_id}`,
        sort_order: Number(row.sort_order || 0),
        rows: [],
        projects: [],
      });
    }

    const group = map.get(key);
    group.rows.push(row);
    group.projects.push({
      id: row.project_id,
      row_id: row.id,
      sort_order: Number(row.sort_order || 0),
      project: row.projects || null,
    });
  }

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      projects: group.projects.sort((a, b) => a.row_id - b.row_id),
      rows: group.rows.sort((a, b) => a.id - b.id),
    }))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.employee_name.localeCompare(b.employee_name, "de");
    });
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
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const [dayEmployeeSelect, setDayEmployeeSelect] = useState({});
  const [dayProjectSelect, setDayProjectSelect] = useState({});
  const [cardProjectSelect, setCardProjectSelect] = useState({});

  const [dragInfo, setDragInfo] = useState(null);
  const [dragOverDate, setDragOverDate] = useState("");

  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);
  const weekDateStrings = useMemo(() => weekDates.map(toIso), [weekDates]);

  const weekLabel = useMemo(() => {
    const first = weekDates[0];
    const last = weekDates[4];
    return `KW ${getWeekNumber(weekAnchor)} · ${first.toLocaleDateString(
      "de-AT"
    )} – ${last.toLocaleDateString("de-AT")}`;
  }, [weekAnchor, weekDates]);

  const grouped = useMemo(() => groupRows(rows), [rows]);

  const groupedByDate = useMemo(() => {
    const map = {};
    for (const dateStr of weekDateStrings) map[dateStr] = [];
    for (const item of grouped) {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    }
    return map;
  }, [grouped, weekDateStrings]);

  useEffect(() => {
    async function bootstrap() {
      setError("");
      try {
        const [employeesRes, projectsRes] = await Promise.all([
          supabase
            .from("employees")
            .select("id, name, active, disabled")
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
            sort_order,
            employees (
              id,
              name
            ),
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
        .order("sort_order", { ascending: true })
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
    setWeekAnchor(toIso(start));
  }

  function getCardsForDay(dateStr) {
    return groupedByDate[dateStr] || [];
  }

  function getUsedEmployeeIdsForDate(dateStr) {
    return new Set(getCardsForDay(dateStr).map((card) => String(card.employee_id)));
  }

  function getAvailableEmployeesForDate(dateStr) {
    const used = getUsedEmployeeIdsForDate(dateStr);
    return employees.filter((emp) => !used.has(String(emp.id)));
  }

  async function addDayAssignment(dateStr) {
    const employeeId = dayEmployeeSelect[dateStr];
    const projectId = dayProjectSelect[dateStr];

    if (!employeeId || !projectId) return;

    const currentCards = getCardsForDay(dateStr);
    const nextSort = currentCards.length
      ? Math.max(...currentCards.map((c) => Number(c.sort_order || 0))) + 1
      : 1;

    try {
      setBusyKey(`day-add-${dateStr}`);

      const { error } = await supabase.from("work_assignments").insert({
        assignment_date: dateStr,
        employee_id: Number(employeeId),
        project_id: Number(projectId),
        sort_order: nextSort,
      });

      if (error) throw error;

      setDayEmployeeSelect((prev) => ({ ...prev, [dateStr]: "" }));
      setDayProjectSelect((prev) => ({ ...prev, [dateStr]: "" }));

      await loadAssignments();
    } catch (e) {
      console.error("[WorkAssignments] add day assignment error:", e);
      window.alert("Einteilung konnte nicht hinzugefügt werden.");
    } finally {
      setBusyKey("");
    }
  }

  async function addProjectToCard(card) {
    const selectedProjectId = cardProjectSelect[card.key];
    if (!selectedProjectId) return;

    const exists = card.projects.some(
      (p) => String(p.id) === String(selectedProjectId)
    );
    if (exists) {
      window.alert("Dieses Projekt ist an diesem Tag schon eingeteilt.");
      return;
    }

    try {
      setBusyKey(`card-add-${card.key}`);

      const { error } = await supabase.from("work_assignments").insert({
        assignment_date: card.date,
        employee_id: Number(card.employee_id),
        project_id: Number(selectedProjectId),
        sort_order: Number(card.sort_order || 0),
      });

      if (error) throw error;

      setCardProjectSelect((prev) => ({ ...prev, [card.key]: "" }));
      await loadAssignments();
    } catch (e) {
      console.error("[WorkAssignments] add project error:", e);
      window.alert("Projekt konnte nicht hinzugefügt werden.");
    } finally {
      setBusyKey("");
    }
  }

  async function removeProject(rowId) {
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
      window.alert("Projekt konnte nicht gelöscht werden.");
    } finally {
      setBusyKey("");
    }
  }

  async function normalizeDaySort(dateStr, cards) {
    let order = 1;

    for (const card of cards) {
      const ids = card.rows.map((r) => r.id);
      if (!ids.length) continue;

      const { error } = await supabase
        .from("work_assignments")
        .update({ sort_order: order })
        .in("id", ids);

      if (error) throw error;
      order += 1;
    }
  }

  async function moveCardToDate(sourceCard, targetDate) {
    const targetCards = getCardsForDay(targetDate);
    const newSort =
      targetCards.length > 0
        ? Math.max(...targetCards.map((c) => Number(c.sort_order || 0))) + 1
        : 1;

    const ids = sourceCard.rows.map((r) => r.id);

    const { error } = await supabase
      .from("work_assignments")
      .update({
        assignment_date: targetDate,
        sort_order: newSort,
      })
      .in("id", ids);

    if (error) throw error;

    if (sourceCard.date !== targetDate) {
      const remainingSourceCards = getCardsForDay(sourceCard.date).filter(
        (c) => c.key !== sourceCard.key
      );
      await normalizeDaySort(sourceCard.date, remainingSourceCards);
    }
  }

  async function reorderInsideDate(dateStr, draggedKey, targetKey) {
    if (!draggedKey || !targetKey || draggedKey === targetKey) return;

    const cards = [...getCardsForDay(dateStr)];
    const fromIndex = cards.findIndex((c) => c.key === draggedKey);
    const toIndex = cards.findIndex((c) => c.key === targetKey);

    if (fromIndex < 0 || toIndex < 0) return;

    const [moved] = cards.splice(fromIndex, 1);
    cards.splice(toIndex, 0, moved);

    await normalizeDaySort(dateStr, cards);
  }

  function onDragStart(card) {
    if (!isAdmin) return;
    setDragInfo({
      key: card.key,
      sourceDate: card.date,
    });
  }

  async function onDropColumn(targetDate) {
    if (!isAdmin || !dragInfo) return;

    try {
      setBusyKey(`drop-${targetDate}`);
      const sourceCard = grouped.find((g) => g.key === dragInfo.key);
      if (!sourceCard) return;

      if (sourceCard.date !== targetDate) {
        await moveCardToDate(sourceCard, targetDate);
        await loadAssignments();
      }
    } catch (e) {
      console.error("[WorkAssignments] drop column error:", e);
      window.alert("Verschieben konnte nicht gespeichert werden.");
    } finally {
      setBusyKey("");
      setDragInfo(null);
      setDragOverDate("");
    }
  }

  async function onDropCard(targetDate, targetCardKey) {
    if (!isAdmin || !dragInfo) return;

    try {
      setBusyKey(`drop-card-${targetCardKey}`);
      const sourceCard = grouped.find((g) => g.key === dragInfo.key);
      if (!sourceCard) return;

      if (sourceCard.date !== targetDate) {
        await moveCardToDate(sourceCard, targetDate);
        await loadAssignments();

        const refreshedCards = groupRows(
          (await supabase
            .from("work_assignments")
            .select(
              `
                id,
                assignment_date,
                employee_id,
                project_id,
                sort_order,
                employees ( id, name ),
                projects ( id, name, cost_center, active )
              `
            )
            .in("assignment_date", weekDateStrings)
            .order("assignment_date", { ascending: true })
            .order("sort_order", { ascending: true })
            .order("id", { ascending: true })).data || []
        );

        const refreshedDayCards = refreshedCards.filter((c) => c.date === targetDate);
        const movedCard = refreshedDayCards.find(
          (c) => String(c.employee_id) === String(sourceCard.employee_id)
        );

        if (movedCard && movedCard.key !== targetCardKey) {
          const cards = [...refreshedDayCards];
          const fromIndex = cards.findIndex((c) => c.key === movedCard.key);
          const toIndex = cards.findIndex((c) => c.key === targetCardKey);
          if (fromIndex >= 0 && toIndex >= 0) {
            const [moved] = cards.splice(fromIndex, 1);
            cards.splice(toIndex, 0, moved);
            await normalizeDaySort(targetDate, cards);
          }
        }

        await loadAssignments();
      } else {
        await reorderInsideDate(targetDate, dragInfo.key, targetCardKey);
        await loadAssignments();
      }
    } catch (e) {
      console.error("[WorkAssignments] drop card error:", e);
      window.alert("Reihenfolge konnte nicht gespeichert werden.");
    } finally {
      setBusyKey("");
      setDragInfo(null);
      setDragOverDate("");
    }
  }

  return (
    <div className="workassign-board-page">
      <div className="workassign-board-head hbz-card">
        <div className="workassign-board-head-top">
          <div>
            <div className="workassign-board-kicker">Planung</div>
            <h2 className="workassign-board-title">Arbeitseinteilung</h2>
            <div className="workassign-board-subtitle">{weekLabel}</div>
          </div>

          <div className="workassign-board-actions">
            <button className="hbz-btn" type="button" onClick={() => shiftWeek(-1)}>
              ← KW zurück
            </button>
            <button
              className="hbz-btn"
              type="button"
              onClick={() => setWeekAnchor(new Date().toISOString().slice(0, 10))}
            >
              Diese KW
            </button>
            <button className="hbz-btn" type="button" onClick={() => shiftWeek(1)}>
              KW vor →
            </button>
          </div>
        </div>

        <div className="workassign-board-toolbar">
          <div className="help">
            Alle sehen alles. Bearbeiten darf nur der Admin. Projekte aus der
            Arbeitseinteilung werden in der Zeiterfassung vorgeschlagen.
          </div>

          <div className="field-inline workassign-board-datefield">
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

      {loading ? (
        <div className="hbz-card month-empty-state">Lade Arbeitseinteilung…</div>
      ) : (
        <div className="workassign-board-grid">
          {weekDateStrings.map((dateStr) => {
            const cards = getCardsForDay(dateStr);
            const availableEmployees = getAvailableEmployeesForDate(dateStr);

            return (
              <div
                key={dateStr}
                className={`workassign-col ${
                  dragOverDate === dateStr ? "workassign-col-dragover" : ""
                }`}
                onDragOver={(e) => {
                  if (!isAdmin) return;
                  e.preventDefault();
                  setDragOverDate(dateStr);
                }}
                onDragLeave={() => {
                  if (dragOverDate === dateStr) setDragOverDate("");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropColumn(dateStr);
                }}
              >
                <div className="workassign-col-head">
                  <div className="workassign-col-day">{dayShort(dateStr)}</div>
                  <div className="workassign-col-date">{dayLabel(dateStr)}</div>
                  <div className="workassign-col-count">{cards.length} MA</div>
                </div>

                {isAdmin ? (
                  <div className="workassign-col-add">
                    <select
                      className="hbz-select"
                      value={dayEmployeeSelect[dateStr] || ""}
                      onChange={(e) =>
                        setDayEmployeeSelect((prev) => ({
                          ...prev,
                          [dateStr]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Mitarbeiter…</option>
                      {availableEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="hbz-select"
                      value={dayProjectSelect[dateStr] || ""}
                      onChange={(e) =>
                        setDayProjectSelect((prev) => ({
                          ...prev,
                          [dateStr]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Projekt…</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {projectLabel(project)}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="hbz-btn hbz-btn-primary"
                      onClick={() => addDayAssignment(dateStr)}
                      disabled={
                        !dayEmployeeSelect[dateStr] ||
                        !dayProjectSelect[dateStr] ||
                        busyKey === `day-add-${dateStr}`
                      }
                    >
                      +
                    </button>
                  </div>
                ) : null}

                <div className="workassign-card-list">
                  {cards.length === 0 ? (
                    <div className="workassign-col-empty">Keine Einteilung</div>
                  ) : (
                    cards.map((card) => {
                      const availableProjects = projects.filter(
                        (project) =>
                          !card.projects.some(
                            (p) => String(p.id) === String(project.id)
                          )
                      );

                      return (
                        <div
                          key={card.key}
                          className="workassign-card"
                          draggable={isAdmin}
                          onDragStart={() => onDragStart(card)}
                          onDragOver={(e) => {
                            if (!isAdmin) return;
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDropCard(dateStr, card.key);
                          }}
                        >
                          <div className="workassign-card-head">
                            <div className="workassign-card-name">
                              {card.employee_name}
                            </div>
                            {isAdmin ? (
                              <div className="workassign-card-drag">↕</div>
                            ) : null}
                          </div>

                          <div className="workassign-card-projects">
                            {card.projects.map((item) => (
                              <span className="workassign-card-chip" key={item.row_id}>
                                {projectLabel(item.project)}
                                {isAdmin ? (
                                  <button
                                    type="button"
                                    className="workassign-card-chip-remove"
                                    onClick={() => removeProject(item.row_id)}
                                    disabled={busyKey === `remove-${item.row_id}`}
                                  >
                                    ×
                                  </button>
                                ) : null}
                              </span>
                            ))}
                          </div>

                          {isAdmin ? (
                            <div className="workassign-card-addrow">
                              <select
                                className="hbz-select"
                                value={cardProjectSelect[card.key] || ""}
                                onChange={(e) =>
                                  setCardProjectSelect((prev) => ({
                                    ...prev,
                                    [card.key]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Projekt…</option>
                                {availableProjects.map((project) => (
                                  <option key={project.id} value={project.id}>
                                    {projectLabel(project)}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                className="hbz-btn"
                                onClick={() => addProjectToCard(card)}
                                disabled={
                                  !cardProjectSelect[card.key] ||
                                  busyKey === `card-add-${card.key}`
                                }
                              >
                                +
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}