import { getEmployeeSollHoursForDay, getHolidayName } from "./time.js";
import {
  isSickEntry as isSickAbsence,
  isTimeCompEntry as isTimeCompAbsence,
  isVacationEntry as isVacationAbsence,
} from "./timeEntryAbsences.js";

export function parseHoursValue(value) {
  if (value === null || typeof value === "undefined") return 0;
  const normalized = String(value).replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundHours(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function calculateZaBalanceDelta(before, after) {
  return roundHours(parseHoursValue(after) - parseHoursValue(before));
}

export function dateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export function dateToDayNumber(value) {
  const d = dateOnly(value);
  const parts = d.split("-").map((v) => Number(v));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return NaN;
  const [year, month, day] = parts;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function dayNumberToDate(dayNumber) {
  return new Date(dayNumber * 86400000).toISOString().slice(0, 10);
}

export function isVacationEntry(row) {
  return isVacationAbsence(row);
}

export function isSickEntry(row) {
  return isSickAbsence(row);
}

export function isTimeCompEntry(row) {
  return isTimeCompAbsence(row);
}

export function isZaNeutralAbsence(row) {
  return isVacationEntry(row) || isSickEntry(row);
}

export function getEntryWorkHoursForZa(row) {
  if (!row || isVacationEntry(row) || isSickEntry(row) || isTimeCompEntry(row)) return 0;

  const start = Number(row.start_min ?? row.from_min ?? 0);
  const end = Number(row.end_min ?? row.to_min ?? 0);
  const pause = Number(row.break_min ?? 0);
  const travel = Number(row.travel_minutes ?? row.travel_min ?? 0);

  if (end <= start) return 0;
  return Math.max(end - start - pause + travel, 0) / 60;
}

export function buildZaDayMap(entries = []) {
  const dayMap = new Map();

  for (const row of entries || []) {
    const date = dateOnly(row?.work_date || row?.date);
    if (!date) continue;

    if (!dayMap.has(date)) {
      dayMap.set(date, {
        date,
        worked: 0,
        usedZa: 0,
        hasZa: false,
        hasPaidAbsence: false,
        rows: [],
      });
    }

    const day = dayMap.get(date);
    day.rows.push(row);
    day.worked += getEntryWorkHoursForZa(row);

    if (isTimeCompEntry(row)) {
      day.hasZa = true;
      day.usedZa += parseHoursValue(row?.za_hours);
    }

    if (isZaNeutralAbsence(row)) {
      day.hasPaidAbsence = true;
    }
  }

  return dayMap;
}

export function calculateZaDailyChange({ day, employee, date, neutralizeHolidays = false }) {
  const currentDay = day || { worked: 0, usedZa: 0, hasZa: false, hasPaidAbsence: false };
  const soll = Number(getEmployeeSollHoursForDay(employee, date)) || 0;
  const zaFallback = currentDay.hasZa && currentDay.usedZa <= 0 ? soll : currentDay.usedZa;
  const isHoliday = neutralizeHolidays && !!getHolidayName(date);

  let generated = 0;
  if (isHoliday || (currentDay.hasPaidAbsence && !currentDay.hasZa && currentDay.worked <= 0)) {
    generated = 0;
  } else if (currentDay.hasZa && currentDay.worked <= 0) {
    generated = -zaFallback;
  } else if (currentDay.hasZa) {
    generated = currentDay.worked - soll - zaFallback;
  } else {
    generated = currentDay.worked - soll;
  }

  return {
    date,
    worked: roundHours(currentDay.worked),
    soll: roundHours(soll),
    usedZa: roundHours(zaFallback),
    generated: roundHours(generated),
  };
}

export function calculateZaBalanceForEmployee({
  employee,
  entries = [],
  adjustments = [],
  from,
  to,
  adjustmentFrom = from,
  adjustmentTo = to,
  neutralizeHolidays = false,
  maxDays = 5000,
}) {
  if (!employee || !from || !to) {
    return { worked: 0, soll: 0, usedZa: 0, generated: 0, corrections: 0, balance: 0, days: [] };
  }

  const startDay = dateToDayNumber(from);
  const endDay = dateToDayNumber(to);
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay < startDay) {
    return { worked: 0, soll: 0, usedZa: 0, generated: 0, corrections: 0, balance: 0, days: [] };
  }

  const dayMap = buildZaDayMap(entries);
  const adjFrom = adjustmentFrom ? dateOnly(adjustmentFrom) : "";
  const adjTo = adjustmentTo ? dateOnly(adjustmentTo) : "";
  const includedAdjustments = (adjustments || []).filter((adj) => {
    const date = dateOnly(adj?.adjustment_date || adj?.date);
    if (adjFrom && date && date < adjFrom) return false;
    if (adjTo && date && date > adjTo) return false;
    return true;
  });
  const adjustmentsByDate = new Map();
  for (const adj of includedAdjustments) {
    const date = dateOnly(adj?.adjustment_date || adj?.date);
    if (!date) continue;
    adjustmentsByDate.set(date, (adjustmentsByDate.get(date) || 0) + parseHoursValue(adj?.hours));
  }
  const days = [];
  const safeMaxDays = Math.min(endDay - startDay, maxDays);

  let worked = 0;
  let soll = 0;
  let usedZa = 0;
  let generated = 0;

  for (let offset = 0; offset <= safeMaxDays; offset += 1) {
    const date = dayNumberToDate(startDay + offset);
    const daily = calculateZaDailyChange({
      day: dayMap.get(date),
      employee,
      date,
      neutralizeHolidays,
    });

    days.push({
      ...daily,
      corrections: roundHours(adjustmentsByDate.get(date) || 0),
    });
    worked += daily.worked;
    soll += daily.soll;
    usedZa += daily.usedZa;
    generated += daily.generated;
  }

  const corrections = includedAdjustments.reduce((sum, adj) => sum + parseHoursValue(adj?.hours), 0);

  return {
    worked: roundHours(worked),
    soll: roundHours(soll),
    usedZa: roundHours(usedZa),
    generated: roundHours(generated),
    corrections: roundHours(corrections),
    balance: roundHours(generated + corrections),
    days,
  };
}
