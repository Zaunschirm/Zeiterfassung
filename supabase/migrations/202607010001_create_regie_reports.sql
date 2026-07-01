create table if not exists public.regie_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null,
  report_date date not null default current_date,
  project_id text,
  project_name text,
  location text,
  client_name text,
  client_contact text,
  description text not null default '',
  labor_items jsonb not null default '[]'::jsonb,
  material_items jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'signed')),
  signed_by text,
  signature_data text,
  signed_at timestamptz,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists regie_reports_report_number_idx on public.regie_reports (report_number);
create index if not exists regie_reports_date_idx on public.regie_reports (report_date desc, created_at desc);
alter table public.regie_reports enable row level security;
drop policy if exists "regie_reports_select_all" on public.regie_reports;
create policy "regie_reports_select_all" on public.regie_reports for select to anon, authenticated using (true);
drop policy if exists "regie_reports_insert_all" on public.regie_reports;
create policy "regie_reports_insert_all" on public.regie_reports for insert to anon, authenticated with check (true);
drop policy if exists "regie_reports_update_all" on public.regie_reports;
create policy "regie_reports_update_all" on public.regie_reports for update to anon, authenticated using (true) with check (true);
drop policy if exists "regie_reports_delete_all" on public.regie_reports;
create policy "regie_reports_delete_all" on public.regie_reports for delete to anon, authenticated using (true);
grant select, insert, update, delete on public.regie_reports to anon, authenticated;
