# Supabase-Migrationen

Die SQL-Dateien in `migrations/` werden in zeitlicher Reihenfolge ausgeführt.

Für bestehende Installationen kann die jeweils neue Datei im Supabase SQL Editor
ausgeführt werden. Alternativ kann ein mit dem Projekt verbundenes Supabase-CLI
`supabase db push` verwenden.

`202606180001_apply_monthly_vacation_accruals.sql` installiert die atomare und
idempotente Monatsgutschrift für Urlaub. Bis diese Funktion in der Datenbank
installiert ist, verwendet die App weiterhin den bisherigen kompatiblen
Client-Fallback.
