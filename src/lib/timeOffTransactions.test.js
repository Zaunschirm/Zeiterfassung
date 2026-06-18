import { describe, expect, it, vi } from "vitest";
import {
  calculateVacationBalanceDelta,
  deleteTimeOffEntriesSafely,
  replaceTimeOffEntriesSafely,
} from "./timeOffTransactions.js";

function createClient({ savedRows = [], deleteResults = [] } = {}) {
  const select = vi.fn().mockResolvedValue({ data: savedRows, error: null });
  const insert = vi.fn(() => ({ select }));
  const removeIn = vi.fn();
  deleteResults.forEach((result) => removeIn.mockResolvedValueOnce(result));
  if (!deleteResults.length) removeIn.mockResolvedValue({ error: null });
  const remove = vi.fn(() => ({ in: removeIn }));
  const from = vi.fn(() => ({ insert, delete: remove }));
  return { client: { from }, insert, removeIn };
}

describe("time off persistence safety", () => {
  it("calculates only the real vacation balance difference", () => {
    expect(calculateVacationBalanceDelta({ entryType: "urlaub", insertedCount: 2 })).toBe(-2);
    expect(calculateVacationBalanceDelta({
      entryType: "urlaub",
      insertedCount: 2,
      replacedRows: [{ kind: "urlaub" }, { kind: "urlaub" }],
    })).toBe(0);
    expect(calculateVacationBalanceDelta({
      entryType: "za",
      insertedCount: 1,
      replacedRows: [{ kind: "urlaub" }],
    })).toBe(1);
  });

  it("rolls back a new entry and vacation delta when replacement deletion fails", async () => {
    const deleteError = new Error("old entry could not be deleted");
    const { client, removeIn } = createClient({
      savedRows: [{ id: "new-1" }],
      deleteResults: [{ error: deleteError }, { error: null }],
    });
    const applyVacationDelta = vi.fn().mockResolvedValue(undefined);

    await expect(replaceTimeOffEntriesSafely({
      client,
      rowsToInsert: [{ note: "[Urlaub]" }],
      deleteIds: ["old-1"],
      vacationDelta: -1,
      applyVacationDelta,
    })).rejects.toBe(deleteError);

    expect(applyVacationDelta.mock.calls.map(([delta]) => delta)).toEqual([-1, 1]);
    expect(removeIn).toHaveBeenNthCalledWith(1, "id", ["old-1"]);
    expect(removeIn).toHaveBeenNthCalledWith(2, "id", ["new-1"]);
  });

  it("restores the vacation balance when deleting an entry fails", async () => {
    const deleteError = new Error("entry could not be deleted");
    const { client } = createClient({ deleteResults: [{ error: deleteError }] });
    const applyVacationDelta = vi.fn().mockResolvedValue(undefined);

    await expect(deleteTimeOffEntriesSafely({
      client,
      ids: ["vac-1"],
      vacationDelta: 1,
      applyVacationDelta,
    })).rejects.toBe(deleteError);

    expect(applyVacationDelta.mock.calls.map(([delta]) => delta)).toEqual([1, -1]);
  });
});
