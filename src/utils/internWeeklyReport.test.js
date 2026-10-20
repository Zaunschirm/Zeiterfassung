import { describe, it, expect } from "vitest";
import { buildWeeklyReport, previousViennaWeek, weekRange, durationHM, loadWeeklyReport, createWeeklyPdf } from "./internWeeklyReport";

const entry = { id: 1, employee_id: 7, work_date: "2026-10-12", start_min: 420, end_min: 720, break_min: 30, project_id: "a" };
const projects = [{ id: "a", name: "BV A", cost_center: "0042", address: "Baustelle A" }];

describe("Praktikanten-Wochennachweis", () => {
  it("uses the previous week in Vienna, including the Sunday UTC/Monday Vienna boundary", () => {
    expect(previousViennaWeek(new Date("2026-10-20T12:00:00Z"))).toBe("2026-W42");
    expect(previousViennaWeek(new Date("2026-10-18T22:30:00Z"))).toBe("2026-W42");
    expect(previousViennaWeek(new Date("2021-01-04T12:00:00Z"))).toBe("2020-W53");
  });
  it("handles ISO years, leap days and month boundaries", () => {
    expect(weekRange("2020-W53")).toEqual({ from: "2020-12-28", to: "2021-01-03" });
    expect(weekRange("2024-W09")).toEqual({ from: "2024-02-26", to: "2024-03-03" });
    expect(() => weekRange("2021-W53")).toThrow();
    expect(() => weekRange("2026-W00")).toThrow();
    expect(() => weekRange("")).toThrow();
  });
  it("keeps sites separate, subtracts each pause and excludes travel/absences/other employees", () => {
    const report = buildWeeklyReport([
      entry,
      { ...entry, id: 2, start_min: 780, end_min: 1020, break_min: 15, project_id: "b", travel_minutes: 60 },
      { ...entry, id: 3, absence_type: "urlaub" },
      { ...entry, id: 4, employee_id: 8 },
      { ...entry, id: 5, work_date: "2026-10-19" },
    ], projects, 7, "2026-W42");
    expect(report.rows).toHaveLength(2);
    expect(report.total).toBe(495);
    expect(durationHM(report.total)).toBe("08:15");
    expect(report.rows[0].costCenter).toBe("0042");
    expect(report.rows[1].address).toBe("Nicht hinterlegt");
    expect(report.rows[1].costCenter).toBe("Nicht hinterlegt");
  });
  it("does not substitute project codes or external cost centers", () => {
    const report = buildWeeklyReport([entry], [{ id: "a", code: "123", external_cost_center: "999", address: " " }], 7, "2026-W42");
    expect(report.rows[0].costCenter).toBe("Nicht hinterlegt");
    expect(report.rows[0].address).toBe("Nicht hinterlegt");
  });
  it.each([
    { start_min: null }, { break_min: null }, { end_min: 400 },
    { break_min: 301 }, { start_min: -1 }, { end_min: 1500 },
  ])("blocks misleading totals for invalid time data %j", (change) => {
    expect(() => buildWeeklyReport([{ ...entry, ...change }], projects, 7, "2026-W42")).toThrow(/Bitte zuerst korrigieren/);
  });
  it("handles midnight and totals above 24 hours", () => {
    const report = buildWeeklyReport(Array.from({ length: 5 }, (_, i) => ({
      ...entry, id: i, work_date: `2026-10-${12 + i}`, start_min: 0, end_min: 480, break_min: 0,
    })), projects, 7, "2026-W42");
    expect(durationHM(report.total)).toBe("40:00");
  });
  it("loads a full week and only the requested employee and referenced projects", async () => {
    const calls = [];
    const client = { from(table) {
      const query = {};
      for (const method of ["select", "eq", "gte", "lte", "order", "in"]) {
        query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
      }
      query.range = async () => ({ data: table === "time_entries" ? [entry] : projects });
      return query;
    } };
    expect((await loadWeeklyReport(client, 7, "2026-W42")).total).toBe(270);
    expect(calls).toContainEqual(["time_entries", "eq", "employee_id", 7]);
    expect(calls).toContainEqual(["time_entries", "gte", "work_date", "2026-10-12"]);
    expect(calls).toContainEqual(["time_entries", "lte", "work_date", "2026-10-18"]);
    expect(calls).toContainEqual(["projects", "in", "id", ["a"]]);
  });
  it("propagates data errors instead of exporting incomplete data", async () => {
    const query = {};
    for (const method of ["select", "eq", "gte", "lte", "order"]) query[method] = () => query;
    query.range = async () => ({ error: new Error("Zugriff verweigert") });
    await expect(loadWeeklyReport({ from: () => query }, 7, "2026-W42")).rejects.toThrow("Zugriff verweigert");
  });
  it("creates a multi-page PDF with a single total and repeated identity", async () => {
    const rows = Array.from({ length: 65 }, (_, id) => ({ ...entry, id }));
    const report = buildWeeklyReport(rows, projects, 7, "2026-W42");
    const pdf = await createWeeklyPdf(report, "Test Mitarbeiter");
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    const content = pdf.output();
    expect(content.match(/Gesamtarbeitszeit/g)).toHaveLength(1);
    expect(content.match(/Test Mitarbeiter/g)).toHaveLength(pdf.getNumberOfPages());
    expect(content).toContain("292:30");
  });
});
