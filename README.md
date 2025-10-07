# Zauni – Zeiterfassung (Minimal, mit Debug)

Dieses Repo enthält eine minimal lauffähige Next.js App mit:

- Login via **Mitarbeitercode + PIN**
- Admin-Liste der Mitarbeiter
- Supabase-Backend (Tabelle `employees`)
- **Debug-Route** zum schnellen Prüfen der ENV
- **Middleware**: schützt `/admin` mit Cookie-Session

## Schnellstart

1) `.env` anlegen (siehe `.env.example`) und in **Vercel → Project → Environment Variables** eintragen:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE`

2) Supabase Tabelle anlegen (SQL Editor):

```sql
create extension if not exists "pgcrypto";

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  display_name text not null,
  role text check (role in ('admin','user')) default 'user',
  pin_salt text not null,
  pin_hash text not null,
  disabled boolean not null default false,
  created_at timestamp default now()
);
```

3) PIN-Hash erzeugen (lokal):  
   ```bash
   npm i
   npm run pin:hash
   ```
   Das Script fragt eine PIN ab und spuckt **Base64 Salt & Hash** aus.

4) Ein Beispiel-Employee einfügen (SQL):  
   ```sql
   insert into employees (code, display_name, role, pin_salt, pin_hash, disabled)
   values ('stefan', 'Stefan Zaunschirm', 'admin', 'BASE64_SALT', 'BASE64_HASH', false)
   on conflict (code) do update set pin_salt=excluded.pin_salt, pin_hash=excluded.pin_hash;
   ```

5) Dev starten: `npm run dev` – oder auf Vercel deployen.

## Routen

- `GET /api/debug` – prüft ENV und Supabase Reachability
- `POST /api/login` – Login (setzt HttpOnly-Cookie)
- `POST /api/logout` – Session-Cookie löschen
- `GET /api/admin/employees` – Mitarbeiterliste (Admin UI)
- `GET /login` – Login Page
- `GET /admin` – Admin Page (durch Middleware geschützt)

## Entferne `app/api/debug/route.js`, sobald alles läuft.
