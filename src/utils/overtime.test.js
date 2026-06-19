import { describe, expect, it } from "vitest";
import {
  calculateZaBalanceForEmployee,
  calculateZaBalanceDelta,
  calculateZaDailyChange,
  getEntryWorkHoursForZa,
  parseHoursValue,
} from "./overtime.js";

const buakEmployee = { role: "mitarbeiter", work_time_model: "buak" };

describe("overtime / ZA helpers", () => {
  it("parses hour values from common inputs", () => {
    expect(parseHoursValue("1,5 h")).toBe(1.5);
    expect(parseHoursValue("-2.25")).toBe(-2.25);
    expect(parseHoursValue(null)).toBe(0);
  });

  it("calculates the centrally rounded change between two ZA balances", () => {
    expect(calculateZaBalanceDelta("38,25", 17)).toBe(-21.25);
    expect(calculateZaBalanceDelta(50.75, 51.5)).toBe(0.75);
  });

  it("calculates worked hours including travel for normal rows only", () => {
    expect(getEntryWorkHoursForZa({ start_min: 420, end_min: 960, break_min: 30, travel_minutes: 60 })).toBe(9.5);
    expect(getEntryWorkHoursForZa({ start_min: 420, end_min: 960, break_min: 30, note: "[Zeitausgleich]", za_hours: 8 })).toBe(0);
    expect(getEntryWorkHoursForZa({ start_min: 420, end_min: 960, break_min: 30, note: "[Urlaub]" })).toBe(0);
  });

  it("does not double-subtract a full ZA day", () => {
    const day = { worked: 0, usedZa: 9, hasZa: true, hasPaidAbsence: false };
    expect(calculateZaDailyChange({ day, employee: buakEmployee, date: "2026-01-05" })).toMatchObject({
      soll: 9,
      usedZa: 9,
      generated: -9,
    });
  });

  it("keeps vacation and sick days neutral for the ZA balance", () => {
    const day = { worked: 0, usedZa: 0, hasZa: false, hasPaidAbsence: true };
    expect(calculateZaDailyChange({ day, employee: buakEmployee, date: "2026-01-05" }).generated).toBe(0);
  });

  it("keeps Austrian holidays neutral when requested by an export", () => {
    expect(calculateZaDailyChange({
      employee: buakEmployee,
      date: "2026-01-01",
      neutralizeHolidays: true,
    }).generated).toBe(0);
  });

  it("calculates balances from entries and corrections", () => {
    const result = calculateZaBalanceForEmployee({
      employee: buakEmployee,
      from: "2026-01-05",
      to: "2026-01-06",
      entries: [
        { work_date: "2026-01-05", start_min: 405, end_min: 990, break_min: 30, travel_minutes: 0 },
        { work_date: "2026-01-06", note: "[Zeitausgleich]", za_hours: 9 },
      ],
      adjustments: [{ adjustment_date: "2026-01-06", hours: 1.5 }],
    });

    expect(result).toMatchObject({
      worked: 9.25,
      soll: 18,
      usedZa: 9,
      generated: -8.75,
      corrections: 1.5,
      balance: -7.25,
    });
    expect(result.days[1]).toMatchObject({ corrections: 1.5 });
  });
});
