import { describe, expect, it } from "vitest";
import {
  buildTimeEntryAbsenceWarnings,
  getTimeEntryAbsenceKind,
} from "./timeEntryAbsences.js";

describe("time entry absence checks", () => {
  it("recognizes sick leave, vacation and time compensation", () => {
    expect(getTimeEntryAbsenceKind({ note: "[Krank] eingetragen" })).toBe("Krank");
    expect(getTimeEntryAbsenceKind({ absence_type: "urlaub" })).toBe("Urlaub");
    expect(getTimeEntryAbsenceKind({ za_hours: 8 })).toBe("ZA");
    expect(getTimeEntryAbsenceKind({ note: "Montage" })).toBe("");
  });

  it("builds one named warning per affected employee", () => {
    const warnings = buildTimeEntryAbsenceWarnings({
      employees: [
        { id: 1, code: "MA01", name: "Anna Berger" },
        { id: 2, code: "MA02", name: "Ben Hofer" },
      ],
      entries: [
        { employee_id: 1, note: "[Krank] aus Arbeitseinteilung" },
        { employee_id: 1, absence_type: "krank" },
        { employee_id: 2, note: "[Zeitausgleich]" },
      ],
    });

    expect(warnings).toEqual([
      "Anna Berger: Für diesen Tag ist bereits Krank eingetragen.",
      "Ben Hofer: Für diesen Tag ist bereits ZA eingetragen.",
    ]);
  });
});
