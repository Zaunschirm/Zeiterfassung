import React, { useMemo } from "react";

/**
 * Schöner Mitarbeiter-Picker (Pills) mit Mehrfachauswahl.
 * Props:
 *  employees: [{id, code, name, role}]
 *  selected: string[]            // ausgewählte codes
 *  onChange: (codes: string[])   // Callback
 *  enableMulti?: boolean         // default: true
 */
export default function EmployeePicker({
  employees = [],
  selected = [],
  onChange,
  enableMulti = true,
}) {
  const allCodes = useMemo(() => employees.map((e) => e.code), [employees]);

  function toggle(code) {
    if (!enableMulti) {
      onChange?.([code]);
      return;
    }
    const set = new Set(selected);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    onChange?.([...set]);
  }

  function selectAll() {
    onChange?.(allCodes);
  }
  function selectNone() {
    onChange?.([]);
  }

  const isAllSelected = selected.length > 0 && selected.length === allCodes.length;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-8 mb-2">
        <div className="font-semibold">Mitarbeiter</div>
        <div className="flex gap-6 text-sm">
          <button type="button" className="hz-pill hz-pill-muted" onClick={selectAll}>
            Alle
          </button>
          <button type="button" className="hz-pill hz-pill-muted" onClick={selectNone}>
            Keine
          </button>
          {enableMulti && (
            <div className="text-xs opacity-70">
              {selected.length} / {allCodes.length} gewählt{isAllSelected ? " (alle)" : ""}
            </div>
          )}
        </div>
      </div>

      <div
        className="hz-pill-row"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, rowGap: 10, maxHeight: 120, overflowY: "auto" }}
      >
        {employees.map((e) => {
          const active = selected.includes(e.code);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => toggle(e.code)}
              className={`hz-pill ${active ? "hz-pill-active" : "hz-pill-idle"}`}
              title={`${e.name} (${e.role})`}
              style={{ minHeight: 34 }}
            >
              {e.name}
            </button>
          );
        })}
      </div>

      <style>{`
        .hz-pill {
          border: 1px solid #d9c9b6;
          background: #ffffff;
          color: #3b2a20;
          padding: 6px 12px;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 600;
          transition: background .15s ease, color .15s ease, border-color .15s ease;
        }
        .hz-pill:hover { background: #f6eee4; }
        .hz-pill-active {
          background: #7b4a2d;
          color: #fff;
          border-color: #7b4a2d;
        }
        .hz-pill-muted {
          background: #fff7f0;
          border-color: #d9c9b6;
          color: #3b2a20;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
