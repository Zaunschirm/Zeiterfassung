// src/lib/monthlyPdf.js
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Exportiert die Monatsübersicht als PDF im 123-erfasst-Stil.
 *
 * @param {Object} opts
 * @param {string}  opts.company       - Firmenname (Kopf)
 * @param {string}  opts.monthLabel    - z.B. "November 2025"
 * @param {string}  opts.filterLabel   - z.B. "Alle Mitarbeiter" oder "Kevin Hainz"
 * @param {Array}   opts.rows          - Datensätze als [{date, employee, project, start, end, breakMin, durationMin, note}]
 * @param {Array}   opts.weekSums      - [{kw: "KW 45", minutes: 5550}, ...]
 * @param {number}  opts.totalMinutes  - Gesamtsumme in Minuten
 * @param {string}  [opts.logoDataUrl] - Optional: Logo als dataURL (PNG/SVG gerendert)
 * @param {Object}  [opts.theme]       - Farben/Styling
 */
export function exportMonthlyPDF({
  company,
  monthLabel,
  filterLabel,
  rows,
  weekSums,
  totalMinutes,
  logoDataUrl,
  theme = {
    primary: "#5E3C2C",
    primarySoft: "#F3ECE7",
    text: "#333333",
    grid: "#E7E2DE",
  },
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const marginX = 40;
  let cursorY = 40;

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", marginX, cursorY, 120, 40);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const rightX = 555;

  doc.setTextColor(theme.primary);
  doc.text(company || "Holzbau Zaunschirm GmbH", rightX, cursorY + 8, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(theme.text);
  doc.text(monthLabel || "", rightX, cursorY + 28, { align: "right" });
  if (filterLabel) doc.text(filterLabel, rightX, cursorY + 46, { align: "right" });

  cursorY += 65;

  doc.setDrawColor(theme.primary);
  doc.setLineWidth(1);
  doc.line(marginX, cursorY, 555, cursorY);
  cursorY += 16;

  const tableHead = [
    [
      { content: "Datum", styles: { halign: "left" } },
      { content: "Mitarbeiter", styles: { halign: "left" } },
      { content: "Projekt", styles: { halign: "left" } },
      { content: "Start", styles: { halign: "center" } },
      { content: "Ende", styles: { halign: "center" } },
      { content: "Pause", styles: { halign: "center" } },
      { content: "Dauer", styles: { halign: "center" } },
      { content: "Notiz", styles: { halign: "left" } },
    ],
  ];

  const pad = (n) => (n < 10 ? "0" + n : "" + n);

  const hm = (min) => {
    const total = parseInt(min || 0, 10);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h} h ${pad(m)} m`;
  };

  const body = (rows || []).map((r) => [
    r.date || "",
    r.employee || "",
    r.project || "",
    r.start || "",
    r.end || "",
    r.breakMin ? `${r.breakMin} min` : "-",
    hm(r.durationMin),
    r.note || "",
  ]);

  autoTable(doc, {
    startY: cursorY,
    head: tableHead,
    body,
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: theme.text,
      lineColor: theme.grid,
      lineWidth: 0.5,
      cellPadding: 6,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: theme.primary,
      textColor: "#ffffff",
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: theme.primarySoft },
    theme: "grid",
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 110 },
      2: { cellWidth: 100 },
      3: { cellWidth: 45, halign: "center" },
      4: { cellWidth: 45, halign: "center" },
      5: { cellWidth: 50, halign: "center" },
      6: { cellWidth: 60, halign: "center" },
      7: { cellWidth: 120 },
    },
    didDrawPage: () => {
      const str = `Seite ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor("#777");
      doc.text(str, 555, 820, { align: "right" });
    },
  });

  cursorY = (doc.lastAutoTable?.finalY || cursorY) + 16;

  doc.setFillColor(theme.primarySoft);
  doc.setDrawColor(theme.grid);
  doc.roundedRect(marginX, cursorY, 515, 70, 6, 6, "FD");

  doc.setFontSize(10);
  doc.setTextColor(theme.text);

  let wkX = marginX + 10;
  let wkY = cursorY + 18;

  doc.setFont("helvetica", "bold");
  doc.text("Wochensummen:", wkX, wkY);
  doc.setFont("helvetica", "normal");

  wkY += 16;
  (weekSums || []).forEach((w) => {
    doc.text(`${w.kw}: ${hm(w.minutes)}`, wkX, wkY);
    wkY += 14;
  });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(theme.primary);
  doc.setFontSize(12);
  doc.text(`Gesamt: ${hm(totalMinutes)}`, 555, cursorY + 44, { align: "right" });

  doc.setFontSize(10);
  doc.setTextColor(theme.text);

  cursorY += 90;

  const sigW = 240;
  const sigGap = 35;
  const sigY = cursorY + 45;

  doc.setDrawColor(theme.grid);
  doc.line(marginX, sigY, marginX + sigW, sigY);
  doc.line(marginX + sigW + sigGap, sigY, marginX + sigW * 2 + sigGap, sigY);

  doc.setFontSize(9);
  doc.setTextColor("#666");
  doc.text("Unterschrift Mitarbeiter", marginX, sigY + 14);
  doc.text("Unterschrift Vorgesetzter", marginX + sigW + sigGap, sigY + 14);

  const safeMonth = String(monthLabel || "Monat").replace(/\s+/g, "_");
  const safeFilter = String(filterLabel || "Alle").replace(/\s+/g, "_");
  doc.save(`Monatsübersicht_${safeMonth}_${safeFilter}.pdf`);
}