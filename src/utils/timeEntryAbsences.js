export function getTimeEntryAbsenceType(entry) {
  const note = String(entry?.note || "").toLowerCase();
  const absenceType = String(
    entry?.absence_type || entry?.absenceType || ""
  ).toLowerCase();

  if (
    absenceType === "krank" ||
    absenceType === "krankenstand" ||
    note.includes("[krank]") ||
    note.includes("krank") ||
    note.includes("krankenstand")
  ) {
    return "krank";
  }
  if (absenceType === "sonderurlaub" || note.includes("[sonderurlaub") || note.includes("sonderurlaub")) {
    return "sonderurlaub";
  }
  if (absenceType === "urlaub" || note.includes("[urlaub]") || note.includes("urlaub")) {
    return "urlaub";
  }
  if (
    absenceType === "zeitausgleich" ||
    absenceType === "za" ||
    Number(entry?.za_hours || 0) > 0 ||
    note.includes("[zeitausgleich]") ||
    note.includes("zeitausgleich")
  ) {
    return "za";
  }
  return "";
}

export function getTimeEntryAbsenceKind(entry) {
  const type = getTimeEntryAbsenceType(entry);
  if (type === "krank") return "Krank";
  if (type === "urlaub") return "Urlaub";
  if (type === "sonderurlaub") return "Sonderurlaub";
  if (type === "za") return "ZA";
  return "";
}

export const isVacationEntry = (entry) =>
  getTimeEntryAbsenceType(entry) === "urlaub";

export const isSpecialLeaveEntry = (entry) =>
  getTimeEntryAbsenceType(entry) === "sonderurlaub";

export const isSickEntry = (entry) =>
  getTimeEntryAbsenceType(entry) === "krank";

export const isTimeCompEntry = (entry) =>
  getTimeEntryAbsenceType(entry) === "za";

export const isAbsenceEntry = (entry) =>
  !!getTimeEntryAbsenceType(entry);

export function buildTimeEntryAbsenceWarnings({ entries = [], employees = [] }) {
  const employeeById = new Map(
    employees.map((employee) => [String(employee.id), employee])
  );
  const kindsByEmployee = new Map();

  for (const entry of entries) {
    const kind = getTimeEntryAbsenceKind(entry);
    if (!kind) continue;
    const employeeId = String(entry.employee_id ?? "");
    if (!employeeId) continue;
    if (!kindsByEmployee.has(employeeId)) kindsByEmployee.set(employeeId, new Set());
    kindsByEmployee.get(employeeId).add(kind);
  }

  return [...kindsByEmployee.entries()].map(([employeeId, kinds]) => {
    const employee = employeeById.get(employeeId);
    const name = employee?.name || employee?.code || "Mitarbeiter";
    return `${name}: Für diesen Tag ist bereits ${[...kinds].join(" / ")} eingetragen.`;
  });
}
