create table if not exists public.time_entry_audit_log (
  id bigserial primary key,
  entry_id text,
  employee_id text,
  changed_by text,
  change_type text,
  field_name text,
  old_value text,
  new_value text,
  source text,
  changed_at timestamptz not null default now()
);

alter table public.time_entry_audit_log
  alter column entry_id type text using entry_id::text,
  alter column employee_id type text using employee_id::text,
  alter column changed_by type text using changed_by::text;

alter table public.time_entry_audit_log
  add column if not exists change_type text,
  add column if not exists field_name text,
  add column if not exists old_value text,
  add column if not exists new_value text,
  add column if not exists source text,
  add column if not exists changed_at timestamptz not null default now();

create index if not exists time_entry_audit_log_entry_id_idx
  on public.time_entry_audit_log(entry_id);

create index if not exists time_entry_audit_log_employee_changed_idx
  on public.time_entry_audit_log(employee_id, changed_at desc);

alter table public.time_entry_audit_log enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'time_entry_audit_log'
      and policyname = 'time_entry_audit_log_select_all'
  ) then
    create policy time_entry_audit_log_select_all
      on public.time_entry_audit_log
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'time_entry_audit_log'
      and policyname = 'time_entry_audit_log_insert_all'
  ) then
    create policy time_entry_audit_log_insert_all
      on public.time_entry_audit_log
      for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;
