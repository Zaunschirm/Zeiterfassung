import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const outDir = "C:/Users/stefa/Documents/GitHub/Zeiterfassung/tmp/pdf-preview";
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "bautagesbericht-layout-preview.pdf");
const logoPath = "C:/Users/stefa/Documents/GitHub/Zeiterfassung/public/logo.png";

const PDF_BRAND = {
  brown: [123, 74, 45],
  darkBrown: [70, 43, 29],
  warm: [247, 243, 239],
  gray: [102, 94, 88],
};

const brandedTable = {
  styles: { fontSize: 9, cellPadding: 5, textColor: PDF_BRAND.darkBrown, lineColor: [231, 224, 218], lineWidth: 0.25 },
  headStyles: { fillColor: PDF_BRAND.brown, textColor: 255, fontStyle: "bold" },
  alternateRowStyles: { fillColor: PDF_BRAND.warm },
};

function addPdfHeader(doc, { title, subtitle = "", rightTop = "" }) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_BRAND.darkBrown);
  doc.rect(0, 0, width, 68, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("HOLZBAU ZAUNSCHIRM", 36, 21);
  doc.setFontSize(20);
  doc.text(title, 36, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (rightTop) doc.text(rightTop, width - 36, 23, { align: "right" });
  if (subtitle) doc.text(subtitle, width - 36, 44, { align: "right" });
  doc.setTextColor(...PDF_BRAND.darkBrown);
}

function addWatermark(doc) {
  if (!fs.existsSync(logoPath)) return;
  const imageData = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const size = 430;
  const x = (width - size) / 2;
  const y = (height - size) / 2 + 18;
  try {
    if (typeof doc.saveGraphicsState === "function") doc.saveGraphicsState();
    if (typeof doc.setGState === "function" && typeof doc.GState === "function") {
      doc.setGState(new doc.GState({ opacity: 0.13 }));
    }
    doc.addImage(imageData, "PNG", x, y, size, size, undefined, "FAST");
  } finally {
    if (typeof doc.restoreGraphicsState === "function") doc.restoreGraphicsState();
    doc.setTextColor(...PDF_BRAND.darkBrown);
  }
}

function addFooter(doc, detail) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 212, 206);
  doc.line(36, height - 27, width - 36, height - 27);
  doc.setTextColor(...PDF_BRAND.gray);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Holzbau Zaunschirm GmbH | Bautagesbericht", 36, height - 14);
  doc.text(detail, width / 2, height - 14, { align: "center" });
  doc.text("Seite 1 von 1", width - 36, height - 14, { align: "right" });
}

function section(doc, title, y) {
  doc.setFillColor(...PDF_BRAND.brown);
  doc.roundedRect(36, y - 12, 523, 20, 4, 4, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(title, 44, y + 2);
  doc.setTextColor(...PDF_BRAND.darkBrown);
}

const doc = new jsPDF({ unit: "pt", format: "a4" });
addPdfHeader(doc, { title: "Bautagesbericht", rightTop: "02.07.2026", subtitle: "AST Leibnitz" });
autoTable(doc, {
  startY: 84,
  theme: "grid",
  ...brandedTable,
  body: [
    ["Baustelle", "AST Leibnitz", "Datum", "02.07.2026"],
    ["Adresse", "Reichsstraße 90, 8430 Leibnitz", "Wetter", "Teilweise bewölkt"],
    ["Auftraggeber", "Partl-Vollmann", "Bauleiter", "Ranftl Michael"],
  ],
});
autoTable(doc, {
  startY: doc.lastAutoTable.finalY + 18,
  theme: "striped",
  ...brandedTable,
  head: [["Mitarbeiter", "Stunden"]],
  body: [
    ["Armin Sormann", "9,25 h"],
    ["Michael Höller", "9,25 h"],
    ["Sandro Brauchart", "9,25 h"],
  ],
  headStyles: { fillColor: PDF_BRAND.brown, textColor: 255, fontStyle: "bold" },
});
let y = doc.lastAutoTable.finalY + 24;
section(doc, "Ausgeführte Arbeiten", y);
autoTable(doc, {
  startY: y + 14,
  theme: "grid",
  ...brandedTable,
  body: [["UK, Stahlteile"]],
  margin: { left: 36, right: 36 },
  styles: { ...brandedTable.styles, fontSize: 9.5, cellPadding: 7 },
});
addWatermark(doc);
addFooter(doc, "AST Leibnitz | 02.07.2026");
doc.save(outPath);
console.log(outPath);
