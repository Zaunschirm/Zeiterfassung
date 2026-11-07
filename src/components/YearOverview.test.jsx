import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { buildPayrollMonthlySummary } from "./YearOverview.jsx";

const employee = { id: 1, name: "Test", work_time_model: "buak" };
const summarize = (rows) => buildPayrollMonthlySummary(
  rows.map((row) => ({ employee_id: 1, employee_name: "Test", work_date: "2026-02-09", ...row })),
  ["2026-02"], [employee],
)[0];

describe("payroll ZA accounting", () => {
  it("credits paid ZA separately without inventing work hours or deducting it twice", () => {
    const result = summarize([{ absence_type: "za", za_hours: 9, start_min: 0, end_min: 0 }]);
    expect(result.totalHours).toBe(0);
    expect(result.workDays).toBe(0);
    expect(result.timeCompHours).toBe(9);
    expect(result.payrollHours).toBe(9);
    expect(result.overtime).toBe(-result.sollHours);
  });
  it("keeps work and partial ZA separate even for legacy ZA rows containing clock times", () => {
    const result = summarize([
      { start_min: 420, end_min: 660, break_min: 0 },
      { note: "[Zeitausgleich]", za_hours: 5, start_min: 660, end_min: 960 },
    ]);
    expect(result).toMatchObject({ totalHours: 4, payrollHours: 9, timeCompHours: 5, workDays: 1 });
    expect(result.overtime).toBe(4 - result.sollHours);
  });
  it("leaves normal work unchanged", () => {
    const result = summarize([{ start_min: 420, end_min: 990, break_min: 30 }]);
    expect(result).toMatchObject({ totalHours: 9, payrollHours: 9, timeCompHours: 0 });
    expect(result.overtime).toBe(9 - result.sollHours);
  });
});
