
# Zeiterfassung – GitHub Pages & Supabase (v0.3)

**Funktionen**
- Rollen/Rechte: Admin, Teamleiter, Mitarbeiter
- 15-Minuten-Schieber (Start/Ende), Default 06:45–16:30, Grenzen 05:00–19:30
- Mobil-optimiert (iPhone/Android), Offline (PWA + IndexedDB)
- **Supabase-ready**: Login (E-Mail/Passwort), Sync von Einträgen, Pull von Mitarbeitern
- **GitHub Pages** Workflow enthalten

## Setup
1. `.env` ausfüllen (oder GitHub-Repo-Secrets setzen):
```
VITE_BASE=/Zeiterfassung/
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
   Im GitHub-Repo unter **Settings → Secrets and variables → Actions** zwei **Secrets** anlegen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

2. **Supabase-Tabellen** (SQL)
```sql
-- Mitarbeiter (rollenbasiert)
create table if not exists employees (
  id bigserial primary key,
  auth_user uuid references auth.users on delete set null,
  name text not null,
  role text check (role in ('admin','lead','worker')) not null default 'worker',
  created_at timestamptz default now()
);

-- Zeiteinträge
create table if not exists time_entries (
  id bigserial primary key,
  owner uuid references auth.users not null, -- wer den Eintrag erstellt hat
  employee_id bigint references employees(id),
  date date not null,
  start_min int not null,
  end_min int not null,
  break_min int default 0,
  note text,
  project text,
  created_at timestamptz default now()
);

-- RLS
alter table employees enable row level security;
alter table time_entries enable row level security;

-- Policies:
-- Admin sieht alle, Teamleiter sieht alle, Worker sieht nur sich selbst (über employees.auth_user)
create policy "employees_admin_all" on employees for all using (
  exists (select 1 from employees e where e.auth_user = auth.uid() and e.role = 'admin')
);
create policy "employees_lead_all" on employees for select using (
  exists (select 1 from employees e where e.auth_user = auth.uid() and e.role in ('admin','lead'))
);
create policy "employees_worker_self" on employees for select using (
  auth.uid() = auth_user
);

-- time_entries: lesen/schreiben
create policy "time_read_admin_lead" on time_entries for select using (
  exists (select 1 from employees e where e.auth_user = auth.uid() and e.role in ('admin','lead'))
);
create policy "time_read_write_self" on time_entries for all using (
  owner = auth.uid()
);
```

3. **GitHub Pages** ist vorkonfiguriert (`.github/workflows/pages.yml`). Push auf `main` baut & veröffentlicht.

## Lokal
```bash
npm i
npm run dev
```

## Hinweise
- Ohne gesetzte Supabase-ENV läuft die App **offline** (Login ausgeblendet).
- Sync-Button in der Tabelle: schiebt lokale Einträge zu `time_entries`. Mitarbeiterliste wird bei App-Start gepullt.
- Rollenlogik serverseitig erfolgt über RLS/Policies (siehe SQL).

Erstellt: 2025-10-17.
