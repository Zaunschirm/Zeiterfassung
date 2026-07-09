export const PDF_BRAND = {
  brown: [123, 74, 45],
  darkBrown: [70, 43, 29],
  warm: [247, 243, 239],
  gray: [102, 94, 88],
};

let pdfLogoDataUrlPromise = null;

async function getPdfLogoDataUrl() {
  if (!pdfLogoDataUrlPromise) {
    pdfLogoDataUrlPromise = (async () => {
      if (typeof fetch !== "function" || typeof FileReader === "undefined") return "";
      const base = String(import.meta.env?.BASE_URL || "/");
      const normalizedBase = base.endsWith("/") ? base : `${base}/`;
      const response = await fetch(`${normalizedBase}logo.png`);
      if (!response.ok) throw new Error("Logo konnte nicht geladen werden.");
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    })().catch((error) => {
      console.warn("[pdfBranding] Wasserzeichen konnte nicht geladen werden:", error?.message || error);
      return "";
    });
  }
  return pdfLogoDataUrlPromise;
}

export function addPdfHeader(doc, { title, subtitle = "", rightTop = "" }) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_BRAND.darkBrown); doc.rect(0, 0, width, 68, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("HOLZBAU ZAUNSCHIRM", 36, 21);
  doc.setFontSize(20); doc.text(String(title || "Dokument"), 36, 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (rightTop) doc.text(String(rightTop), width - 36, 23, { align: "right" });
  if (subtitle) doc.text(String(subtitle), width - 36, 44, { align: "right" });
  doc.setTextColor(...PDF_BRAND.darkBrown);
}

export async function addPdfWatermark(doc, { opacity = 0.10, size = 360, yOffset = -10 } = {}) {
  const logoDataUrl = await getPdfLogoDataUrl();
  if (!logoDataUrl) return;

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const x = (width - size) / 2;
  const y = (height - size) / 2 + yOffset;

  try {
    if (typeof doc.saveGraphicsState === "function") doc.saveGraphicsState();
    if (typeof doc.setGState === "function" && typeof doc.GState === "function") {
      doc.setGState(new doc.GState({ opacity }));
    }
    doc.addImage(logoDataUrl, "PNG", x, y, size, size, undefined, "FAST");
  } catch (error) {
    console.warn("[pdfBranding] Wasserzeichen konnte nicht eingefügt werden:", error?.message || error);
  } finally {
    if (typeof doc.restoreGraphicsState === "function") doc.restoreGraphicsState();
    doc.setTextColor(...PDF_BRAND.darkBrown);
  }
}

export function addPdfFooters(doc, { label, detail = "" }) {
  const pages = doc.getNumberOfPages(); const width = doc.internal.pageSize.getWidth(); const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page); doc.setDrawColor(220, 212, 206); doc.line(36, height - 27, width - 36, height - 27);
    doc.setTextColor(...PDF_BRAND.gray); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(`Holzbau Zaunschirm GmbH | ${label}`, 36, height - 14);
    if (detail) doc.text(String(detail), width / 2, height - 14, { align: "center" });
    doc.text(`Seite ${page} von ${pages}`, width - 36, height - 14, { align: "right" });
  }
}

export const brandedTable = {
  styles: { fontSize: 9, cellPadding: 5, textColor: PDF_BRAND.darkBrown, lineColor: [231, 224, 218], lineWidth: 0.25 },
  headStyles: { fillColor: PDF_BRAND.brown, textColor: 255, fontStyle: "bold" },
  alternateRowStyles: { fillColor: PDF_BRAND.warm },
};
