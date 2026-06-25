import { describe, expect, it, vi } from "vitest";
import {
  createTimeEntries,
  deleteTimeEntry,
  updateTimeEntry,
} from "./timeEntries.js";

describe("time entry persistence", () => {
  it("creates entries and returns the saved rows", async () => {
    const savedRows = [{ id: "entry-1", employee_id: "emp-1" }];
    const select = vi.fn().mockResolvedValue({ data: savedRows, error: null });
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const client = { from };

    await expect(
      createTimeEntries(client, { employee_id: "emp-1" })
    ).resolves.toEqual(savedRows);
    expect(from).toHaveBeenCalledWith("time_entries");
    expect(insert).toHaveBeenCalledWith([{ employee_id: "emp-1" }]);
    expect(select).toHaveBeenCalledWith("*");
  });

  it("updates one entry", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ update })) };
    const changes = { start_min: 450 };

    await expect(
      updateTimeEntry(client, "entry-1", changes)
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith(changes);
    expect(eq).toHaveBeenCalledWith("id", "entry-1");
  });

  it("retries without absence_type for older database schemas", async () => {
    const savedRows = [{ id: "entry-1", note: "[Urlaub]" }];
    const unsupportedSelect = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST204", message: "Could not find the 'absence_type' column" },
    });
    const compatibleSelect = vi.fn().mockResolvedValue({ data: savedRows, error: null });
    const insert = vi
      .fn()
      .mockImplementationOnce(() => ({ select: unsupportedSelect }))
      .mockImplementationOnce(() => ({ select: compatibleSelect }));
    const client = { from: vi.fn(() => ({ insert })) };

    await expect(
      createTimeEntries(client, { absence_type: "urlaub", note: "[Urlaub]" })
    ).resolves.toEqual(savedRows);
    expect(insert).toHaveBeenNthCalledWith(1, [{ absence_type: "urlaub", note: "[Urlaub]" }]);
    expect(insert).toHaveBeenNthCalledWith(2, [{ note: "[Urlaub]" }]);
  });

  it("deletes one entry", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ delete: remove })) };

    await expect(deleteTimeEntry(client, "entry-1")).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenCalledWith("id", "entry-1");
  });

  it("restores one vacation day when deleting a vacation entry", async () => {
    const employeeMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 13, vacation_entitlement_days: 10 },
      error: null,
    });
    const employeeEqForSelect = vi.fn(() => ({ maybeSingle: employeeMaybeSingle }));
    const employeeSelect = vi.fn(() => ({ eq: employeeEqForSelect }));
    const employeeEqForUpdate = vi.fn().mockResolvedValue({ error: null });
    const employeeUpdate = vi.fn(() => ({ eq: employeeEqForUpdate }));

    const vacationInsert = vi.fn().mockResolvedValue({ error: null });

    const timeEntryEq = vi.fn().mockResolvedValue({ error: null });
    const timeEntryDelete = vi.fn(() => ({ eq: timeEntryEq }));

    const client = {
      from: vi.fn((table) => {
        if (table === "employees") {
          return { select: employeeSelect, update: employeeUpdate };
        }
        if (table === "vacation_adjustments") {
          return { insert: vacationInsert };
        }
        if (table === "time_entries") {
          return { delete: timeEntryDelete };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await expect(
      deleteTimeEntry(client, "entry-urlaub", {
        entry: {
          id: "entry-urlaub",
          employee_id: 13,
          work_date: "2026-06-26",
          note: "[Urlaub]",
        },
      })
    ).resolves.toBeUndefined();

    expect(employeeUpdate).toHaveBeenCalledWith({ vacation_entitlement_days: 11 });
    expect(vacationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: "13",
        days: 1,
        note: "Urlaub gelöscht: 2026-06-26",
      })
    );
    expect(timeEntryDelete).toHaveBeenCalledOnce();
    expect(timeEntryEq).toHaveBeenCalledWith("id", "entry-urlaub");
  });

  it("forwards database errors", async () => {
    const databaseError = new Error("database unavailable");
    const select = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    const client = {
      from: vi.fn(() => ({ insert: vi.fn(() => ({ select })) })),
    };

    await expect(createTimeEntries(client, [])).rejects.toBe(databaseError);
  });
});
