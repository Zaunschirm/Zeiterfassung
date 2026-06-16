import { describe, expect, it } from "vitest";
import {
  calcEmployeeSollHoursForRange,
  getAustrianHolidays,
  getBuakSollHoursForDay,
  getBuakWeekLabel,
  getEmployeeSollHoursForDay,
  getEmployeeWorkDay,
  getHolidayName,
} from "./time.js";

describe("BUAK time model", () => {
  it("calculates short weeks with Monday to Thursday and no Friday hours", () => {
    expect(getBuakWeekLabel("2026-01-05")).toBe("KW 2 - Kurze Woche");
    expect(getBuakSollHoursForDay("2026-01-05")).toBe(9);
    expect(getBuakSollHoursForDay("2026-01-08")).toBe(9);
    expect(getBuakSollHoursForDay("2026-01-09")).toBe(0);
  });

  it("calculates long weeks with a six hour Friday", () => {
    expect(getBuakWeekLabel("2026-01-12")).toBe("KW 3 - Lange Woche");
    expect(getBuakSollHoursForDay("2026-01-12")).toBe(9);
    expect(getBuakSollHoursForDay("2026-01-16")).toBe(6);
  });
});

describe("Austrian holidays", () => {
  it("returns fixed and movable Austrian holidays", () => {
    expect(getHolidayName("2026-01-06")).toBe("Heilige Drei K\u00f6nige");
    expect(getHolidayName("2026-05-25")).toBe("Pfingstmontag");
    expect(getHolidayName("2026-12-08")).toBe("Mari\u00e4 Empf\u00e4ngnis");
  });

  it("builds the holiday map for a year", () => {
    const holidays = getAustrianHolidays(2026);
    expect(holidays["2026-04-06"]).toBe("Ostermontag");
    expect(holidays["2026-06-04"]).toBe("Fronleichnam");
  });
});

describe("employee work time models", () => {
  const officeEmployee = { role: "verwaltung" };

  it("uses the default office model for Verwaltung employees", () => {
    expect(getEmployeeSollHoursForDay(officeEmployee, "2026-01-05")).toBe(8);
    expect(getEmployeeSollHoursForDay(officeEmployee, "2026-01-09")).toBe(4);
    expect(getEmployeeSollHoursForDay(officeEmployee, "2026-01-10")).toBe(0);
  });

  it("uses custom individual work time settings", () => {
    const employee = {
      work_time_model: "individuell",
      work_time_settings: {
        days: {
          1: { active: true, start: "08:00", end: "12:00", breakMinutes: 0 },
          2: { active: true, start: "08:00", end: "17:00", breakMinutes: 60 },
          3: { active: false, start: "", end: "", breakMinutes: 0 },
        },
      },
    };

    expect(getEmployeeWorkDay(employee, "2026-01-05")).toMatchObject({
      model: "individuell",
      active: true,
      requiredMinutes: 240,
      requiredHours: 4,
    });
    expect(getEmployeeSollHoursForDay(employee, "2026-01-06")).toBe(8);
    expect(getEmployeeSollHoursForDay(employee, "2026-01-07")).toBe(0);
  });

  it("calculates ranges with or without paid holidays", () => {
    expect(calcEmployeeSollHoursForRange(officeEmployee, "2026-01-05", "2026-01-09", true)).toBe(36);
    expect(calcEmployeeSollHoursForRange(officeEmployee, "2026-01-05", "2026-01-09", false)).toBe(28);
  });
});
