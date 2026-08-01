from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


root = Path(__file__).resolve().parents[1]
tmp_dir = root / "tmp" / "pdfs"
tmp_dir.mkdir(parents=True, exist_ok=True)

logo_path = root / "public" / "logo.png"
watermark_path = tmp_dir / "logo_watermark_preview.png"
pdf_path = tmp_dir / "wasserzeichen_vorabzug.pdf"

logo = Image.open(logo_path).convert("RGBA")
alpha = logo.getchannel("A")
alpha = alpha.point(lambda px: int(px * 0.10))
logo.putalpha(alpha)
logo.save(watermark_path)

c = canvas.Canvas(str(pdf_path), pagesize=A4)
width, height = A4

c.setFillColor(colors.HexColor("#462b1d"))
c.rect(0, height - 68, width, 68, stroke=0, fill=1)
c.setFillColor(colors.white)
c.setFont("Helvetica-Bold", 9)
c.drawString(36, height - 22, "HOLZBAU ZAUNSCHIRM")
c.setFont("Helvetica-Bold", 20)
c.drawString(36, height - 47, "Regiebericht")
c.setFont("Helvetica", 9)
c.drawRightString(width - 36, height - 24, "RB-Beispiel-20260709")
c.drawRightString(width - 36, height - 45, "Musterbaustelle | 09.07.2026")

wm_size = 360
c.drawImage(
    str(watermark_path),
    (width - wm_size) / 2,
    (height - wm_size) / 2 - 10,
    width=wm_size,
    height=wm_size,
    mask="auto",
)

y = height - 96
c.setFillColor(colors.HexColor("#462b1d"))
c.setFont("Helvetica-Bold", 12)
c.drawString(36, y, "Baustellendaten")
y -= 20
c.setFont("Helvetica", 10)
rows = [
    ("Datum", "09.07.2026", "Projekt", "Musterbaustelle"),
    ("Ort", "Hauptstraße 42, 8401 Kalsdorf", "Auftraggeber", "Kulmer Holz-Leimbau"),
    ("Kontakt", "Bauleiter Mustermann", "Erstellt von", "Stefan Zaunschirm"),
]
for left_label, left_value, right_label, right_value in rows:
    c.setFillColor(colors.HexColor("#f7f3ef"))
    c.rect(36, y - 11, width - 72, 22, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#6f6259"))
    c.setFont("Helvetica-Bold", 8)
    c.drawString(44, y, left_label)
    c.drawString(300, y, right_label)
    c.setFillColor(colors.HexColor("#2f2119"))
    c.setFont("Helvetica", 9)
    c.drawString(92, y, left_value)
    c.drawString(366, y, right_value)
    y -= 26

y -= 10
c.setFont("Helvetica-Bold", 12)
c.setFillColor(colors.HexColor("#462b1d"))
c.drawString(36, y, "Ausgeführte Arbeiten")
y -= 18
c.setFont("Helvetica", 10)
for line in [
    "Montagearbeiten laut Auftrag, Unterkonstruktion vorbereitet.",
    "Anpassungen auf der Baustelle durchgeführt und sauber dokumentiert.",
    "Der helle Logostempel liegt im Hintergrund und stört die Lesbarkeit nicht.",
]:
    c.drawString(44, y, line)
    y -= 16

y -= 12
c.setFont("Helvetica-Bold", 12)
c.drawString(36, y, "Mitarbeiter und Stunden")
y -= 20
c.setFillColor(colors.HexColor("#7b4a2d"))
c.rect(36, y - 8, width - 72, 22, stroke=0, fill=1)
c.setFillColor(colors.white)
c.setFont("Helvetica-Bold", 9)
c.drawString(44, y, "Mitarbeiter")
c.drawString(360, y, "Stunden")
y -= 24
for name, hours in [("Armin Sormann", "8,50 h"), ("Michael Höller", "8,50 h"), ("Sandro Brauchart", "7,25 h")]:
    c.setFillColor(colors.HexColor("#fbf8f4"))
    c.rect(36, y - 8, width - 72, 22, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#2f2119"))
    c.setFont("Helvetica", 9)
    c.drawString(44, y, name)
    c.drawString(360, y, hours)
    y -= 24

c.setStrokeColor(colors.HexColor("#dcd4ce"))
c.line(36, 32, width - 36, 32)
c.setFillColor(colors.HexColor("#6f6259"))
c.setFont("Helvetica", 7.5)
c.drawString(36, 18, "Holzbau Zaunschirm GmbH | Regiebericht")
c.drawCentredString(width / 2, 18, "Vorabzug Wasserzeichen")
c.drawRightString(width - 36, 18, "Seite 1 von 1")

c.save()
print(pdf_path)
