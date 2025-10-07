# Zauni PIN App – Complete

Funktionen:
- Login mit Mitarbeitercode + PIN (sicherer scrypt Hash + Salt in Supabase)
- Geschütztes Dashboard
- Admin-Bereich: Mitarbeiter anlegen/bearbeiten/löschen, PIN setzen/zurücksetzen, aktiv/deaktiv
- Session via JWT-Cookie (HS256, 7 Tage)

## Environment Variables
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE
- JWT_SECRET

## Supabase – Tabelle
```sql
create extension if not exists "pgcrypto";

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  display_name text not null,
  role text not null default 'employee',
  pin_salt text not null,
  pin_hash text not null,
  disabled boolean not null default false
);
```
