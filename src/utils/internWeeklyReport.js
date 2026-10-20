import { isAbsenceEntry } from "./timeEntryAbsences.js";
import { collectSupabaseRows } from "./pagination.js";

const DAY = 86400000;
const dateString = (date) => date.toISOString().slice(0, 10);
export const durationHM = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const displayDate = (date) => date.split("-").reverse().join(".");

function weekOf(date) {
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function previousViennaWeek(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return weekOf(new Date(Date.UTC(+get("year"), +get("month") - 1, +get("day")) - 7 * DAY));
}

export function weekRange(value) {
  if (!/^\d{4}-W\d{2}$/.test(value)) throw new Error("Bitte eine gültige Kalenderwoche wählen.");
  const [year, week] = value.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(+jan4 + (1 - (jan4.getUTCDay() || 7) + (week - 1) * 7) * DAY);
  if (weekOf(monday) !== value) throw new Error("Diese Kalenderwoche existiert nicht.");
  return { from: dateString(monday), to: dateString(new Date(+monday + 6 * DAY)) };
}

const present = (...values) => values.find((value) => value != null && String(value).trim()) || "Nicht hinterlegt";

export function buildWeeklyReport(entries, projects, employeeId, week) {
  const range = weekRange(week);
  const byId = new Map(projects.map((project) => [String(project.id), project]));
  const rows = entries
    .filter((entry) => String(entry.employee_id) === String(employeeId)
      && entry.work_date >= range.from && entry.work_date <= range.to && !isAbsenceEntry(entry))
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.start_min - b.start_min || Number(a.id) - Number(b.id))
    .map((entry) => {
      const { start_min: start, end_min: end, break_min: pause } = entry;
      if (![start, end, pause].every(Number.isInteger) || start < 0 || start >= 1440
        || end < start || end > 1440 || pause < 0 || pause > end - start) {
        throw new Error(`Ungültige oder fehlende Arbeitszeit/Pause am ${displayDate(entry.work_date)} (Eintrag ${entry.id}). Bitte zuerst korrigieren.`);
      }
      const project = byId.get(String(entry.project_id));
      return {
        date: entry.work_date,
        project: present(project?.name, entry.project),
        costCenter: present(project?.cost_center),
        address: present(project?.address),
        start, end, pause, net: end - start - pause,
      };
    });
  return { ...range, week, rows, total: rows.reduce((sum, row) => sum + row.net, 0) };
}

export async function loadWeeklyReport(client, employeeId, week) {
  const { from, to } = weekRange(week);
  // Read the base table so absence_type is available (the expanded view omits it).
  const entries = await collectSupabaseRows(() => client.from("time_entries")
    .select("id, employee_id, work_date, start_min, end_min, break_min, project_id, project, note, absence_type, za_hours")
    .eq("employee_id", employeeId).gte("work_date", from).lte("work_date", to)
    .order("work_date").order("id"));
  const ids = [...new Set(entries.map((entry) => entry.project_id).filter(Boolean))];
  const projects = ids.length ? await collectSupabaseRows(() => client.from("projects")
    .select("id, name, cost_center, address").in("id", ids).order("id")) : [];
  return buildWeeklyReport(entries, projects, employeeId, week);
}

export async function createWeeklyPdf(report, employeeName) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const nameLines = doc.splitTextToSize(`Name: ${employeeName}`, 267);
  const startY = 31 + nameLines.length * 5;
  autoTable(doc, {
    startY, margin: { top: startY, bottom: 22, left: 15, right: 15 },
    head: [["Datum", "BV / Projekt", "Kostenstelle", "Baustellenadresse", "Von", "Bis", "Pause", "Netto"]],
    body: report.rows.map((row) => [
      displayDate(row.date), row.project, row.costCenter, row.address,
      durationHM(row.start), durationHM(row.end), durationHM(row.pause), durationHM(row.net),
    ]),
    foot: [[{ content: "Gesamtarbeitszeit (HH:MM)", colSpan: 7 }, durationHM(report.total)]],
    showFoot: "lastPage", rowPageBreak: "avoid", theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak" },
    headStyles: { fillColor: [123, 74, 45] }, footStyles: { fillColor: [123, 74, 45] },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 53 }, 2: { cellWidth: 31 },
      3: { cellWidth: 75 }, 4: { cellWidth: 21 }, 5: { cellWidth: 21 },
      6: { cellWidth: 21 }, 7: { cellWidth: 21 } },
  });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(11);
    doc.text("Holzbau Zaunschirm GmbH", 15, 12);
    doc.setFontSize(16);
    doc.text("Praktikanten-Stundennachweis", 15, 20);
    doc.setFontSize(10);
    doc.text(`${report.week} | ${displayDate(report.from)} - ${displayDate(report.to)}`, 15, 27);
    doc.text(nameLines, 15, 33);
    doc.setFontSize(8);
    doc.text("Netto = Bis - Von - Pause. Fahrzeiten und Abwesenheiten sind nicht in der Arbeitszeitsumme enthalten.", 15, 195);
    doc.text("Fehlende Stammdaten: „Nicht hinterlegt“. Projektangaben entsprechen dem aktuellen Datenstand.", 15, 200);
    doc.text(`Seite ${page} / ${doc.getNumberOfPages()}`, 282, 200, { align: "right" });
  }
  return doc;
}
