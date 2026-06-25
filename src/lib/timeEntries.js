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

function roundVacationDays(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isVacationTimeEntry(entry) {
  const absenceType = String(entry?.absence_type || "").trim().toLowerCase();
  const note = String(entry?.note || "").trim().toLowerCase();
  return absenceType === "urlaub" || note.startsWith("[urlaub]");
}

function vacationEntitlementDays(employee) {
  return Number(
    employee?.vacation_entitlement_days ??
      employee?.urlaub_anspruch_tage ??
      employee?.vacation_days ??
      0
  ) || 0;
}

function vacationColumn(employee) {
  if (Object.prototype.hasOwnProperty.call(employee || {}, "vacation_entitlement_days")) {
    return "vacation_entitlement_days";
  }
  if (Object.prototype.hasOwnProperty.call(employee || {}, "urlaub_anspruch_tage")) {
    return "urlaub_anspruch_tage";
  }
  if (Object.prototype.hasOwnProperty.call(employee || {}, "vacation_days")) {
    return "vacation_days";
  }
  return "vacation_entitlement_days";
}

async function loadVacationEmployee(client, employeeId) {
  const selectVariants = [
    "id,vacation_entitlement_days,urlaub_anspruch_tage,vacation_days",
    "id,vacation_entitlement_days,vacation_days",
    "id,vacation_entitlement_days",
    "id,vacation_days",
    "id",
  ];
  let lastError = null;

  for (const selectText of selectVariants) {
    const { data, error } = await client
      .from("employees")
      .select(selectText)
      .eq("id", employeeId)
      .maybeSingle();

    if (!error) return data;
    lastError = error;
  }

  throw lastError || new Error("Mitarbeiter konnte nicht geladen werden.");
}

async function applyVacationBalanceDelta(client, entry, deltaDays, note) {
  if (!entry?.employee_id || !Number.isFinite(Number(deltaDays)) || Number(deltaDays) === 0) return;

  const employee = await loadVacationEmployee(client, entry.employee_id);
  if (!employee?.id) throw new Error("Mitarbeiter konnte nicht geladen werden.");

  const nextDays = roundVacationDays(vacationEntitlementDays(employee) + Number(deltaDays));
  const column = vacationColumn(employee);
  const { error: updateError } = await client
    .from("employees")
    .update({ [column]: nextDays })
    .eq("id", employee.id);
  if (updateError) throw updateError;

  const { error: auditError } = await client.from("vacation_adjustments").insert({
    employee_id: String(employee.id),
    adjustment_date: todayISO(),
    days: Number(deltaDays),
    note,
  });
  if (auditError) {
    console.warn("[timeEntries] Urlaubskorrektur-Audit konnte nicht gespeichert werden", auditError);
  }
}

export async function updateTimeEntry(client, id, changes) {
  const { error } = await client
    .from("time_entries")
    .update(changes)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteTimeEntry(client, id, options = {}) {
  const entry = options.entry || null;
  const restoreVacation = isVacationTimeEntry(entry);
  let vacationRestored = false;

  try {
    if (restoreVacation) {
      const dateText = entry?.work_date ? String(entry.work_date).slice(0, 10) : "";
      await applyVacationBalanceDelta(
        client,
        entry,
        1,
        `Urlaub gelöscht${dateText ? `: ${dateText}` : ""}`
      );
      vacationRestored = true;
    }

    const { error } = await client
      .from("time_entries")
      .delete()
      .eq("id", id);

    if (error) throw error;
  } catch (error) {
    if (vacationRestored) {
      try {
        const dateText = entry?.work_date ? String(entry.work_date).slice(0, 10) : "";
        await applyVacationBalanceDelta(
          client,
          entry,
          -1,
          `Rückabwicklung Urlaub gelöscht${dateText ? `: ${dateText}` : ""}`
        );
      } catch (rollbackError) {
        throw new Error(
          `${error?.message || error} Rückabwicklung Urlaubskonto fehlgeschlagen: ${rollbackError?.message || rollbackError}`,
          { cause: error }
        );
      }
    }
    throw error;
  }
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
