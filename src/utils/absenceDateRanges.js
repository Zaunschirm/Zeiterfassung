export function absenceDateRanges(dates) {
  const ranges = [];
  for (const date of [...new Set(dates)].sort()) {
    const last = ranges[ranges.length - 1];
    if (last && Date.parse(date) - Date.parse(last.end) === 86400000) {
      last.end = date;
    } else {
      ranges.push({ start: date, end: date });
    }
  }
  const display = date => date.split("-").reverse().join(".");
  return ranges.map(({ start, end }) => start === end
    ? display(start)
    : display(start) + " – " + display(end)).join(", ") || "—";
}

export function payrollAbsenceCell(dates) {
  const days = [...new Set(dates)];
  if (!days.length) return "—";
  return `${days.length} ${days.length === 1 ? "Tag" : "Tage"}\n${absenceDateRanges(days)}`;
}
