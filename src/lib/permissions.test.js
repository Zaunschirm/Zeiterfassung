import { describe, expect, it } from "vitest";
import { canEditTimeEntry, getUserPermissions } from "./permissions.js";

describe("user permissions", () => {
  it("lets employees edit only their own time entries by default", () => {
    const permissions = getUserPermissions({ role: "mitarbeiter" });

    expect(permissions.writeOwnTime).toBe(true);
    expect(permissions.editOwnTime).toBe(true);
    expect(permissions.editAllTime).toBe(false);
    expect(permissions.deleteOwnTime).toBe(false);
    expect(permissions.deleteAllTime).toBe(false);
  });

  it("lets team leaders edit and delete team entries", () => {
    const permissions = getUserPermissions({ role: "teamleiter" });

    expect(permissions.editAllTime).toBe(true);
    expect(permissions.deleteAllTime).toBe(true);
  });

  it("allows employees to edit their own entry but not another employee's", () => {
    const options = {
      currentEmployeeId: "employee-1",
      isManager: false,
      canEditOwnTime: true,
    };

    expect(
      canEditTimeEntry({ ...options, entry: { employee_id: "employee-1" } })
    ).toBe(true);
    expect(
      canEditTimeEntry({ ...options, entry: { employee_id: "employee-2" } })
    ).toBe(false);
  });

  it("allows managers to edit another employee's entry", () => {
    expect(
      canEditTimeEntry({
        entry: { employee_id: "employee-2" },
        currentEmployeeId: "employee-1",
        isManager: true,
        canEditOwnTime: false,
      })
    ).toBe(true);
  });
});
