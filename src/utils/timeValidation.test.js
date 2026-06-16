import { describe, expect, it } from "vitest";
import { validateTimeEntry } from "./timeValidation.js";

const employee = { id: "emp-1", role: "mitarbeiter", work_time_model: "buak" };

describe("time entry validation", () => {
  it("blocks entries whose end is not after start", () => {
    const result = validateTimeEntry({
      date: "2026-01-05",
      employee,
      entry: { employee_id: "emp-1", work_date: "2026-01-05", start_min: 600, end_min: 600, break_min: 0 },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Ende muss nach Start liegen.");
  });

  it("warns when a long work day has no break", () => {
    const result = validateTimeEntry({
      date: "2026-01-05",
      employee,
      entry: { employee_id: "emp-1", work_date: "2026-01-05", project_id: "p1", start_min: 420, end_min: 840, break_min: 0 },
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("Bei einem langen Arbeitstag ist keine Pause eingetragen.");
  });

  it("warns for normal work entries on holidays or non-working days", () => {
    const holiday = validateTimeEntry({
      date: "2026-01-06",
      employee,
      entry: { employee_id: "emp-1", work_date: "2026-01-06", project_id: "p1", start_min: 420, end_min: 960, break_min: 30 },
    });
    const shortFriday = validateTimeEntry({
      date: "2026-01-09",
      employee,
      entry: { employee_id: "emp-1", work_date: "2026-01-09", project_id: "p1", start_min: 420, end_min: 720, break_min: 0 },
    });

    expect(holiday.warnings.some((message) => message.includes("Feiertag"))).toBe(true);
    expect(shortFriday.warnings).toContain("Eintrag an arbeitsfreier Tag laut Modell.");
  });

  it("warns for likely duplicate entries", () => {
    const result = validateTimeEntry({
      date: "2026-01-05",
      employee,
      entry: { employee_id: "emp-1", work_date: "2026-01-05", project_id: "p1", start_min: 420, end_min: 960, break_min: 30 },
      existingEntries: [
        { employee_id: "emp-1", work_date: "2026-01-05", project_id: "p1", start_min: 420, end_min: 960, break_min: 30 },
      ],
    });

    expect(result.warnings).toContain("Es gibt bereits einen sehr ähnlichen Eintrag für diese Person, diesen Tag, dieses Projekt und diese Zeit.");
  });
});
