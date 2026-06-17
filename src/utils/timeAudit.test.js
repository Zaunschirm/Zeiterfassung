import { describe, expect, it } from "vitest";
import {
  auditDisplayValue,
  auditFieldLabel,
  buildCreateAuditRows,
  buildDeleteAuditRows,
  buildUpdateAuditRows,
} from "./timeAudit.js";

const asUuidOrNull = (value) => value || null;
const displayValue = (field, value) =>
  auditDisplayValue(field, value, {
    getProjectNameById: (id) => `Projekt ${id}`,
    toHM: (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
  });

describe("time audit helpers", () => {
  it("labels audit fields", () => {
    expect(auditFieldLabel("project_id")).toBe("Projekt");
    expect(auditFieldLabel("unknown")).toBe("unknown");
  });

  it("formats audit values", () => {
    expect(displayValue("project_id", "p1")).toBe("Projekt p1");
    expect(displayValue("start_min", 420)).toBe("07:00");
    expect(displayValue("travel_minutes", 45)).toBe("45 min");
    expect(displayValue("bad_weather", true)).toBe("Ja");
  });

  it("builds create audit rows", () => {
    const rows = buildCreateAuditRows(
      [{ id: "entry-1", employee_id: "emp-1" }],
      { actor: "actor-1", asUuidOrNull, summary: () => "summary" }
    );

    expect(rows).toEqual([
      expect.objectContaining({
        entry_id: "entry-1",
        employee_id: "emp-1",
        changed_by: "actor-1",
        change_type: "create",
        field_name: "Eintrag",
        new_value: "summary",
      }),
    ]);
  });

  it("builds update audit rows only for changed fields", () => {
    const rows = buildUpdateAuditRows(
      { id: "entry-1", employee_id: "emp-1", start_min: 420, end_min: 960 },
      { start_min: 420, end_min: 990 },
      { actor: "actor-1", asUuidOrNull, displayValue }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      field_name: "end_min",
      old_value: "16:00",
      new_value: "16:30",
      change_type: "update",
    });
  });

  it("builds delete audit rows", () => {
    const rows = buildDeleteAuditRows(
      { id: "entry-1", employee_id: "emp-1" },
      { actor: "actor-1", asUuidOrNull, summary: () => "deleted entry" }
    );

    expect(rows).toEqual([
      expect.objectContaining({
        entry_id: "entry-1",
        employee_id: "emp-1",
        change_type: "delete",
        old_value: "deleted entry",
        new_value: null,
      }),
    ]);
  });
});
