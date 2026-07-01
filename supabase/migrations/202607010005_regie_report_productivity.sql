alter table public.projects
  add column if not exists client_name text,
  add column if not exists client_contact text;

create table if not exists public.regie_material_templates (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  unit text not null default 'Stk.',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.regie_report_audit_log (
  id bigserial primary key,
  report_id uuid,
  report_number text,
  action text not null,
  changed_by text,
  changed_by_name text,
  changes jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists regie_report_audit_report_idx
  on public.regie_report_audit_log (report_id, changed_at desc);

alter table public.regie_material_templates enable row level security;
alter table public.regie_report_audit_log enable row level security;

drop policy if exists "regie_material_templates_all" on public.regie_material_templates;
create policy "regie_material_templates_all" on public.regie_material_templates for all to anon, authenticated using (true) with check (true);
drop policy if exists "regie_report_audit_select" on public.regie_report_audit_log;
create policy "regie_report_audit_select" on public.regie_report_audit_log for select to anon, authenticated using (true);
drop policy if exists "regie_report_audit_insert" on public.regie_report_audit_log;
create policy "regie_report_audit_insert" on public.regie_report_audit_log for insert to anon, authenticated with check (true);

grant select, insert, update, delete on public.regie_material_templates to anon, authenticated;
grant select, insert on public.regie_report_audit_log to anon, authenticated;
grant usage, select on sequence public.regie_report_audit_log_id_seq to anon, authenticated;
