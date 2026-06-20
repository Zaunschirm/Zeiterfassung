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

  it("does not double-subtract ZA on a mixed work and ZA day", () => {
    const result = calculateZaBalanceForEmployee({
      employee: buakEmployee,
      from: "2026-01-05",
      to: "2026-01-05",
      entries: [
        { work_date: "2026-01-05", start_min: 420, end_min: 660, break_min: 0 },
        { work_date: "2026-01-05", note: "[Zeitausgleich]", za_hours: 5 },
      ],
    });

    expect(result).toMatchObject({ worked: 4, soll: 9, usedZa: 5, generated: -5, balance: -5 });
  });

  it("uses the daily target as fallback when a ZA row has no hours", () => {
    const result = calculateZaBalanceForEmployee({
      employee: buakEmployee,
      from: "2026-01-05",
      to: "2026-01-05",
      entries: [{ work_date: "2026-01-05", note: "[Zeitausgleich]" }],
    });

    expect(result).toMatchObject({ usedZa: 9, generated: -9, balance: -9 });
  });

  it("keeps vacation and sick days neutral for the ZA balance", () => {
    const day = { worked: 0, usedZa: 0, hasZa: false, hasPaidAbsence: true };
    expect(calculateZaDailyChange({ day, employee: buakEmployee, date: "2026-01-05" }).generated).toBe(0);
  });

  it("keeps Austrian holidays neutral in every ZA account", () => {
    expect(calculateZaDailyChange({
      employee: buakEmployee,
      date: "2026-01-01",
    }).generated).toBe(0);
  });

  it("keeps real vacation and sick entries neutral across a range", () => {
    const result = calculateZaBalanceForEmployee({
      employee: buakEmployee,
      from: "2026-01-07",
      to: "2026-01-08",
      entries: [
        { work_date: "2026-01-07", note: "[Urlaub]" },
        { work_date: "2026-01-08", note: "[Krank]" },
      ],
    });

    expect(result).toMatchObject({ generated: 0, balance: 0 });
  });

  it("calculates balances from entries and corrections", () => {
    const result = calculateZaBalanceForEmployee({
      employee: buakEmployee,
      from: "2026-01-07",
      to: "2026-01-08",
      entries: [
        { work_date: "2026-01-07", start_min: 405, end_min: 990, break_min: 30, travel_minutes: 0 },
        { work_date: "2026-01-08", note: "[Zeitausgleich]", za_hours: 9 },
      ],
      adjustments: [{ adjustment_date: "2026-01-08", hours: 1.5 }],
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

  it("filters corrections and assigns them to the correct side of a month change", () => {
    const result = calculateZaBalanceForEmployee({
      employee: buakEmployee,
      from: "2026-01-30",
      to: "2026-02-02",
      adjustments: [
        { adjustment_date: "2026-01-29", hours: 99 },
        { adjustment_date: "2026-01-31", hours: 2 },
        { adjustment_date: "2026-02-01", hours: -0.5 },
        { adjustment_date: "2026-02-03", hours: 99 },
      ],
    });

    expect(result.corrections).toBe(1.5);
    expect(result.days.map((day) => [day.date, day.corrections])).toEqual([
      ["2026-01-30", 0],
      ["2026-01-31", 2],
      ["2026-02-01", -0.5],
      ["2026-02-02", 0],
    ]);
  });
});
