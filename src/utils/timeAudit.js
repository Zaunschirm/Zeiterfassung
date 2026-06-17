export const AUDIT_FIELDS = [
  "project_id",
  "start_min",
  "end_min",
  "break_min",
  "travel_minutes",
  "crane_hours",
  "private_pkw_km",
  "za_hours",
  "bad_weather",
  "weather_manual",
  "weather_final",
  "note",
];

export function auditFieldLabel(field) {
  const map = {
    Eintrag: "Eintrag",
    project_id: "Projekt",
    start_min: "Start",
    end_min: "Ende",
    break_min: "Pause",
    travel_minutes: "Fahrzeit",
    crane_hours: "Kran",
    private_pkw_km: "Privat-PKW",
    za_hours: "Zeitausgleich",
    bad_weather: "Schlechtwetter",
    weather_manual: "Wetter manuell",
    weather_final: "Finales Wetter",
    note: "Notiz",
  };
  return map[field] || field || "—";
}

export function buildAuditEntrySummary(row, { fallbackDate = "", getEmployeeNameById, getProjectNameById, toHM }) {
  if (!row) return "—";

  const start = row.start_min ?? row.from_min ?? 0;
  const end = row.end_min ?? row.to_min ?? 0;
  const travel = row.travel_minutes ?? row.travel_min ?? 0;
  const emp = row.employee_name || getEmployeeNameById(row.employee_id);
  const project = row.project_name || getProjectNameById(row.project_id);

  return `${row.work_date || fallbackDate || ""} · ${emp} · ${project} · ${toHM(start)}–${toHM(end)} · Pause ${row.break_min ?? 0} min · Fahrzeit ${travel} min · Kran ${Number(row.crane_hours || 0)} h · Privat-PKW ${Number(row.private_pkw_km || 0)} km · ZA ${Number(row.za_hours || 0)} h${row.note ? ` · ${row.note}` : ""}`;
}

export function auditDisplayValue(field, value, { getProjectNameById, toHM }) {
  if (value == null || value === "") return "—";
  if (field === "project_id") return getProjectNameById(value);
  if (field === "start_min" || field === "end_min") return toHM(Number(value || 0));
  if (field === "break_min" || field === "travel_minutes") return `${Number(value || 0)} min`;
  if (field === "crane_hours" || field === "za_hours") return `${Number(value || 0).toLocaleString("de-AT")} h`;
  if (field === "private_pkw_km") return `${Number(value || 0).toLocaleString("de-AT")} km`;
  if (field === "bad_weather") return value ? "Ja" : "Nein";
  return String(value);
}

export function buildCreateAuditRows(savedRows, { actor, asUuidOrNull, summary }) {
  return (savedRows || [])
    .map((row) => ({
      entry_id: asUuidOrNull(row.id),
      employee_id: asUuidOrNull(row.employee_id),
      changed_by: actor,
      change_type: "create",
      field_name: "Eintrag",
      old_value: null,
      new_value: summary(row),
      source: "manual",
    }))
    .filter((row) => row.entry_id);
}

export function buildUpdateAuditRows(oldRow, upd, { actor, asUuidOrNull, displayValue }) {
  if (!oldRow?.id || !upd) return [];

  return AUDIT_FIELDS
    .map((field) => {
      if (!Object.prototype.hasOwnProperty.call(upd, field)) return null;

      const oldRaw =
        field === "travel_minutes"
          ? oldRow.travel_minutes ?? oldRow.travel_min ?? 0
          : oldRow[field];
      const newRaw = upd[field];

      const oldCompare = String(oldRaw ?? "");
      const newCompare = String(newRaw ?? "");
      if (oldCompare === newCompare) return null;

      return {
        entry_id: asUuidOrNull(oldRow.id),
        employee_id: asUuidOrNull(oldRow.employee_id),
        changed_by: actor,
        change_type: "update",
        field_name: field,
        old_value: displayValue(field, oldRaw),
        new_value: displayValue(field, newRaw),
        source: "manual",
      };
    })
    .filter(Boolean)
    .filter((row) => row.entry_id);
}

export function buildDeleteAuditRows(oldRow, { actor, asUuidOrNull, summary }) {
  if (!oldRow?.id) return [];

  return [
    {
      entry_id: asUuidOrNull(oldRow.id),
      employee_id: asUuidOrNull(oldRow.employee_id),
      changed_by: actor,
      change_type: "delete",
      field_name: "Eintrag",
      old_value: summary(oldRow),
      new_value: null,
      source: "manual",
    },
  ];
}
