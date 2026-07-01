import { describe, expect, it } from "vitest";
import { cleanLaborItems, cleanMaterialItems, createReportNumber, prepareLaborItems, sumLaborHours } from "./regieReports";
describe("regie report helpers", () => {
  it("creates a project and date based report number", () => expect(createReportNumber("Spitzer Dach U4", new Date(2026, 6, 1))).toBe("RB-Spitzer-Dach-U4-20260701"));
  it("cleans rows and sums hours", () => {
    expect(cleanLaborItems([{ name: "Max", hours: "2.5" }, { name: "", hours: 3 }])).toEqual([{ employee_id: "", name: "Max", hours: 2.5, activity: "" }]);
    expect(cleanMaterialItems([{ description: "Schrauben", quantity: "4", unit: "Stk." }, {}])).toEqual([{ description: "Schrauben", quantity: 4, unit: "Stk." }]);
    expect(sumLaborHours([{ name: "Max", hours: 2.5 }, { name: "Eva", hours: 1 }])).toBe(3.5);
  });
  it("keeps prepared employees even before hours are entered", () => {
    expect(prepareLaborItems([{ employee_id: 7, name: "Max", hours: 0 }])).toEqual([
      { employee_id: "7", name: "Max", hours: 0, activity: "" },
    ]);
  });
});
