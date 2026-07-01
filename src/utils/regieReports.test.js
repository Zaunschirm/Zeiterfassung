import { describe, expect, it } from "vitest";
import { cleanLaborItems, cleanMaterialItems, createReportNumber, sumLaborHours } from "./regieReports";
describe("regie report helpers", () => {
  it("creates a readable report number", () => expect(createReportNumber(new Date(2026, 6, 1, 9, 5), 0.012)).toBe("RB-20260701-0905-012"));
  it("cleans rows and sums hours", () => {
    expect(cleanLaborItems([{ name: "Max", hours: "2.5" }, { name: "", hours: 3 }])).toEqual([{ employee_id: "", name: "Max", hours: 2.5, activity: "" }]);
    expect(cleanMaterialItems([{ description: "Schrauben", quantity: "4", unit: "Stk." }, {}])).toEqual([{ description: "Schrauben", quantity: 4, unit: "Stk." }]);
    expect(sumLaborHours([{ name: "Max", hours: 2.5 }, { name: "Eva", hours: 1 }])).toBe(3.5);
  });
});
