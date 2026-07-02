create table if not exists public.daily_site_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  project_id text not null,
  project_name text,
  location text,
  client_name text,
  client_contact text,
  weather text,
  employee_items jsonb not null default '[]'::jsonb,
  activities text not null default '',
  incidents text,
  deliveries text,
  materials_equipment text,
  photo_paths jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  completed_by text,
  completed_by_name text,
  completed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_date, project_id)
);

create index if not exists daily_site_reports_date_idx on public.daily_site_reports (report_date desc, project_id);
alter table public.daily_site_reports enable row level security;
drop policy if exists "daily_site_reports_all" on public.daily_site_reports;
create policy "daily_site_reports_all" on public.daily_site_reports for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.daily_site_reports to anon, authenticated;
