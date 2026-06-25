create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  requested_by text,
  decided_by text,
  entry_type text not null check (entry_type in ('urlaub', 'za')),
  from_date date not null,
  to_date date not null,
  days jsonb not null default '[]'::jsonb,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists time_off_requests_status_created_idx
  on public.time_off_requests (status, created_at desc);

create index if not exists time_off_requests_employee_status_idx
  on public.time_off_requests (employee_id, status);

alter table public.time_off_requests enable row level security;

drop policy if exists "time_off_requests_select_all" on public.time_off_requests;
create policy "time_off_requests_select_all"
  on public.time_off_requests
  for select
  to anon, authenticated
  using (true);

drop policy if exists "time_off_requests_insert_all" on public.time_off_requests;
create policy "time_off_requests_insert_all"
  on public.time_off_requests
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "time_off_requests_update_all" on public.time_off_requests;
create policy "time_off_requests_update_all"
  on public.time_off_requests
  for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.time_off_requests to anon, authenticated;
