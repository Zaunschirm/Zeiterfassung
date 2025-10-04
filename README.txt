Zeiterfassung PWA – v27 (Komplettpaket)
====================================

Neu in v27
- Monatsübersicht ist **nur für Admins** bearbeitbar.
  - Für Nicht-Admins sind die Felder (Von/Bis, Projekt, Pause, Notiz) deaktiviert und es gibt keinen Speichern-Button.
  - Hinweiszeile unter dem Titel der Monatsübersicht zeigt die Regel an.
- Cache-Bump: `zeit-pwa-v27`.

Bestehende Features
- Checkbox-Sammelerfassung (alle Mitarbeiter sichtbar), eingeloggter User vorausgewählt.
- Projekte mit Kostenstelle (bearbeiten, archivieren, löschen).
- Monatsübersicht pro Nutzer, CSV- & PDF-Export.
- Projekt-Fotos mit Bildkomprimierung.
- Passwortwechsel beim ersten Login (mustChange).
- Offline/PWA mit Service Worker.
- Branding via config.json.

Install
1) ZIP entpacken und alle Dateien ins Repo (Root) kopieren.
2) Commit & Push.
3) GitHub Pages Root prüfen.
4) Browser Hard-Reload / Service Worker unregister, falls nötig.
