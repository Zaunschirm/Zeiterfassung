# Supabase-Migrationen

Die SQL-Dateien in `migrations/` werden in zeitlicher Reihenfolge ausgeführt.

Für bestehende Installationen kann die jeweils neue Datei im Supabase SQL Editor
ausgeführt werden. Alternativ kann ein mit dem Projekt verbundenes Supabase-CLI
`supabase db push` verwenden.

`202606180001_apply_monthly_vacation_accruals.sql` installiert die atomare und
idempotente Monatsgutschrift für Urlaub. Bis diese Funktion in der Datenbank
installiert ist, verwendet die App weiterhin den bisherigen kompatiblen
Client-Fallback.

`202606250001_create_time_off_requests.sql` legt die Freigabe-Tabelle fuer
Urlaub-/ZA-Antraege an. Ohne diese Migration koennen Mitarbeiter keine neuen
Antraege senden und Admins sehen keine offenen Freigaben.

`202607010001_create_regie_reports.sql` legt Regieberichte mit Arbeits-,
Material- und Unterschriftsdaten an. Die Unterschrift wird mit dem Bericht
gespeichert und in die PDF-Ausgabe übernommen.

`202607010002_prepare_regie_reports.sql` ergänzt den Desktop-zu-Handy-Ablauf:
Admins/Teamleiter weisen vorbereitete Arbeitsaufträge Mitarbeitern zu; diese
ergänzen mobil nur Stunden, Material und Unterschrift.
