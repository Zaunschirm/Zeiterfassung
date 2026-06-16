import { getEmployeeSollHoursForDay, getHolidayName, getIsoWeekday } from "./time.js";

const LONG_DAY_HOURS = 12;
const BREAK_WARNING_THRESHOLD_HOURS = 6;

function entryMinutes(entry) {
  const start = Number(entry?.start_min ?? entry?.from_min ?? 0);
  const end = Number(entry?.end_min ?? entry?.to_min ?? 0);
  const pause = Number(entry?.break_min ?? 0);
  return Math.max(end - start - pause, 0);
}

function isSameEntryDay(a, b) {
  return String(a?.work_date || "").slice(0, 10) === String(b?.work_date || "").slice(0, 10);
}

function isSameEmployee(a, b) {
  return String(a?.employee_id || "") === String(b?.employee_id || "");
}

function isSameProject(a, b) {
  return String(a?.project_id || "") === String(b?.project_id || "");
}

function hasAbsenceNote(entry) {
  const note = String(entry?.note || "").toLowerCase();
  const absenceType = String(entry?.absence_type || entry?.absenceType || "").toLowerCase();
  return (
    absenceType === "urlaub" ||
    absenceType === "krank" ||
    absenceType === "krankenstand" ||
    absenceType === "zeitausgleich" ||
    absenceType === "za" ||
    note.includes("[urlaub]") ||
    note.includes("[krank]") ||
    note.includes("[zeitausgleich]")
  );
}

export function validateTimeEntry({ date, employee, entry, existingEntries = [] }) {
  const errors = [];
  const warnings = [];
  const workDate = String(date || entry?.work_date || "").slice(0, 10);
  const start = Number(entry?.start_min ?? entry?.from_min ?? 0);
  const end = Number(entry?.end_min ?? entry?.to_min ?? 0);
  const pause = Number(entry?.break_min ?? 0);
  const travel = Number(entry?.travel_minutes ?? entry?.travel_min ?? 0);
  const hours = entryMinutes(entry) / 60;
  const isAbsence = hasAbsenceNote(entry) || Number(entry?.za_hours || 0) > 0;

  if (!workDate) errors.push("Datum fehlt.");
  if (end <= start) errors.push("Ende muss nach Start liegen.");
  if (pause < 0) errors.push("Pause darf nicht negativ sein.");
  if (travel < 0) errors.push("Fahrzeit darf nicht negativ sein.");

  if (hours > LONG_DAY_HOURS) {
    warnings.push(`Sehr langer Arbeitstag: ${hours.toFixed(2).replace(".", ",")} h.`);
  }

  if (!isAbsence && hours >= BREAK_WARNING_THRESHOLD_HOURS && pause <= 0) {
    warnings.push("Bei einem langen Arbeitstag ist keine Pause eingetragen.");
  }

  const weekday = getIsoWeekday(workDate);
  const holiday = getHolidayName(workDate);
  const soll = Number(getEmployeeSollHoursForDay(employee, workDate)) || 0;
  if (!isAbsence && (weekday === 6 || weekday === 7 || holiday || soll <= 0)) {
    const reason = holiday ? `Feiertag (${holiday})` : weekday === 6 || weekday === 7 ? "Wochenende" : "arbeitsfreier Tag laut Modell";
    warnings.push(`Eintrag an ${reason}.`);
  }

  const duplicate = (existingEntries || []).find((row) => (
    isSameEntryDay(row, { work_date: workDate }) &&
    isSameEmployee(row, entry) &&
    isSameProject(row, entry) &&
    Number(row?.start_min ?? row?.from_min ?? 0) === start &&
    Number(row?.end_min ?? row?.to_min ?? 0) === end
  ));
  if (duplicate) {
    warnings.push("Es gibt bereits einen sehr ähnlichen Eintrag für diese Person, diesen Tag, dieses Projekt und diese Zeit.");
  }

  const mixedAbsence = isAbsence && (entryMinutes(entry) > 0 || Number(entry?.travel_minutes || 0) > 0);
  if (mixedAbsence) {
    warnings.push("Abwesenheit/ZA enthält gleichzeitig Arbeitszeit oder Fahrzeit.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function formatValidationMessages(result) {
  return [...(result?.errors || []), ...(result?.warnings || [])].join("\n");
}
