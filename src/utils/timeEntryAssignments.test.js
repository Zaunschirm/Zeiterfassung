import { describe, expect, it } from "vitest";
import {
  getAssignedEmployeeCodes,
  getAssignmentProjects,
  getDefaultAssignmentProjectId,
} from "./timeEntryAssignments.js";

const employees = [
  { id: 1, code: "MA01", name: "Anna", active: true, disabled: false },
  { id: 2, code: "MA02", name: "Ben", active: true, disabled: false },
  { id: 3, code: "MA03", name: "Clara", active: false, disabled: false },
];

const assignments = [
  { assignment_date: "2026-06-18", employee_id: 1, project_id: 10 },
  { assignment_date: "2026-06-18", employee_id: 2, project_id: 10 },
  { assignment_date: "2026-06-18", employee_id: 3, project_id: 10 },
  { assignment_date: "2026-06-18", employee_id: 1, project_id: 20 },
  { assignment_date: "2026-06-19", employee_id: 2, project_id: 20 },
];

describe("time entry assignment helpers", () => {
  it("returns unique projects for the selected day", () => {
    expect(
      getAssignmentProjects({
        assignments,
        date: "2026-06-18",
        projects: [
          { id: 10, code: "P10", name: "Baustelle" },
          { id: 20, code: "P20", name: "Werkstatt" },
        ],
      })
    ).toEqual([
      { id: 10, code: "P10", name: "Baustelle" },
      { id: 20, code: "P20", name: "Werkstatt" },
    ]);
  });

  it("preselects active employees assigned to the project", () => {
    expect(
      getAssignedEmployeeCodes({
        assignments,
        date: "2026-06-18",
        projectId: 10,
        employees,
      })
    ).toEqual(["MA01", "MA02"]);
  });

  it("returns no employees without a selected project", () => {
    expect(
      getAssignedEmployeeCodes({ assignments, date: "2026-06-18", employees })
    ).toEqual([]);
  });

  it("defaults employees only to their own assigned project", () => {
    expect(
      getDefaultAssignmentProjectId({
        assignments,
        date: "2026-06-18",
        currentEmployeeId: 2,
        isManager: false,
      })
    ).toBe(10);
  });

  it("does not preselect another project when the employee has no assignment", () => {
    expect(
      getDefaultAssignmentProjectId({
        assignments,
        date: "2026-06-18",
        currentEmployeeId: 99,
        isManager: false,
      })
    ).toBeNull();
  });

  it("defaults managers to the first project of the day", () => {
    expect(
      getDefaultAssignmentProjectId({
        assignments,
        date: "2026-06-18",
        currentEmployeeId: 99,
        isManager: true,
      })
    ).toBe(10);
  });
});
