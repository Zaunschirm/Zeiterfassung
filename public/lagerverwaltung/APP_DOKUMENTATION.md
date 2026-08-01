# Lagererfassung - Projektdokumentation

Stand: 10.07.2026

## 1. Systemuebersicht

Die Lagererfassung ist als Schwesterprojekt zur Zeiterfassungsapp geplant. Ziel ist eine Web-App fuer Materialien, Befestigungsmittel, Lagerorte, QR-/Barcode-Scan, Bestandsbuchungen und Auswertungen.

Aktueller Stand:

- Lokale Browser-App ohne Backend
- Speicherung im Browser ueber `localStorage`
- Artikelverwaltung
- Bestandsanzeige mit Mindestbestand
- Zu- und Abgangsbuchungen
- Buchungsverlauf
- CSV Import/Export
- QR-/Barcode-Feld je Artikel
- QR-/Barcode-Scan ueber Browser-Kamera, sofern vom Browser unterstuetzt

Zielaufbau wie Zeiterfassungsapp:

- React/Vite Web-App
- Supabase als Datenbank und Backend
- GitHub als Online-Codeablage
- Vercel als Deployment
- Login/Rollen fuer Mitarbeiter und Admin
- Datenbanktabellen fuer Artikel, Lagerorte, Buchungen, Lieferanten, QR-Codes und Audit-Log

## 2. Speicherort

Lokaler Projektordner:

```text
C:\Users\stefa\Documents\Lagererfassung
```

Aktuelle Dateien:

```text
index.html
styles.css
app.js
APP_DOKUMENTATION.md
```

Die App ist aktuell noch nicht wie die Zeiterfassung als vollstaendige React/Supabase-App aufgebaut. Sie ist momentan eine lauffaehige Vorversion, die direkt im Browser funktioniert.

## 3. Online-Code / GitHub

Noch offen.

Geplanter Aufbau analog zur Zeiterfassungsapp:

```text
https://github.com/Zaunschirm/Lagererfassung
```

Sobald das GitHub-Repository angelegt ist, sollte dieses Projekt dorthin gepusht werden.

## 4. Deployment / Vercel

Noch offen.

Geplanter Aufbau:

- Vercel-Projekt fuer Lagererfassung
- Deployment aus GitHub
- Environment Variables fuer Supabase
- Produktion z. B. unter einer eigenen Vercel-Domain

Beispiel:

```text
lagererfassung.vercel.app
```

## 5. Datenbank / Supabase

Aktuell gibt es fuer die Lagererfassung noch keine Supabase-Datenbankanbindung. Die Daten liegen derzeit im Browser-Speicher des jeweiligen Geraets.

Geplanter Supabase-Aufbau:

```text
Projekt: noch offen
```

Wichtige geplante Tabellen:

```text
employees
inventory_items
inventory_categories
inventory_locations
inventory_suppliers
inventory_movements
inventory_audit_log
inventory_counts
inventory_count_lines
```

## 6. Wichtige Tabellen

### employees

Kann aus der Zeiterfassungsapp uebernommen oder synchron genutzt werden, wenn dieselben Mitarbeiter mit denselben Rollen arbeiten sollen.

Wichtige Felder:

```text
id
code
name
role
active
disabled
created_at
```

### inventory_items

Speichert alle Materialien, Befestigungsmittel und Verbrauchsartikel.

Wichtige Felder:

```text
id
name
sku
qr_code
category_id
unit
quantity
minimum_quantity
location_id
supplier_id
note
active
created_at
updated_at
```

### inventory_categories

Kategorien fuer Artikel.

Beispiele:

```text
Material
Befestigungsmittel
Werkzeug
Verbrauchsmaterial
Ersatzteil
```

### inventory_locations

Lagerorte wie Regal, Fach, Container, Fahrzeug oder Baustelle.

Wichtige Felder:

```text
id
name
description
active
```

### inventory_suppliers

Lieferanten und Bezugsquellen.

Wichtige Felder:

```text
id
name
contact
phone
email
note
```

### inventory_movements

Speichert alle Bestandsbewegungen.

Wichtige Felder:

```text
id
item_id
employee_id
movement_type
quantity
unit
reason
project
created_at
```

Moegliche `movement_type` Werte:

```text
in
out
correction
count
transfer
```

### inventory_audit_log

Protokolliert wichtige Aenderungen fuer Nachvollziehbarkeit.

Beispiele:

```text
Artikel angelegt
Artikel bearbeitet
Artikel deaktiviert
Bestand gebucht
Inventur abgeschlossen
```

## 7. Login und Rollen

Ziel ist ein Aufbau wie in der Zeiterfassungsapp.

Geplante Rollen:

```text
employee
admin
```

Mitarbeiter duerfen:

- Artikel suchen
- QR-/Barcode scannen
- Bestand abbuchen
- Wareneingang erfassen, falls erlaubt
- eigene Buchungen sehen

Admins duerfen:

- Artikel anlegen und bearbeiten
- Lagerorte verwalten
- Kategorien verwalten
- Lieferanten verwalten
- Buchungen korrigieren
- Inventur starten und abschliessen
- Auswertungen exportieren
- Audit-Log ansehen

## 8. Reiter und Funktionen

### Bestand

Aktuell vorhanden.

Funktionen:

- Artikelliste
- Suche
- Mindestbestand markieren
- Artikel anlegen
- Artikel bearbeiten
- Artikel loeschen
- QR-/Barcode hinterlegen

### Buchen

Aktuell vorhanden.

Funktionen:

- Artikel auswaehlen
- Zugang buchen
- Abgang buchen
- Menge erfassen
- Grund oder Projekt hinterlegen
- Artikel per QR-/Barcode auswaehlen

### Verlauf

Aktuell vorhanden.

Funktionen:

- letzte Buchungen anzeigen
- Buchungsverlauf lokal speichern

Spaeter in Supabase:

- Filter nach Mitarbeiter
- Filter nach Artikel
- Filter nach Zeitraum
- Export fuer Auswertung

### Inventur

Noch nicht vorhanden.

Geplante Funktionen:

- Inventur starten
- Artikel scannen
- gezahlten Bestand erfassen
- Differenzen anzeigen
- Korrekturbuchungen erzeugen
- Inventur abschliessen

### Admin

Noch nicht vorhanden.

Geplante Funktionen:

- Artikelstamm
- Kategorien
- Lagerorte
- Lieferanten
- Mitarbeiterrechte
- Datenexport

## 9. Datenfluesse

### Artikel anlegen

1. Admin legt Artikel an.
2. Name, Artikelnummer, QR-/Barcode, Einheit, Kategorie und Lagerort werden gespeichert.
3. Optional wird ein Mindestbestand definiert.
4. Aenderung wird im Audit-Log protokolliert.

### Bestand abbuchen

1. Mitarbeiter scannt QR-/Barcode oder sucht Artikel.
2. Mitarbeiter waehlt Abgang.
3. Menge und Grund/Projekt werden erfasst.
4. App reduziert Bestand.
5. Bewegung wird in `inventory_movements` gespeichert.
6. Audit-Log protokolliert die Buchung.

### Wareneingang

1. Mitarbeiter/Admin scannt oder sucht Artikel.
2. Zugang wird gebucht.
3. Bestand wird erhoeht.
4. Bewegung wird gespeichert.

### Inventur

1. Admin startet Inventur.
2. Artikel werden gescannt und gezaehlt.
3. Differenzen werden berechnet.
4. Admin bestaetigt Korrektur.
5. App schreibt Korrekturbuchungen.

## 10. Wichtige Code-Dateien aktuell

### index.html

Enthaelt die komplette Oberflaeche der aktuellen lokalen Version.

Wichtig fuer:

- Navigation
- Suchfeld
- Artikelmaske
- Buchungsmaske
- Verlauf
- Scanner-Dialog

### styles.css

Enthaelt das Design der aktuellen lokalen Version.

Wichtig fuer:

- Layout
- Tabellen
- Formulare
- Scanner-Fenster
- mobile Ansicht

### app.js

Enthaelt die komplette Logik der aktuellen lokalen Version.

Wichtig fuer:

- Artikel speichern
- Bestand buchen
- Verlauf speichern
- CSV Import/Export
- QR-/Barcode-Scan
- Suche
- Darstellung der Tabellen

## 11. Ziel-Code-Dateien spaeter

Wenn die App wie die Zeiterfassung aufgebaut wird, sollte die Struktur ungefaehr so aussehen:

```text
src/
  App.jsx
  main.jsx
  lib/
    supabaseClient.js
  components/
    InventoryList.jsx
    InventoryItemForm.jsx
    MovementEntry.jsx
    ScannerDialog.jsx
    InventoryHistory.jsx
    InventoryCount.jsx
    AdminPanel.jsx
  services/
    inventoryService.js
    movementService.js
    auditService.js
  styles/
    app.css
```

## 12. Supabase-Aufgaben

Noch zu erledigen:

- Supabase-Projekt anlegen oder bestehendes Projekt nutzen
- Tabellen erstellen
- Row Level Security definieren
- Rollenmodell klaeren
- Environment Variables einrichten
- Supabase Client einbauen
- lokale `localStorage` Speicherung ersetzen

## 13. Vercel/GitHub-Aufgaben

Noch zu erledigen:

- GitHub-Repository erstellen
- Projektstruktur auf React/Vite umstellen
- Vercel-Projekt verbinden
- Environment Variables setzen
- Deployment testen

## 14. Wiederverwendung aus der Zeiterfassungsapp

Wahrscheinlich wiederverwendbar:

- Login-Prinzip
- Mitarbeiter-/Admin-Rollen
- Supabase Client
- Deployment-Ablauf ueber Vercel
- GitHub Workflow
- Audit-Log-Idee
- Admin-Ansicht
- CSV/Export-Muster
- Grundstruktur der Reiter

Nicht 1:1 wiederverwendbar:

- Zeiterfassungslogik
- Urlaub/ZA/Krank-Regeln
- Regieberichte/Bautagesberichte
- Abrechnungslogik

## 15. Naechste sinnvolle Schritte

1. Entscheiden, ob die Lagererfassung ein eigenes Supabase-Projekt bekommt oder das bestehende Zeiterfassungs-Supabase-Projekt nutzt.
2. GitHub-Repository fuer Lagererfassung anlegen.
3. Lokale App von `index.html`/`app.js` auf React/Vite umbauen.
4. Supabase-Tabellen fuer Lagerdaten erstellen.
5. Login/Rollen aus der Zeiterfassung uebernehmen.
6. QR-/Barcode-Scan in die React-App uebernehmen.
7. Vercel Deployment einrichten.

