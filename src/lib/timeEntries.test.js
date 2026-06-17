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

  it("deletes one entry", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ delete: remove })) };

    await expect(deleteTimeEntry(client, "entry-1")).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenCalledWith("id", "entry-1");
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
