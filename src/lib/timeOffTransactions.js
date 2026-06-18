import { createTimeEntries } from "./timeEntries.js";

const errorText = (error) => error?.message || String(error || "Unbekannter Fehler");

async function deleteEntries(client, ids) {
  if (!ids.length) return;
  const { error } = await client.from("time_entries").delete().in("id", ids);
  if (error) throw error;
}

function throwWithRollbackDetails(originalError, rollbackErrors) {
  if (!rollbackErrors.length) throw originalError;
  throw new Error(
    `${errorText(originalError)} Rückabwicklung unvollständig: ${rollbackErrors
      .map(errorText)
      .join("; ")}`,
    { cause: originalError }
  );
}

export function calculateVacationBalanceDelta({ entryType, insertedCount = 0, replacedRows = [] }) {
  const replacedVacationDays = (replacedRows || []).filter(
    (row) => row?.kind === "urlaub"
  ).length;
  const insertedVacationDays = entryType === "urlaub" ? Number(insertedCount || 0) : 0;
  return replacedVacationDays - insertedVacationDays;
}

export async function replaceTimeOffEntriesSafely({
  client,
  rowsToInsert = [],
  deleteIds = [],
  vacationDelta = 0,
  applyVacationDelta,
}) {
  const savedRows = rowsToInsert.length
    ? await createTimeEntries(client, rowsToInsert)
    : [];
  const savedIds = savedRows.map((row) => row?.id).filter(Boolean);
  let vacationDeltaApplied = false;

  try {
    if (vacationDelta) {
      await applyVacationDelta(vacationDelta);
      vacationDeltaApplied = true;
    }
    await deleteEntries(client, deleteIds);
    return savedRows;
  } catch (error) {
    const rollbackErrors = [];

    if (vacationDeltaApplied) {
      try {
        await applyVacationDelta(-vacationDelta);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    try {
      await deleteEntries(client, savedIds);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }

    throwWithRollbackDetails(error, rollbackErrors);
  }
}

export async function deleteTimeOffEntriesSafely({
  client,
  ids = [],
  vacationDelta = 0,
  applyVacationDelta,
}) {
  let vacationDeltaApplied = false;

  try {
    if (vacationDelta) {
      await applyVacationDelta(vacationDelta);
      vacationDeltaApplied = true;
    }
    await deleteEntries(client, ids);
  } catch (error) {
    const rollbackErrors = [];
    if (vacationDeltaApplied) {
      try {
        await applyVacationDelta(-vacationDelta);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    throwWithRollbackDetails(error, rollbackErrors);
  }
}
