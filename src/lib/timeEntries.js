export async function createTimeEntries(client, rows) {
  const payload = Array.isArray(rows) ? rows : [rows];
  let { data, error } = await client
    .from("time_entries")
    .insert(payload)
    .select("*");

  const absenceTypeUnsupported =
    error &&
    payload.some((row) => Object.prototype.hasOwnProperty.call(row || {}, "absence_type")) &&
    `${error.code || ""} ${error.message || ""} ${error.details || ""}`
      .toLowerCase()
      .includes("absence_type");

  if (absenceTypeUnsupported) {
    const compatiblePayload = payload.map(({ absence_type: _absenceType, ...row }) => row);
    ({ data, error } = await client
      .from("time_entries")
      .insert(compatiblePayload)
      .select("*"));
  }

  if (error) throw error;
  return data || [];
}

export async function updateTimeEntry(client, id, changes) {
  const { error } = await client
    .from("time_entries")
    .update(changes)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteTimeEntry(client, id) {
  const { error } = await client
    .from("time_entries")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function loadTimeEntryAbsences(client, { date, employeeIds = [] }) {
  if (!date || employeeIds.length === 0) return [];

  const selectVariants = [
    "employee_id,work_date,note,za_hours,absence_type",
    "employee_id,work_date,note,za_hours",
    "employee_id,work_date,note",
  ];
  let lastError = null;

  for (const selectText of selectVariants) {
    const { data, error } = await client
      .from("time_entries")
      .select(selectText)
      .eq("work_date", date)
      .in("employee_id", employeeIds);

    if (!error) return data || [];
    lastError = error;
  }

  throw lastError || new Error("Abwesenheiten konnten nicht geprüft werden.");
}
