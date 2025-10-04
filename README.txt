Zeiterfassung PWA – v26 (Komplettpaket)
====================================

Wichtigste Features
- Zeiteingabe mit Schiebereglern (04:00–20:00 möglich; Standard 06:45–16:30).
- Mehrere Mitarbeiter per Checkbox auswählbar (alphabetisch), eingeloggter User vorab angehakt.
- Projekte mit Kostenstelle; Projekte bearbeitbar, archivierbar, löschbar.
- Monatsübersicht pro Nutzer, Einträge editierbar.
- CSV- und PDF-Export (Spalten: Datum, Mitarbeiter, Von, Bis, Projekt, Kostenstelle, Pausen, Arbeitszeit, Überstunden, Notiz).
- Foto-Upload pro Projekt mit automatischer Bildkomprimierung (max ~1600px, Qualität 0.82).
- Mitarbeiterverwaltung im Unterordner /users (nur Admin).
- Passwortwechsel beim ersten Login (mustChange).
- Offlinefähig via Service Worker (Cache: zeit-pwa-v26).
- Branding über config.json (Farben, Name, Logo).

Erstinstallation / Update
1) ZIP entpacken; gesamten Inhalt ins Repo (Root) kopieren.
2) Commit & Push.
3) GitHub Pages: Branch + Root prüfen (Settings → Pages).
4) Browser Hard-Reload (Strg+F5 / Cmd+Shift+R). Bei Problemen Service Worker deregistrieren (DevTools → Application → Service Workers → Unregister).

Hinweise
- Fallback-Admin 'admin/admin' wird nur erstellt, wenn kein aktiver Admin existiert.
- Für Sammelerfassung werden je Mitarbeiter eigenständige Einträge angelegt (kein Extra-Feld im Export).
