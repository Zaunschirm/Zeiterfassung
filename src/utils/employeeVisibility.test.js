import { describe, expect, it } from "vitest";
import { filterVisibleEmployeesForRole, isTestEmployee } from "./employeeVisibility";

describe("employeeVisibility", () => {
  const employees = [
    { id: 1, name: "Echt", is_test_employee: false },
    { id: 2, name: "Test", is_test_employee: true },
  ];

  it("shows test employees to admins", () => {
    expect(filterVisibleEmployeesForRole(employees, "admin")).toHaveLength(2);
  });

  it("hides test employees from non-admin roles", () => {
    expect(filterVisibleEmployeesForRole(employees, "mitarbeiter")).toEqual([
      employees[0],
    ]);
    expect(filterVisibleEmployeesForRole(employees, "teamleiter")).toEqual([
      employees[0],
    ]);
  });

  it("detects only explicitly flagged test employees", () => {
    expect(isTestEmployee({ name: "Test Name", is_test_employee: false })).toBe(false);
    expect(isTestEmployee({ name: "Egal", is_test_employee: true })).toBe(true);
  });
});

