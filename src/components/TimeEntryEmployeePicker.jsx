import React, { useMemo, useState } from "react";

export default function TimeEntryEmployeePicker({
  employees = [],
  selected = [],
  onChange,
  ownCode,
  assignmentLabel,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectableEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => employee?.active !== false && employee?.disabled !== true
      ),
    [employees]
  );

  const selectedEmployees = useMemo(
    () => {
      const employeeByCode = new Map(
        selectableEmployees.map((employee) => [employee.code, employee])
      );
      return selected.map((code) => employeeByCode.get(code)).filter(Boolean);
    },
    [selectableEmployees, selected]
  );

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("de");
    if (!term) return selectableEmployees;
    return selectableEmployees.filter((employee) =>
      `${employee.name || ""} ${employee.code || ""}`
        .toLocaleLowerCase("de")
        .includes(term)
    );
  }, [search, selectableEmployees]);

  const toggleEmployee = (code) => {
    const next = selected.includes(code)
      ? selected.filter((item) => item !== code)
      : [...selected, code];
    onChange?.(next);
  };

  return (
    <div className="time-entry-employee-picker">
      <button
        type="button"
        className={`time-entry-employee-summary${open ? " open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="time-entry-employee-head">
          <span className="hbz-label">Zeit erfassen für</span>
          <span className="time-entry-employee-head-right">
            <span className="badge-soft">{selectedEmployees.length} ausgewählt</span>
            <span className="time-entry-employee-chevron" aria-hidden="true">⌄</span>
          </span>
        </span>
        {assignmentLabel ? (
          <span className="time-entry-assignment-label">{assignmentLabel}</span>
        ) : null}
        <span className="time-entry-selected-people">
          {selectedEmployees.length ? (
            selectedEmployees.map((employee) => (
              <span className="time-entry-person-chip" key={employee.id || employee.code}>
                {employee.name}{employee.code === ownCode ? " (Ich)" : ""}
              </span>
            ))
          ) : (
            <span className="help">Keine Mitarbeiter ausgewählt</span>
          )}
        </span>
      </button>

      {open ? (
        <div className="time-entry-employee-options">
          <div className="time-entry-employee-actions">
            <button
              type="button"
              className="hbz-btn btn-small"
              onClick={() => onChange?.(ownCode ? [ownCode] : [])}
            >
              Nur ich
            </button>
            <button
              type="button"
              className="hbz-btn btn-small"
              onClick={() => onChange?.(selectableEmployees.map((employee) => employee.code))}
            >
              Alle
            </button>
          </div>
          <input
            type="search"
            className="hbz-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Mitarbeiter suchen ..."
          />
          <div className="time-entry-employee-list">
            {filteredEmployees.map((employee) => (
              <label className="time-entry-employee-row" key={employee.id || employee.code}>
                <input
                  type="checkbox"
                  checked={selected.includes(employee.code)}
                  onChange={() => toggleEmployee(employee.code)}
                />
                <span>{employee.name || employee.code}</span>
                <small>{employee.code === ownCode ? "Ich" : employee.code}</small>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <style>{`
        .time-entry-employee-picker { margin-top: 12px; padding: 12px; border: 1px solid #d9c9b6; border-radius: 8px; background: #fffaf2; }
        .time-entry-employee-summary { width: 100%; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
        .time-entry-employee-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .time-entry-employee-head-right { display: flex; align-items: center; gap: 7px; }
        .time-entry-employee-chevron { color: #7b4a2d; font-size: 18px; transition: transform .15s ease; }
        .time-entry-employee-summary.open .time-entry-employee-chevron { transform: rotate(180deg); }
        .time-entry-assignment-label { display: block; margin-top: 5px; color: #7a614e; font-size: 11px; font-weight: 700; }
        .time-entry-selected-people { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
        .time-entry-person-chip { border: 1px solid #d6b99e; border-radius: 999px; padding: 5px 8px; background: #fff; color: #5a3a23; font-size: 12px; font-weight: 800; }
        .time-entry-employee-options { margin-top: 10px; }
        .time-entry-employee-actions { display: flex; gap: 7px; margin-bottom: 8px; }
        .time-entry-employee-list { max-height: 230px; margin-top: 8px; overflow-y: auto; border: 1px solid #ddcbb9; border-radius: 8px; background: #fff; }
        .time-entry-employee-row { min-height: 43px; padding: 8px 10px; display: flex; align-items: center; gap: 9px; border-bottom: 1px solid #eee1d5; cursor: pointer; }
        .time-entry-employee-row:last-child { border-bottom: 0; }
        .time-entry-employee-row input { width: 18px; height: 18px; accent-color: #7b4a2d; }
        .time-entry-employee-row span { flex: 1; font-size: 13px; font-weight: 750; }
        .time-entry-employee-row small { color: #8a715d; font-size: 10px; }
      `}</style>
    </div>
  );
}
