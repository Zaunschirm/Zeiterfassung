# Zeiterfassung – Rollen & Slider (v0.2)

**Neu in dieser Version**
- Rollen/Rechte: **Admin**, **Teamleiter**, **Mitarbeiter**
  - Admin & Teamleiter: können für **alle Mitarbeiter** Tageszeiten erfassen.
  - Mitarbeiter: dürfen **nur sich selbst** bearbeiten.
- **Kein Start/Stop-Button** – stattdessen **Start-/End-Schieber** im **15‑Minuten‑Raster**.
  - Standard: **06:45–16:30**
  - Grenzen: **05:00–19:30**
- **Mobil optimiert**: große Touch‑Targets, 1‑Spalten-Layout auf iPhone/Android.
- **GitHub Pages ready**: Workflow `.github/workflows/pages.yml`, `VITE_BASE` für Repo‑Pfad.

## Lokal starten
```bash
npm i
npm run dev
# http://localhost:5173
```

## Deploy auf GitHub Pages
1. Repository erstellen und Code pushen.
2. In Repo‑Settings → Pages: „Build and deployment“ auf „GitHub Actions“ stellen.
3. Optional in den Repo‑Settings → Actions erlauben.
4. Falls der Repo‑Name z. B. `zeiterfassung` lautet, setze beim Build die Basis:
   ```bash
   # Beispiel lokal für Test-Build mit Base-Pfad:
   VITE_BASE=/zeiterfassung/ npm run build
   ```
   Oder lege eine `.env` mit `VITE_BASE=/REPO-NAME/` an.
5. Pushen → Action baut & veröffentlicht die Seite unter `https://<user>.github.io/<repo>/`.

## Rollen/Anmeldung (Demo)
- Einfache Session (localStorage) mit Auswahl **Rolle** + **Mitarbeiter** in der UI.
- Hook-Punkte für echte Auth (Supabase/Firebase) vorhanden (`src/utils/auth.js`).

## Limits & To‑Dos
- Kein echter Server‑Sync in v0.2 – vorbereitet, kann nachgerüstet werden (RLS, Users, Policies).
- Mitarbeiter-Namen sind Platzhalter (Dexie „populate“).
- Wochen-/Monatsberichte und PDF‑Export folgen gern als nächster Schritt.

Erstellt: 2025-10-17.
