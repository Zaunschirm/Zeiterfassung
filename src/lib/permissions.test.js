import { describe, expect, it } from "vitest";
import { getUserPermissions } from "./permissions.js";

describe("user permissions", () => {
  it("does not let employees edit or delete time entries by default", () => {
    const permissions = getUserPermissions({ role: "mitarbeiter" });

    expect(permissions.writeOwnTime).toBe(true);
    expect(permissions.editOwnTime).toBe(false);
    expect(permissions.editAllTime).toBe(false);
    expect(permissions.deleteOwnTime).toBe(false);
    expect(permissions.deleteAllTime).toBe(false);
  });

  it("lets team leaders edit and delete team entries", () => {
    const permissions = getUserPermissions({ role: "teamleiter" });

    expect(permissions.editAllTime).toBe(true);
    expect(permissions.deleteAllTime).toBe(true);
  });
});
